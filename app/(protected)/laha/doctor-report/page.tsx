"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Card from "@/components/Card";
import { ChevronRight, Printer } from "lucide-react";

// Round 40 — "مولّد تقرير الطبيب" (One-Click Doctor Report). صفحة قابلة
// للطباعة (زرار "طباعة" بينده window.print()؛ CSS's #print-area في
// app/globals.css بيخفي شِل التطبيق وقت الطباعة ويسيب التقرير بس ظاهر).
const MOOD_LABEL: Record<string, string> = {
  happy: "مبسوطة", calm: "هادية", tired: "متعبة", sensitive: "حساسة", anxious: "قلقانة", irritable: "سريعة الانفعال",
};
const FLOW_LABEL: Record<string, string> = { light: "خفيف", medium: "متوسط", heavy: "غزير" };
const PAIN_LABEL: Record<string, string> = {
  headache: "صداع", cramps: "تشنجات", backache: "ألم ظهر", bloating: "انتفاخ", chest: "ثقل صدر", nausea: "غثيان",
};

function fmtDate(iso: string) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function DoctorReportPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/laha/doctor-report");
        const d = await res.json();
        setData(d);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p className="text-sm text-neutral-400 text-center py-10">جاري التحميل...</p>;
  if (!data) return <p className="text-sm text-red-500 text-center py-10">معرفناش نجيب بيانات التقرير</p>;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/laha" className="flex items-center gap-1 text-sm text-neutral-500"><ChevronRight size={16} /> رجوع</Link>
        <button onClick={() => window.print()} className="flex items-center gap-1.5 bg-pink-500 text-white rounded-lg px-3 py-1.5 text-xs font-medium">
          <Printer size={14} /> طباعة / حفظ PDF
        </button>
      </div>

      <div id="print-area" className="space-y-4">
        <div className="text-center space-y-1">
          <h1 className="text-lg font-bold">تقرير للطبيبة</h1>
          <p className="text-xs text-neutral-400">من تطبيق FlowCash — قسم "لها"</p>
        </div>

        <Card className="space-y-1 text-sm">
          <p>متوسط طول الدورة: <b>{data.avgCycleLength ? `${data.avgCycleLength} يوم` : "مفيش بيانات كفاية لسه"}</b></p>
        </Card>

        <Card className="space-y-2">
          <p className="text-xs font-semibold">آخر الدورات</p>
          {data.lastPeriods?.length ? (
            <div className="space-y-1">
              {data.lastPeriods.map((p: any, i: number) => (
                <p key={i} className="text-xs">{fmtDate(p.start_date)}{p.end_date ? ` → ${fmtDate(p.end_date)}` : " (مستمرة)"}</p>
              ))}
            </div>
          ) : (
            <p className="text-xs text-neutral-400">مفيش دورات مسجلة</p>
          )}
        </Card>

        <Card className="space-y-2">
          <p className="text-xs font-semibold">أكتر الأعراض تكرارًا</p>
          {data.topSymptoms?.length ? (
            <div className="space-y-1">
              {data.topSymptoms.map((s: any) => (
                <div key={s.tag} className="flex items-center justify-between text-xs">
                  <span>{PAIN_LABEL[s.tag] || s.tag}</span>
                  <span className="text-neutral-400">{s.count} مرة</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-neutral-400">مفيش أعراض متسجلة لسه</p>
          )}
        </Card>

        <Card className="space-y-2">
          <p className="text-xs font-semibold">سجل يومي (آخر {data.dailyLogs?.length || 0} تسجيل)</p>
          {data.dailyLogs?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] text-right border-collapse">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-700">
                    <th className="py-1 pl-2">التاريخ</th>
                    <th className="py-1 pl-2">المزاج</th>
                    <th className="py-1 pl-2">الأعراض</th>
                    <th className="py-1">التدفق</th>
                  </tr>
                </thead>
                <tbody>
                  {data.dailyLogs.map((l: any, i: number) => (
                    <tr key={i} className="border-b border-neutral-100 dark:border-neutral-800">
                      <td className="py-1 pl-2 whitespace-nowrap">{fmtDate(l.log_date)}</td>
                      <td className="py-1 pl-2">{l.mood ? MOOD_LABEL[l.mood] || l.mood : "-"}</td>
                      <td className="py-1 pl-2">{(l.pain_tags || []).map((t: string) => PAIN_LABEL[t] || t).join("، ") || "-"}</td>
                      <td className="py-1">{l.flow ? FLOW_LABEL[l.flow] || l.flow : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-neutral-400">مفيش تسجيلات يومية لسه</p>
          )}
        </Card>

        <p className="text-[10px] text-neutral-400 text-center">هذا التقرير للاستعانة به أثناء الزيارة الطبية، ومش بديلاً عن أي تقييم أو تشخيص طبي.</p>
      </div>
    </div>
  );
}
