"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Card from "@/components/Card";
import { fmt } from "@/lib/format";
import { Plus, ChevronDown, Trash2, Pencil, Paperclip } from "lucide-react";
import { shrinkImage } from "@/lib/image";

interface Payment { id: string; amount: number; paid_at: string; receipt_url: string | null; note: string | null }
interface Debt {
  id: string;
  title: string;
  reason: string | null;
  direction: "owed_to_me" | "i_owe";
  original_amount: number;
  remaining_amount: number;
  currency: string;
  status: string;
  due_date: string | null;
  people: { name: string; phone: string | null };
  debt_payments: Payment[];
}

const STATUS_LABEL: Record<string, string> = { open: "مفتوح", paid: "تم السداد", overdue: "متأخر", written_off: "خسارة/معدوم" };
const STATUS_COLOR: Record<string, string> = {
  open: "text-blue-600 bg-blue-50 dark:bg-blue-950",
  paid: "text-orange-600 bg-orange-50 dark:bg-orange-950",
  overdue: "text-red-600 bg-red-50 dark:bg-red-950",
  written_off: "text-neutral-500 bg-neutral-100 dark:bg-neutral-800",
};

function PeopleInner() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"owed_to_me" | "i_owe">("owed_to_me");
  const [debts, setDebts] = useState<Debt[]>([]);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formWarning, setFormWarning] = useState("");
  const [payFor, setPayFor] = useState<Debt | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [form, setForm] = useState({ person_id: "", new_person: "", title: "", reason: "", amount: "", currency: "EGP" });
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, any>>({});
  const [confirmDelete, setConfirmDelete] = useState<Debt | null>(null);
  const [editError, setEditError] = useState("");
  const [payError, setPayError] = useState("");
  const [receiptDataUrl, setReceiptDataUrl] = useState<string | null>(null);

  const load = async () => {
    const d = await fetch("/api/debts").then((r) => r.json());
    setDebts(d.debts || []);
    const p = await fetch("/api/people").then((r) => r.json());
    setPeople((p.people || []).map((x: any) => ({ id: x.id, name: x.name })));
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.person_id && !form.new_person.trim()) {
      setFormWarning("لازم تختار شخص أو تكتب اسم جديد");
      return;
    }
    if (!form.title.trim()) {
      setFormWarning("اسم الدين لازم يتملى");
      return;
    }
    if (!form.amount || parseFloat(form.amount) <= 0) {
      setFormWarning("المبلغ لازم يتملى برقم أكبر من صفر");
      return;
    }
    setFormWarning("");
    setSaving(true);
    let personId = form.person_id;
    if (!personId && form.new_person) {
      const p = await fetch("/api/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.new_person }),
      }).then((r) => r.json());
      personId = p.person?.id;
    }
    try {
      const res = await fetch("/api/debts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person_id: personId, direction: tab, title: form.title, reason: form.reason, amount: parseFloat(form.amount), currency: form.currency }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormWarning(data.error || "حصل خطأ ومتحفظش الدين، حاول تاني");
        setSaving(false);
        return;
      }
      setShowForm(false);
      setForm({ person_id: "", new_person: "", title: "", reason: "", amount: "", currency: "EGP" });
      load();
    } catch {
      setFormWarning("مفيش اتصال بالإنترنت، حاول تاني");
    } finally {
      setSaving(false);
    }
  };

  const submitPayment = async () => {
    if (!payFor || !payAmount) return;
    setPayError("");
    try {
      const res = await fetch(`/api/debts/${payFor.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parseFloat(payAmount), receipt_url: receiptDataUrl || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPayError(data.error || "حصل خطأ ومتسجلش السداد، حاول تاني");
        return;
      }
      setPayFor(null);
      setPayAmount("");
      setReceiptDataUrl(null);
      load();
    } catch {
      setPayError("مفيش اتصال بالإنترنت، حاول تاني");
    }
  };

  const onReceiptPicked = async (file: File) => {
    const dataUrl = await shrinkImage(file);
    setReceiptDataUrl(dataUrl);
  };

  const toggleExpand = (d: Debt) => {
    if (expandedId === d.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(d.id);
    setEditError("");
    setEditDraft({
      title: d.title,
      reason: d.reason || "",
      due_date: d.due_date || "",
      original_amount: String(d.original_amount),
      remaining_amount: String(d.remaining_amount),
      currency: d.currency,
    });
  };

  const saveEdit = async (id: string) => {
    setEditError("");
    try {
      const res = await fetch(`/api/debts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editDraft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setEditError(data.error || "حصل خطأ ومتحفظش التعديل، حاول تاني"); return; }
      setExpandedId(null);
      load();
    } catch {
      setEditError("مفيش اتصال بالإنترنت، حاول تاني");
    }
  };

  const remove = async (d: Debt) => {
    const res = await fetch(`/api/debts/${d.id}`, { method: "DELETE" });
    setConfirmDelete(null);
    if (!res.ok) { setEditError("حصل خطأ ومتحذفش الدين، حاول تاني"); return; }
    setExpandedId(null);
    load();
  };

  useEffect(() => {
    const target = searchParams.get("debt");
    if (target && expandedId !== target) {
      const d = debts.find((x) => x.id === target);
      if (d) {
        setTab(d.direction);
        toggleExpand(d);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debts.length]);

  const filtered = debts.filter((d) => d.direction === tab);
  const total = filtered.filter((d) => d.status !== "paid" && d.status !== "written_off").reduce((s, d) => s + Number(d.remaining_amount), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">الأشخاص والديون</h1>
        <button onClick={() => { setShowForm((s) => !s); setFormWarning(""); }} className="flex items-center gap-1 text-sm bg-orange-600 text-white rounded-full px-3 py-1.5">
          <Plus size={16} /> دين جديد
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 bg-neutral-100 dark:bg-neutral-800 rounded-xl p-1">
        <button onClick={() => setTab("owed_to_me")} className={`py-2 rounded-lg text-sm font-medium ${tab === "owed_to_me" ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>
          مستحقات لي
        </button>
        <button onClick={() => setTab("i_owe")} className={`py-2 rounded-lg text-sm font-medium ${tab === "i_owe" ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>
          مستحقات عليّ
        </button>
      </div>

      <Card className="text-center bg-neutral-100 dark:bg-neutral-800/50 border-none">
        <p className="text-xs text-neutral-500">{tab === "owed_to_me" ? "إجمالي المستحق لي" : "إجمالي المستحق عليّ"}</p>
        <p className="text-lg font-bold mt-1">{total.toLocaleString()}</p>
      </Card>

      {showForm && (
        <Card className="space-y-2">
          <select value={form.person_id} onChange={(e) => setForm({ ...form, person_id: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
            <option value="">-- اختار شخص أو ضيف جديد تحت --</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {!form.person_id && (
            <input placeholder="اسم شخص جديد" value={form.new_person} onChange={(e) => setForm({ ...form, new_person: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          )}
          <input placeholder="اسم الدين (مثال: سلفة شقة)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          <input placeholder="السبب (اختياري)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="المبلغ" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
              <option value="EGP">جنيه</option>
              <option value="USD">دولار</option>
              <option value="SAR">ريال</option>
            </select>
          </div>
          {formWarning && <p className="text-xs text-red-500">{formWarning}</p>}
          <button disabled={saving} onClick={submit} className="w-full bg-orange-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60">
            {saving ? "جاري الحفظ..." : "حفظ الدين"}
          </button>
        </Card>
      )}

      <div className="space-y-2">
        {filtered.map((d) => {
          const isOpen = expandedId === d.id;
          const paid = Number(d.original_amount) - Number(d.remaining_amount);
          return (
            <Card key={d.id} className="!p-0 overflow-hidden">
              <button className="w-full text-right p-4" onClick={() => toggleExpand(d)}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-sm">{d.people?.name} — {d.title}</p>
                    {d.reason && <p className="text-xs text-neutral-400">{d.reason}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLOR[d.status]}`}>{STATUS_LABEL[d.status]}</span>
                    <ChevronDown size={16} className={`text-neutral-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-neutral-400">من أصل {fmt(Number(d.original_amount), d.currency)}</p>
                  <p className="font-bold text-sm">{fmt(Number(d.remaining_amount), d.currency)}</p>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-neutral-100 dark:border-neutral-800 p-4 space-y-3 bg-neutral-50 dark:bg-neutral-900/50">
                  {paid > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-neutral-500">تفاصيل السداد — اتسدد {fmt(paid, d.currency)} من {fmt(Number(d.original_amount), d.currency)}، باقي {fmt(Number(d.remaining_amount), d.currency)}</p>
                      {d.debt_payments?.length > 0 && (
                        <div className="space-y-1">
                          {d.debt_payments.map((p) => (
                            <div key={p.id} className="flex items-center justify-between text-[11px] text-neutral-500 border-b border-neutral-100 dark:border-neutral-800 py-1">
                              <span>{new Date(p.paid_at).toLocaleDateString("ar-EG")}</span>
                              {p.receipt_url && (
                                <a href={p.receipt_url} target="_blank" rel="noopener noreferrer" className="text-orange-500 underline">الإيصال</a>
                              )}
                              <span className="font-medium">{fmt(Number(p.amount), d.currency)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <input value={editDraft.title || ""} onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })} placeholder="اسم الدين" className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                    <input value={editDraft.reason || ""} onChange={(e) => setEditDraft({ ...editDraft, reason: e.target.value })} placeholder="السبب" className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-neutral-400">المبلغ الأصلي</label>
                        <input type="number" value={editDraft.original_amount ?? ""} onChange={(e) => setEditDraft({ ...editDraft, original_amount: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] text-neutral-400">المتبقي</label>
                        <input type="number" value={editDraft.remaining_amount ?? ""} onChange={(e) => setEditDraft({ ...editDraft, remaining_amount: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                      </div>
                    </div>
                  </div>

                  {editError && <p className="text-xs text-red-500">{editError}</p>}

                  <div className="flex gap-2">
                    {(d.status === "open" || d.status === "overdue") && (
                      <button onClick={() => { setPayFor(d); setPayAmount(""); setReceiptDataUrl(null); setPayError(""); }} className="flex-1 text-xs bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300 rounded-lg py-2">
                        تسجيل سداد جزئي
                      </button>
                    )}
                    <button onClick={() => saveEdit(d.id)} className="flex-1 flex items-center justify-center gap-1 text-xs bg-orange-600 text-white rounded-lg py-2">
                      <Pencil size={13} /> حفظ التعديل
                    </button>
                    <button onClick={() => setConfirmDelete(d)} className="flex items-center justify-center gap-1 text-xs bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 rounded-lg py-2 px-3">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
        {filtered.length === 0 && <p className="text-center text-sm text-neutral-400 mt-8">مفيش ديون هنا.</p>}
      </div>

      {payFor && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={() => setPayFor(null)}>
          <div className="bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-sm">سداد جزئي — {payFor.title}</p>
            <p className="text-xs text-neutral-400">الباقي: {fmt(Number(payFor.remaining_amount), payFor.currency)}</p>
            <input autoFocus type="number" placeholder="المبلغ المدفوع" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
            <label className="flex items-center gap-2 text-xs text-orange-600 dark:text-orange-400 border border-dashed border-orange-200 dark:border-orange-900 rounded-lg px-3 py-2 cursor-pointer">
              <Paperclip size={14} />
              {receiptDataUrl ? "تم إرفاق إيصال — دوس لتغييره" : "إرفاق صورة إيصال (إيداع، فودافون كاش، إنستاباي...)"}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onReceiptPicked(f); }} />
            </label>
            {receiptDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={receiptDataUrl} alt="الإيصال" className="w-full max-h-28 object-contain rounded-lg border border-neutral-200 dark:border-neutral-800" />
            )}
            {payError && <p className="text-xs text-red-500">{payError}</p>}
            <button onClick={submitPayment} className="w-full bg-orange-600 text-white rounded-lg py-2 text-sm font-medium">تأكيد السداد</button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-sm">تأكيد الحذف</p>
            <p className="text-xs text-neutral-500">هتحذف دين "{confirmDelete.title}" مع كل تفاصيل السداد الخاصة بيه. الإجراء ده مش قابل للتراجع.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm">إلغاء</button>
              <button onClick={() => remove(confirmDelete)} className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium">حذف نهائي</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PeoplePage() {
  return (
    <Suspense fallback={null}>
      <PeopleInner />
    </Suspense>
  );
}
