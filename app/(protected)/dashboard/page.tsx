"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Card from "@/components/Card";
import { fmt } from "@/lib/format";
import { LineChart, Line, ResponsiveContainer, PieChart, Pie, Cell, Tooltip, XAxis } from "recharts";
import { AlertTriangle, ChevronLeft } from "lucide-react";

const COLORS = ["#f97316", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#84cc16"];

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [alerts, setAlerts] = useState<{ count: number; dueRecurring: number; overBudget: number; overdueCount: number } | null>(null);

  useEffect(() => {
    fetch("/api/dashboard").then((r) => r.json()).then(setData);
    fetch("/api/alerts-count").then((r) => r.json()).then(setAlerts);
  }, []);

  if (!data) return <p className="text-center text-neutral-400 mt-10">جاري التحميل...</p>;
  if (data.error) return <p className="text-center text-red-500 mt-10">{data.error}</p>;

  const { netWorth, spent, categoryBreakdown, balanceHistory } = data;

  return (
    <div className="space-y-4">
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
