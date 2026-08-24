"use client";
import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Card from "@/components/Card";
import { fmt } from "@/lib/format";
import { shrinkImage } from "@/lib/image";
import { shareFile } from "@/lib/shareFile";
import InstallmentCalculatorModal from "@/components/InstallmentCalculator";
import {
  Plus, Trash2, Pencil, CreditCard, Users, CheckCircle2, Camera, ShieldCheck, ShieldAlert,
  Star, ArrowLeftRight, Calculator, ChevronDown, ChevronUp, X, Scale, FileDown, Image as ImageIcon,
} from "lucide-react";

// ===================== types =====================
interface InstallmentPayment {
  id: string; month_index: number; due_date: string; amount: number; status: "pending" | "paid"; paid_at: string | null;
}
interface InstallmentPlan {
  id: string; item_name: string; company_name: string | null; original_price: number | null;
  total_amount: number; months_count: number; monthly_amount: number; currency: string;
  start_date: string; status: "active" | "completed" | "cancelled";
  installment_payments: InstallmentPayment[];
}
interface Gam3eyaParticipant {
  id: string; name: string; phone: string | null; account_number: string | null; address: string | null;
  id_photo_front: string | null; id_photo_back: string | null; selfie_photo: string | null;
  verified: boolean; verification_note: string | null; payout_order: number; rating: number | null;
}
interface Gam3eyaPayment {
  id: string; participant_id: string | null; month_index: number; due_date: string;
  amount: number; status: "pending" | "paid"; paid_at: string | null; receipt_url: string | null;
}
interface Gam3eya {
  id: string; type: "subscribed" | "organizing"; name: string | null; monthly_amount: number; currency: string;
  participants_count: number; months_count: number; start_date: string; my_payout_month: number | null;
  status: "active" | "completed" | "cancelled";
  gam3eya_participants: Gam3eyaParticipant[]; gam3eya_payments: Gam3eyaPayment[];
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function InstallmentsPage() {
  return (
    <Suspense fallback={<p className="text-center text-neutral-400 mt-10">جاري التحميل...</p>}>
      <InstallmentsPageInner />
    </Suspense>
  );
}

function InstallmentsPageInner() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState<"installments" | "gam3eya">(initialTab === "gam3eya" ? "gam3eya" : "installments");

