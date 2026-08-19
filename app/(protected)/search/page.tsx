"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/Card";
import TransactionRow from "@/components/TransactionRow";
import { fmt } from "@/lib/format";
import { Search as SearchIcon, User, Receipt, HandCoins } from "lucide-react";

export default function SearchPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ transactions: any[]; debts: any[]; people: any[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const runSearch = () => {
    if (!q.trim()) { setResults(null); return; }
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then(setResults)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!q.trim()) { setResults(null); return; }
    const t = setTimeout(runSearch, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const empty = results && !results.transactions.length && !results.debts.length && !results.people.length;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">البحث</h1>

      <div className="relative">
        <SearchIcon size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث باسم شخص، سبب دين، تصنيف، أو وصف حركة..."
          className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent pr-9 pl-3 py-2.5 text-sm"
        />
      </div>

      {loading && <p className="text-center text-sm text-neutral-400 py-4">جاري البحث...</p>}
      {empty && <p className="text-center text-sm text-neutral-400 py-6">مفيش نتائج لـ "{q}"</p>}

      {results && results.people.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-neutral-500 flex items-center gap-1"><User size={13} /> أشخاص</p>
          {results.people.map((p) => (
            <button key={p.id} onClick={() => router.push("/people")} className="w-full text-right">
              <Card className="py-2.5"><p className="text-sm font-medium">{p.name}</p></Card>
            </button>
          ))}
        </div>
      )}

      {results && results.debts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-neutral-500 flex items-center gap-1"><HandCoins size={13} /> ديون</p>
          {results.debts.map((d) => (
            <button key={d.id} onClick={() => router.push(`/people?debt=${d.id}`)} className="w-full text-right">
              <Card className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium">{d.people?.name} — {d.title}</p>
                  {d.reason && <p className="text-[11px] text-neutral-400">{d.reason}</p>}
                </div>
                <p className="font-semibold text-sm">{fmt(Number(d.remaining_amount), d.currency)}</p>
              </Card>
            </button>
          ))}
        </div>
      )}

      {results && results.transactions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-neutral-500 flex items-center gap-1"><Receipt size={13} /> حركات</p>
          {results.transactions.map((t) => (
            <TransactionRow key={t.id} tx={t} onChanged={runSearch} />
          ))}
        </div>
      )}
    </div>
  );
}
