"use client";
import { useRef, useState } from "react";
import { fmt } from "@/lib/format";
import { shrinkImage } from "@/lib/image";
import { ArrowDownLeft, ArrowUpRight, ArrowRightLeft, Wallet, Landmark, Pencil, Trash2, Camera, Loader2 } from "lucide-react";
import ReceiptActions from "@/components/ReceiptActions";

export interface Tx {
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
  receipt_url?: string | null;
  source?: string | null;
  category_id?: string | null;
  accounts?: { name: string; currency: string };
  to_accounts?: { name: string; currency: string };
  categories?: { name: string; icon: string };
  debts?: { id: string; title: string; people?: { name: string } };
}

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

// A single transaction row that expands in place into an edit form (amount,
// description, counterparty, category, date, receipt) with save/delete —
// no navigation to a separate page. Shared between /activity and the recent
// history list on /add so both get the same inline-edit behavior.
export default function TransactionRow({
  tx,
  categories = [],
  onChanged,
}: {
  tx: Tx;
  categories?: { id: string; name: string; icon: string; kind: string }[];
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState({
    description: tx.description || "",
    counterparty_name: tx.counterparty_name || "",
    amount: String(Math.abs(Number(tx.amount))),
    occurred_at: (tx.occurred_at || "").slice(0, 16),
  });
  const [categoryId, setCategoryId] = useState(tx.category_id || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgIsError, setMsgIsError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState(tx.receipt_url || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canEditAmount = tx.type === "expense" || tx.type === "withdrawal" || tx.type === "income";

  const showMsg = (text: string, isError = false) => {
    setMsg(text);
    setMsgIsError(isError);
    setTimeout(() => setMsg(""), isError ? 4000 : 2000);
  };

  const toggle = () => {
    if (!expanded) {
      setForm({
        description: tx.description || "",
        counterparty_name: tx.counterparty_name || "",
        amount: String(Math.abs(Number(tx.amount))),
        occurred_at: (tx.occurred_at || "").slice(0, 16),
      });
      setCategoryId(tx.category_id || "");
      setReceiptUrl(tx.receipt_url || null);
    }
    setExpanded((e) => !e);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const body: any = {
        description: form.description || null,
        counterparty_name: form.counterparty_name || null,
        occurred_at: form.occurred_at ? new Date(form.occurred_at).toISOString() : undefined,
        category_id: categoryId || null,
      };
      if (canEditAmount) body.amount = parseFloat(form.amount);
      const res = await fetch(`/api/transactions/${tx.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ ومتحفظش التعديل، حاول تاني", true); return; }
      showMsg("تم حفظ التعديل ✅");
      setExpanded(false);
      onChanged();
    } catch {
      showMsg("مفيش اتصال بالإنترنت، حاول تاني", true);
    } finally {
      setSaving(false);
    }
  };

  const uploadReceipt = async (file: File) => {
    setUploadingReceipt(true);
    try {
      const dataUrl = await shrinkImage(file);
      const res = await fetch(`/api/transactions/${tx.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt_url: dataUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ في رفع الإيصال، حاول تاني", true); return; }
      setReceiptUrl(dataUrl);
      showMsg("تم رفع الإيصال ✅");
      onChanged();
    } catch {
      showMsg("حصلت مشكلة في رفع الإيصال، حاول تاني", true);
    } finally {
      setUploadingReceipt(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/transactions/${tx.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ ومتحذفتش الحركة، حاول تاني", true); setConfirmDelete(false); return; }
      onChanged();
    } catch {
      showMsg("مفيش اتصال بالإنترنت، حاول تاني", true);
    } finally {
      setSaving(false);
    }
  };

  const Icon = TYPE_ICON[tx.type] || Wallet;
  const person = tx.debts?.people?.name || tx.counterparty_name;
  const sign = tx.type === "income" ? "+" : tx.type === "expense" || tx.type === "withdrawal" ? "-" : "";
  const color =
    tx.type === "income" ? "text-emerald-600 dark:text-emerald-400" : tx.type === "expense" || tx.type === "withdrawal" ? "text-red-500" : "text-neutral-700 dark:text-neutral-200";

  return (
    <>
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm overflow-hidden">
      <button onClick={toggle} className="w-full text-right flex items-center gap-3 py-3 px-3.5">
        <div className="w-9 h-9 rounded-full bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
          <Icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate flex items-center gap-1.5">
            {tx.categories?.icon ? `${tx.categories.icon} ` : ""}
            {tx.description || tx.categories?.name || TYPE_LABEL[tx.type]}
            {tx.source === "bot" && (
              <span className="shrink-0 text-[10px] bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400 rounded-full px-1.5 py-0.5">تليجرام</span>
            )}
          </p>
          <p className="text-[11px] text-neutral-400 truncate">
            {tx.accounts?.name}
            {tx.type === "transfer" && tx.to_accounts?.name ? ` ← ${tx.to_accounts.name}` : ""}
            {person ? ` · ${person}` : ""}
            {" · "}
            {new Date(tx.occurred_at).toLocaleDateString("ar-EG")}
          </p>
        </div>
        <p className={`font-bold text-sm shrink-0 ${color}`}>
          {sign}{fmt(Math.abs(Number(tx.amount)), tx.currency)}
        </p>
      </button>

      {expanded && (
        <div className="border-t border-neutral-100 dark:border-neutral-800 p-3 space-y-2">
          {msg && (
            <p className={`text-xs text-center rounded-lg py-1.5 ${msgIsError ? "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400" : "bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300"}`}>
              {msg}
            </p>
          )}
          {canEditAmount && (
            <input type="number" placeholder="المبلغ" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          )}
          {!canEditAmount && <p className="text-[11px] text-neutral-400">مبلغ حركات التحويل/تحديث الرصيد مايتغيرش من هنا.</p>}
          <input placeholder="الوصف" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          <input placeholder="اسم الطرف الآخر (اختياري)" value={form.counterparty_name} onChange={(e) => setForm({ ...form, counterparty_name: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          {categories.length > 0 && (
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
              <option value="">بدون تصنيف</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          )}
          <input type="datetime-local" value={form.occurred_at} onChange={(e) => setForm({ ...form, occurred_at: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />

          {receiptUrl && (
            <div className="space-y-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={receiptUrl} alt="الإيصال" className="w-full max-h-40 object-contain rounded-lg border border-neutral-200 dark:border-neutral-800" />
              <ReceiptActions url={receiptUrl} filename={`إيصال-${tx.description || TYPE_LABEL[tx.type]}.jpg`} />
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadReceipt(f); }}
          />
          <button
            type="button"
            disabled={uploadingReceipt}
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-1.5 text-xs border border-orange-200 dark:border-orange-900 text-orange-600 dark:text-orange-400 rounded-lg py-1.5"
          >
            {uploadingReceipt ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
            {uploadingReceipt ? "جاري الرفع..." : receiptUrl ? "تغيير الصورة" : "إرفاق صورة"}
          </button>

          <div className="flex gap-2 pt-1">
            <button disabled={saving} onClick={saveEdit} className="flex-1 flex items-center justify-center gap-1.5 bg-orange-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60">
              <Pencil size={14} /> {saving ? "جاري الحفظ..." : "حفظ"}
            </button>
            <button onClick={() => setConfirmDelete(true)} className="shrink-0 flex items-center justify-center gap-1.5 bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 rounded-lg px-3 py-2 text-sm font-medium">
              <Trash2 size={14} /> حذف
            </button>
            <button onClick={() => setExpanded(false)} className="shrink-0 rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm">إلغاء</button>
          </div>
        </div>
      )}
    </div>

    {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={() => setConfirmDelete(false)}>
          <div className="bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-sm">هل تريد حذف هذه الحركة؟</p>
            <p className="text-xs text-neutral-400">هيرجع تأثيرها على رصيد الحساب.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm">إلغاء</button>
              <button disabled={saving} onClick={remove} className="flex-1 rounded-lg bg-red-600 text-white py-2 text-sm">تأكيد الحذف</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
