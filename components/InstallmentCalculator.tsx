"use client";
import { useMemo, useState } from "react";
import { fmt } from "@/lib/format";
import { X, Calculator, TrendingUp, Scale, Search, Table2 } from "lucide-react";

// ============================================================================
// حاسبة الأقساط — منقولة من الحاسبة المستقلة اللي بعتها (MasterInstallmentEngine)
// بنفس منطق الحساب بالظبط (فائدة ثابتة/متناقصة، مصاريف إدارية، دفعة استلام،
// وديعة صيانة، دفعات دورية موازية، التفاوض العكسي، مقارنة خطتين، كشف الفائدة)
// لكن بواجهة معاد بناؤها بألوان وستايل FlowCash (Card / orange-600 / الوضع
// الليلي) بدل ألوان الحاسبة الأصلية (slate/blue/amber/purple)، ومربوطة
// بالتطبيق فعليًا عبر زرار "استخدم في قسط جديد" اللي بيودّي القيم المحسوبة
// مباشرة لفورم تسجيل القسط في تبويب الأقساط.
// ============================================================================

type PeriodType = "years" | "months";
type InterestType = "flat" | "reducing";
type FeeType = "percent" | "fixed";
type PayMode = "upfront" | "financed";
type Frequency = "quarterly" | "semiAnnual" | "annual";
type DurationMode = "full" | "custom";
type Tab = "singlePlan" | "negotiation" | "comparison" | "reverse";

const frequencyMap: Record<Frequency, { countPerYear: number; label: string }> = {
  quarterly: { countPerYear: 4, label: "ربع سنوية (كل 3 شهور)" },
  semiAnnual: { countPerYear: 2, label: "نصف سنوية (كل 6 شهور)" },
  annual: { countPerYear: 1, label: "سنوية (كل سنة)" },
};

interface PlanResult {
  error: string | null;
  baseFinanced: number;
  adminFee: number;
  maintenance: number;
  delivery: number;
  monthly: number;
  totalMonths: number;
  effectiveYears: number;
  totalPeriodicCount: number;
  totalPeriodicAmount: number;
  totalInterest: number;
  totalPaidAll: number;
  trueApr: number;
}

function calculatePlan(
  price: number, down: number, periodVal: number, pType: PeriodType, rate: number, iType: InterestType,
  feeVal: number, feeType: FeeType, feePay: PayMode,
  deliveryEnabled: boolean, deliveryAmt: number,
  maintEnabled: boolean, maintVal: number, maintPay: PayMode,
  periodicEnabled: boolean, pAmt: number, pFreq: Frequency, pDurMode: DurationMode, pDurYears: number
): PlanResult {
  const p = Number(price) || 0;
  const d = Number(down) || 0;
  const pVal = Number(periodVal) || 0;
  const r = Number(rate) || 0;

  let error: string | null = null;
  if (p <= 0) error = "يرجى إدخال سعر صحيح للسلعة.";
  if (d >= p && p > 0) error = "المقدم يغطي إجمالي السعر كاش بالكامل.";
  if (pVal <= 0) error = "مدة التقسيط يجب أن تكون أكبر من الصفر.";

  const totalMonths = pType === "years" ? pVal * 12 : pVal;
  const totalYears = totalMonths / 12;
  const baseFinanced = Math.max(0, p - d);

  const adminFee = feeType === "percent" ? (baseFinanced * (Number(feeVal) || 0)) / 100 : Number(feeVal) || 0;
  const maintenance = maintEnabled ? Number(maintVal) || 0 : 0;
  const delivery = deliveryEnabled ? Number(deliveryAmt) || 0 : 0;

  const freqInfo = frequencyMap[pFreq];
  let effectiveYears = totalYears;
  if (pDurMode === "custom") effectiveYears = Math.min(totalYears, Number(pDurYears) || 0);
  const totalPeriodicCount = periodicEnabled ? Math.floor(effectiveYears * freqInfo.countPerYear) : 0;
  const totalPeriodicAmount = totalPeriodicCount * (Number(pAmt) || 0);

  const totalSpecialDeductions = delivery + totalPeriodicAmount;
  if (totalSpecialDeductions > baseFinanced && !error) {
    error = "مجموع دفعات الاستلام والدفعات الإضافية أكبر من المبلغ المراد تقسيطه!";
  }

  let remainingForMonthly = Math.max(0, baseFinanced - totalSpecialDeductions);
  if (feePay === "financed") remainingForMonthly += adminFee;
  if (maintPay === "financed") remainingForMonthly += maintenance;

  let totalInterest = 0;
  let monthly = 0;

  if (!error && totalMonths > 0) {
    if (iType === "flat") {
      totalInterest = baseFinanced * (r / 100) * totalYears;
      monthly = (remainingForMonthly + totalInterest) / totalMonths;
    } else {
      const monthlyRate = r / 100 / 12;
      if (monthlyRate === 0) {
        monthly = remainingForMonthly / totalMonths;
      } else {
        const factor = Math.pow(1 + monthlyRate, totalMonths);
        monthly = (remainingForMonthly * (monthlyRate * factor)) / (factor - 1);
        totalInterest = monthly * totalMonths - remainingForMonthly;
      }
    }
  }

  const totalFinanceCost = totalInterest + adminFee;
  const trueApr = baseFinanced > 0 && totalYears > 0 ? (totalFinanceCost / baseFinanced / totalYears) * 100 : 0;

  const totalPaidAll =
    d +
    (feePay === "upfront" ? adminFee : 0) +
    (maintPay === "upfront" ? maintenance : 0) +
    delivery +
    totalPeriodicAmount +
    monthly * totalMonths;

  return {
    error,
    baseFinanced,
    adminFee: Math.round(adminFee),
    maintenance: Math.round(maintenance),
    delivery: Math.round(delivery),
    monthly: Math.round(monthly),
    totalMonths,
    effectiveYears,
    totalPeriodicCount,
    totalPeriodicAmount,
    totalInterest: Math.round(totalInterest),
    totalPaidAll: Math.round(totalPaidAll),
    trueApr: Math.round(trueApr * 10) / 10,
  };
}