  const [plans, setPlans] = useState<InstallmentPlan[]>([]);
  const [gam3eyat, setGam3eyat] = useState<Gam3eya[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [msgIsError, setMsgIsError] = useState(false);

  const showMsg = (text: string, isError = false) => {
    setMsg(text);
    setMsgIsError(isError);
    setTimeout(() => setMsg(""), isError ? 4500 : 2500);
  };

  // silent=true (كل استدعاء بعد أول تحميل) بيمنع إعادة تحميل الصفحة كلها —
  // كانت أي عملية (تسجيل دفعة، تبديل دور، إضافة فرد...) بترجع loading=true
  // فتختفي الصفحة بالكامل ويظهر "جاري التحميل..." لحظة، وده بيقفل أي كارت
  // متفتح (زي كارت الجمعية) وبيحس المستخدم إنه "خرج" من الصفحة. دلوقتي أول
  // تحميل بس هو اللي بيوريه سبينر؛ أي reload() بعد كده بيحصل في الخلفية
  // والبيانات بتتحدث في مكانها من غير ما حاجة تختفي.
  const loadAll = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [p, g] = await Promise.all([
        fetch("/api/installments").then((r) => r.json()),
        fetch("/api/gam3eya").then((r) => r.json()),
      ]);
      setPlans(p.plans || []);
      setGam3eyat(g.gam3eyas || []);
    } finally {
      if (!silent) setLoading(false);
    }
  };
  const reload = () => loadAll(true);
  useEffect(() => { loadAll(); }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">أقساط وجمعيات</h1>

      {msg && (
        <Card className={`text-sm text-center ${msgIsError ? "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400" : "bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300"}`}>
          {msg}
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2 bg-neutral-100 dark:bg-neutral-800 rounded-xl p-1">
        <button
          onClick={() => setTab("installments")}
          className={`flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium ${tab === "installments" ? "bg-white dark:bg-neutral-900 shadow text-orange-600" : "text-neutral-500"}`}
        >
          <CreditCard size={14} /> أقساط
        </button>
        <button
          onClick={() => setTab("gam3eya")}
          className={`flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium ${tab === "gam3eya" ? "bg-white dark:bg-neutral-900 shadow text-orange-600" : "text-neutral-500"}`}
        >
          <Users size={14} /> جمعيات
        </button>
      </div>

      {loading && <p className="text-center text-sm text-neutral-400 py-6">جاري التحميل...</p>}

      {!loading && tab === "installments" && <InstallmentsTab plans={plans} reload={reload} showMsg={showMsg} />}
      {!loading && tab === "gam3eya" && <Gam3eyaTab gam3eyat={gam3eyat} reload={reload} showMsg={showMsg} />}
    </div>
  );
}

// ===================== أقساط =====================
function InstallmentsTab({ plans, reload, showMsg }: { plans: InstallmentPlan[]; reload: () => void; showMsg: (t: string, e?: boolean) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ item_name: "", company_name: "", original_price: "", monthly_amount: "", months_count: "", start_date: todayISO(), currency: "EGP" });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<InstallmentPlan | null>(null);
  const [escalation, setEscalation] = useState<InstallmentPlan | null>(null);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showBudgetReview, setShowBudgetReview] = useState(false);
  const [calculatorPlan, setCalculatorPlan] = useState<InstallmentPlan | null>(null); // set = "تعديل متقدم" على خطة موجودة، فاضي = إنشاء قسط جديد
  const [editPayment, setEditPayment] = useState<{ plan: InstallmentPlan; payment: InstallmentPayment } | null>(null);
  const [editPlan, setEditPlan] = useState<InstallmentPlan | null>(null);
  const [busy, setBusy] = useState(false);

  const active = plans.filter((p) => p.status === "active");
  const completed = plans.filter((p) => p.status === "completed");
  const totalRemaining = active.reduce((s, p) => s + p.installment_payments.filter((x) => x.status === "pending").reduce((s2, x) => s2 + Number(x.amount), 0), 0);

  const submit = async () => {
    if (!form.item_name || !form.monthly_amount || !form.months_count) { showMsg("اسم السلعة ومبلغ القسط وعدد الشهور لازم يتملوا", true); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/installments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_name: form.item_name,
          company_name: form.company_name || null,
          original_price: form.original_price ? parseFloat(form.original_price) : null,
          monthly_amount: parseFloat(form.monthly_amount),
          months_count: parseInt(form.months_count),
          start_date: form.start_date,
          currency: form.currency,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ ومتحفظش، حاول تاني", true); return; }
      setForm({ item_name: "", company_name: "", original_price: "", monthly_amount: "", months_count: "", start_date: todayISO(), currency: "EGP" });
      setShowForm(false);
      reload();
    } catch {
      showMsg("مفيش اتصال بالإنترنت، حاول تاني", true);
    } finally {
      setBusy(false);
    }
  };

  const savePlanEdit = async (plan: InstallmentPlan, updates: { item_name?: string; company_name?: string | null; original_price?: number | null }) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/installments/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ ومتحفظش التعديل", true); return; }
      showMsg("✅ اتحفظ التعديل");
      setEditPlan(null);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const applyAdvancedEdit = async (plan: InstallmentPlan, v: { monthly_amount: number; months_count: number }) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/installments/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate: { monthly_amount: v.monthly_amount, months_count: v.months_count } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ وماتحدثش الجدول", true); return; }
      showMsg("✅ اتحدث جدول الأقساط الباقية");
      setShowCalculator(false);
      setCalculatorPlan(null);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const savePaymentEdit = async (plan: InstallmentPlan, payment: InstallmentPayment, updates: { amount?: number; due_date?: string; status?: "pending" | "paid" }) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/installments/${plan.id}/payments/${payment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ ومتحفظش التعديل", true); return; }
      showMsg("✅ اتحفظ التعديل");
      setEditPayment(null);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const markPaid = async (plan: InstallmentPlan, paymentId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/installments/${plan.id}/payments/${paymentId}`, { method: "POST" });
      if (!res.ok) { showMsg("حصل خطأ ومتسجلش، حاول تاني", true); return; }
      showMsg("✅ اتسجل القسط مدفوع");
      reload();
    } finally {
      setBusy(false);
    }
  };

  const payBothOverdue = async (plan: InstallmentPlan) => {
    const overdue = plan.installment_payments.filter((x) => x.status === "pending" && x.due_date < todayISO()).sort((a, b) => a.month_index - b.month_index);
    setBusy(true);
    try {
      for (const p of overdue) {
        await fetch(`/api/installments/${plan.id}/payments/${p.id}`, { method: "POST" });
      }
      showMsg(`✅ اتسجل ${overdue.length} قسط مدفوعين`);
      setEscalation(null);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const reschedule = async (plan: InstallmentPlan) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/installments/${plan.id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months: 1 }),
      });
      if (!res.ok) { showMsg("حصل خطأ في إعادة الجدولة", true); return; }
      showMsg("✅ اتعادت جدولة الأقساط الباقية شهر لقدام");
      setEscalation(null);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const deletePlan = async (plan: InstallmentPlan) => {
    const res = await fetch(`/api/installments/${plan.id}`, { method: "DELETE" });
    setConfirmDelete(null);
    if (!res.ok) { showMsg("حصل خطأ ومتحذفش", true); return; }
    reload();
  };

  return (
    <div className="space-y-3">
      <Card className="bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-900 flex items-center justify-between">
        <div>
          <p className="text-xs text-orange-700 dark:text-orange-300">باقي عليك (كل الأقساط الشغالة)</p>
          <p className="text-lg font-bold text-orange-700 dark:text-orange-300">{fmt(totalRemaining, "EGP")}</p>
        </div>
        <div className="text-xs text-orange-600 dark:text-orange-400 text-left">
          <p>{active.length} قسط شغال</p>
          <p>{completed.length} خلص ✅</p>
        </div>
      </Card>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">كل الأقساط</p>
        <div className="flex gap-2">
          <button onClick={() => setShowBudgetReview(true)} className="flex items-center gap-1 text-xs border border-orange-300 dark:border-orange-800 text-orange-600 dark:text-orange-400 rounded-full px-3 py-1.5">
            <Scale size={14} /> راجع ميزانيتك
          </button>
          <button onClick={() => { setCalculatorPlan(null); setShowCalculator(true); }} className="flex items-center gap-1 text-xs border border-orange-300 dark:border-orange-800 text-orange-600 dark:text-orange-400 rounded-full px-3 py-1.5">
            <Calculator size={14} /> حاسبة
          </button>
          <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-1 text-xs bg-orange-600 text-white rounded-full px-3 py-1.5">
            <Plus size={14} /> قسط جديد
          </button>
        </div>
      </div>

      {showForm && (
        <Card className="space-y-2">
          <input placeholder="اسم السلعة (مثال: تلاجة)" value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          <input placeholder="اسم الشركة (اختياري)" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          <div>
            <input type="number" placeholder="السعر الأصلي (اختياري — لحساب الفايدة)" value={form.original_price} onChange={(e) => setForm({ ...form, original_price: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-neutral-400">عدد الشهور</label>
              <input type="number" placeholder="عدد الشهور" value={form.months_count} onChange={(e) => setForm({ ...form, months_count: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-neutral-400">تاريخ بداية القسط</label>
              <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-neutral-400">مبلغ القسط الشهري</label>
              <input type="number" placeholder="مبلغ القسط الشهري" value={form.monthly_amount} onChange={(e) => setForm({ ...form, monthly_amount: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-neutral-400">العملة</label>
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
                <option value="EGP">جنيه</option><option value="USD">دولار</option><option value="SAR">ريال</option>
              </select>
            </div>
          </div>
          {form.monthly_amount && form.months_count && (
            <div className="rounded-lg bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-900 p-2.5 text-[11px] text-orange-700 dark:text-orange-300 space-y-0.5">
              <p>إجمالي العملية: {fmt(parseFloat(form.monthly_amount) * (parseInt(form.months_count) || 0), form.currency)}</p>
              {form.original_price && parseFloat(form.original_price) > 0 && (
                <p>الفايدة: {fmt(parseFloat(form.monthly_amount) * (parseInt(form.months_count) || 0) - parseFloat(form.original_price), form.currency)} ({Math.round(((parseFloat(form.monthly_amount) * (parseInt(form.months_count) || 0) - parseFloat(form.original_price)) / parseFloat(form.original_price)) * 100)}%)</p>
              )}
            </div>
          )}
          <button disabled={busy} onClick={submit} className="w-full bg-orange-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60">حفظ</button>
        </Card>
      )}

      <div className="space-y-2">
        {plans.map((plan) => {
          const overduePending = plan.installment_payments.filter((x) => x.status === "pending" && x.due_date < todayISO());
          const nextPending = plan.installment_payments.find((x) => x.status === "pending");
          const paidCount = plan.installment_payments.filter((x) => x.status === "paid").length;
          const paidSum = plan.installment_payments.filter((x) => x.status === "paid").reduce((s, x) => s + Number(x.amount), 0);
          const totalSum = plan.installment_payments.reduce((s, x) => s + Number(x.amount), 0);
          const remainingSum = totalSum - paidSum;
          const isOpen = expanded === plan.id;
          const interestPct = plan.original_price && plan.original_price > 0 ? Math.round(((plan.total_amount - plan.original_price) / plan.original_price) * 100) : null;

          return (
            <Card key={plan.id} className="!p-3 space-y-2">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(isOpen ? null : plan.id)}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{plan.item_name}{plan.company_name ? ` — ${plan.company_name}` : ""}</p>
                  <p className="text-[11px] text-neutral-400">
                    {fmt(plan.monthly_amount, plan.currency)}/شهر · {paidCount}/{plan.months_count} اتدفعوا
                    {plan.status === "completed" && " · خلص ✅"}
                    {interestPct !== null && ` · فايدة ${interestPct}%`}
                  </p>
                  {nextPending && (
                    <p className={`text-[11px] mt-0.5 ${overduePending.length > 0 ? "text-red-500 font-medium" : "text-neutral-400"}`}>
                      {overduePending.length > 0 ? `⚠️ متأخر من ${nextPending.due_date}` : `القسط الجاي: ${fmt(Number(nextPending.amount), plan.currency)} بتاريخ ${nextPending.due_date}`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {overduePending.length >= 2 && (
                    <button onClick={(e) => { e.stopPropagation(); setEscalation(plan); }} className="text-[10px] bg-red-600 text-white rounded-full px-2 py-1">قسطين متأخرين</button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); setEditPlan(plan); }} className="text-neutral-400 hover:text-orange-600 p-1"><Pencil size={14} /></button>
                  <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(plan); }} className="text-neutral-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
                  {isOpen ? <ChevronUp size={16} className="text-neutral-400" /> : <ChevronDown size={16} className="text-neutral-400" />}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-1 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 p-2 text-center">
                <div>
                  <p className="text-[9px] text-neutral-400">إجمالي العملية</p>
                  <p className="text-[11px] font-semibold">{fmt(totalSum, plan.currency)}</p>
                </div>
                <div>
                  <p className="text-[9px] text-neutral-400">المدفوع</p>
                  <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">{fmt(paidSum, plan.currency)}</p>
                </div>
                <div>
                  <p className="text-[9px] text-neutral-400">الباقي</p>
                  <p className="text-[11px] font-semibold text-orange-600 dark:text-orange-400">{fmt(remainingSum, plan.currency)}</p>
                </div>
                <div>
                  <p className="text-[9px] text-neutral-400">القسط القادم</p>
                  <p className="text-[11px] font-semibold">{nextPending ? fmt(Number(nextPending.amount), plan.currency) : "—"}</p>
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-neutral-100 dark:border-neutral-800 pt-2 space-y-1.5">
                  {plan.installment_payments.map((p) => {
                    const late = p.status === "pending" && p.due_date < todayISO();
                    return (
                      <div key={p.id} className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${late ? "bg-red-50 dark:bg-red-950 ring-1 ring-red-300 dark:ring-red-800" : "bg-neutral-50 dark:bg-neutral-800/50"}`}>
                        <button onClick={() => setEditPayment({ plan, payment: p })} className="flex-1 text-right hover:underline">
                          قسط {p.month_index} — {p.due_date} — {fmt(Number(p.amount), plan.currency)}
                        </button>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {p.status === "paid" ? (
                            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2 size={12} /> مدفوع</span>
                          ) : (
                            <button disabled={busy} onClick={() => markPaid(plan, p.id)} className="bg-orange-600 text-white rounded-full px-2 py-1">تم الدفع</button>
                          )}
                          <button onClick={() => setEditPayment({ plan, payment: p })} className="text-neutral-400 hover:text-orange-600 p-0.5"><Pencil size={12} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
        {plans.length === 0 && <p className="text-center text-sm text-neutral-400 py-6">لسه مفيش أقساط مسجلة.</p>}
      </div>

      {escalation && (
        <Modal onClose={() => setEscalation(null)}>
          <p className="font-semibold text-sm">قسطين متأخرين في "{escalation.item_name}"</p>
          <p className="text-xs text-neutral-500">فاتك شهرين من غير ما تسدد. تحب تدفع القسطين مع بعض دلوقتي، ولا نعيد جدولة الباقي شهر لقدام (المعاد الجاي بس بيتأجل، من غير ما يتغير عدد الأقساط)؟</p>
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => reschedule(escalation)} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm disabled:opacity-60">أعد الجدولة</button>
            <button disabled={busy} onClick={() => payBothOverdue(escalation)} className="flex-1 bg-orange-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60">ادفع القسطين</button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <DeleteConfirmModal
          description={`هتحذف "${confirmDelete.item_name}" وكل جدول أقساطه. الإجراء ده مش قابل للتراجع.`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => deletePlan(confirmDelete)}
        />
      )}

      {editPayment && (
        <PaymentEditModal
          plan={editPayment.plan}
          payment={editPayment.payment}
          busy={busy}
          onClose={() => setEditPayment(null)}
          onSave={(updates) => savePaymentEdit(editPayment.plan, editPayment.payment, updates)}
        />
      )}

      {showBudgetReview && <SimulatorModal onClose={() => setShowBudgetReview(false)} kind="installment" />}

      {editPlan && (
        <PlanEditModal
          plan={editPlan}
          busy={busy}
          onClose={() => setEditPlan(null)}
          onSave={(updates) => savePlanEdit(editPlan, updates)}
          onAdvancedEdit={() => { setEditPlan(null); setCalculatorPlan(editPlan); setShowCalculator(true); }}
        />
      )}

      {showCalculator && (
        <InstallmentCalculatorModal
          onClose={() => { setShowCalculator(false); setCalculatorPlan(null); }}
          applyLabel={calculatorPlan ? "حدّث جدول الأقساط الباقية بالقيم دي" : undefined}
          initial={
            calculatorPlan
              ? {
                  itemName: calculatorPlan.item_name,
                  itemPrice: calculatorPlan.original_price || calculatorPlan.total_amount,
                  downPayment: 0,
                  periodValue: Math.max(1, calculatorPlan.months_count - calculatorPlan.installment_payments.filter((p) => p.status === "paid").length),
                  periodType: "months",
                  currency: calculatorPlan.currency,
                }
              : undefined
          }
          onApply={(v) => {
            if (calculatorPlan) {
              applyAdvancedEdit(calculatorPlan, { monthly_amount: v.monthly_amount, months_count: v.months_count });
              return;
            }
            setForm({
              item_name: v.item_name,
              company_name: "",
              original_price: "",
              monthly_amount: String(v.monthly_amount),
              months_count: String(v.months_count),
              start_date: todayISO(),
              currency: v.currency,
            });
            setShowForm(true);
            showMsg("✅ اتملى الفورم بقيم الحاسبة — راجعها واحفظ");
          }}
        />
      )}
    </div>
  );
}

