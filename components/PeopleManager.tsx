"use client";
import { useEffect, useState } from "react";
import { Trash2, UserPlus } from "lucide-react";

interface Person { id: string; name: string; phone: string | null }

// Settings ← الأشخاص: family members / people you transfer to or pay for
// often. Saved here, they show up as suggestions while entering a transfer
// or expense counterparty in "إضافة حركة" — no need to retype a name twice.
export default function PeopleManager() {
  const [people, setPeople] = useState<Person[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Person | null>(null);

  const load = () => fetch("/api/people").then((r) => r.json()).then((d) => setPeople((d.people || []).map((p: any) => ({ id: p.id, name: p.name, phone: p.phone }))));
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim()) { setMsg("اكتب الاسم الأول"); return; }
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() || null }),
      });
      if (!res.ok) { setMsg("حصل خطأ ومتحفظش، حاول تاني"); return; }
      setName(""); setPhone("");
      load();
    } catch {
      setMsg("مفيش اتصال بالإنترنت، حاول تاني");
    } finally {
      setSaving(false);
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
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم" className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="رقم الموبايل (اختياري)" className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
      </div>
      <button disabled={saving} onClick={add} className="w-full flex items-center justify-center gap-1.5 bg-orange-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60">
        <UserPlus size={15} /> {saving ? "جاري الإضافة..." : "إضافة شخص"}
      </button>
      {msg && <p className="text-xs text-center text-red-500">{msg}</p>}

      <div className="space-y-1.5 pt-1">
        {people.map((p) => (
          <div key={p.id} className="flex items-center justify-between text-sm bg-neutral-50 dark:bg-neutral-900/60 rounded-lg px-3 py-2">
            <span>{p.name}{p.phone ? ` — ${p.phone}` : ""}</span>
            <button onClick={() => setConfirmDelete(p)} className="text-neutral-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
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
