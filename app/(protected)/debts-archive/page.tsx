"use client";
// Round 48 — "في الإعدادات تعمل مفتاح اسمه الأرشيف... يدخلنا على كل الديون
// المسددة، ومفتاح رجوع الدين لصفحة الديون": صفحة مستقلة بتعرض كل الديون
// اللي اتنقلت للأرشيف (سواء تلقائيًا وقت تسوية الدين بالكامل، أو يدويًا من
// كارت الدين نفسه — راجع app/(protected)/people/page.tsx وapp/api/debts/
// [id]/route.ts's PATCH). "استرجاع" بيرجّع الدين لصفحة الديون العادية،
// وبيظهر عليه زرار "نقل إلى الأرشيف" تاني هناك لو حبيت تؤرشفه من جديد.
import { useEffect, useState } from "react";
import Card from "@/components/Card";
import { fmt } from "@/lib/format";
import { showToast } from "@/lib/toast";
import { Archive, ArchiveRestore, ChevronRight } from "lucide-react";

interface ArchivedDebt {
  id: string;
  title: string;
  reason: string | null;
  direction: "owed_to_me" | "i_owe";
  original_amount: number;
  remaining_amount: number;
  currency: string;
  status: string;
  updated_at: string;
  people: { name: string };
}

export default function DebtsArchivePage() {
  const [debts, setDebts] = useState<ArchivedDebt[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const d = await fetch("/api/debts?archived=1").then((r) => r.json());
      setDebts(d.debts || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const restore = async (id: string) => {
    setRestoringId(id);
    try {
      const res = await fetch(`/api/debts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restore: true }),
      });
      if (!res.ok) { showToast("حصل خطأ ومترجعش الدين، حاول تاني", "error"); return; }
      showToast("تم استرجاع الدين لصفحة الديون", "success", 5000);
      setDebts((ds) => ds.filter((d) => d.id !== id));
    } catch {
      showToast("مفيش اتصال بالإنترنت، حاول تاني", "error");
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="space-y-4">
      <a href="/settings" className="flex items-center gap-1 text-xs text-neutral-400">
        <ChevronRight size={14} /> رجوع للإعدادات
      </a>
      <h1 className="text-xl font-bold flex items-center gap-2"><Archive size={20} /> أرشيف الديون المسددة</h1>
      <p className="text-xs text-neutral-400">
        الديون اللي اتسددت بالكامل بتتنقل هنا تلقائيًا وتختفي من صفحة الديون — استرجعيها في أي وقت لو محتاجة تعدّلي عليها تاني.
      </p>

      {loading ? (
        <p className="text-sm text-neutral-400 text-center py-6">جاري التحميل...</p>
      ) : debts.length === 0 ? (
        <Card className="text-center py-8">
          <p className="text-sm text-neutral-400">الأرشيف فاضي دلوقتي</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {debts.map((d) => (
            <Card key={d.id} className="space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] text-neutral-400">{d.direction === "owed_to_me" ? "كان مستحق لي" : "كان مستحق عليّ"}</p>
                  <p className="font-medium text-sm">{d.people?.name} — {d.title}</p>
                  {d.reason && <p className="text-xs text-neutral-400">{d.reason}</p>}
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full text-orange-600 bg-orange-50 dark:bg-orange-950 shrink-0">تم السداد</span>
              </div>
              <p className="text-xs text-neutral-400">المبلغ الأصلي: {fmt(Number(d.original_amount), d.currency)}</p>
              <button
                disabled={restoringId === d.id}
                onClick={() => restore(d.id)}
                className="w-full flex items-center justify-center gap-1.5 text-xs bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300 rounded-lg py-2 disabled:opacity-60"
              >
                <ArchiveRestore size={13} /> {restoringId === d.id ? "جاري الاسترجاع..." : "استرجاع لصفحة الديون"}
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
