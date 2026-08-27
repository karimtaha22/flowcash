"use client";
import { useEffect, useMemo, useState } from "react";
import TransactionRow, { type Tx } from "@/components/TransactionRow";
import { Search } from "lucide-react";

const TABS = [
  { key: "all", label: "الكل" },
  { key: "expense", label: "مصروف" },
  { key: "withdrawal", label: "سحب" },
  { key: "income", label: "دخل" },
  { key: "transfer", label: "تحويل" },
];

export default function ActivityPage() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<{ id: string; name: string; icon: string; kind: string }[]>([]);

  const load = () => {
    setLoading(true);
    const url = tab === "all" ? "/api/transactions?limit=300" : `/api/transactions?type=${tab}&limit=300`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => setTxs(d.transactions || []))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [tab]);
  useEffect(() => { fetch("/api/categories").then((r) => r.json()).then((d) => setCategories(d.categories || [])); }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return txs;
    const s = q.trim().toLowerCase();
    return txs.filter((t) => {
      const person = t.debts?.people?.name || t.counterparty_name || "";
      return (
        (t.description || "").toLowerCase().includes(s) ||
        person.toLowerCase().includes(s) ||
        (t.accounts?.name || "").toLowerCase().includes(s) ||
        (t.categories?.name || "").toLowerCase().includes(s)
      );
    });
  }, [txs, q]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">الحركات المالية</h1>

      <div className="relative">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="دور باسم شخص أو سبب أو تصنيف..."
          className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent pr-9 pl-3 py-2 text-sm"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border ${tab === t.key ? "bg-orange-600 text-white border-orange-600" : "border-neutral-300 dark:border-neutral-700"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* clicking a transaction expands it in place for editing (see
          TransactionRow) — no more jumping to a separate page. */}
      <div className="space-y-2">
        {loading && <p className="text-center text-sm text-neutral-400 py-6">جاري التحميل...</p>}
        {!loading && filtered.length === 0 && <p className="text-center text-sm text-neutral-400 py-6">مفيش حركات هنا.</p>}
        {filtered.map((t) => (
          <TransactionRow key={t.id} tx={t} categories={categories} onChanged={load} />
        ))}
      </div>
    </div>
  );
}
