"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Card from "@/components/Card";
import { fmt } from "@/lib/format";
import { LineChart, Line, ResponsiveContainer, PieChart, Pie, Cell, Tooltip, XAxis } from "recharts";
import { AlertTriangle, ChevronLeft, ArrowLeftRight, Sparkles, CalendarDays } from "lucide-react";
import { formatHijriFromDate } from "@/lib/hijri";

const COLORS = ["#f97316", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#84cc16"];

const FX_CURRENCIES = [
  { code: "EGP", label: "جنيه مصري" },
  { code: "USD", label: "دولار أمريكي" },
  { code: "EUR", label: "يورو" },
  { code: "SAR", label: "ريال سعودي" },
  { code: "QAR", label: "ريال قطري" },
  { code: "LYD", label: "دينار ليبي" },
  { code: "AED", label: "درهم إماراتي" },
];

function CurrencyConverter({ rates, baseCurrency }: { rates: Record<string, number> | undefined; baseCurrency: string }) {
  const [amount, setAmount] = useState("100");
  const [from, setFrom] = useState("EGP");
  const [to, setTo] = useState("USD");

  useEffect(() => {
    setFrom(baseCurrency);
  }, [baseCurrency]);

  const converted = useMemo(() => {
    if (!rates) return null;
    const amt = parseFloat(amount);
    if (!amt || !rates[from] || !rates[to]) return null;
    // rates are relative to EGP: 1 EGP = rates[CUR]
    const inEgp = amt / rates[from];
    return inEgp * rates[to];
  }, [rates, amount, from, to]);

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  // scrolling ticker: 1 unit of every other tracked currency against the
  // app's base currency (e.g. "1 SAR = X EGP") — re-derives automatically
  // whenever base_currency changes.
  const tickerEntries = useMemo(() => {
    if (!rates || !rates[baseCurrency]) return [];
    return FX_CURRENCIES.filter((c) => c.code !== baseCurrency).map((c) => {
      if (!rates[c.code]) return { code: c.code, value: 0 };
      const inEgp = 1 / rates[c.code];
      const value = inEgp * rates[baseCurrency];
      return { code: c.code, value };
    });
  }, [rates, baseCurrency]);

  return (
    <Card>
      <p className="text-sm font-semibold mb-1">أسعار العملات لحظيًا</p>
      {tickerEntries.length > 0 && (
        <div className="overflow-hidden mb-3 -mx-1">
          <div className="flex w-max animate-marquee">
            {[...tickerEntries, ...tickerEntries].map((t, i) => (
              <span key={i} className="shrink-0 text-[11px] text-neutral-500 px-3 border-l border-neutral-200 dark:border-neutral-800 whitespace-nowrap">
                1 {t.code} = {t.value.toLocaleString("ar-EG", { maximumFractionDigits: 3 })} {baseCurrency}
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className="flex-1 space-y-1">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
          />
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-xs"
          >
            {FX_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.label} ({c.code})</option>
            ))}
          </select>
        </div>
        <button onClick={swap} className="text-neutral-400 hover:text-orange-600 p-2 shrink-0" aria-label="تبديل العملات">
          <ArrowLeftRight size={16} />
        </button>
        <div className="flex-1 space-y-1">
          <div className="w-full rounded-lg border border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950 px-3 py-2 text-sm font-semibold text-orange-700 dark:text-orange-300 truncate">
            {converted !== null ? converted.toLocaleString("ar-EG", { maximumFractionDigits: 2 }) : "—"}
          </div>
          <select
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-xs"
          >
            {FX_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.label} ({c.code})</option>
            ))}
          </select>
        </div>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [alerts, setAlerts] = useState<{ count: number; dueRecurring: number; overBudget: number; overdueCount: number } | null>(null);
  const [hijriCorrection, setHijriCorrection] = useState(0);
  const [baseCurrency, setBaseCurrency] = useState("EGP");

  useEffect(() => {
    fetch("/api/dashboard").then((r) => r.json()).then(setData);
    fetch("/api/alerts-count").then((r) => r.json()).then(setAlerts);
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        setHijriCorrection(Number(d?.user?.hijri_correction_days) || 0);
        setBaseCurrency(d?.user?.base_currency || "EGP");
      })
      .catch(() => {});
  }, []);

  if (!data) return <p className="text-center text-neutral-400 mt-10">جاري التحميل...</p>;
  if (data.error) return <p className="text-center text-red-500 mt-10">{data.error}</p>;

  const { netWorth, spent, categoryBreakdown, balanceHistory, rates } = data;
  const today = new Date();
  const gregorianLabel = today.toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const hijriLabel = formatHijriFromDate(today, hijriCorrection);

  return (
    <div className="space-y-4">
      <Card className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 flex items-center justify-center shrink-0">
          <CalendarDays size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{gregorianLabel}</p>
          <p className="text-xs text-neutral-400">{hijriLabel}</p>
        </div>
      </Card>

      <Link href="/planning?tab=zakat">
        <div
          className="rounded-2xl border border-emerald-500/30 bg-neutral-900 px-4 py-3 flex items-center justify-between gap-2 cursor-pointer"
          style={{ boxShadow: "0 0 18px rgba(16,185,129,0.35), inset 0 0 18px rgba(16,185,129,0.08)" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles size={16} className="text-emerald-400 shrink-0" />
            <p
              className="text-sm font-semibold truncate"
              style={{ color: "#6ee7b7", textShadow: "0 0 6px rgba(110,231,183,0.9), 0 0 16px rgba(16,185,129,0.7)" }}
            >
              هل تحققت من الصدقات والزكاة اليوم؟
            </p>
          </div>
          <ChevronLeft size={16} className="text-emerald-400 shrink-0" />
        </div>
      </Link>

      {alerts && alerts.count > 0 && (
        <Link href="/planning">
          <Card className="flex items-center gap-3 bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-900">
            <div className="w-9 h-9 rounded-full bg-orange-500 text-white flex items-center justify-center shrink-0">
              <AlertTriangle size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-orange-700 dark:text-orange-300">في {alerts.count} حاجة محتاجة انتباهك</p>
              <p className="text-[11px] text-orange-600/80 dark:text-orange-400/80">
                {alerts.dueRecurring > 0 && `${alerts.dueRecurring} مصروف/دخل متكرر · `}
                {alerts.overBudget > 0 && `${alerts.overBudget} ميزانية تخطت الحد · `}
                {alerts.overdueCount > 0 && `${alerts.overdueCount} دين متأخر`}
              </p>
            </div>
            <ChevronLeft size={16} className="text-orange-400 shrink-0" />
          </Card>
        </Link>
      )}

      <Card className="bg-gradient-to-l from-orange-600 to-orange-500 text-white border-none">
        <p className="text-xs opacity-90">صافي الثروة</p>
        <p className="text-3xl font-bold mt-1">{fmt(netWorth.net)}</p>
        <div className="flex justify-between mt-4 text-sm">
          <div>
            <p className="opacity-80 text-xs">تملك</p>
            <p className="font-semibold">{fmt(netWorth.totalOwned)}</p>
          </div>
          <div>
            <p className="opacity-80 text-xs">عليك</p>
            <p className="font-semibold">{fmt(netWorth.iOwe)}</p>
          </div>
        </div>
      </Card>

      <CurrencyConverter rates={rates} baseCurrency={baseCurrency} />

      <div className="grid grid-cols-3 gap-2">
        <Card className="text-center">
          <p className="text-xs text-neutral-500">النهاردة</p>
          <p className="font-bold mt-1">{fmt(spent.today)}</p>
        </Card>
        <Card className="text-center">
          <p className="text-xs text-neutral-500">الأسبوع</p>
          <p className="font-bold mt-1">{fmt(spent.week)}</p>
        </Card>
        <Card className="text-center">
          <p className="text-xs text-neutral-500">الشهر</p>
          <p className="font-bold mt-1">{fmt(spent.month)}</p>
        </Card>
      </div>

      {balanceHistory?.length > 1 && (
        <Card>
          <p className="text-sm font-semibold mb-2">حركة الرصيد</p>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={balanceHistory}>
              <XAxis dataKey="date" hide />
              <Tooltip formatter={(v: any) => fmt(Number(v))} labelFormatter={(l) => l} />
              <Line type="monotone" dataKey="balance" stroke="#f97316" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {categoryBreakdown?.length > 0 && (
        <Card>
          <p className="text-sm font-semibold mb-2">المصروفات حسب التصنيف (الشهر ده)</p>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={130} height={130}>
              <PieChart>
                <Pie data={categoryBreakdown} dataKey="total" nameKey="name" innerRadius={30} outerRadius={55}>
                  {categoryBreakdown.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => fmt(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1 text-xs">
              {categoryBreakdown.slice(0, 6).map((c: any, i: number) => (
                <div key={c.name} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="flex-1">{c.icon} {c.name}</span>
                  <span className="font-medium">{fmt(c.total)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
