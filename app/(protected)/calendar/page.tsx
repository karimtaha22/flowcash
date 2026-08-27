"use client";
import { useEffect, useMemo, useState } from "react";
import Card from "@/components/Card";
import TransactionRow from "@/components/TransactionRow";
import { fmt } from "@/lib/format";
import { toEGP, fromEGP, type FxRates } from "@/lib/fx";
import { startOfMonth, endOfMonth, eachDayOfInterval, format, getDay, addMonths, subMonths } from "date-fns";
import { ChevronRight, ChevronLeft, Flame, UserRound, Clock, PieChart as PieChartIcon, HeartHandshake, CheckCircle2, Wallet, CreditCard, Users, TrendingUp } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const COLORS = ["#f97316", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#84cc16"];
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function CalendarPage() {
  const [month, setMonth] = useState(new Date());
  const [txs, setTxs] = useState<any[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // ---- dashboard-ish data for the insights panel below the (now-smaller) calendar ----
  const [baseCurrency, setBaseCurrency] = useState("EGP");
  const [rates, setRates] = useState<FxRates | null>(null);
  const [debts, setDebts] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<any[]>([]);
  const [charityMutedDate, setCharityMutedDate] = useState<string | null>(null);
  const [charityEnabled, setCharityEnabled] = useState(false);
  const [mutingCharity, setMutingCharity] = useState(false);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [installmentsSummary, setInstallmentsSummary] = useState<{ remainingCount: number; remainingAmount: number } | null>(null);
  const [gam3eyaSummary, setGam3eyaSummary] = useState<{ activeCount: number } | null>(null);
  // Round 35 — "المحفظة الشخصية" في الداش بورد بتاع التقارير: عرض بس، مش
  // داخلة في أي حساب/مجموع فوق — نفس النمط في accounts/page.tsx.
  const [walletBalances, setWalletBalances] = useState<{ currency: string; balance: number }[]>([]);

  const loadTxs = () => {
    const from = startOfMonth(month).toISOString();
    const to = endOfMonth(month).toISOString();
    fetch(`/api/transactions?from=${from}&to=${to}&limit=500`).then((r) => r.json()).then((d) => setTxs(d.transactions || []));
  };
  useEffect(loadTxs, [month]);

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => {
      setBaseCurrency(d?.user?.base_currency || "EGP");
      setCharityMutedDate(d?.user?.charity_muted_date || null);
      setCharityEnabled(!!d?.user?.charity_reminder_enabled);
    }).catch(() => {});
    fetch("/api/fx").then((r) => r.json()).then((d) => setRates(d.rates || null)).catch(() => {});
    fetch("/api/debts").then((r) => r.json()).then((d) => setDebts(d.debts || [])).catch(() => {});
    fetch("/api/accounts").then((r) => r.json()).then((d) => setAccounts(d.accounts || [])).catch(() => {});
    fetch("/api/wallet").then((r) => r.json()).then((d) => setWalletBalances(d.balances || [])).catch(() => {});
    fetch("/api/dashboard").then((r) => r.json()).then((d) => setCategoryBreakdown(d.categoryBreakdown || [])).catch(() => {});
    // ربط الصفحة (دلوقتي "التقارير") بالأقساط والجمعيات والمصاريف الثابتة —
    // budget-snapshot بيرجع كل حاجة محوّلة للعملة الأساسية أصلًا (نفس اللي
    // بتستخدمه SimulatorModal في تبويب الأقساط)، فبنعيد استخدامه هنا بدل ما
    // نحسب من الصفر تاني.
    fetch("/api/budget-snapshot").then((r) => r.json()).then((d) => setSnapshot(d)).catch(() => {});
    fetch("/api/installments").then((r) => r.json()).then((d) => {
      const active = (d.plans || []).filter((p: any) => p.status === "active");
      const remainingCount = active.reduce((s: number, p: any) => s + p.installment_payments.filter((x: any) => x.status === "pending").length, 0);
      const remainingAmount = active.reduce((s: number, p: any) => s + p.installment_payments.filter((x: any) => x.status === "pending").reduce((s2: number, x: any) => s2 + Number(x.amount), 0), 0);
      setInstallmentsSummary({ remainingCount, remainingAmount });
    }).catch(() => {});
    fetch("/api/gam3eya").then((r) => r.json()).then((d) => {
      const activeCount = (d.gam3eyas || []).filter((g: any) => g.status === "active").length;
      setGam3eyaSummary({ activeCount });
    }).catch(() => {});
  }, []);

  const byDay = useMemo(() => {
    const map: Record<string, { total: number; items: any[] }> = {};
    for (const t of txs) {
      if (t.type !== "expense" && t.type !== "withdrawal") continue;
      const key = t.occurred_at.slice(0, 10);
      if (!map[key]) map[key] = { total: 0, items: [] };
      map[key].total += Math.abs(Number(t.amount));
      map[key].items.push(t);
    }
    return map;
  }, [txs]);

  // ---- busiest spending days (top 3 this viewed month) ----
  const busiestDays = useMemo(() => {
    return Object.entries(byDay)
      .map(([date, v]) => ({ date, total: v.total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);
  }, [byDay]);

  const toBase = (amount: number, currency: string) => {
    if (!rates) return amount;
    return fromEGP(toEGP(amount, currency, rates), baseCurrency, rates);
  };

  // ---- person who owes the most (owed_to_me, open/overdue) ----
  const topDebtor = useMemo(() => {
    const owedToMe = debts.filter((d) => d.direction === "owed_to_me" && (d.status === "open" || d.status === "overdue"));
    const byPerson: Record<string, { name: string; total: number }> = {};
    for (const d of owedToMe) {
      const name = d.people?.name || "شخص";
      if (!byPerson[name]) byPerson[name] = { name, total: 0 };
      byPerson[name].total += toBase(Number(d.remaining_amount), d.currency);
    }
    const list = Object.values(byPerson).sort((a, b) => b.total - a.total);
    return list[0] || null;
  }, [debts, rates, baseCurrency]);

  // ---- nearest due debt (any direction, open/overdue, has a due_date) ----
  const nearestDebt = useMemo(() => {
    const withDue = debts.filter((d) => (d.status === "open" || d.status === "overdue") && d.due_date);
    if (!withDue.length) return null;
    const today = new Date();
    return [...withDue].sort((a, b) => Math.abs(new Date(a.due_date).getTime() - today.getTime()) - Math.abs(new Date(b.due_date).getTime() - today.getTime()))[0];
  }, [debts]);

  // ---- account balances pie (converted to base currency) ----
  const accountsPie = useMemo(() => {
    return accounts
      .map((a) => ({ name: a.name, value: Math.max(toBase(Number(a.balance), a.currency), 0) }))
      .filter((a) => a.value > 0);
  }, [accounts, rates, baseCurrency]);

  const mutedToday = charityMutedDate === todayISO();
  const toggleCharityToday = async () => {
    setMutingCharity(true);
    try {
      const nextValue = mutedToday ? null : todayISO();
      const res = await fetch("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ charity_muted_date: nextValue }) });
      if (res.ok) setCharityMutedDate(nextValue);
    } catch {
      // best-effort
    } finally {
      setMutingCharity(false);
    }
  };

  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
  const leadingBlanks = getDay(startOfMonth(month)); // 0=Sunday

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">التقارير</h1>

      <div className="flex items-center justify-between">
        <button onClick={() => setMonth(subMonths(month, 1))}><ChevronRight size={18} /></button>
        <p className="text-sm font-bold">{format(month, "MMMM yyyy")}</p>
        <button onClick={() => setMonth(addMonths(month, 1))}><ChevronLeft size={18} /></button>
      </div>

      {/* shrunk calendar — smaller padding/gaps/text than before, so the rest
          of the page has room for the insights dashboard below. */}
      <Card className="!p-2 max-w-[300px] mx-auto">
        <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] text-neutral-400 mb-1">
          {["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"].map((d) => <span key={d}>{d}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: leadingBlanks }).map((_, i) => <div key={"b" + i} />)}
          {days.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            const info = byDay[key];
            const isToday = key === format(new Date(), "yyyy-MM-dd");
            return (
              <button
                key={key}
                onClick={() => info && setSelectedDay(key)}
                className={`relative aspect-square rounded-md flex flex-col items-center justify-center text-[9px] ${info ? "bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300" : "text-neutral-400"} ${isToday ? "ring-1 ring-orange-600" : ""}`}
              >
                <span className={isToday ? "font-bold text-orange-600 dark:text-orange-400" : ""}>{format(d, "d")}</span>
                {info && <span className="font-bold text-[8px]">{Math.round(info.total)}</span>}
              </button>
            );
          })}
        </div>
      </Card>

      {/* ---------------- insights dashboard ---------------- */}
      <div className="space-y-3">
        <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">نظرة عامة</p>

        <div className="grid grid-cols-1 gap-3">
          {snapshot && (
            <Card className="space-y-2 !bg-neutral-950 !border-neutral-800 text-white">
              <p className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5"><Wallet size={14} /> كل قرش داخل وخارج — نظرة شاملة</p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-neutral-900 rounded-lg p-2">
                  <p className="text-neutral-400">دخلك الشهري التقريبي</p>
                  <p className="font-bold text-emerald-400">{fmt(snapshot.estimatedMonthlyIncome, snapshot.baseCurrency)}</p>
                </div>
                <div className="bg-neutral-900 rounded-lg p-2">
                  <p className="text-neutral-400">مصاريفك الثابتة شهريًا</p>
                  <p className="font-bold text-orange-400">{fmt(snapshot.monthlyFixedExpenses, snapshot.baseCurrency)}</p>
                </div>
                <div className="bg-neutral-900 rounded-lg p-2 flex items-center gap-1.5">
                  <CreditCard size={12} className="text-neutral-400 shrink-0" />
                  <div>
                    <p className="text-neutral-400">أقساط شهريًا</p>
                    <p className="font-bold">{fmt(snapshot.activeInstallmentsMonthly, snapshot.baseCurrency)}</p>
                  </div>
                </div>
                <div className="bg-neutral-900 rounded-lg p-2 flex items-center gap-1.5">
                  <Users size={12} className="text-neutral-400 shrink-0" />
                  <div>
                    <p className="text-neutral-400">جمعيات شهريًا</p>
                    <p className="font-bold">{fmt(snapshot.activeGam3eyaMonthly, snapshot.baseCurrency)}</p>
                  </div>
                </div>
              </div>
              {snapshot.outstandingDebts > 0 && (
                <p className="text-[11px] text-red-300 flex items-center gap-1"><TrendingUp size={12} /> ديون متبقية عليك: {fmt(snapshot.outstandingDebts, snapshot.baseCurrency)}</p>
              )}
              {(installmentsSummary || gam3eyaSummary) && (
                <div className="border-t border-neutral-800 pt-2 flex items-center justify-between text-[11px] text-neutral-300">
                  {installmentsSummary && <span>باقي {installmentsSummary.remainingCount} قسط — {fmt(installmentsSummary.remainingAmount, snapshot.baseCurrency)}</span>}
                  {gam3eyaSummary && <span>{gam3eyaSummary.activeCount} جمعية شغالة</span>}
                </div>
              )}
              <a href="/installments" className="block text-center text-[11px] text-orange-400 pt-1">افتح الأقساط والجمعيات ←</a>
            </Card>
          )}

          {busiestDays.length > 0 && (
            <Card className="space-y-2">
              <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-1.5"><Flame size={14} /> أكتر أيام الشهر صرفًا</p>
              {busiestDays.map((d, i) => (
                <div key={d.date} className="flex items-center justify-between text-xs">
                  <span className="text-neutral-500">{i + 1}. {format(new Date(d.date + "T00:00:00"), "d MMMM")}</span>
                  <span className="font-bold">{fmt(d.total)}</span>
                </div>
              ))}
            </Card>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Card className="space-y-1.5">
              <p className="text-[11px] font-semibold text-neutral-500 flex items-center gap-1.5"><UserRound size={13} /> أكتر شخص عليه دين ليك</p>
              {topDebtor ? (
                <>
                  <p className="text-sm font-bold truncate">{topDebtor.name}</p>
                  <p className="text-xs text-orange-600 dark:text-orange-400 font-semibold">{fmt(topDebtor.total, baseCurrency)}</p>
                </>
              ) : (
                <p className="text-xs text-neutral-400">مفيش ديون مستحقة ليك دلوقتي</p>
              )}
            </Card>

            <Card className="space-y-1.5">
              <p className="text-[11px] font-semibold text-neutral-500 flex items-center gap-1.5"><Clock size={13} /> أقرب دين مستحق</p>
              {nearestDebt ? (
                <>
                  <p className="text-sm font-bold truncate">{nearestDebt.people?.name || "شخص"} — {nearestDebt.title}</p>
                  <p className="text-xs text-orange-600 dark:text-orange-400 font-semibold">
                    {fmt(Number(nearestDebt.remaining_amount), nearestDebt.currency)} · {new Date(nearestDebt.due_date).toLocaleDateString("ar-EG")}
                  </p>
                </>
              ) : (
                <p className="text-xs text-neutral-400">مفيش ديون ليها معاد استحقاق</p>
              )}
            </Card>
          </div>

          {categoryBreakdown.length > 0 && (
            <Card className="space-y-1.5">
              <p className="text-[11px] font-semibold text-neutral-500">أكتر حاجة استهلكت فلوس الشهر ده</p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">{categoryBreakdown[0].icon} {categoryBreakdown[0].name}</span>
                <span className="text-sm font-bold text-orange-600 dark:text-orange-400">{fmt(categoryBreakdown[0].total)}</span>
              </div>
            </Card>
          )}

          <Card className={`space-y-2 ${mutedToday ? "!bg-emerald-50 dark:!bg-emerald-950/40 !border-emerald-200 dark:!border-emerald-900" : ""}`}>
            <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 flex items-center gap-1.5"><HeartHandshake size={14} /> صدقتك النهاردة</p>
            {!charityEnabled ? (
              <p className="text-xs text-neutral-400">تذكير الصدقة مش مفعّل — فعّله من تبويب "صدقات وزكاة".</p>
            ) : mutedToday ? (
 <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2 size={13} /> اتدفعت النهاردة </p>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-neutral-400">لسه ماتأكدش إنها اتدفعت النهاردة</p>
                <button disabled={mutingCharity} onClick={toggleCharityToday} className="shrink-0 text-[11px] bg-emerald-600 text-white rounded-lg px-2.5 py-1.5 disabled:opacity-60">
 اتدفعت 
                </button>
              </div>
            )}
          </Card>

          {accountsPie.length > 0 && (
            <Card className="space-y-2">
              <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 flex items-center gap-1.5"><PieChartIcon size={14} /> أرصدة الحسابات (بالعملة الرئيسية)</p>
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={120} height={120}>
                  <PieChart>
                    <Pie data={accountsPie} dataKey="value" nameKey="name" innerRadius={28} outerRadius={52}>
                      {accountsPie.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => fmt(Number(v), baseCurrency)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1 text-[11px]">
                  {accountsPie.slice(0, 6).map((a, i) => (
                    <div key={a.name} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="flex-1 truncate">{a.name}</span>
                      <span className="font-medium">{fmt(a.value, baseCurrency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          {walletBalances.length > 0 && (
            <Card className="space-y-1.5">
              <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-300 flex items-center gap-1.5">
                <Wallet size={14} /> محفظتك (كاش — مش محسوبة في صافي الثروة)
              </p>
              <p className="text-sm font-bold flex flex-wrap gap-x-2">
                {walletBalances.map((w) => <span key={w.currency}>{fmt(w.balance, w.currency)}</span>)}
              </p>
            </Card>
          )}
        </div>
      </div>

      {selectedDay && byDay[selectedDay] && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={() => setSelectedDay(null)}>
          <div className="bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-4 space-y-2 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-sm">{selectedDay} — {fmt(byDay[selectedDay].total)}</p>
            {byDay[selectedDay].items.map((t) => (
              <TransactionRow key={t.id} tx={t} onChanged={loadTxs} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
