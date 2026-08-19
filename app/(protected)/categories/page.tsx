"use client";
import { useEffect, useState } from "react";
import Card from "@/components/Card";
import { Plus, Trash2, Pencil } from "lucide-react";

interface Category { id: string; name: string; icon: string; kind: "expense" | "income"; keywords: string[] }

const EMOJI_CHOICES = ["💰", "🍔", "🚕", "🛒", "🏠", "💊", "🎓", "🎉", "✈️", "📱", "⚡", "👕", "🎁", "💼", "🐱", "☕"];

export default function CategoriesPage() {
  const [cats, setCats] = useState<Category[]>([]);
  const [tab, setTab] = useState<"expense" | "income">("expense");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", icon: "💰", kind: "expense" as "expense" | "income" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, any>>({});
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null);

  const load = () => fetch("/api/categories").then((r) => r.json()).then((d) => setCats(d.categories || []));
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.name.trim()) { setError("اسم التصنيف مطلوب"); return; }
    setSaving(true);
    setError("");
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "حصل خطأ ومتحفظش، حاول تاني");
      return;
    }
    setShowForm(false);
    setForm({ name: "", icon: "💰", kind: tab });
    load();
  };

  const saveEdit = async (id: string) => {
    const res = await fetch(`/api/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editDraft),
    });
    if (!res.ok) { setError("حصل خطأ ومتحفظش التعديل"); return; }
    setEditing(null);
    load();
  };

  const remove = async (c: Category) => {
    const res = await fetch(`/api/categories/${c.id}`, { method: "DELETE" });
    setConfirmDelete(null);
    if (!res.ok) { setError("حصل خطأ ومتحذفش التصنيف"); return; }
    load();
  };

  const filtered = cats.filter((c) => c.kind === tab);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">التصنيفات</h1>
        <button
          onClick={() => { setShowForm((s) => !s); setForm({ name: "", icon: "💰", kind: tab }); setError(""); }}
          className="flex items-center gap-1 text-sm bg-orange-600 text-white rounded-full px-3 py-1.5"
        >
          <Plus size={16} /> تصنيف جديد
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 bg-neutral-100 dark:bg-neutral-800 rounded-xl p-1">
        <button onClick={() => setTab("expense")} className={`py-2 rounded-lg text-sm font-medium ${tab === "expense" ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>
          تصنيفات المصروفات
        </button>
        <button onClick={() => setTab("income")} className={`py-2 rounded-lg text-sm font-medium ${tab === "income" ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>
          تصنيفات الدخل
        </button>
      </div>

      {error && <p className="text-xs text-red-500 text-center">{error}</p>}

      {showForm && (
        <Card className="space-y-2">
          <input
            placeholder="اسم التصنيف (مثال: مطاعم)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
          />
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as any })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
            <option value="expense">مصروف</option>
            <option value="income">دخل</option>
          </select>
          <div className="flex flex-wrap gap-1.5">
            {EMOJI_CHOICES.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setForm({ ...form, icon: e })}
                className={`w-9 h-9 rounded-lg border text-lg flex items-center justify-center ${form.icon === e ? "border-orange-500 bg-orange-50 dark:bg-orange-950" : "border-neutral-200 dark:border-neutral-800"}`}
              >
                {e}
              </button>
            ))}
          </div>
          <button disabled={saving} onClick={submit} className="w-full bg-orange-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60">
            {saving ? "جاري الحفظ..." : "حفظ التصنيف"}
          </button>
        </Card>
      )}

      <div className="space-y-2">
        {filtered.map((c) => (
          <Card key={c.id} className="!p-3">
            {editing === c.id ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {EMOJI_CHOICES.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setEditDraft({ ...editDraft, icon: e })}
                      className={`w-8 h-8 rounded-lg border text-base flex items-center justify-center ${editDraft.icon === e ? "border-orange-500 bg-orange-50 dark:bg-orange-950" : "border-neutral-200 dark:border-neutral-800"}`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
                <input
                  value={editDraft.name || ""}
                  onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(c.id)} className="flex-1 bg-orange-600 text-white rounded-lg py-1.5 text-xs">حفظ</button>
                  <button onClick={() => setEditing(null)} className="flex-1 border border-neutral-300 dark:border-neutral-700 rounded-lg py-1.5 text-xs">إلغاء</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{c.icon}</span>
                  <span className="text-sm font-medium">{c.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => { setEditing(c.id); setEditDraft({ name: c.name, icon: c.icon }); }} className="p-2 text-neutral-400 hover:text-orange-600">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setConfirmDelete(c)} className="p-2 text-neutral-400 hover:text-red-600">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )}
          </Card>
        ))}
        {filtered.length === 0 && <p className="text-center text-sm text-neutral-400 mt-8">مفيش تصنيفات هنا لسه.</p>}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-sm">تأكيد الحذف</p>
            <p className="text-xs text-neutral-500">هتحذف تصنيف "{confirmDelete.name}". الحركات القديمة هتفضل موجودة بس من غير تصنيف. الإجراء ده مش قابل للتراجع.</p>
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
