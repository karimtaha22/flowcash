"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Card from "@/components/Card";
import { fmt } from "@/lib/format";
import { shrinkImage } from "@/lib/image";
import { ArrowRight, Camera, Loader2, Pencil, Trash2, Send } from "lucide-react";

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
  receipt_url: string | null;
  source: string | null;
  category_id: string | null;
  accounts?: { name: string; currency: string };
  to_accounts?: { name: string; currency: string };
  categories?: { name: string; icon: string };
  debts?: { id: string; title: string; people?: { name: string } };
}

const TYPE_LABEL: Record<string, string> = {
  expense: "مصروف",
  withdrawal: "سحب",
  income: "دخل",
  transfer: "تحويل",
  balance_update: "تحديث رصيد",
};

export default function TransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tx, setTx] = useState<Tx | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ description: "", counterparty_name: "", amount: "", occurred_at: "" });
  const [categories, setCategories] = useState<{ id: string; name: string; icon: string; kind: string }[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgIsError, setMsgIsError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showMsg = (text: string, isError = false) => {
    setMsg(text);
    setMsgIsError(isError);
    setTimeout(() => setMsg(""), isError ? 4000 : 2000);
  };

  const load = () => {
    setLoading(true);
    fetch(`/api/transactions/${id}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        setTx(d.transaction);
        setForm({
          description: d.transaction.description || "",
          counterparty_name: d.transaction.counterparty_name || "",
          amount: String(Math.abs(Number(d.transaction.amount))),
          occurred_at: (d.transaction.occurred_at || "").slice(0, 16),
        });
        setCategoryId(d.transaction.category_id || "");
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [id]);
  useEffect(() => { fetch("/api/categories").then((r) => r.json()).then((d) => setCategories(d.categories || [])); }, []);

  const canEditAmount = tx && (tx.type === "expense" || tx.type === "withdrawal" || tx.type === "income");

  const saveEdit = async () => {
    if (!tx) return;
    setSaving(true);
    try {
      const body: any = {
        description: form.description || null,
        counterparty_name: form.counterparty_name || null,
        occurred_at: form.occurred_at ? new Date(form.occurred_at).toISOString() : undefined,
        category_id: categoryId || null,
      };
      if (canEditAmount) body.amount = parseFloat(form.amount);
      const res = await fetch(`/api/transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ ومتحفظش التعديل، حاول تاني", true); return; }
      setTx(data.transaction);
      setEditing(false);
      showMsg("تم حفظ التعديل ✅");
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
      const res = await fetch(`/api/transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt_url: dataUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ في رفع الإيصال، حاول تاني", true); return; }
      setTx(data.transaction);
      showMsg("تم رفع الإيصال ✅");
    } catch {
      showMsg("حصلت مشكلة في رفع الإيصال، حاول تاني", true);
    } finally {
      setUploadingReceipt(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ ومتحذفتش الحركة، حاول تاني", true); setConfirmDelete(false); return; }
      router.push("/activity");
    } catch {
      showMsg("مفيش اتصال بالإنترنت، حاول تاني", true);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-center text-sm text-neutral-400 py-10">جاري التحميل...</p>;

  if (notFound || !tx) {
    return (
      <div className="space-y-4">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-neutral-500"><ArrowRight size={16} /> رجوع</button>
        <Card className="text-center text-sm text-neutral-400">الحركة دي مش موجودة (يمكن اتحذفت).</Card>
      </div>
    );
  }

  const person = tx.debts?.people?.name || tx.counterparty_name;
  const sign = tx.type === "income" ? "+" : tx.type === "expense" || tx.type === "withdrawal" ? "-" : "";
  const color =
    tx.type === "income" ? "text-emerald-600 dark:text-emerald-400" : tx.type === "expense" || tx.type === "withdrawal" ? "text-red-500" : "text-neutral-700 dark:text-neutral-200";

  return (
    <div className="space-y-4">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-neutral-500"><ArrowRight size={16} /> رجوع</button>

      {msg && (
        <Card className={`text-sm text-center ${msgIsError ? "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400" : "bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300"}`}>
          {msg}
        </Card>
      )}

      <Card className="space-y-3 text-center">
        <p className="text-xs text-neutral-400">{TYPE_LABEL[tx.type]}</p>
        <p className={`text-3xl font-bold ${color}`}>{sign}{fmt(Math.abs(Number(tx.amount)), tx.currency)}</p>
        <p className="text-sm text-neutral-500">
          {tx.categories?.icon ? `${tx.categories.icon} ` : ""}
          {tx.description || tx.categories?.name || TYPE_LABEL[tx.type]}
        </p>
        {tx.source === "bot" && (
          <span className="inline-block text-[11px] bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400 rounded-full px-2.5 py-1">
            📨 جت من تليجرام
          </span>
        )}
      </Card>

      <Card className="space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-neutral-400">التاريخ</span><span>{new Date(tx.occurred_at).toLocaleString("ar-EG")}</span></div>
        {tx.accounts?.name && <div className="flex justify-between"><span className="text-neutral-400">الحساب</span><span>{tx.accounts.name}</span></div>}
        {tx.type === "transfer" && tx.to_accounts?.name && <div className="flex justify-between"><span className="text-neutral-400">إلى حساب</span><span>{tx.to_accounts.name}</span></div>}
        {person && <div className="flex justify-between"><span className="text-neutral-400">الشخص</span><span>{person}</span></div>}
        {tx.categories?.name && <div className="flex justify-between"><span className="text-neutral-400">التصنيف</span><span>{tx.categories.icon} {tx.categories.name}</span></div>}
      </Card>

      {!editing ? (
        <div className="flex gap-2">
          <button onClick={() => setEditing(true)} className="flex-1 flex items-center justify-center gap-1.5 bg-neutral-800 dark:bg-neutral-700 text-white rounded-lg py-2.5 text-sm font-medium">
            <Pencil size={15} /> تعديل
          </button>
          <button onClick={() => setConfirmDelete(true)} className="flex-1 flex items-center justify-center gap-1.5 bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 rounded-lg py-2.5 text-sm font-medium">
            <Trash2 size={15} /> حذف
          </button>
        </div>
      ) : (
        <Card className="space-y-2">
          <p className="text-sm font-semibold">تعديل الحركة</p>
          {canEditAmount && (
            <input type="number" placeholder="المبلغ" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          )}
          {!canEditAmount && <p className="text-[11px] text-neutral-400">مبلغ حركات التحويل/تحديث الرصيد مايتغيرش من هنا.</p>}
          <input placeholder="الوصف" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          <input placeholder="اسم الطرف الآخر (اختياري)" value={form.counterparty_name} onChange={(e) => setForm({ ...form, counterparty_name: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
            <option value="">بدون تصنيف</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
          <input type="datetime-local" value={form.occurred_at} onChange={(e) => setForm({ ...form, occurred_at: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button disabled={saving} onClick={saveEdit} className="flex-1 bg-orange-600 text-white rounded-lg py-2 text-sm font-medium">{saving ? "جاري الحفظ..." : "حفظ"}</button>
            <button onClick={() => setEditing(false)} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm">إلغاء</button>
          </div>
        </Card>
      )}

      <Card className="space-y-2">
        <p className="text-sm font-semibold flex items-center gap-1.5"><Send size={14} className="text-orange-600" /> الإيصال</p>
        {tx.receipt_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tx.receipt_url} alt="الإيصال" className="w-full max-h-56 object-contain rounded-lg border border-neutral-200 dark:border-neutral-800" />
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
          className="w-full flex items-center justify-center gap-1.5 text-sm border border-orange-200 dark:border-orange-900 text-orange-600 dark:text-orange-400 rounded-lg py-2"
        >
          {uploadingReceipt ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
          {uploadingReceipt ? "جاري الرفع..." : tx.receipt_url ? "تغيير الإيصال" : "رفع إيصال"}
        </button>
      </Card>

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
    </div>
  );
}