function PlanEditModal({
  plan, busy, onClose, onSave, onAdvancedEdit,
}: {
  plan: InstallmentPlan; busy: boolean; onClose: () => void;
  onSave: (updates: { item_name: string; company_name: string | null; original_price: number | null }) => void;
  onAdvancedEdit: () => void;
}) {
  const [itemName, setItemName] = useState(plan.item_name);
  const [companyName, setCompanyName] = useState(plan.company_name || "");
  const [originalPrice, setOriginalPrice] = useState(plan.original_price ? String(plan.original_price) : "");

  return (
    <Modal onClose={onClose}>
      <p className="font-semibold text-sm">تعديل بيانات القسط</p>
      <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 rounded-lg p-2">
        ⚠️ التعديل هيغيّر بيانات القسط المسجلة عندك.
      </p>
      <div>
        <label className="text-[10px] text-neutral-400">اسم السلعة</label>
        <input value={itemName} onChange={(e) => setItemName(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-[10px] text-neutral-400">اسم الشركة (اختياري)</label>
        <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-[10px] text-neutral-400">السعر الأصلي (اختياري — لحساب الفايدة)</label>
        <input type="number" value={originalPrice} onChange={(e) => setOriginalPrice(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
      </div>
      <button
        disabled={busy || !itemName.trim()}
        onClick={() => onSave({ item_name: itemName, company_name: companyName || null, original_price: originalPrice ? parseFloat(originalPrice) : null })}
        className="w-full bg-orange-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60"
      >
        حفظ
      </button>
      <button onClick={onAdvancedEdit} className="w-full flex items-center justify-center gap-1 rounded-lg border border-orange-300 dark:border-orange-800 text-orange-600 dark:text-orange-400 py-2 text-sm font-medium">
        <Calculator size={14} /> تعديل متقدم (المبلغ الشهري وعدد الشهور عن طريق الحاسبة)
      </button>
      <p className="text-[10px] text-neutral-400 text-center">التعديل المتقدم بيغيّر بس الأقساط اللي لسه ما اتدفعتش — الأقساط المدفوعة فعلاً متتأثرش.</p>
    </Modal>
  );
}

function PaymentEditModal({
  plan, payment, busy, onClose, onSave,
}: {
  plan: InstallmentPlan; payment: InstallmentPayment; busy: boolean; onClose: () => void;
  onSave: (updates: { amount?: number; due_date?: string; status?: "pending" | "paid" }) => void;
}) {
  const [amount, setAmount] = useState(String(payment.amount));
  const [dueDate, setDueDate] = useState(payment.due_date);

  return (
    <Modal onClose={onClose}>
      <p className="font-semibold text-sm">تعديل القسط رقم {payment.month_index} — {plan.item_name}</p>
      <div>
        <label className="text-[10px] text-neutral-400">المبلغ</label>
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-[10px] text-neutral-400">تاريخ الاستحقاق</label>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
      </div>
      <button
        disabled={busy}
        onClick={() => onSave({ amount: parseFloat(amount), due_date: dueDate })}
        className="w-full bg-orange-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60"
      >
        حفظ التعديل
      </button>
      {payment.status === "paid" ? (
        <button disabled={busy} onClick={() => onSave({ status: "pending" })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm disabled:opacity-60">
          التراجع عن "تم الدفع"
        </button>
      ) : (
        <button disabled={busy} onClick={() => onSave({ status: "paid" })} className="w-full rounded-lg border border-emerald-300 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 py-2 text-sm disabled:opacity-60">
          علّمه كمدفوع
        </button>
      )}
    </Modal>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

const DELETE_CONFIRM_WORD = "idea";

// حماية إضافية قبل أي حذف نهائي (قسط أو جمعية) — لازم تكتب "idea" (بأي حروف
// كابيتال أو سمول) في المربع قبل ما زرار "حذف نهائي" يشتغل، عشان يبقى في
// خطوة واعية قبل إجراء مش قابل للتراجع.
function DeleteConfirmModal({ description, onCancel, onConfirm }: { description: string; onCancel: () => void; onConfirm: () => void }) {
  const [word, setWord] = useState("");
  const canDelete = word.trim().toLowerCase() === DELETE_CONFIRM_WORD;

  return (
    <Modal onClose={onCancel}>
      <p className="font-semibold text-sm">تأكيد الحذف</p>
      <p className="text-xs text-neutral-500">{description}</p>
      <div>
        <label className="text-[10px] text-neutral-400">اكتب كلمة idea في المربع علشان يتم الحذف</label>
        <input
          value={word}
          onChange={(e) => setWord(e.target.value)}
          placeholder="idea"
          className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm">إلغاء</button>
        <button disabled={!canDelete} onClick={onConfirm} className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-40">حذف نهائي</button>
      </div>
    </Modal>
  );
}

function StarPicker({ value, onChange, readOnly = false }: { value: number | null; onChange?: (v: number) => void; readOnly?: boolean }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          className={readOnly ? "cursor-default" : "cursor-pointer"}
        >
          <Star size={14} className={(value || 0) >= n ? "fill-amber-400 text-amber-400" : "text-neutral-300 dark:text-neutral-700"} />
        </button>
      ))}
    </div>
  );
}

// ===================== جمعيات =====================
type NewParticipant = { name: string; phone: string; account_number: string; address: string; id_photo_front: string };

function Gam3eyaTab({
  gam3eyat, reload, showMsg,
}: {
  gam3eyat: Gam3eya[]; reload: () => void; showMsg: (t: string, e?: boolean) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"subscribed" | "organizing">("subscribed");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Gam3eya | null>(null);
  const [showSimulator, setShowSimulator] = useState(false);
  const [verifyPanel, setVerifyPanel] = useState<{ gam3eyaId: string; participantId: string } | null>(null);
  const [swapMode, setSwapMode] = useState<string | null>(null); // gam3eya id currently in swap-picker mode
  const [swapFirst, setSwapFirst] = useState<string | null>(null); // first participant picked for swap

  const [subForm, setSubForm] = useState({ name: "", monthly_amount: "", currency: "EGP", months_count: "", my_payout_month: "", start_date: todayISO() });
  const [orgForm, setOrgForm] = useState({ name: "", monthly_amount: "", currency: "EGP", start_date: todayISO() });
  const [orgParticipants, setOrgParticipants] = useState<NewParticipant[]>([
    { name: "", phone: "", account_number: "", address: "", id_photo_front: "" },
    { name: "", phone: "", account_number: "", address: "", id_photo_front: "" },
  ]);

  const active = gam3eyat.filter((g) => g.status === "active");

  const submitSubscribed = async () => {
    if (!subForm.monthly_amount || !subForm.months_count || !subForm.my_payout_month) { showMsg("المبلغ الشهري وعدد الشهور ومعاد قبضك لازم يتملوا", true); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/gam3eya", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "subscribed",
          name: subForm.name || null,
          monthly_amount: parseFloat(subForm.monthly_amount),
          currency: subForm.currency,
          months_count: parseInt(subForm.months_count),
          my_payout_month: parseInt(subForm.my_payout_month),
          start_date: subForm.start_date,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ ومتحفظش", true); return; }
      setSubForm({ name: "", monthly_amount: "", currency: "EGP", months_count: "", my_payout_month: "", start_date: todayISO() });
      setShowForm(false);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const submitOrganizing = async () => {
    const validParticipants = orgParticipants.filter((p) => p.name.trim());
    if (!orgForm.monthly_amount || validParticipants.length < 2) { showMsg("المبلغ الشهري وأسماء الأفراد (٢ على الأقل) لازم يتملوا", true); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/gam3eya", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "organizing",
          name: orgForm.name || null,
          monthly_amount: parseFloat(orgForm.monthly_amount),
          currency: orgForm.currency,
          start_date: orgForm.start_date,
          participants: validParticipants,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ ومتحفظش", true); return; }
      setOrgForm({ name: "", monthly_amount: "", currency: "EGP", start_date: todayISO() });
      setOrgParticipants([
        { name: "", phone: "", account_number: "", address: "", id_photo_front: "" },
        { name: "", phone: "", account_number: "", address: "", id_photo_front: "" },
      ]);
      setShowForm(false);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const markPaid = async (g: Gam3eya, paymentId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/gam3eya/${g.id}/payments/${paymentId}`, { method: "POST" });
      if (!res.ok) { showMsg("حصل خطأ ومتسجلش", true); return; }
      showMsg("✅ اتسجلت الدفعة");
      reload();
    } finally {
      setBusy(false);
    }
  };

  const deleteGam3eya = async (g: Gam3eya) => {
    const res = await fetch(`/api/gam3eya/${g.id}`, { method: "DELETE" });
    setConfirmDelete(null);
    if (!res.ok) { showMsg("حصل خطأ ومتحذفش", true); return; }
    reload();
  };

  const rateParticipant = async (g: Gam3eya, participantId: string, rating: number) => {
    await fetch(`/api/gam3eya/${g.id}/participants/${participantId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating }),
    });
    reload();
  };

  // تبديل الأدوار بقى بخطوتين: اختيار شخصين (إما بالدوس عليهم زي القديم، أو
  // بدروب داون جديد جوه الكارت) ثم تأكيد صريح "هيتم نقل فلان مكان فلان" قبل
  // ما التبديل الفعلي يحصل — كان بيتنفذ على طول من غير تأكيد قبل كده.
  const [swapConfirm, setSwapConfirm] = useState<{ g: Gam3eya; a: string; b: string } | null>(null);

  const requestSwap = (g: Gam3eya, a: string, b: string) => {
    if (!a || !b || a === b) return;
    setSwapConfirm({ g, a, b });
  };

  const pickForSwap = (g: Gam3eya, participantId: string) => {
    if (!swapFirst) { setSwapFirst(participantId); return; }
    if (swapFirst === participantId) { setSwapFirst(null); return; }
    requestSwap(g, swapFirst, participantId);
  };

  const confirmSwap = async () => {
    if (!swapConfirm) return;
    const { g, a, b } = swapConfirm;
    setBusy(true);
    try {
      const res = await fetch(`/api/gam3eya/${g.id}/participants/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participant_a: a, participant_b: b }),
      });
      if (!res.ok) { showMsg("حصل خطأ في التبديل", true); return; }
      showMsg("✅ اتبدل الدور");
      setSwapConfirm(null);
      setSwapFirst(null);
      setSwapMode(null);
      reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">{active.length} جمعية شغالة</p>
        <div className="flex gap-2">
          <button onClick={() => setShowSimulator(true)} className="flex items-center gap-1 text-xs border border-orange-300 dark:border-orange-800 text-orange-600 dark:text-orange-400 rounded-full px-3 py-1.5">
            <Calculator size={14} /> محاكاة
          </button>
          <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-1 text-xs bg-orange-600 text-white rounded-full px-3 py-1.5">
            <Plus size={14} /> جمعية جديدة
          </button>
        </div>
      </div>

      {showForm && (
        <Card className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setFormType("subscribed")} className={`rounded-lg py-2 text-xs border ${formType === "subscribed" ? "bg-orange-600 text-white border-orange-600" : "border-neutral-300 dark:border-neutral-700"}`}>مشترك في جمعية</button>
            <button onClick={() => setFormType("organizing")} className={`rounded-lg py-2 text-xs border ${formType === "organizing" ? "bg-orange-600 text-white border-orange-600" : "border-neutral-300 dark:border-neutral-700"}`}>أبدأ جمعية</button>
          </div>

          {formType === "subscribed" ? (
            <div className="space-y-2">
              <input placeholder="اسم الجمعية (اختياري)" value={subForm.name} onChange={(e) => setSubForm({ ...subForm, name: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="المبلغ الشهري" value={subForm.monthly_amount} onChange={(e) => setSubForm({ ...subForm, monthly_amount: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                <select value={subForm.currency} onChange={(e) => setSubForm({ ...subForm, currency: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
                  <option value="EGP">جنيه</option><option value="USD">دولار</option><option value="SAR">ريال</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-neutral-400">عدد شهور الجمعية</label>
                  <input type="number" value={subForm.months_count} onChange={(e) => setSubForm({ ...subForm, months_count: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-[10px] text-neutral-400">هتقبض في الشهر رقم</label>
                  <input type="number" value={subForm.my_payout_month} onChange={(e) => setSubForm({ ...subForm, my_payout_month: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-neutral-400">تاريخ أول دفعة</label>
                <input type="date" value={subForm.start_date} onChange={(e) => setSubForm({ ...subForm, start_date: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
              </div>
              <button disabled={busy} onClick={submitSubscribed} className="w-full bg-orange-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60">حفظ</button>
            </div>
          ) : (
            <div className="space-y-2">
              <input placeholder="اسم الجمعية (اختياري)" value={orgForm.name} onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="المبلغ الشهري لكل فرد" value={orgForm.monthly_amount} onChange={(e) => setOrgForm({ ...orgForm, monthly_amount: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                <select value={orgForm.currency} onChange={(e) => setOrgForm({ ...orgForm, currency: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
                  <option value="EGP">جنيه</option><option value="USD">دولار</option><option value="SAR">ريال</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-neutral-400">تاريخ أول شهر (وترتيب القبض هيكون بترتيب الأفراد تحت)</label>
                <input type="date" value={orgForm.start_date} onChange={(e) => setOrgForm({ ...orgForm, start_date: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
              </div>
              <p className="text-[11px] text-neutral-400">عدد الشهور = عدد الأفراد أوتوماتيك (كل شهر واحد يقبض).</p>
              <div className="space-y-2">
                {orgParticipants.map((p, i) => {
                  const update = (patch: Partial<NewParticipant>) => setOrgParticipants(orgParticipants.map((x, xi) => (xi === i ? { ...x, ...patch } : x)));
                  return (
                    <div key={i} className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-2 space-y-1.5">
                      <div className="flex gap-1.5 items-center">
                        <span className="text-[10px] text-neutral-400 w-4 shrink-0">{i + 1}</span>
                        <input placeholder="الاسم" value={p.name} onChange={(e) => update({ name: e.target.value })} className="flex-1 min-w-0 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-xs" />
                        <button onClick={() => setOrgParticipants(orgParticipants.filter((_, xi) => xi !== i))} className="text-neutral-400 hover:text-red-600 p-1 shrink-0"><X size={13} /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <input placeholder="رقم الموبايل" value={p.phone} onChange={(e) => update({ phone: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-xs" />
                        <input placeholder="حساب بنك أو انستجرام" value={p.account_number} onChange={(e) => update({ account_number: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-xs" />
                      </div>
                      <input placeholder="العنوان (اختياري)" value={p.address} onChange={(e) => update({ address: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-xs" />
                      <label className="flex items-center gap-1.5 text-[10px] text-neutral-400 cursor-pointer">
                        <Camera size={12} /> {p.id_photo_front ? "✅ اتصورت صورة البطاقة" : "ارفع صورة البطاقة (اختياري)"}
                        <input
                          type="file" accept="image/*" capture="environment" className="hidden"
                          onChange={async (e) => { const f = e.target.files?.[0]; if (f) update({ id_photo_front: await shrinkImage(f) }); }}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
              <button onClick={() => setOrgParticipants([...orgParticipants, { name: "", phone: "", account_number: "", address: "", id_photo_front: "" }])} className="text-xs text-orange-600 dark:text-orange-400 font-medium">+ إضافة فرد</button>
              <button disabled={busy} onClick={submitOrganizing} className="w-full bg-orange-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60">حفظ الجمعية</button>
            </div>
          )}
        </Card>
      )}

      <div className="space-y-2">
        {gam3eyat.map((g) => (
          <Gam3eyaCard
            key={g.id}
            g={g}
            isOpen={expanded === g.id}
            onToggle={() => setExpanded(expanded === g.id ? null : g.id)}
            onDelete={() => setConfirmDelete(g)}
            onMarkPaid={(paymentId) => markPaid(g, paymentId)}
            onRate={(participantId, rating) => rateParticipant(g, participantId, rating)}
            busy={busy}
            swapMode={swapMode === g.id}
            swapFirst={swapFirst}
            onToggleSwapMode={() => { setSwapMode(swapMode === g.id ? null : g.id); setSwapFirst(null); }}
            onPickSwap={(pid) => pickForSwap(g, pid)}
            onRequestSwap={(a, b) => requestSwap(g, a, b)}
            onOpenVerify={(pid) => setVerifyPanel({ gam3eyaId: g.id, participantId: pid })}
            onAddedParticipant={reload}
            showMsg={showMsg}
          />
        ))}
        {gam3eyat.length === 0 && <p className="text-center text-sm text-neutral-400 py-6">لسه مفيش جمعيات مسجلة.</p>}
      </div>

      {confirmDelete && (
        <DeleteConfirmModal
          description={`هتحذف جمعية "${confirmDelete.name || "بدون اسم"}" وكل بياناتها. الإجراء ده مش قابل للتراجع.`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => deleteGam3eya(confirmDelete)}
        />
      )}

      {swapConfirm && (
        <Modal onClose={() => setSwapConfirm(null)}>
          <p className="font-semibold text-sm">تأكيد تبديل الأدوار</p>
          <p className="text-xs text-neutral-500">
            هيتم نقل "{swapConfirm.g.gam3eya_participants.find((p) => p.id === swapConfirm.a)?.name}" مكان "{swapConfirm.g.gam3eya_participants.find((p) => p.id === swapConfirm.b)?.name}" في ترتيب القبض.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setSwapConfirm(null)} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm">إلغاء</button>
            <button disabled={busy} onClick={confirmSwap} className="flex-1 bg-orange-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60">تأكيد التبديل</button>
          </div>
        </Modal>
      )}

      {verifyPanel && (
        <VerifyParticipantModal
          gam3eyaId={verifyPanel.gam3eyaId}
          participantId={verifyPanel.participantId}
          onClose={() => setVerifyPanel(null)}
          onDone={() => { setVerifyPanel(null); reload(); }}
          showMsg={showMsg}
        />
      )}

      {showSimulator && (
        <SimulatorModal onClose={() => setShowSimulator(false)} kind="gam3eya" />
      )}
    </div>
  );
}

function Gam3eyaCard({
  g, isOpen, onToggle, onDelete, onMarkPaid, onRate, busy, swapMode, swapFirst, onToggleSwapMode, onPickSwap, onRequestSwap, onOpenVerify, onAddedParticipant, showMsg,
}: {
  g: Gam3eya; isOpen: boolean; onToggle: () => void; onDelete: () => void; onMarkPaid: (paymentId: string) => void;
  onRate: (participantId: string, rating: number) => void; busy: boolean;
  swapMode: boolean; swapFirst: string | null; onToggleSwapMode: () => void; onPickSwap: (pid: string) => void;
  onRequestSwap: (a: string, b: string) => void;
  onOpenVerify: (pid: string) => void; onAddedParticipant: () => void; showMsg: (t: string, e?: boolean) => void;
}) {
  const today = todayISO();
  const [addingParticipant, setAddingParticipant] = useState(false);
  const [newParticipant, setNewParticipant] = useState({ name: "", phone: "", account_number: "", address: "", id_photo_front: "" });
  const [addBusy, setAddBusy] = useState(false);
  const [detailParticipant, setDetailParticipant] = useState<Gam3eyaParticipant | null>(null);
  const [swapA, setSwapA] = useState("");
  const [swapB, setSwapB] = useState("");
  const [phoneHistory, setPhoneHistory] = useState<{ gam3eyat_count: number; average_rating: number | null; ever_verified: boolean } | null>(null);
  const [phoneHistoryBusy, setPhoneHistoryBusy] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportIncludePhotos, setExportIncludePhotos] = useState(false);
  const [exportIncludeAddress, setExportIncludeAddress] = useState(false);
  const [exportIncludePhone, setExportIncludePhone] = useState(false);
  const [exportIncludeReceipts, setExportIncludeReceipts] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const checkPhoneHistory = async (phone: string) => {
    if (!phone.trim()) return;
    setPhoneHistoryBusy(true);
    setPhoneHistory(null);
    try {
      const res = await fetch(`/api/gam3eya/credit-score?phone=${encodeURIComponent(phone.trim())}`);
      const data = await res.json();
      if (res.ok) setPhoneHistory(data);
    } finally {
      setPhoneHistoryBusy(false);
    }
  };

  const submitNewParticipant = async () => {
    if (!newParticipant.name.trim()) { showMsg("اسم الفرد لازم يتملى", true); return; }
    setAddBusy(true);
    try {
      const res = await fetch(`/api/gam3eya/${g.id}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newParticipant),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ ومتضافش الفرد", true); return; }
      setNewParticipant({ name: "", phone: "", account_number: "", address: "", id_photo_front: "" });
      setAddingParticipant(false);
      onAddedParticipant();
    } finally {
      setAddBusy(false);
    }
  };

  // اجمالي الجمعية من بره = قيمة الدفعة الكاملة اللي بتتقبض كل شهر (المبلغ
  // الشهري × عدد الأفراد)، مش مجموع اللي هيتدفع طول المدة. تاريخ النهاية
  // بيتحسب من آخر تاريخ استحقاق في جدول الدفعات نفسه (مش بحساب منفصل) عشان
  // يفضل متسق مع أي إعادة جدولة أو تعديل حصل.
  const totalPot = g.monthly_amount * g.participants_count;
  const endDate = g.gam3eya_payments.reduce((max, p) => (p.due_date > max ? p.due_date : max), g.start_date);

  if (g.type === "subscribed") {
    const paidCount = g.gam3eya_payments.filter((p) => p.status === "paid").length;
    const nextPending = g.gam3eya_payments.find((p) => p.status === "pending");
    const overdue = g.gam3eya_payments.filter((p) => p.status === "pending" && p.due_date < today).length;
    const payoutRow = g.gam3eya_payments.find((p) => p.month_index === g.my_payout_month);
    return (
      <Card className="!p-3 space-y-2">
        <div className="flex items-center justify-between cursor-pointer" onClick={onToggle}>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{g.name || "جمعية (مشترك فيها)"}</p>
            <p className="text-[11px] text-neutral-400">
              {fmt(g.monthly_amount, g.currency)}/شهر · {paidCount}/{g.months_count} اتدفعوا · هتقبض في الشهر {g.my_payout_month}
              {g.status === "completed" && " · خلصت ✅"}
            </p>
            {nextPending && <p className={`text-[11px] mt-0.5 ${overdue > 0 ? "text-red-500 font-medium" : "text-neutral-400"}`}>{overdue > 0 ? `⚠️ متأخر من ${nextPending.due_date}` : `الدفعة الجاية: ${nextPending.due_date}`}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-neutral-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
            {isOpen ? <ChevronUp size={16} className="text-neutral-400" /> : <ChevronDown size={16} className="text-neutral-400" />}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 p-2 text-center">
          <div><p className="text-[9px] text-neutral-400">إجمالي الجمعية</p><p className="text-[11px] font-semibold">{fmt(totalPot, g.currency)}</p></div>
          <div><p className="text-[9px] text-neutral-400">تاريخ البداية</p><p className="text-[11px] font-semibold">{g.start_date}</p></div>
          <div><p className="text-[9px] text-neutral-400">تاريخ النهاية</p><p className="text-[11px] font-semibold">{endDate}</p></div>
          <div><p className="text-[9px] text-neutral-400">هتقبض إنت</p><p className="text-[11px] font-semibold">{payoutRow?.due_date || "—"}</p></div>
        </div>

        {isOpen && (
          <div className="border-t border-neutral-100 dark:border-neutral-800 pt-2 space-y-1.5">
            {g.gam3eya_payments.map((p) => {
              const late = p.status === "pending" && p.due_date < today;
              const isPayout = p.month_index === g.my_payout_month;
              return (
                <div key={p.id} className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${late ? "bg-red-50 dark:bg-red-950 ring-1 ring-red-300 dark:ring-red-800" : isPayout ? "bg-emerald-50 dark:bg-emerald-950" : "bg-neutral-50 dark:bg-neutral-800/50"}`}>
                  <span>شهر {p.month_index} — {p.due_date}{isPayout ? " 🎁 معاد قبضك" : ""} — {fmt(Number(p.amount), g.currency)}</span>
                  {p.status === "paid" ? (
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2 size={12} /> مدفوع</span>
                  ) : (
                    <button disabled={busy} onClick={() => onMarkPaid(p.id)} className="bg-orange-600 text-white rounded-full px-2 py-1">تم الدفع</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    );
  }

  // organizing
  const sortedParticipants = [...g.gam3eya_participants].sort((a, b) => a.payout_order - b.payout_order);
  const currentMonth = g.gam3eya_payments.filter((p) => p.due_date <= today).reduce((max, p) => Math.max(max, p.month_index), 1);
  const collector = sortedParticipants.find((p) => p.payout_order === currentMonth);
  const paymentsThisMonth = g.gam3eya_payments.filter((p) => p.month_index === currentMonth);
  const paidThisMonth = paymentsThisMonth.filter((p) => p.status === "paid").length;

  // تصدير الجمعية — تقرير مصور (PNG) أو PDF. زي تصدير الديون بالظبط: كارت
  // مخفي برة الشاشة بـ innerHTML عادي (مش JSX) عشان html2canvas-pro يقدر
  // يرسمه، بعدين يتحول لصورة أو يتحط جوه PDF بنفس المقاس. المحتوى الأساسي
  // (عدد الأفراد، مين قبض ومين لسه، تاريخ البداية والنهاية، اجمالي كل قبضة،
  // مين دفع الشهر ده ومين لأ، تقييم كل واحد بالنجوم، وعلامة حمرا حوالين أي
  // حد لسه متأخر) بيظهر دايمًا؛ صور البطاقات/العنوان/التليفون/صور
  // التحويلات بس لو اتفعّلوا من الـ checkboxes قبل التصدير.
  const generateGam3eyaExport = async (format: "image" | "pdf") => {
    setExporting(true);
    setExportError("");
    try {
      const node = document.createElement("div");
      node.style.position = "fixed";
      node.style.left = "-9999px";
      node.style.top = "0";
      node.style.width = "420px";
      node.style.background = "#ffffff";
      node.style.padding = "24px";
      node.style.fontFamily = "Cairo, sans-serif";
      node.style.direction = "rtl";
      node.style.color = "#111827";

      const rowsHtml = sortedParticipants
        .map((p) => {
          const myPayment = g.gam3eya_payments.find((x) => x.participant_id === p.id && x.month_index === currentMonth);
          const overdueForP = g.gam3eya_payments.some((x) => x.participant_id === p.id && x.status === "pending" && x.due_date < today);
          const collected = p.payout_order < currentMonth || (p.payout_order === currentMonth && g.status === "completed");
          const paidLabel = myPayment ? (myPayment.status === "paid" ? '<span style="color:#059669;font-weight:700;">دفع ✓</span>' : '<span style="color:#dc2626;font-weight:700;">لسه ✗</span>') : "";
          const stars = "★".repeat(p.rating || 0) + "☆".repeat(5 - (p.rating || 0));
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f3f4f6;${overdueForP ? "background:#fef2f2;" : ""}">
              <div style="display:flex;align-items:center;gap:6px;min-width:0;">
                ${overdueForP ? '<span style="width:7px;height:7px;border-radius:50%;background:#dc2626;flex-shrink:0;"></span>' : ""}
                <span style="font-size:12px;font-weight:600;color:${overdueForP ? "#dc2626" : "#111827"};">#${p.payout_order} ${p.name}</span>
                <span style="font-size:11px;color:#f59e0b;">${stars}</span>
              </div>
              <div style="font-size:11px;text-align:left;flex-shrink:0;">
                <div>${collected ? '<span style="color:#059669;">قبض ✓</span>' : '<span style="color:#9ca3af;">لسه ما قبضش</span>'}</div>
                <div>${paidLabel}</div>
              </div>
            </div>
            ${
              exportIncludeAddress || exportIncludePhone
                ? `<div style="font-size:10px;color:#6b7280;padding:2px 0 6px;">${exportIncludePhone && p.phone ? `📱 ${p.phone}` : ""}${exportIncludePhone && exportIncludeAddress && p.phone && p.address ? " · " : ""}${exportIncludeAddress && p.address ? `📍 ${p.address}` : ""}</div>`
                : ""
            }
            ${exportIncludePhotos && p.id_photo_front ? `<img src="${p.id_photo_front}" style="width:100%;max-height:140px;object-fit:cover;border-radius:8px;margin-bottom:8px;" />` : ""}
          `;
        })
        .join("");

      const receipts = exportIncludeReceipts ? g.gam3eya_payments.filter((p) => p.receipt_url) : [];
      const receiptsHtml = receipts.length
        ? `<div style="border-top:1px solid #e5e7eb;margin-top:10px;padding-top:10px;">
             <p style="font-size:12px;font-weight:700;margin:0 0 6px;">صور التحويلات المرفوعة</p>
             ${receipts.map((p) => `<img src="${p.receipt_url}" style="width:100%;max-height:160px;object-fit:cover;border-radius:8px;margin-bottom:6px;" />`).join("")}
           </div>`
        : "";

      node.innerHTML = `
        <div style="text-align:center;margin-bottom:16px;">
          <p style="font-size:12px;color:#ea580c;font-weight:700;">FlowCash</p>
        </div>
        <h2 style="font-size:16px;margin:0 0 4px;">${g.name || "جمعية"}</h2>
        <div style="border-top:1px solid #e5e7eb;padding-top:10px;font-size:12px;line-height:2;">
          <div style="display:flex;justify-content:space-between;"><span>عدد الأفراد</span><b>${g.participants_count}</b></div>
          <div style="display:flex;justify-content:space-between;"><span>تاريخ البداية</span><b>${g.start_date}</b></div>
          <div style="display:flex;justify-content:space-between;"><span>تاريخ النهاية</span><b>${endDate}</b></div>
          <div style="display:flex;justify-content:space-between;"><span>إجمالي كل قبضة</span><b>${fmt(totalPot, g.currency)}</b></div>
        </div>
        <div style="border-top:1px solid #e5e7eb;margin-top:10px;padding-top:6px;">
          ${rowsHtml}
        </div>
        ${receiptsHtml}
        <p style="font-size:10px;color:#9ca3af;text-align:center;margin-top:16px;">تم الإنشاء بواسطة FlowCash — ${new Date().toLocaleDateString("ar-EG")}</p>
      `;
      document.body.appendChild(node);
      const html2canvas = (await import("html2canvas-pro")).default;
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
      document.body.removeChild(node);

      const filenameBase = `جمعية-${(g.name || "بدون اسم").trim()}`.replace(/[\\/:*?"<>|]/g, "").slice(0, 60);
      if (format === "image") {
        const dataUrl = canvas.toDataURL("image/png");
        await shareFile(dataUrl, `${filenameBase}.png`);
      } else {
        const { jsPDF } = await import("jspdf");
        const w = canvas.width / 2;
        const h = canvas.height / 2;
        const pdf = new jsPDF({ unit: "px", format: [w, h] });
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, w, h);
        const pdfDataUrl = pdf.output("dataurlstring");
        await shareFile(pdfDataUrl, `${filenameBase}.pdf`, "application/pdf");
      }
      setShowExport(false);
    } catch (err) {
      const detail = err instanceof Error && err.message ? ` (${err.message})` : "";
      setExportError(`حصل خطأ في التصدير، حاول تاني${detail}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card className="!p-3 space-y-2">
      <div className="flex items-center justify-between cursor-pointer" onClick={onToggle}>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{g.name || "جمعية (بتديرها)"}</p>
          <p className="text-[11px] text-neutral-400">
            {fmt(g.monthly_amount, g.currency)}/فرد شهريًا · {g.participants_count} فرد
            {g.status === "completed" && " · خلصت ✅"}
          </p>
          {g.status === "active" && (
            <p className="text-[11px] mt-0.5 text-neutral-500">
              الشهر {currentMonth} — بيقبض: <b>{collector?.name || "—"}</b> · اتدفع {paidThisMonth}/{paymentsThisMonth.length}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-neutral-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
          {isOpen ? <ChevronUp size={16} className="text-neutral-400" /> : <ChevronDown size={16} className="text-neutral-400" />}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 p-2 text-center">
        <div><p className="text-[9px] text-neutral-400">إجمالي الجمعية</p><p className="text-[11px] font-semibold">{fmt(totalPot, g.currency)}</p></div>
        <div><p className="text-[9px] text-neutral-400">تاريخ البداية</p><p className="text-[11px] font-semibold">{g.start_date}</p></div>
        <div><p className="text-[9px] text-neutral-400">تاريخ النهاية</p><p className="text-[11px] font-semibold">{endDate}</p></div>
        <div><p className="text-[9px] text-neutral-400">بيقبض الشهر ده</p><p className="text-[11px] font-semibold truncate">{collector?.name || "—"}</p></div>
      </div>

      {isOpen && (
        <div className="border-t border-neutral-100 dark:border-neutral-800 pt-2 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-neutral-400">ترتيب القبض والأفراد</p>
            <div className="flex gap-1.5">
              <button onClick={() => setAddingParticipant((s) => !s)} className="flex items-center gap-1 text-[10px] rounded-full px-2 py-1 border border-neutral-300 dark:border-neutral-700 text-neutral-500">
                <Plus size={11} /> فرد
              </button>
              <button onClick={onToggleSwapMode} className={`flex items-center gap-1 text-[10px] rounded-full px-2 py-1 ${swapMode ? "bg-orange-600 text-white" : "border border-neutral-300 dark:border-neutral-700 text-neutral-500"}`}>
                <ArrowLeftRight size={11} /> {swapMode ? "قفل التبديل" : "بدّل الأدوار"}
              </button>
              <button onClick={() => setShowExport(true)} className="flex items-center gap-1 text-[10px] rounded-full px-2 py-1 border border-neutral-300 dark:border-neutral-700 text-neutral-500">
                <FileDown size={11} /> تصدير
              </button>
            </div>
          </div>

          {swapMode && (
            <div className="rounded-lg border border-dashed border-orange-300 dark:border-orange-800 p-2 space-y-2">
              <p className="text-[10px] text-neutral-400">دوس على شخصين من القايمة تحت للتبديل، أو اختارهم من هنا:</p>
              <div className="grid grid-cols-2 gap-1.5">
                <select value={swapA} onChange={(e) => setSwapA(e.target.value)} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-xs">
                  <option value="">الشخص الأول</option>
                  {sortedParticipants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select value={swapB} onChange={(e) => setSwapB(e.target.value)} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-xs">
                  <option value="">الشخص التاني</option>
                  {sortedParticipants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <button
                disabled={!swapA || !swapB || swapA === swapB}
                onClick={() => onRequestSwap(swapA, swapB)}
                className="w-full bg-orange-600 text-white rounded-lg py-1.5 text-xs font-medium disabled:opacity-40"
              >
                بدّل
              </button>
            </div>
          )}

          {addingParticipant && (
            <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-2 space-y-1.5">
              <input placeholder="اسم الفرد الجديد" value={newParticipant.name} onChange={(e) => setNewParticipant({ ...newParticipant, name: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-xs" />
              <div className="grid grid-cols-2 gap-1.5">
                <input placeholder="رقم الموبايل" value={newParticipant.phone} onBlur={(e) => checkPhoneHistory(e.target.value)} onChange={(e) => { setNewParticipant({ ...newParticipant, phone: e.target.value }); setPhoneHistory(null); }} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-xs" />
                <input placeholder="حساب بنك أو انستجرام" value={newParticipant.account_number} onChange={(e) => setNewParticipant({ ...newParticipant, account_number: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-xs" />
              </div>
              <input placeholder="العنوان (اختياري)" value={newParticipant.address} onChange={(e) => setNewParticipant({ ...newParticipant, address: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-xs" />
              <label className="flex items-center gap-1.5 text-[10px] text-neutral-400 cursor-pointer">
                <Camera size={12} /> {newParticipant.id_photo_front ? "✅ اتصورت صورة البطاقة" : "ارفع صورة البطاقة (اختياري)"}
                <input
                  type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={async (e) => { const f = e.target.files?.[0]; if (f) setNewParticipant({ ...newParticipant, id_photo_front: await shrinkImage(f) }); }}
                />
              </label>
              {phoneHistoryBusy && <p className="text-[10px] text-neutral-400">جاري البحث عن تاريخه...</p>}
              {phoneHistory && (
                phoneHistory.gam3eyat_count > 0 ? (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400">
                    ⭐ دخل {phoneHistory.gam3eyat_count} جمعية معاك قبل كده{phoneHistory.average_rating ? ` — متوسط تقييمه ${phoneHistory.average_rating.toFixed(1)}/٥` : ""}{phoneHistory.ever_verified ? " · اتوثق قبل كده" : ""}
                  </p>
                ) : (
                  <p className="text-[10px] text-neutral-400">مفيش تاريخ سابق للرقم ده عندك.</p>
                )
              )}
              <p className="text-[10px] text-neutral-400">هيتضاف آخر الدور، وهيتحسبله شهر جديد في الجدول لكل الأفراد.</p>
              <button disabled={addBusy} onClick={submitNewParticipant} className="w-full bg-orange-600 text-white rounded-lg py-1.5 text-xs font-medium disabled:opacity-60">إضافة</button>
            </div>
          )}

          {sortedParticipants.map((p) => {
            const myPayment = g.gam3eya_payments.find((x) => x.participant_id === p.id && x.month_index === currentMonth);
            const isCollectorNow = p.payout_order === currentMonth;
            const selected = swapFirst === p.id;
            const overdueForP = g.gam3eya_payments.some((x) => x.participant_id === p.id && x.status === "pending" && x.due_date < today);
            return (
              <div key={p.id} className={`rounded-lg px-2.5 py-2 text-xs space-y-1.5 ${isCollectorNow ? "bg-emerald-50 dark:bg-emerald-950" : "bg-neutral-50 dark:bg-neutral-800/50"} ${selected ? "ring-2 ring-orange-500" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => (swapMode ? onPickSwap(p.id) : setDetailParticipant(p))}
                    className="flex items-center gap-1.5 flex-1 min-w-0 text-right"
                  >
                    <span className="text-neutral-400 shrink-0">#{p.payout_order}</span>
                    <span className={`font-medium truncate ${overdueForP ? "text-red-500" : ""}`}>{p.name}</span>
                    {overdueForP && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" title="متأخر عن السداد" />}
                    {isCollectorNow && <span className="text-[10px] shrink-0">🎁 بيقبض الشهر ده</span>}
                    {p.verified ? <ShieldCheck size={13} className="text-emerald-600 shrink-0" /> : <ShieldAlert size={13} className="text-neutral-300 dark:text-neutral-600 shrink-0" />}
                  </button>
                  {!swapMode && myPayment && (
                    myPayment.status === "paid" ? (
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 shrink-0"><CheckCircle2 size={12} /> دفع</span>
                    ) : (
                      <button disabled={busy} onClick={() => onMarkPaid(myPayment.id)} className="bg-orange-600 text-white rounded-full px-2 py-1 shrink-0">تم الدفع</button>
                    )
                  )}
                </div>
                {!swapMode && (
                  <div className="flex items-center justify-between">
                    <StarPicker value={p.rating} onChange={(v) => onRate(p.id, v)} />
                    <button onClick={() => setDetailParticipant(p)} className="text-[10px] text-orange-600 dark:text-orange-400 flex items-center gap-1">
                      <Pencil size={11} /> عرض وتعديل
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {detailParticipant && (
        <ParticipantDetailModal
          gam3eyaId={g.id}
          participant={detailParticipant}
          busy={busy}
          onClose={() => setDetailParticipant(null)}
          onOpenVerify={() => { setDetailParticipant(null); onOpenVerify(detailParticipant.id); }}
          onSaved={() => { setDetailParticipant(null); onAddedParticipant(); }}
          showMsg={showMsg}
        />
      )}

      {showExport && (
        <Modal onClose={() => !exporting && setShowExport(false)}>
          <p className="font-semibold text-sm">تصدير الجمعية</p>
          <p className="text-[11px] text-neutral-400">
            بيتصدّر دايمًا: عدد الأفراد، مين قبض ومين لسه، تاريخ البداية والنهاية، إجمالي كل قبضة، ومين دفع الشهر ده ومين لأ (مع التقييم بالنجوم وعلامة حمرا للمتأخرين).
          </p>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
              <input type="checkbox" checked={exportIncludePhotos} onChange={(e) => setExportIncludePhotos(e.target.checked)} /> إرفاق صور البطاقات
            </label>
            <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
              <input type="checkbox" checked={exportIncludeAddress} onChange={(e) => setExportIncludeAddress(e.target.checked)} /> إرفاق العنوان
            </label>
            <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
              <input type="checkbox" checked={exportIncludePhone} onChange={(e) => setExportIncludePhone(e.target.checked)} /> إرفاق رقم التليفون
            </label>
            <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
              <input type="checkbox" checked={exportIncludeReceipts} onChange={(e) => setExportIncludeReceipts(e.target.checked)} /> إرفاق صور التحويلات المرفوعة
            </label>
          </div>
          <div className="flex gap-2">
            <button disabled={exporting} onClick={() => generateGam3eyaExport("image")} className="flex-1 flex items-center justify-center gap-1.5 text-sm bg-neutral-800 dark:bg-neutral-700 text-white rounded-lg py-2 disabled:opacity-60">
              <ImageIcon size={14} /> صورة
            </button>
            <button disabled={exporting} onClick={() => generateGam3eyaExport("pdf")} className="flex-1 flex items-center justify-center gap-1.5 text-sm bg-orange-600 text-white rounded-lg py-2 disabled:opacity-60">
              <FileDown size={14} /> PDF
            </button>
          </div>
          {exporting && <p className="text-[11px] text-center text-neutral-400">جاري التجهيز...</p>}
          {exportError && <p className="text-xs text-red-500 text-center">{exportError}</p>}
          <button onClick={() => { setShowExport(false); setExportError(""); }} disabled={exporting} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm disabled:opacity-60">إلغاء</button>
        </Modal>
      )}
    </Card>
  );
}

// "عرض وتعديل" الفرد — بتفتح لما تدوس على أي فرد في الجمعية (لو مش في وضع
// التبديل). بتوري كل بياناته (بما فيها صورة البطاقة لو موجودة) وتسمح
// بتعديلها كلها من نفس المكان، بدل الفورم الصغير القديم اللي كان بيعدل بس
// رقم الموبايل وحساب البنك.
function ParticipantDetailModal({
  gam3eyaId, participant, busy, onClose, onSaved, onOpenVerify, showMsg,
}: {
  gam3eyaId: string; participant: Gam3eyaParticipant; busy: boolean; onClose: () => void;
  onSaved: () => void; onOpenVerify: () => void; showMsg: (t: string, e?: boolean) => void;
}) {
  const [name, setName] = useState(participant.name);
  const [phone, setPhone] = useState(participant.phone || "");
  const [accountNumber, setAccountNumber] = useState(participant.account_number || "");
  const [address, setAddress] = useState(participant.address || "");
  const [idPhoto, setIdPhoto] = useState(participant.id_photo_front || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) { showMsg("اسم الفرد لازم يتملى", true); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/gam3eya/${gam3eyaId}/participants/${participant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone: phone || null, account_number: accountNumber || null, address: address || null, id_photo_front: idPhoto || null }),
      });
      if (!res.ok) { showMsg("حصل خطأ ومتحفظش التعديل", true); return; }
      showMsg("✅ اتحفظ التعديل");
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between">
        <p className="font-semibold text-sm">عرض وتعديل الفرد</p>
        {participant.verified ? (
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><ShieldCheck size={12} /> موثّق</span>
        ) : (
          <span className="text-[10px] text-neutral-400 flex items-center gap-1"><ShieldAlert size={12} /> غير موثّق</span>
        )}
      </div>

      {idPhoto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={idPhoto} alt="صورة البطاقة" className="w-full max-h-40 object-cover rounded-lg border border-neutral-200 dark:border-neutral-800" />
      )}
      <label className="flex items-center gap-1.5 text-[11px] text-orange-600 dark:text-orange-400 cursor-pointer">
        <Camera size={13} /> {idPhoto ? "تغيير صورة البطاقة" : "رفع صورة البطاقة"}
        <input
          type="file" accept="image/*" capture="environment" className="hidden"
          onChange={async (e) => { const f = e.target.files?.[0]; if (f) setIdPhoto(await shrinkImage(f)); }}
        />
      </label>

      <div>
        <label className="text-[10px] text-neutral-400">الاسم</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-neutral-400">رقم الموبايل</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-[10px] text-neutral-400">حساب بنك أو انستجرام</label>
          <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label className="text-[10px] text-neutral-400">العنوان</label>
        <input value={address} onChange={(e) => setAddress(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
      </div>

      <button disabled={saving || busy} onClick={save} className="w-full bg-orange-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60">حفظ التعديل</button>
      <button onClick={onOpenVerify} className="w-full flex items-center justify-center gap-1 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm">
        <ShieldCheck size={14} /> {participant.verified ? "توثيق تاني" : "توثيق (اختياري)"}
      </button>
    </Modal>
  );
}

function VerifyParticipantModal({
  gam3eyaId, participantId, onClose, onDone, showMsg,
}: { gam3eyaId: string; participantId: string; onClose: () => void; onDone: () => void; showMsg: (t: string, e?: boolean) => void }) {
  const [front, setFront] = useState<string | null>(null);
  const [back, setBack] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  const pick = async (file: File, setter: (v: string) => void) => setter(await shrinkImage(file));

  const submit = async () => {
    if (!front || !selfie) { showMsg("لازم صورة وش البطاقة والسيلفي على الأقل", true); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/gam3eya/${gam3eyaId}/participants/${participantId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_photo_front: front, id_photo_back: back, selfie_photo: selfie }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ في التوثيق", true); return; }
      setResult(data.result);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <p className="font-semibold text-sm">توثيق العضو (اختياري)</p>
      <p className="text-[11px] text-neutral-400 leading-relaxed">
        دي مش عملية تحقق هوية رسمية زي البنوك — مجرد مقارنة بالذكاء الاصطناعي بين صورة البطاقة والسيلفي، بتديك مؤشر ثقة بس. البيانات بتتحفظ عندك في حسابك فقط.
      </p>

      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col items-center gap-1 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg p-2 text-[10px] text-center cursor-pointer">
          <Camera size={16} className="text-neutral-400" />
          {front ? "✅ اتصورت" : "وش البطاقة"}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f, setFront); }} />
        </label>
        <label className="flex flex-col items-center gap-1 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg p-2 text-[10px] text-center cursor-pointer">
          <Camera size={16} className="text-neutral-400" />
          {back ? "✅ اتصورت" : "ضهر البطاقة (اختياري)"}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f, setBack); }} />
        </label>
        <label className="flex flex-col items-center gap-1 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg p-2 text-[10px] text-center cursor-pointer">
          <Camera size={16} className="text-neutral-400" />
          {selfie ? "✅ اتصورت" : "سيلفي حي"}
          <input type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f, setSelfie); }} />
        </label>
      </div>

      {result && (
        <div className={`text-xs rounded-lg p-2 space-y-1 ${result.verified ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300" : "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300"}`}>
          <p className="font-medium">{result.verified ? "✅ اتوثق" : "⚠️ مش متطابق / مش واضح"}</p>
          {result.notes && <p>{result.notes}</p>}
          {result.error && <p>{result.error}</p>}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onDone} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm">قفل</button>
        <button disabled={busy} onClick={submit} className="flex-1 bg-orange-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60">{busy ? "جاري التحقق..." : "ابدأ التحقق"}</button>
      </div>
    </Modal>
  );
}

interface BudgetSnapshot {
  baseCurrency: string; monthlyFixedExpenses: number; monthlyRecurringIncome: number; estimatedMonthlyIncome: number;
  activeInstallmentsMonthly: number; activeGam3eyaMonthly: number; outstandingDebts: number;
}

// محاكاة عامة — بتتفتح من "محاكاة" في تبويب الجمعيات (لجمعية جديدة) أو من
// "راجع أقساطك مع ميزانيتك" في تبويب الأقساط (لقسط جديد). بتجيب التزاماتك
// الحقيقية المسجلة في البرنامج (مصاريف ثابتة متكررة + أقساط شغالة + جمعيات
// مشترك فيها + ديون متبقية) ودخلك التقديري من حركات الدخل الفعلية بدل ما
// تدخلهم بإيدك، وتوريك الموقف مع المبلغ الجديد.
function SimulatorModal({ onClose, kind = "gam3eya" }: { onClose: () => void; kind?: "gam3eya" | "installment" }) {
  const [amount, setAmount] = useState("");
  const [income, setIncome] = useState("");
  const [snapshot, setSnapshot] = useState<BudgetSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/budget-snapshot")
      .then((r) => r.json())
      .then((d: BudgetSnapshot) => {
        setSnapshot(d);
        const suggestedIncome = d.estimatedMonthlyIncome || d.monthlyRecurringIncome;
        if (suggestedIncome > 0) setIncome(String(suggestedIncome));
      })
      .finally(() => setLoading(false));
  }, []);

  const currency = snapshot?.baseCurrency || "EGP";
  const currentCommitment = snapshot ? snapshot.monthlyFixedExpenses + snapshot.activeInstallmentsMonthly + snapshot.activeGam3eyaMonthly : 0;
  const newAmount = parseFloat(amount) || 0;
  const newTotal = currentCommitment + newAmount;
  const incomeNum = income ? parseFloat(income) : null;
  const remaining = incomeNum !== null ? incomeNum - newTotal : null;
  const newAmountLabel = kind === "installment" ? "القسط الشهري الجديد" : "المبلغ الشهري للجمعية الجديدة";

  return (
    <Modal onClose={onClose}>
      <p className="font-semibold text-sm">{kind === "installment" ? "راجع القسط مع ميزانيتك" : "محاكاة جمعية جديدة"}</p>
      <p className="text-[11px] text-neutral-400">
        {kind === "installment" ? "قبل ما تدخل في قسط جديد" : "قبل ما تدخل جمعية جديدة"}، شوف هل ميزانيتك هتستحمله مع كل التزاماتك الحالية المسجلة في البرنامج.
      </p>

      {loading && <p className="text-center text-xs text-neutral-400 py-4">جاري جلب بياناتك...</p>}

      {!loading && (
        <>
          <input type="number" placeholder={newAmountLabel} value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          <div>
            <input type="number" placeholder="دخلك الشهري" value={income} onChange={(e) => setIncome(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
            {snapshot && (snapshot.estimatedMonthlyIncome > 0 || snapshot.monthlyRecurringIncome > 0) && (
              <p className="text-[10px] text-neutral-400 mt-0.5">مقدّر تلقائيًا من حركات الدخل عندك آخر ٣ شهور — عدّله لو مش دقيق.</p>
            )}
          </div>

          <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800/50 p-2.5 text-xs space-y-1">
            <p>مصاريف ثابتة متكررة: {fmt(snapshot?.monthlyFixedExpenses || 0, currency)}</p>
            <p>أقساط شغالة: {fmt(snapshot?.activeInstallmentsMonthly || 0, currency)}</p>
            <p>جمعيات مشترك فيها: {fmt(snapshot?.activeGam3eyaMonthly || 0, currency)}</p>
            <p className="pt-1 border-t border-neutral-200 dark:border-neutral-700">= التزاماتك الشهرية الحالية: {fmt(currentCommitment, currency)}</p>
            <p>+ {newAmountLabel}: {fmt(newAmount, currency)}</p>
            <p className="font-medium">= الإجمالي الشهري بعد كده: {fmt(newTotal, currency)}</p>
            {snapshot && snapshot.outstandingDebts > 0 && (
              <p className="text-amber-600 dark:text-amber-400 pt-1 border-t border-neutral-200 dark:border-neutral-700">
                ⚠️ عندك كمان ديون متبقية بإجمالي {fmt(snapshot.outstandingDebts, currency)} (مش محسوبة في الإجمالي فوق لأنها مش التزام شهري ثابت).
              </p>
            )}
          </div>

          {remaining !== null && (
            <div className={`rounded-lg p-2.5 text-xs font-medium ${remaining >= 0 ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300" : "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400"}`}>
              {remaining >= 0 ? `✅ هيفضلك حوالي ${fmt(remaining, currency)} من دخلك بعد كل الالتزامات` : `⚠️ الالتزامات هتتخطى دخلك بـ ${fmt(Math.abs(remaining), currency)}`}
            </div>
          )}
        </>
      )}

      <button onClick={onClose} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm">قفل</button>
    </Modal>
  );
}
