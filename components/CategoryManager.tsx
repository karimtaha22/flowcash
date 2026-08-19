"use client";
import { useEffect, useMemo, useState } from "react";
import Card from "@/components/Card";
import { ArrowLeft, ArrowRight, Plus, Save } from "lucide-react";

interface Cat { id: string; name: string; icon: string; kind: "expense" | "income"; is_active: boolean }

const EMOJI_CHOICES = ["💰", "🍔", "🚕", "🛒", "🏠", "💊", "🎓", "🎉", "✈️", "📱", "⚡", "👕", "🎁", "💼", "🐱", "☕"];

// Two columns — "المتاحة" (master pool, off) and "المفعّلة" (chosen, what
// actually shows up across the app) — with arrows to move a category
// between them, plus "إضافة تصنيف" for anything not in the master pool.
// Nothing is written to the server until "حفظ" is pressed.
export default function CategoryManager() {
  const [cats, setCats] = useState<Cat[]>([]);
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const [newCats, setNewCats] = useState<{ name: string; icon: string; kind: "expense" | "income" }[]>([]);
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("💰");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () => {
    setLoading(true);
    fetch("/api/categories/catalog")
      .then((r) => r.json())
      .then((d) => {
        const list: Cat[] = d.categories || [];
        setCats(list);
        setActiveIds(new Set(list.filter((c) => c.is_active).map((c) => c.id)));
        setNewCats([]);
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => cats.filter((c) => c.kind === kind), [cats, kind]);
  const active = filtered.filter((c) => activeIds.has(c.id));
  const available = filtered.filter((c) => !activeIds.has(c.id));

  const toggle = (id: string, on: boolean) => {
    setActiveIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  };

  const addNew = () => {
    if (!newName.trim()) return;
    setNewCats((prev) => [...prev, { name: newName.trim(), icon: newIcon, kind }]);
    setNewName("");
    setNewIcon("💰");
  };

  const removePendingNew = (idx: number) => setNewCats((prev) => prev.filter((_, i) => i !== idx));

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      const originalActive = new Set(cats.filter((c) => c.is_active).map((c) => c.id));
      const activate = [...activeIds].filter((id) => !originalActive.has(id));
      const deactivate = [...originalActive].filter((id) => !activeIds.has(id));
      const res = await fetch("/api/categories/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activate, deactivate, newCategories: newCats }),
      });
      if (!res.ok) { setMsg("حصل خطأ ومتحفظش، حاول تاني"); return; }
      setMsg("تم الحفظ ✅ — دي التصنيفات اللي هتظهرلك في البرنامج");
      load();
    } catch {
      setMsg("مفيش اتصال بالإنترنت، حاول تاني");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-center text-sm text-neutral-400 py-6">جاري التحميل...</p>;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 bg-neutral-100 dark:bg-neutral-800 rounded-xl p-1">
        <button onClick={() => setKind("expense")} className={`py-2 rounded-lg text-sm font-medium ${kind === "expense" ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>مصروفات</button>
        <button onClick={() => setKind("income")} className={`py-2 rounded-lg text-sm font-medium ${kind === "income" ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>دخل</button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-neutral-500 text-center">المفعّلة (بتظهر ليك)</p>
          <div className="space-y-1 max-h-56 overflow-y-auto">
            {active.map((c) => (
              <button key={c.id} onClick={() => toggle(c.id, false)} className="w-full flex items-center justify-between gap-1 text-xs bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300 rounded-lg px-2 py-1.5 text-right">
                <span className="truncate">{c.icon} {c.name}</span>
                <ArrowRight size={13} className="shrink-0" />
              </button>
            ))}
            {active.length === 0 && <p className="text-center text-[11px] text-neutral-400 py-3">مفيش تصنيفات مفعّلة — اختار من المتاحة</p>}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-neutral-500 text-center">المتاحة</p>
          <div className="space-y-1 max-h-56 overflow-y-auto">
            {available.map((c) => (
              <button key={c.id} onClick={() => toggle(c.id, true)} className="w-full flex items-center justify-between gap-1 text-xs border border-neutral-200 dark:border-neutral-800 rounded-lg px-2 py-1.5 text-right">
                <ArrowLeft size={13} className="shrink-0 text-orange-600" />
                <span className="truncate flex-1 text-right">{c.icon} {c.name}</span>
              </button>
            ))}
            {available.length === 0 && <p className="text-center text-[11px] text-neutral-400 py-3">اخترت كل المتاح</p>}
          </div>
        </div>
      </div>

      {newCats.filter((c) => c.kind === kind).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {newCats.map((c, i) => c.kind === kind && (
            <span key={i} className="flex items-center gap-1 text-[11px] bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded-full px-2 py-1">
              {c.icon} {c.name}
              <button onClick={() => removePendingNew(i)} className="text-emerald-500">×</button>
            </span>
          ))}
        </div>
      )}

      <div className="space-y-2 border-t border-dashed border-neutral-200 dark:border-neutral-800 pt-2">
        <p className="text-xs font-semibold text-neutral-500">إضافة تصنيف جديد</p>
        <div className="flex gap-1.5 flex-wrap">
          {EMOJI_CHOICES.map((e) => (
            <button key={e} type="button" onClick={() => setNewIcon(e)} className={`w-8 h-8 rounded-lg border text-base flex items-center justify-center ${newIcon === e ? "border-orange-500 bg-orange-50 dark:bg-orange-950" : "border-neutral-200 dark:border-neutral-800"}`}>
              {e}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={`اسم تصنيف ${kind === "expense" ? "مصروف" : "دخل"} جديد`} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          <button onClick={addNew} className="shrink-0 bg-neutral-800 dark:bg-neutral-700 text-white rounded-lg px-3"><Plus size={16} /></button>
        </div>
      </div>

      {msg && <p className="text-xs text-center text-orange-600 dark:text-orange-400">{msg}</p>}
      <button disabled={saving} onClick={save} className="w-full flex items-center justify-center gap-1.5 bg-orange-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-60">
        <Save size={15} /> {saving ? "جاري الحفظ..." : "حفظ"}
      </button>
    </div>
  );
}
