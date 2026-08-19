"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/Card";
import { fmt } from "@/lib/format";
import { Search, ArrowDownLeft, ArrowUpRight, ArrowRightLeft, Wallet, Landmark } from "lucide-react";

interface Tx {
  id: string;
  type: "expense" | "withdrawal" | "income" | "transfer" | "balance_update";
  amount: number;
  currency: string;
  description: string | null;
  counterparty_name: string | null;
  occurred_at: string;
  account_id: string | null;
  to_account_id: string | null;
  debt_id: string | null;
  accounts?: { name: string; currency: string };
  to_accounts?: { name: string; currency: string };
  categories?: { name: string; icon: string };
  debts?: { id: string; title: string; people?: { name: string } };
}

const TABS = [
  { key: "all", label: "الكل" },
  { key: "expense", label: "مصروف" },
  { key: "withdrawal", label: "سحب" },
  { key: "income", label: "دخل" },
  { key: "transfer", label: "تحويل" },
];

const TYPE_ICON: Record<string, any> = {
  expense: ArrowUpRight,
  withdrawal: Landmark,
  income: ArrowDownLeft,
  transfer: ArrowRightLeft,
  balance_update: Wallet,
};

const TYPE_LABEL: Record<string, string> = {
  expense: "مصروف",
  withdrawal: "سحب",
  income: "دخل",
  transfer: "تحويل",
  balance_update: "تحديث رصيد",
};

export default function ActivityPage() {
  const router = useRouter();
  const [txs, setTxs] = useState<Tx[]>([]);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const url = tab === "all" ? "/api/transactions?limit=300" : `/api/transactions?type=${tab}&limit=300`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => setTxs(d.transactions || []))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [tab]);

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

  const goToSource = (t: Tx) => {
    if (t.debt_id && t.debts?.id) {
      router.push(`/people?debt=${t.debts.id}`);
    } else if (t.account_id) {
      router.push(`/accounts?account=${t.account_id}`);
    }
  };

  const signAndColor = (t: Tx) => {
    if (t.type === "income") return { sign: "+", color: "text-emerald-600 dark:text-emerald-400" };
    if (t.type === "expense" || t.type === "withdrawal") return { sign: "-", color: "text-red-500" };
    if (t.type === "transfer") return { sign: "", color: "text-neutral-600 dark:text-neutral-300" };
    return { sign: Number(t.amount) >= 0 ? "+" : "", color: Number(t.amount) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500" };
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">الحركة</h1>

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

      <div className="space-y-2">
        {loading && <p className="text-center text-sm text-neutral-400 py-6">جاري التحميل...</p>}
        {!loading && filtered.length === 0 && <p className="text-center text-sm text-neutral-400 py-6">مفيش حركات هنا.</p>}
        {filtered.map((t) => {
          const Icon = TYPE_ICON[t.type] || Wallet;
          const { sign, color } = signAndColor(t);
          const person = t.debts?.people?.name || t.counterparty_name;
          return (
            <button key={t.id} onClick={() => goToSource(t)} className="w-full text-right">
              <Card className="flex items-center gap-3 py-3">
                <div className="w-9 h-9 rounded-full bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {t.categories?.icon ? `${t.categories.icon} ` : ""}
                    {t.description || t.categories?.name || TYPE_LABEL[t.type]}
                  </p>
                  <p className="text-[11px] text-neutral-400 truncate">
                    {t.accounts?.name}
                    {t.type === "transfer" && t.to_accounts?.name ? ` ← ${t.to_accounts.name}` : ""}
                    {person ? ` · ${person}` : ""}
                    {" · "}
                    {new Date(t.occurred_at).toLocaleDateString("ar-EG")}
                  </p>
                </div>
                <p className={`font-bold text-sm shrink-0 ${color}`}>
                  {sign}{fmt(Math.abs(Number(t.amount)), t.currency)}
                </p>
              </Card>
            </button>
          );
        })}
      </div>
    </div>
  );
}