const inputCls = "w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-xs font-medium";
const labelCls = "block text-[10px] text-neutral-400 mb-1";
const boxCls = "p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50 space-y-1.5";

export default function InstallmentCalculatorModal({
  onClose,
  onApply,
  applyLabel,
  initial,
}: {
  onClose: () => void;
  onApply?: (v: { item_name: string; monthly_amount: number; months_count: number; currency: string }) => void;
  applyLabel?: string;
  initial?: { itemName?: string; itemPrice?: number; downPayment?: number; periodValue?: number; periodType?: PeriodType; currency?: string };
}) {
  const [tab, setTab] = useState<Tab>("singlePlan");
  const [showSchedule, setShowSchedule] = useState(false);
  const [currency, setCurrency] = useState(initial?.currency || "EGP");

  const [itemName, setItemName] = useState(initial?.itemName || "سلعة / منتج");
  const [itemPrice, setItemPrice] = useState(String(initial?.itemPrice ?? 100000));
  const [downPayment, setDownPayment] = useState(String(initial?.downPayment ?? 15000));
  const [periodValue, setPeriodValue] = useState(String(initial?.periodValue ?? 24));
  const [periodType, setPeriodType] = useState<PeriodType>(initial?.periodType ?? "months");
  const [annualRate, setAnnualRate] = useState("0");
  const [interestType, setInterestType] = useState<InterestType>("flat");

  const [adminFeeValue, setAdminFeeValue] = useState("0");
  const [adminFeeType, setAdminFeeType] = useState<FeeType>("percent");
  const [adminFeePayment, setAdminFeePayment] = useState<PayMode>("upfront");

  const [hasDeliveryPayment, setHasDeliveryPayment] = useState(false);
  const [deliveryPaymentAmount, setDeliveryPaymentAmount] = useState("0");

  const [hasMaintenance, setHasMaintenance] = useState(false);
  const [maintenanceValue, setMaintenanceValue] = useState("0");
  const [maintenancePayment, setMaintenancePayment] = useState<PayMode>("upfront");

  const [hasPeriodic, setHasPeriodic] = useState(false);
  const [periodicAmount, setPeriodicAmount] = useState("0");
  const [periodicFrequency, setPeriodicFrequency] = useState<Frequency>("quarterly");
  const [periodicDurationMode, setPeriodicDurationMode] = useState<DurationMode>("full");
  const [periodicDurationYears, setPeriodicDurationYears] = useState("1");

  const [targetMonthlyBudget, setTargetMonthlyBudget] = useState("");

  const [compPeriodValue, setCompPeriodValue] = useState("3");
  const [compAnnualRate, setCompAnnualRate] = useState("10");
  const [compAdminFeeValue, setCompAdminFeeValue] = useState("2");

  const [revCashPrice, setRevCashPrice] = useState("50000");
  const [revDownPayment, setRevDownPayment] = useState("10000");
  const [revMonths, setRevMonths] = useState("12");
  const [revMonthlyInstallment, setRevMonthlyInstallment] = useState("4000");

  const planA = useMemo(
    () =>
      calculatePlan(
        Number(itemPrice), Number(downPayment), Number(periodValue), periodType, Number(annualRate), interestType,
        Number(adminFeeValue), adminFeeType, adminFeePayment,
        hasDeliveryPayment, Number(deliveryPaymentAmount),
        hasMaintenance, Number(maintenanceValue), maintenancePayment,
        hasPeriodic, Number(periodicAmount), periodicFrequency, periodicDurationMode, Number(periodicDurationYears)
      ),
    [
      itemPrice, downPayment, periodValue, periodType, annualRate, interestType,
      adminFeeValue, adminFeeType, adminFeePayment,
      hasDeliveryPayment, deliveryPaymentAmount,
      hasMaintenance, maintenanceValue, maintenancePayment,
      hasPeriodic, periodicAmount, periodicFrequency, periodicDurationMode, periodicDurationYears,
    ]
  );

  const planB = useMemo(
    () =>
      calculatePlan(
        Number(itemPrice), Number(downPayment), Number(compPeriodValue), "years", Number(compAnnualRate), interestType,
        Number(compAdminFeeValue), "percent", "upfront", false, 0, false, 0, "upfront", false, 0, "quarterly", "full", 1
      ),
    [itemPrice, downPayment, compPeriodValue, compAnnualRate, interestType, compAdminFeeValue]
  );

  const negotiationProposals = useMemo(() => {
    const target = Number(targetMonthlyBudget) || 0;
    const currentMonthly = planA.monthly;
    if (target <= 0 || planA.error || currentMonthly <= target) return null;

    const diff = currentMonthly - target;
    const totalMonths = planA.totalMonths;
    const totalGapAmount = diff * totalMonths;

    const neededMonthsForTarget = Math.ceil((planA.monthly * totalMonths) / target);
    const neededYears = (neededMonthsForTarget / 12).toFixed(1);

    const totalYears = totalMonths / 12;
    const suggestedAnnualPayment = Math.round(totalGapAmount / Math.max(1, totalYears));
    const suggestedExtraDown = Math.round(totalGapAmount);

    return { diff: Math.round(diff), neededMonthsForTarget, neededYears, suggestedAnnualPayment, suggestedExtraDown };
  }, [targetMonthlyBudget, planA]);

  const amortizationSchedule = useMemo(() => {
    if (planA.error || planA.totalMonths <= 0) return [];
    let balance = planA.baseFinanced;
    const monthlyP = planA.monthly;
    const interestPerMonth = planA.totalInterest / planA.totalMonths;
    const principalPerMonth = monthlyP - interestPerMonth;

    const rows: { month: number; installment: number; principalPart: number; interestPart: number; remainingBalance: number }[] = [];
    for (let i = 1; i <= planA.totalMonths; i++) {
      balance = Math.max(0, balance - principalPerMonth);
      rows.push({
        month: i,
        installment: monthlyP,
        principalPart: Math.round(principalPerMonth),
        interestPart: Math.round(interestPerMonth),
        remainingBalance: Math.round(balance),
      });
    }
    return rows;
  }, [planA]);

  const calcReverse = useMemo(() => {
    const cash = Number(revCashPrice) || 0;
    const down = Number(revDownPayment) || 0;
    const count = Number(revMonths) || 0;
    const inst = Number(revMonthlyInstallment) || 0;

    const financed = Math.max(0, cash - down);
    const totalInst = count * inst;
    const grandTotal = down + totalInst;
    const interest = Math.max(0, grandTotal - cash);

    let error: string | null = null;
    if (cash <= 0 || count <= 0 || inst <= 0) error = "يرجى ملء الحقول بأرقام صحيحة.";
    if (grandTotal < cash) error = "إجمالي الأقساط أقل من سعر الكاش نفسه!";

    const totalIncreasePercent = financed > 0 ? (interest / financed) * 100 : 0;
    const annualRateEstimated = count / 12 > 0 ? totalIncreasePercent / (count / 12) : 0;

    return {
      error,
      financed,
      totalInst,
      grandTotal,
      interest: Math.round(interest),
      totalIncreasePercent: Math.round(totalIncreasePercent * 10) / 10,
      annualRateEstimated: Math.round(annualRateEstimated * 10) / 10,
    };
  }, [revCashPrice, revDownPayment, revMonths, revMonthlyInstallment]);

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "singlePlan", label: "الخطة الأساسية", icon: Calculator },
    { key: "negotiation", label: "التفاوض والبدائل", icon: TrendingUp },
    { key: "comparison", label: "مقارنة خطتين", icon: Scale },
    { key: "reverse", label: "كشف الفائدة", icon: Search },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-neutral-950 text-white px-4 py-3 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center shrink-0">
              <Calculator size={15} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">حاسبة الأقساط</p>
              <p className="text-[10px] text-neutral-400 truncate">فايدة، مصاريف إدارية، دفعة استلام، مقارنة، وتفاوض ذكي</p>
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-white p-1 shrink-0"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1 shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold border transition ${
                  tab === t.key ? "bg-orange-600 text-white border-orange-600" : "border-neutral-300 dark:border-neutral-700 text-neutral-500"
                }`}
              >
                <t.icon size={12} /> {t.label}
              </button>
            ))}
          </div>

          {tab === "singlePlan" && (
            <div className="space-y-4">
              {planA.error && <p className="text-xs font-medium text-red-600 bg-red-50 dark:bg-red-950 rounded-lg p-2.5">⚠️ {planA.error}</p>}

              <div>
                <label className={labelCls}>اسم السلعة</label>
                <input value={itemName} onChange={(e) => setItemName(e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>سعر السلعة كاش</label>
                  <input type="number" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>المقدم المدفوع</label>
                  <input type="number" value={downPayment} onChange={(e) => setDownPayment(e.target.value)} className={inputCls} />
                </div>
              </div>

              <div>
                <label className={labelCls}>فترة التقسيط</label>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" value={periodValue} onChange={(e) => setPeriodValue(e.target.value)} className={inputCls} />
                  <select value={periodType} onChange={(e) => setPeriodType(e.target.value as PeriodType)} className={inputCls}>
                    <option value="years">سنوات</option>
                    <option value="months">شهور</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>نظام الفائدة</label>
                  <select value={interestType} onChange={(e) => setInterestType(e.target.value as InterestType)} className={inputCls}>
                    <option value="flat">فائدة سنوية ثابتة</option>
                    <option value="reducing">فائدة متناقصة</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>الفائدة السنوية (%)</label>
                  <input type="number" step="0.1" value={annualRate} onChange={(e) => setAnnualRate(e.target.value)} className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className={boxCls}>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={hasDeliveryPayment} onChange={(e) => setHasDeliveryPayment(e.target.checked)} className="w-4 h-4 accent-orange-600" />
                    <span className="text-xs font-semibold">دفعة استلام مخصصة</span>
                  </label>
                  {hasDeliveryPayment && (
                    <input type="number" placeholder="مبلغ دفعة الاستلام" value={deliveryPaymentAmount} onChange={(e) => setDeliveryPaymentAmount(e.target.value)} className={inputCls} />
                  )}
                </div>

                <div className={boxCls}>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={hasMaintenance} onChange={(e) => setHasMaintenance(e.target.checked)} className="w-4 h-4 accent-orange-600" />
                      <span className="text-xs font-semibold">وديعة / صيانة</span>
                    </label>
                    {hasMaintenance && (
                      <select value={maintenancePayment} onChange={(e) => setMaintenancePayment(e.target.value as PayMode)} className="text-[10px] rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-1 py-0.5">
                        <option value="upfront">كاش</option>
                        <option value="financed">تقسيط</option>
                      </select>
                    )}
                  </div>
                  {hasMaintenance && (
                    <input type="number" placeholder="مبلغ الصيانة" value={maintenanceValue} onChange={(e) => setMaintenanceValue(e.target.value)} className={inputCls} />
                  )}
                </div>
              </div>

              <div className={boxCls}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">المصاريف الإدارية</span>
                  <div className="flex gap-2 text-[11px]">
                    <label className="flex items-center gap-1"><input type="radio" checked={adminFeePayment === "upfront"} onChange={() => setAdminFeePayment("upfront")} /> مقدماً</label>
                    <label className="flex items-center gap-1"><input type="radio" checked={adminFeePayment === "financed"} onChange={() => setAdminFeePayment("financed")} /> تقسيط</label>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" step="0.1" value={adminFeeValue} onChange={(e) => setAdminFeeValue(e.target.value)} className={inputCls} />
                  <select value={adminFeeType} onChange={(e) => setAdminFeeType(e.target.value as FeeType)} className={inputCls}>
                    <option value="percent">نسبة (%)</option>
                    <option value="fixed">مبلغ ثابت</option>
                  </select>
                </div>
              </div>

              <div className={boxCls}>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={hasPeriodic} onChange={(e) => setHasPeriodic(e.target.checked)} className="w-4 h-4 accent-orange-600" />
                  <span className="text-xs font-semibold">دفعات دورية موازية للأقساط</span>
                </label>
                {hasPeriodic && (
                  <div className="space-y-2 pt-1.5 border-t border-neutral-200 dark:border-neutral-700">
                    <div className="grid grid-cols-2 gap-2">
                      <select value={periodicFrequency} onChange={(e) => setPeriodicFrequency(e.target.value as Frequency)} className={inputCls}>
                        {Object.entries(frequencyMap).map(([k, v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>
                      <input type="number" placeholder="مبلغ الدفعة" value={periodicAmount} onChange={(e) => setPeriodicAmount(e.target.value)} className={inputCls} />
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[11px]">
                      <label className="flex items-center gap-1 cursor-pointer"><input type="radio" checked={periodicDurationMode === "full"} onChange={() => setPeriodicDurationMode("full")} /> طوال مدة التقسيط</label>
                      <label className="flex items-center gap-1 cursor-pointer"><input type="radio" checked={periodicDurationMode === "custom"} onChange={() => setPeriodicDurationMode("custom")} /> لمدة محددة:</label>
                      {periodicDurationMode === "custom" && (
                        <div className="flex items-center gap-1">
                          <input type="number" min="1" value={periodicDurationYears} onChange={(e) => setPeriodicDurationYears(e.target.value)} className="w-12 px-1 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent text-xs text-center" />
                          <span>سنوات فقط</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className={labelCls}>العملة</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls + " w-24"}>
                  <option value="EGP">جنيه</option><option value="USD">دولار</option><option value="SAR">ريال</option>
                </select>
              </div>

              <div className="rounded-2xl bg-neutral-950 text-white p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                  <span className="text-[11px] text-neutral-400 truncate">عرض سعر: {itemName}</span>
                  <span className="text-[10px] px-2 py-0.5 bg-orange-500/20 text-orange-300 rounded font-bold shrink-0">APR ≈ {planA.trueApr}%</span>
                </div>

                <div className="bg-gradient-to-l from-orange-600 to-orange-500 rounded-xl p-4 text-center">
                  <span className="text-[11px] opacity-90 block mb-1">القسط الشهري المستمر</span>
                  <div className="text-2xl font-black">{fmt(planA.monthly, currency)}</div>
                  <span className="text-[10px] opacity-80 block mt-1">يُدفع لمدة {planA.totalMonths} شهراً</span>
                </div>

                <div className="space-y-1 text-[11px] text-neutral-300">
                  <Row label="سعر السلعة كاش" value={fmt(Number(itemPrice) || 0, currency)} />
                  <Row label="المقدم" value={fmt(Number(downPayment) || 0, currency)} />
                  {hasDeliveryPayment && <Row label="دفعة الاستلام" value={fmt(planA.delivery, currency)} accent="text-emerald-400" />}
                  {hasMaintenance && <Row label="وديعة الصيانة" value={`+${fmt(planA.maintenance, currency)}`} accent="text-orange-300" />}
                  {planA.adminFee > 0 && <Row label="المصاريف الإدارية" value={`+${fmt(planA.adminFee, currency)}`} accent="text-orange-300" />}
                  {hasPeriodic && <Row label="إجمالي الدفعات الإضافية" value={`+${fmt(planA.totalPeriodicAmount, currency)}`} accent="text-emerald-400" />}
                  <Row label="إجمالي الفوائد" value={`+${fmt(planA.totalInterest, currency)}`} accent="text-amber-400" />
                  <div className="flex justify-between pt-2 mt-1 border-t border-neutral-800 text-sm font-bold text-emerald-400">
                    <span>الإجمالي الكلي بالتقسيط</span><span>{fmt(planA.totalPaidAll, currency)}</span>
                  </div>
                </div>

                <button onClick={() => setShowSchedule((s) => !s)} className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5">
                  <Table2 size={13} /> {showSchedule ? "إخفاء جدول الإهلاك" : "عرض جدول الإهلاك الشهري"}
                </button>
              </div>

              {onApply && !planA.error && (
                <button
                  onClick={() => { onApply({ item_name: itemName, monthly_amount: planA.monthly, months_count: planA.totalMonths, currency }); onClose(); }}
                  className="w-full bg-orange-600 text-white rounded-lg py-2.5 text-sm font-medium"
                >
                  {applyLabel || "استخدم القيم دي في تسجيل قسط جديد"}
                </button>
              )}

              {showSchedule && amortizationSchedule.length > 0 && (
                <div className="border-t border-neutral-100 dark:border-neutral-800 pt-3">
                  <p className="text-xs font-semibold mb-2">جدول الإهلاك الشهري</p>
                  <div className="max-h-64 overflow-y-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
                    <table className="w-full text-[11px] text-right">
                      <thead className="bg-neutral-100 dark:bg-neutral-800 sticky top-0 font-bold">
                        <tr>
                          <th className="p-2">الشهر</th><th className="p-2">القسط</th><th className="p-2">الأصل</th><th className="p-2">الفائدة</th><th className="p-2">المتبقي</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                        {amortizationSchedule.map((row) => (
                          <tr key={row.month}>
                            <td className="p-2 font-bold">#{row.month}</td>
                            <td className="p-2">{fmt(row.installment, currency)}</td>
                            <td className="p-2 text-neutral-500">{fmt(row.principalPart, currency)}</td>
                            <td className="p-2 text-amber-600 dark:text-amber-400">{fmt(row.interestPart, currency)}</td>
                            <td className="p-2 font-semibold">{fmt(row.remainingBalance, currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "negotiation" && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-900">
                <p className="text-xs font-bold text-orange-800 dark:text-orange-300 mb-1">التفاوض العكسي (اقتراح عروض بديلة)</p>
                <p className="text-[11px] text-orange-700/90 dark:text-orange-300/80 leading-relaxed">
                  القسط الشهري الحالي (من تبويب "الخطة الأساسية") هو <b>{fmt(planA.monthly, currency)}</b>. لو الرقم ده أعلى من اللي تقدر تدفعه، حدد أقصى قسط تقدر تلتزم بيه وهنقترحلك 3 بدائل تقدر تفاوض بيها البائع.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <input type="number" placeholder="أقصى قسط تقدر تدفعه شهريًا" value={targetMonthlyBudget} onChange={(e) => setTargetMonthlyBudget(e.target.value)} className={inputCls + " w-40"} />
                  <span className="text-[10px] text-neutral-400">{currency}/شهر</span>
                </div>
              </div>

              {negotiationProposals ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="rounded-xl border border-orange-200 dark:border-orange-900 bg-orange-50/60 dark:bg-orange-950/60 p-3 space-y-2">
                    <p className="text-xs font-bold text-orange-800 dark:text-orange-300">1️⃣ زيادة مدة السداد</p>
                    <p className="text-[11px] text-neutral-500 leading-relaxed">اطلب تمديد فترة التقسيط لحد ما القسط يوصل للمبلغ المستهدف.</p>
                    <div className="bg-white dark:bg-neutral-900 rounded-lg p-2 text-center border border-orange-200 dark:border-orange-900">
                      <span className="text-[10px] text-neutral-400 block">المدة المقترحة</span>
                      <span className="text-base font-black text-orange-700 dark:text-orange-400">{negotiationProposals.neededYears} سنة</span>
                      <span className="text-[10px] text-neutral-400 block">({negotiationProposals.neededMonthsForTarget} قسطاً)</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/40 p-3 space-y-2">
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-300">2️⃣ إضافة دفعة سنوية</p>
                    <p className="text-[11px] text-neutral-500 leading-relaxed">احتفظ بنفس المدة، وادفع دفعة سنوية إضافية بدل ما القسط الشهري يزيد.</p>
                    <div className="bg-white dark:bg-neutral-900 rounded-lg p-2 text-center border border-amber-200 dark:border-amber-900">
                      <span className="text-[10px] text-neutral-400 block">الدفعة السنوية المقترحة</span>
                      <span className="text-base font-black text-amber-700 dark:text-amber-400">+{fmt(negotiationProposals.suggestedAnnualPayment, currency)}</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/40 p-3 space-y-2">
                    <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">3️⃣ زيادة المقدم</p>
                    <p className="text-[11px] text-neutral-500 leading-relaxed">زوّد الدفعة الأولى مقدمًا عشان يقل المبلغ المُقسّط ويوصل القسط للهدف.</p>
                    <div className="bg-white dark:bg-neutral-900 rounded-lg p-2 text-center border border-emerald-200 dark:border-emerald-900">
                      <span className="text-[10px] text-neutral-400 block">المقدم الجديد المقترح</span>
                      <span className="text-base font-black text-emerald-700 dark:text-emerald-400">{fmt((Number(downPayment) || 0) + negotiationProposals.suggestedExtraDown, currency)}</span>
                      <span className="text-[10px] text-neutral-400 block">(زيادة {fmt(negotiationProposals.suggestedExtraDown, currency)})</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-center text-xs text-neutral-400 py-6 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl">
                  القسط الحالي ({fmt(planA.monthly, currency)}) أصلًا في حدود ميزانيتك المستهدفة، أو لسه مادخلتش ميزانية.
                </p>
              )}
            </div>
          )}

          {tab === "comparison" && (
            <div className="space-y-4">
              <p className="text-[11px] text-neutral-400">مقارنة تكلفة ومعدل APR لخطتين على نفس السلعة (سعر الكاش: {fmt(Number(itemPrice) || 0, currency)})، بنفس بيانات "الخطة الأساسية" (السعر والمقدم).</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between items-center border-b border-neutral-100 dark:border-neutral-800 pb-1.5">
                    <span className="font-bold">الخطة (أ) — الحالية</span>
                    <span className="bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded font-bold text-[10px]">{planA.totalMonths} شهراً</span>
                  </div>
                  <Row label="القسط الشهري" value={fmt(planA.monthly, currency)} bold />
                  <Row label="المصاريف الإدارية" value={fmt(planA.adminFee, currency)} />
                  <Row label="إجمالي الفوائد" value={`+${fmt(planA.totalInterest, currency)}`} />
                  <Row label="معدل APR" value={`${planA.trueApr}%`} bold />
                  <div className="flex justify-between border-t border-neutral-100 dark:border-neutral-800 pt-1.5 font-bold text-sm">
                    <span>إجمالي المدفوع</span><span>{fmt(planA.totalPaidAll, currency)}</span>
                  </div>
                </div>

                <div className="rounded-xl border border-orange-200 dark:border-orange-900 bg-orange-50/40 dark:bg-orange-950/30 p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between items-center border-b border-orange-100 dark:border-orange-900 pb-1.5">
                    <span className="font-bold">الخطة (ب) — بديلة</span>
                    <div className="flex items-center gap-1">
                      <input type="number" value={compPeriodValue} onChange={(e) => setCompPeriodValue(e.target.value)} className="w-10 px-1 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent text-center font-bold text-[11px]" />
                      <span className="text-[10px]">سنوات</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-neutral-400 block mb-0.5">فائدة سنوية (%)</label>
                      <input type="number" step="0.1" value={compAnnualRate} onChange={(e) => setCompAnnualRate(e.target.value)} className="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent font-bold text-[11px]" />
                    </div>
                    <div>
                      <label className="text-[10px] text-neutral-400 block mb-0.5">مصاريف إدارية (%)</label>
                      <input type="number" step="0.1" value={compAdminFeeValue} onChange={(e) => setCompAdminFeeValue(e.target.value)} className="w-full px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent font-bold text-[11px]" />
                    </div>
                  </div>
                  <Row label="القسط الشهري" value={fmt(planB.monthly, currency)} bold accent="text-emerald-600 dark:text-emerald-400" />
                  <Row label="المصاريف الإدارية" value={fmt(planB.adminFee, currency)} />
                  <Row label="إجمالي الفوائد" value={`+${fmt(planB.totalInterest, currency)}`} />
                  <Row label="معدل APR" value={`${planB.trueApr}%`} bold />
                  <div className="flex justify-between border-t border-orange-100 dark:border-orange-900 pt-1.5 font-bold text-sm">
                    <span>إجمالي المدفوع</span><span>{fmt(planB.totalPaidAll, currency)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-neutral-950 text-white p-3 flex items-center justify-between text-xs">
                <span>الفرق الإجمالي بين الخطتين</span>
                <span className="font-bold text-emerald-400">
                  توفير {fmt(Math.abs(planA.totalPaidAll - planB.totalPaidAll), currency)} لصالح الخطة ({planA.totalPaidAll < planB.totalPaidAll ? "أ" : "ب"})
                </span>
              </div>
            </div>
          )}

          {tab === "reverse" && (
            <div className="space-y-4">
              <p className="text-[11px] text-neutral-400">اكتشف الفايدة الفعلية اللي هتدفعها لو حد عرض عليك سلعة بالتقسيط — من غير ما يقولك نسبة الفايدة صراحة.</p>
              {calcReverse.error && <p className="text-xs font-medium text-red-600 bg-red-50 dark:bg-red-950 rounded-lg p-2.5">⚠️ {calcReverse.error}</p>}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>سعر السلعة كاش</label>
                  <input type="number" value={revCashPrice} onChange={(e) => setRevCashPrice(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>المقدم المدفوع</label>
                  <input type="number" value={revDownPayment} onChange={(e) => setRevDownPayment(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>عدد الشهور</label>
                  <input type="number" value={revMonths} onChange={(e) => setRevMonths(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>القسط الشهري المعروض</label>
                  <input type="number" value={revMonthlyInstallment} onChange={(e) => setRevMonthlyInstallment(e.target.value)} className={inputCls} />
                </div>
              </div>

              <div className="rounded-2xl bg-neutral-950 text-white p-4 space-y-3">
                <span className="text-[11px] text-neutral-400 block border-b border-neutral-800 pb-2">تحليل الفايدة المستنتجة</span>
                <div className="bg-neutral-800 rounded-xl p-3 text-center">
                  <span className="text-[11px] text-neutral-400 block mb-1">إجمالي الفوائد المفروضة</span>
                  <div className="text-xl font-black text-amber-400">+{fmt(calcReverse.interest, currency)}</div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                  <div className="bg-neutral-800 rounded-lg p-2">
                    <span className="text-neutral-400 block text-[10px]">نسبة الزيادة الكلية</span>
                    <span className="text-emerald-400 font-bold">{calcReverse.totalIncreasePercent}%</span>
                  </div>
                  <div className="bg-neutral-800 rounded-lg p-2">
                    <span className="text-neutral-400 block text-[10px]">الفائدة السنوية التقريبية</span>
                    <span className="text-orange-400 font-bold">{calcReverse.annualRateEstimated}%</span>
                  </div>
                </div>
                <div className="text-xs border-t border-neutral-800 pt-2 flex justify-between font-bold text-emerald-400">
                  <span>الإجمالي الكلي بالتقسيط</span><span>{fmt(calcReverse.grandTotal, currency)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-neutral-400">{label}</span>
      <span className={`${bold ? "font-bold" : ""} ${accent || ""}`}>{value}</span>
    </div>
  );
}
