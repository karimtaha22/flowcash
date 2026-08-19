"use client";
import { useEffect, useState } from "react";
import { Trash2, UserPlus, Plus, X, Pencil, Check } from "lucide-react";

interface PaymentAccount { type: "bank" | "instapay" | "wallet"; label?: string; account_number: string }
interface Person { id: string; name: string; phone: string | null; phones: string[]; payment_accounts: PaymentAccount[] }

const ACCOUNT_TYPE_LABELS: Record<PaymentAccount["type"], string> = { bank: "حساب بنك", instapay: "إنستاباي", wallet: "محفظة" };
const inputCls = "rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm";
const emptyAccount = (): PaymentAccount => ({ type: "bank", label: "", account_number: "" });

// Shared editor for the "phones[]" + "payment_accounts[]" fields — used both
// in the "add person" form and in each person's inline edit mode, so the
// dynamic add/remove-row UI only has to be built once.
function ContactFieldsEditor({
  phones, setPhones, accounts, setAccounts,
}: {
  phones: string[];
  setPhones: (p: string[]) => void;
  accounts: PaymentAccount[];
  setAccounts: (a: PaymentAccount[]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="text-xs text-neutral-400">أرقام الموبايل</p>
        {phones.map((ph, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={ph}
              onChange={(e) => setPhones(phones.map((p, j) => (j === i ? e.target.value : p)))}
              placeholder="رقم الموبايل"
              className={`flex-1 ${inputCls}`}
            />
            {phones.length > 1 && (
              <button onClick={() => setPhones(phones.filter((_, j) => j !== i))} className="text-neutral-400 hover:text-red-600 p-2">
                <X size={14} />
              </button>
            )}
          </div>
        ))}
        <button onClick={() => setPhones([...phones, ""])} className="flex items-center gap-1 text-xs text-orange-600 font-medium">
          <Plus size={12} /> إضافة رقم تاني
        </button>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-neutral-400">حسابات الدفع (بنك / إنستاباي / محفظة)</p>
        {accounts.map((acc, i) => (
          <div key={i} className="space-y-1.5 bg-neutral-50 dark:bg-neutral-900/60 rounded-lg p-2">
            <div className="flex gap-2">
              <select
                value={acc.type}
                onChange={(e) => setAccounts(accounts.map((a, j) => (j === i ? { ...a, type: e.target.value as PaymentAccount["type"] } : a)))}
                className={`${inputCls} !px-2 !py-1.5 text-xs`}
              >
                <option value="bank">حساب بنك</option>
                <option value="instapay">إنستاباي</option>
                <option value="wallet">محفظة</option>
              </select>
              <input
                value={acc.label || ""}
                onChange={(e) => setAccounts(accounts.map((a, j) => (j === i ? { ...a, label: e.target.value } : a)))}
                placeholder="اسم البنك / ملاحظة (اختياري)"
                className={`flex-1 ${inputCls} !px-2 !py-1.5 text-xs`}
              />
              <button onClick={() => setAccounts(accounts.filter((_, j) => j !== i))} className="text-neutral-400 hover:text-red-600 p-1 shrink-0">
                <X size={14} />
              </button>
            </div>
            <input
              value={acc.account_number}
              onChange={(e) => setAccounts(accounts.map((a, j) => (j === i ? { ...a, account_number: e.target.value } : a)))}
              placeholder="رقم الحساب / IBAN / رقم المحفظة"
              className={`w-full ${inputCls} !px-2 !py-1.5 text-xs`}
            />
          </div>
        ))}
        <button onClick={() => setAccounts([...accounts, emptyAccount()])} className="flex items-center gap-1 text-xs text-orange-600 font-medium">
          <Plus size={12} /> إضافة حساب تاني
        </button>
      </div>
    </div>
  );
}

// Settings ← الأشخاص: family members / people you transfer to or pay for
// often. Saved here, they show up as suggestions while entering a transfer
// or expense counterparty in "إضافة حركة" — no need to retype a name twice.
export default function PeopleManager() {
  const [people, setPeople] = useState<Person[]>([]);
  const [name, setName] = useState("");
  const [phones, setPhones] = useState<string[]>([""]);
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Person | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhones, setEditPhones] = useState<string[]>([""]);
  const [editAccounts, setEditAccounts] = useState<PaymentAccount[]>([]);
  const [editSaving, setEditSaving] = useState(false);

  const load = () =>
    fetch("/api/people")
      .then((r) => r.json())
      .then((d) =>
        setPeople(
          (d.people || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            phone: p.phone,
            phones: Array.isArray(p.phones) && p.phones.length ? p.phones : p.phone ? [p.phone] : [],
            payment_accounts: Array.isArray(p.payment_accounts) ? p.payment_accounts : [],
          }))
        )
      );
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim()) { setMsg("اكتب الاسم الأول"); return; }
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phones: phones.map((p) => p.trim()).filter(Boolean),
          payment_accounts: accounts.filter((a) => a.account_number.trim()).map((a) => ({ ...a, label: a.label?.trim() || undefined })),
        }),
      });
      if (!res.ok) { setMsg("حصل خطأ ومتحفظش، حاول تاني"); return; }
      setName(""); setPhones([""]); setAccounts([]);
      load();
    } catch {
      setMsg("مفيش اتصال بالإنترنت، حاول تاني");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (p: Person) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditPhones(p.phones.length ? [...p.phones] : [""]);
    setEditAccounts(p.payment_accounts.length ? p.payment_accounts.map((a) => ({ ...a })) : []);
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/people/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          phones: editPhones.map((p) => p.trim()).filter(Boolean),
          payment_accounts: editAccounts.filter((a) => a.account_number.trim()).map((a) => ({ ...a, label: a.label?.trim() || undefined })),
        }),
      });
      if (!res.ok) { setMsg("حصل خطأ ومتحفظش، حاول تاني"); return; }
      setEditingId(null);
      load();
    } catch {
      setMsg("مفيش اتصال بالإنترنت، حاول تاني");
    } finally {
      setEditSaving(false);
    }
  };

  const remove = async (p: Person) => {
    const res = await fetch(`/api/people/${p.id}`, { method: "DELETE" });
    setConfirmDelete(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMsg(data.error || "حصل خطأ ومتحذفش، حاول تاني");
      return;
    }
    load();
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-neutral-400">أضف أفراد الأسرة أو أي حد بتحوّل له أو تدفع عنه باستمرار — هيظهر كاقتراح لما تسجل تحويل أو مصروف.</p>

      <div className="space-y-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم" className={`w-full ${inputCls}`} />
        <ContactFieldsEditor phones={phones} setPhones={setPhones} accounts={accounts} setAccounts={setAccounts} />
      </div>
      <button disabled={saving} onClick={add} className="w-full flex items-center justify-center gap-1.5 bg-orange-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60">
        <UserPlus size={15} /> {saving ? "جاري الإضافة..." : "إضافة شخص"}
      </button>
      {msg && <p className="text-xs text-center text-red-500">{msg}</p>}

      <div className="space-y-1.5 pt-1">
        {people.map((p) => (
          <div key={p.id} className="bg-neutral-50 dark:bg-neutral-900/60 rounded-lg overflow-hidden">
            {editingId === p.id ? (
              <div className="p-3 space-y-3">
                <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="الاسم" className={`w-full ${inputCls}`} />
                <ContactFieldsEditor phones={editPhones} setPhones={setEditPhones} accounts={editAccounts} setAccounts={setEditAccounts} />
                <div className="flex gap-2">
                  <button onClick={cancelEdit} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm">إلغاء</button>
                  <button disabled={editSaving} onClick={saveEdit} className="flex-1 flex items-center justify-center gap-1.5 bg-orange-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60">
                    <Check size={14} /> {editSaving ? "جاري الحفظ..." : "حفظ"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between text-sm px-3 py-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{p.name}</p>
                  {(p.phones.length > 0 || p.payment_accounts.length > 0) && (
                    <p className="text-[11px] text-neutral-400 truncate">
                      {p.phones.join(" · ")}
                      {p.phones.length > 0 && p.payment_accounts.length > 0 ? " — " : ""}
                      {p.payment_accounts.map((a) => `${ACCOUNT_TYPE_LABELS[a.type]}${a.label ? ` (${a.label})` : ""}`).join("، ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => startEdit(p)} className="text-neutral-400 hover:text-orange-600 p-1"><Pencil size={14} /></button>
                  <button onClick={() => setConfirmDelete(p)} className="text-neutral-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
                </div>
              </div>
            )}
          </div>
        ))}
        {people.length === 0 && <p className="text-center text-xs text-neutral-400 py-3">لسه مفيش أشخاص مسجلين.</p>}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-sm">حذف "{confirmDelete.name}"؟</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm">إلغاء</button>
              <button onClick={() => remove(confirmDelete)} className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium">حذف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
