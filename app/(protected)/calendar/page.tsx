"use client";
import { useEffect, useMemo, useState } from "react";
import Card from "@/components/Card";
import { fmt } from "@/lib/format";
import { startOfMonth, endOfMonth, eachDayOfInterval, format, getDay, addMonths, subMonths } from "date-fns";
import { ChevronRight, ChevronLeft } from "lucide-react";

export default function CalendarPage() {
  const [month, setMonth] = useState(new Date());
  const [txs, setTxs] = useState<any[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    const from = startOfMonth(month).toISOString();
    const to = endOfMonth(month).toISOString();
    fetch(`/api/transactions?from=${from}&to=${to}&limit=500`).then((r) => r.json()).then((d) => setTxs(d.transactions || []));
  }, [month]);

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

  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
  const leadingBlanks = getDay(startOfMonth(month)); // 0=Sunday

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setMonth(subMonths(month, 1))}><ChevronRight /></button>
        <h1 className="text-lg font-bold">{format(month, "MMMM yyyy")}</h1>
        <button onClick={() => setMonth(addMonths(month, 1))}><ChevronLeft /></button>
      </div>

      <Card>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-neutral-400 mb-2">
          {["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"].map((d) => <span key={d}>{d}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: leadingBlanks }).map((_, i) => <div key={"b" + i} />)}
          {days.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            const info = byDay[key];
            const isToday = key === format(new Date(), "yyyy-MM-dd");
            return (
              <button
                key={key}
                onClick={() => info && setSelectedDay(key)}
                className={`relative aspect-square rounded-lg flex flex-col items-center justify-center text-[10px] ${info ? "bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300" : "text-neutral-400"} ${isToday ? "ring-2 ring-orange-600" : ""}`}
              >
                <span className={isToday ? "font-bold text-orange-600 dark:text-orange-400" : ""}>{format(d, "d")}</span>
                {info && <span className="font-bold">{Math.round(info.total)}</span>}
              </button>
            );
          })}
        </div>
      </Card>

      {selectedDay && byDay[selectedDay] && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={() => setSelectedDay(null)}>
          <div className="bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-4 space-y-2 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-sm">{selectedDay} — {fmt(byDay[selectedDay].total)}</p>
            {byDay[selectedDay].items.map((t) => (
              <div key={t.id} className="flex justify-between text-xs border-b border-neutral-100 dark:border-neutral-800 py-1.5">
                <span>{t.categories?.icon} {t.description || t.type}</span>
                <span className="font-medium">{fmt(Math.abs(Number(t.amount)), t.currency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
