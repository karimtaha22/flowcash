"use client";
import { useEffect, useState } from "react";
import Card from "@/components/Card";
import { fmt } from "@/lib/format";
import { Plus, Trash2, Pencil, Repeat, PiggyBank, Target, CheckCircle2 } from "lucide-react";

interface Account { id: string; name: string; currency: string }
interface Category { id: string; name: string; icon: string; kind: string }
interface RecurringItem {
  id: string; kind: "expense" | "income"; name: string; amount: number; currency: string;
  account_id: string; category_id: string | null; day_of_month: number; last_confirmed_month: string | null; is_active: boolean;
  accounts?: { name: string; currency: string }; categories?: { name: string; icon: string };
}
interface Budget {
  id: string; category_id: string; monthly_limit: number; currency: string; alert_threshold_pct: number;
  spent: number; pct: number; categories?: { name: string; icon: string };
}
interface Goal { id: string; name: string; target_amount: number; current_amount: number; currency: string; target_date: string | null }

const TABS = [
  { key: "recurring", label: "مصاريف ودخل متكرر", icon: Repeat },
  { key: "budgets", label: "الميزانية الشهرية", icon: PiggyBank },
  { key: "goals", label: "أهداف التوفير", icon: Target },
];

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

export default function PlanningPage() {
  const [tab, setTab] = useState("recurring");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [recurring, setRecurring] = useState<RecurringItem[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgIsError, setMsgIsError] = useState(false);

  const showMsg = (text: string, isError = false) => {
    setMsg(text);
    setMsgIsError(isError);
    setTimeout(() => setMsg(""), isError ? 4500 : 2500);
  };

  const [rForm, setRForm] = useState({ kind: "expense", name: "", amount: "", currency: "EGP", account_id: "", category_id: "", day_of_month: "1" });
  const [bForm, setBForm] = useState({ category_id: "", monthly_limit: "", currency: "EGP" });
  const [gForm, setGForm] = useState({ name: "", target_amount: "", currency: "EGP", target_date: "" });
  const [contributeFor, setContributeFor] = useState<Goal | null>(null);
  const [contributeAmount, setContributeAmount] = useState("");

  // inline-edit state, one draft per row id
  const [editingR, setEditingR] = useState<string | null>(null);
  const [rDraft, setRDraft] = useState<Record<string, any>>({});
  const [editingB, setEditingB] = useState<string | null>(null);
  const [bDraft, setBDraft] = useState<Record<string, any>>({});
  const [editingG, setEditingG] = useState<string | null>(null);
  const [gDraft, setGDraft] = useState<Record<string, any>>({});

  const [confirmDeleteR, setConfirmDeleteR] = useState<RecurringItem | null>(null);
  const [confirmDeleteB, setConfirmDeleteB] = useState<Budget | null>(null);
  const [confirmDeleteG, setConfirmDeleteG] = useState<Goal | null>(null);

  const loadAll = async () => {
    const [a, c, r, b, g] = await Promise.all([
      fetch("/api/accounts").then((x) => x.json()),
      fetch("/api/categories").then((x) => x.json()),
      fetch("/api/recurring").then((x) => x.json()),
      fetch("/api/budgets").then((x) => x.json()),
      fetch("/api/goals").then((x) => x.json()),
    ]);
    setAccounts(a.accounts || []);
    setCategories(c.categories || []);
    setRecurring(r.items || []);
    setBudgets(b.budgets || []);
    setGoals(g.goals || []);
  };
  useEffect(() => { loadAll(); }, []);

  const dueRecurring = recurring.filter((r) => r.is_active && r.last_confirmed_month !== currentMonthKey());

  const submitRecurring = async () => {
    if (!rForm.name || !rForm.amount || !rForm.account_id) { showMsg("الاسم والمبلغ والحساب لازم يتملوا", true); return; }
    try {
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rForm, amount: parseFloat(rForm.amount), day_of_month: parseInt(rForm.day_of_month) || 1, category_id: rForm.category_id || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ ومتحفظش، حاول تاني", true); return; }
      setRForm({ kind: "expense", name: "", amount: "", currency: "EGP", account_id: "", category_id: "", day_of_month: "1" });
      setShowForm(false);
      loadAll();
    } catch {
      showMsg("مفيش اتصال بالإنترنت، حاول تاني", true);
    }
  };

  const markPaid = async (r: RecurringItem) => {
    try {
      const res = await fetch(`/api/recurring/${r.id}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ ومتسجلش، حاول تاني", true); return; }
      const accName = r.accounts?.name || accounts.find((a) => a.id === r.account_id)?.name || "الحساب";
      if (r.kind === "income") showMsg(`✅ اتسجل الإيداع في حساب ${accName} — ${fmt(Number(r.amount), r.currency)}`);
      else showMsg(`✅ اتخصم من حساب ${accName} — ${fmt(Number(r.amount), r.currency)}`);
      loadAll();
    } catch {
      showMsg("مفيش اتصال بالإنترنت، حاول تاني", true);
    }
  };

  const startEditR = (r: RecurringItem) => {
    setEditingR(editingR === r.id ? null : r.id);
    setRDraft({ name: r.name, amount: String(r.amount), currency: r.currency, account_id: r.account_id, category_id: r.category_id || "", day_of_month: String(r.day_of_month), is_active: r.is_active });
  };

  const saveEditR = async (id: string) => {
    try {
      const res = await fetch(`/api/recurring/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rDraft, amount: parseFloat(rDraft.amount) || 0, day_of_month: parseInt(rDraft.day_of_month) || 1, category_id: rDraft.category_id || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ ومتحفظش التعديل، حاول تاني", true); return; }
      setEditingR(null);
      loadAll();
    } catch {
      showMsg("مفيش اتصال بالإنترنت، حاول تاني", true);
    }
  };

  const deleteRecurring = async (id: string) => {
    try {
      const res = await fetch(`/api/recurring/${id}`, { method: "DELETE" });
      setConfirmDeleteR(null);
      if (!res.ok) { showMsg("حصل خطأ ومتحذفش، حاول تاني", true); return; }
      loadAll();
    } catch {
      showMsg("مفيش اتصال بالإنترنت، حاول تاني", true);
    }
  };

  const submitBudget = async () => {
    if (!bForm.category_id || !bForm.monthly_limit) { showMsg("التصنيف والحد الشهري لازم يتملوا", true); return; }
    try {
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...bForm, monthly_limit: parseFloat(bForm.monthly_limit) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ ومتحفظش، حاول تاني", true); return; }
      setBForm({ category_id: "", monthly_limit: "", currency: "EGP" });
      setShowForm(false);
      loadAll();
    } catch {
      showMsg("مفيش اتصال بالإنترنت، حاول تاني", true);
    }
  };

  const startEditB = (b: Budget) => {
    setEditingB(editingB === b.id ? null : b.id);
    setBDraft({ monthly_limit: String(b.monthly_limit), alert_threshold_pct: String(b.alert_threshold_pct || 80) });
  };

  const saveEditB = async (id: string) => {
    try {
      const res = await fetch(`/api/budgets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthly_limit: parseFloat(bDraft.monthly_limit) || 0, alert_threshold_pct: parseInt(bDraft.alert_threshold_pct) || 80 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ ومتحفظش التعديل، حاول تاني", true); return; }
      setEditingB(null);
      loadAll();
    } catch {
      showMsg("مفيش اتصال بالإنترنت، حاول تاني", true);
    }
  };

  const deleteBudget = async (id: string) => {
    try {
      const res = await fetch(`/api/budgets/${id}`, { method: "DELETE" });
      setConfirmDeleteB(null);
      if (!res.ok) { showMsg("حصل خطأ ومتحذفش، حاول تاني", true); return; }
      loadAll();
    } catch {
      showMsg("مفيش اتصال بالإنترنت، حاول تاني", true);
    }
  };

  const submitGoal = async () => {
    if (!gForm.name || !gForm.target_amount) { showMsg("اسم الهدف والمبلغ المستهدف لازم يتملوا", true); return; }
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...gForm, target_amount: parseFloat(gForm.target_amount), target_date: gForm.target_date || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ ومتحفظش، حاول تاني", true); return; }
      setGForm({ name: "", target_amount: "", currency: "EGP", target_date: "" });
      setShowForm(false);
      loadAll();
    } catch {
      showMsg("مفيش اتصال بالإنترنت، حاول تاني", true);
    }
  };

  const startEditG = (g: Goal) => {
    setEditingG(editingG === g.id ? null : g.id);
    setGDraft({ name: g.name, target_amount: String(g.target_amount), target_date: g.target_date || "" });
  };

  const saveEditG = async (id: string) => {
    try {
      const res = await fetch(`/api/goals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...gDraft, target_amount: parseFloat(gDraft.target_amount) || 0 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ ومتحفظش التعديل، حاول تاني", true); return; }
      setEditingG(null);
      loadAll();
    } catch {
      showMsg("مفيش اتصال بالإنترنت، حاول تاني", true);
    }
  };

  const deleteGoal = async (id: string) => {
    try {
      const res = await fetch(`/api/goals/${id}`, { method: "DELETE" });
      setConfirmDeleteG(null);
      if (!res.ok) { showMsg("حصل خطأ ومتحذفش، حاول تاني", true); return; }
      loadAll();
    } catch {
      showMsg("مفيش اتصال بالإنترنت، حاول تاني", true);
    }
  };

  const submitContribution = async () => {
    if (!contributeFor || !contributeAmount) return;
    try {
      const res = await fetch(`/api/goals/${contributeFor.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: parseFloat(contributeAmount) }),
      });
      if (!res.ok) { showMsg("حصل خطأ ومتحفظش المبلغ، حاول تاني", true); return; }
      setContributeFor(null);
      setContributeAmount("");
      loadAll();
    } catch {
      showMsg("مفيش اتصال بالإنترنت، حاول تاني", true);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">التخطيط المالي</h1>

      {msg && (
        <Card className={`text-sm text-center ${msgIsError ? "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400" : "bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300"}`}>
          {msg}
        </Card>
      )}

      <div className="grid grid-cols-3 gap-2 bg-neutral-100 dark:bg-neutral-800 rounded-xl p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setShowForm(false); }}
            className={`flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium ${tab === t.key ? "bg-white dark:bg-neutral-900 shadow text-orange-600" : "text-neutral-500"}`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "recurring" && (
        <div className="space-y-3">
          {dueRecurring.length > 0 && (
            <Card className="bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-900 space-y-2">
              <p className="text-sm font-semibold text-orange-700 dark:text-orange-300">عليك المصاريف/الدخل دي الشهر ده:</p>
              {dueRecurring.map((r) => (
                <div key={r.id} className="flex items-center justify-between bg-white dark:bg-neutral-900 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{r.name}</p>
                    <p className="text-[11px] text-neutral-400">{fmt(Number(r.amount), r.currency)} · يوم {r.day_of_month} من كل شهر</p>
                  </div>
                  <button onClick={() => markPaid(r)} className="flex items-center gap-1 text-xs bg-orange-600 text-white rounded-lg px-3 py-1.5">
                    <CheckCircle2 size={13} /> {r.kind === "income" ? "نزل" : "دفعت"}
                  </button>
                </div>
              ))}
            </Card>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">كل العناصر المتكررة</p>
            <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-1 text-xs bg-orange-600 text-white rounded-full px-3 py-1.5">
              <Plus size={14} /> إضافة
            </button>
          </div>

          {showForm && (
            <Card className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <select value={rForm.kind} onChange={(e) => setRForm({ ...rForm, kind: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
                  <option value="expense">مصروف ثابت</option>
                  <option value="income">دخل ثابت</option>
                </select>
                <input type="number" min="1" max="31" placeholder="يوم الشهر (تاريخ الاستحقاق)" value={rForm.day_of_month} onChange={(e) => setRForm({ ...rForm, day_of_month: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
              </div>
              <input placeholder="الاسم (مثال: إيجار الشقة)" value={rForm.name} onChange={(e) => setRForm({ ...rForm, name: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="المبلغ" value={rForm.amount} onChange={(e) => setRForm({ ...rForm, amount: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                <select value={rForm.currency} onChange={(e) => setRForm({ ...rForm, currency: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
                  <option value="EGP">جنيه</option><option value="USD">دولار</option><option value="SAR">ريال</option>
                </select>
              </div>
              <select value={rForm.account_id} onChange={(e) => setRForm({ ...rForm, account_id: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
                <option value="">من/إلى أي حساب؟</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select value={rForm.category_id} onChange={(e) => setRForm({ ...rForm, category_id: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
                <option value="">تصنيف (اختياري)</option>
                {categories.filter((c) => c.kind === rForm.kind).map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
              <p className="text-[11px] text-neutral-400">مش هيتسحب تلقائي — هنفكرك يوم قبل الاستحقاق وفي يوم الاستحقاق نفسه، وانت اللي تأكد.</p>
              <button onClick={submitRecurring} className="w-full bg-orange-600 text-white rounded-lg py-2 text-sm font-medium">حفظ</button>
            </Card>
          )}

          <div className="space-y-2">
            {recurring.map((r) => (
              <Card key={r.id} className="!p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{r.categories?.icon} {r.name}</p>
                    <p className="text-[11px] text-neutral-400">{fmt(Number(r.amount), r.currency)} · يوم {r.day_of_month} · {r.accounts?.name}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEditR(r)} className="text-neutral-400 hover:text-orange-600 p-2"><Pencil size={14} /></button>
                    <button onClick={() => setConfirmDeleteR(r)} className="text-neutral-400 hover:text-red-600 p-2"><Trash2 size={14} /></button>
                  </div>
                </div>
                {editingR === r.id && (
                  <div className="space-y-2 border-t border-neutral-100 dark:border-neutral-800 pt-2">
                    <input value={rDraft.name || ""} onChange={(e) => setRDraft({ ...rDraft, name: e.target.value })} placeholder="الاسم" className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                    <div className="grid grid-cols-2 gap-2">
                      <input type="number" value={rDraft.amount || ""} onChange={(e) => setRDraft({ ...rDraft, amount: e.target.value })} placeholder="المبلغ" className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                      <input type="number" min="1" max="31" value={rDraft.day_of_month || ""} onChange={(e) => setRDraft({ ...rDraft, day_of_month: e.target.value })} placeholder="يوم الشهر" className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                    </div>
                    <select value={rDraft.account_id || ""} onChange={(e) => setRDraft({ ...rDraft, account_id: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={!!rDraft.is_active} onChange={(e) => setRDraft({ ...rDraft, is_active: e.target.checked })} />
                      نشط (هيتم تذكيري بيه)
                    </label>
                    <button onClick={() => saveEditR(r.id)} className="w-full bg-orange-600 text-white rounded-lg py-2 text-sm font-medium">حفظ التعديل</button>
                  </div>
                )}
              </Card>
            ))}
            {recurring.length === 0 && <p className="text-center text-sm text-neutral-400 py-6">لسه مفيش مصاريف أو دخل متكرر مسجل.</p>}
          </div>
        </div>
      )}

      {tab === "budgets" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">الميزانيات الشهرية</p>
            <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-1 text-xs bg-orange-600 text-white rounded-full px-3 py-1.5">
              <Plus size={14} /> إضافة
            </button>
          </div>

          {showForm && (
            <Card className="space-y-2">
              <select value={bForm.category_id} onChange={(e) => setBForm({ ...bForm, category_id: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
                <option value="">اختار التصنيف</option>
                {categories.filter((c) => c.kind === "expense").map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="الحد الشهري" value={bForm.monthly_limit} onChange={(e) => setBForm({ ...bForm, monthly_limit: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                <select value={bForm.currency} onChange={(e) => setBForm({ ...bForm, currency: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
                  <option value="EGP">جنيه</option><option value="USD">دولار</option><option value="SAR">ريال</option>
                </select>
              </div>
              <button onClick={submitBudget} className="w-full bg-orange-600 text-white rounded-lg py-2 text-sm font-medium">حفظ الميزانية</button>
            </Card>
          )}

          <div className="space-y-2">
            {budgets.map((b) => {
              const over = b.pct >= (b.alert_threshold_pct || 80);
              return (
                <Card key={b.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{b.categories?.icon} {b.categories?.name}</p>
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEditB(b)} className="text-neutral-400 hover:text-orange-600 p-1"><Pencil size={14} /></button>
                      <button onClick={() => setConfirmDeleteB(b)} className="text-neutral-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                    <div className={`h-full rounded-full ${over ? "bg-red-500" : "bg-orange-500"}`} style={{ width: `${Math.min(b.pct, 100)}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className={over ? "text-red-500 font-medium" : "text-neutral-500"}>{fmt(b.spent, b.currency)} من {fmt(Number(b.monthly_limit), b.currency)} ({b.pct}%)</span>
                    {over && <span className="text-red-500 font-medium">تخطيت {b.alert_threshold_pct}% ⚠️</span>}
                  </div>
                  {editingB === b.id && (
                    <div className="space-y-2 border-t border-neutral-100 dark:border-neutral-800 pt-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-neutral-400">الحد الشهري</label>
                          <input type="number" value={bDraft.monthly_limit || ""} onChange={(e) => setBDraft({ ...bDraft, monthly_limit: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                        </div>
                        <div>
                          <label className="text-[10px] text-neutral-400">نسبة التنبيه %</label>
                          <input type="number" min="1" max="100" value={bDraft.alert_threshold_pct || ""} onChange={(e) => setBDraft({ ...bDraft, alert_threshold_pct: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                        </div>
                      </div>
                      <button onClick={() => saveEditB(b.id)} className="w-full bg-orange-600 text-white rounded-lg py-2 text-sm font-medium">حفظ التعديل</button>
                    </div>
                  )}
                </Card>
              );
            })}
            {budgets.length === 0 && <p className="text-center text-sm text-neutral-400 py-6">لسه مفيش ميزانيات متحددة.</p>}
          </div>
        </div>
      )}

      {tab === "goals" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">أهداف التوفير</p>
            <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-1 text-xs bg-orange-600 text-white rounded-full px-3 py-1.5">
              <Plus size={14} /> إضافة
            </button>
          </div>

          {showForm && (
            <Card className="space-y-2">
              <input placeholder="اسم الهدف (مثال: تحويشة عربية)" value={gForm.name} onChange={(e) => setGForm({ ...gForm, name: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="المبلغ المستهدف" value={gForm.target_amount} onChange={(e) => setGForm({ ...gForm, target_amount: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                <select value={gForm.currency} onChange={(e) => setGForm({ ...gForm, currency: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
                  <option value="EGP">جنيه</option><option value="USD">دولار</option><option value="SAR">ريال</option>
                </select>
              </div>
              <input type="date" value={gForm.target_date} onChange={(e) => setGForm({ ...gForm, target_date: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
              <button onClick={submitGoal} className="w-full bg-orange-600 text-white rounded-lg py-2 text-sm font-medium">حفظ الهدف</button>
            </Card>
          )}

          <div className="space-y-2">
            {goals.map((g) => {
              const pct = g.target_amount > 0 ? Math.min(Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100), 100) : 0;
              return (
                <Card key={g.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{g.name}</p>
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEditG(g)} className="text-neutral-400 hover:text-orange-600 p-1"><Pencil size={14} /></button>
                      <button onClick={() => setConfirmDeleteG(g)} className="text-neutral-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                    <div className="h-full rounded-full bg-orange-500" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-500">{fmt(Number(g.current_amount), g.currency)} من {fmt(Number(g.target_amount), g.currency)} ({pct}%)</span>
                    <button onClick={() => setContributeFor(g)} className="text-orange-600 dark:text-orange-400 font-medium">أضف مبلغ +</button>
                  </div>
                  {editingG === g.id && (
                    <div className="space-y-2 border-t border-neutral-100 dark:border-neutral-800 pt-2">
                      <input value={gDraft.name || ""} onChange={(e) => setGDraft({ ...gDraft, name: e.target.value })} placeholder="اسم الهدف" className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                      <input type="number" value={gDraft.target_amount || ""} onChange={(e) => setGDraft({ ...gDraft, target_amount: e.target.value })} placeholder="المبلغ المستهدف" className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                      <input type="date" value={gDraft.target_date || ""} onChange={(e) => setGDraft({ ...gDraft, target_date: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                      <button onClick={() => saveEditG(g.id)} className="w-full bg-orange-600 text-white rounded-lg py-2 text-sm font-medium">حفظ التعديل</button>
                    </div>
                  )}
                </Card>
              );
            })}
            {goals.length === 0 && <p className="text-center text-sm text-neutral-400 py-6">لسه مفيش أهداف توفير متحددة.</p>}
          </div>
        </div>
      )}

      {contributeFor && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={() => setContributeFor(null)}>
          <div className="bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-sm">إضافة مبلغ — {contributeFor.name}</p>
            <input autoFocus type="number" placeholder="المبلغ" value={contributeAmount} onChange={(e) => setContributeAmount(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
            <button onClick={submitContribution} className="w-full bg-orange-600 text-white rounded-lg py-2 text-sm font-medium">تأكيد</button>
          </div>
        </div>
      )}

      {confirmDeleteR && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={() => setConfirmDeleteR(null)}>
          <div className="bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-sm">تأكيد الحذف</p>
            <p className="text-xs text-neutral-500">هتحذف "{confirmDeleteR.name}" من العناصر المتكررة. الإجراء ده مش قابل للتراجع.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDeleteR(null)} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm">إلغاء</button>
              <button onClick={() => deleteRecurring(confirmDeleteR.id)} className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium">حذف نهائي</button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteB && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={() => setConfirmDeleteB(null)}>
          <div className="bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-sm">تأكيد الحذف</p>
            <p className="text-xs text-neutral-500">هتحذف ميزانية "{confirmDeleteB.categories?.name}". الإجراء ده مش قابل للتراجع.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDeleteB(null)} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm">إلغاء</button>
              <button onClick={() => deleteBudget(confirmDeleteB.id)} className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium">حذف نهائي</button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteG && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={() => setConfirmDeleteG(null)}>
          <div className="bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-sm">تأكيد الحذف</p>
            <p className="text-xs text-neutral-500">هتحذف هدف "{confirmDeleteG.name}". الإجراء ده مش قابل للتراجع.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDeleteG(null)} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm">إلغاء</button>
              <button onClick={() => deleteGoal(confirmDeleteG.id)} className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium">حذف نهائي</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
