"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Card from "@/components/Card";
import { fmt } from "@/lib/format";
import { toEGP, fromEGP, type FxRates } from "@/lib/fx";
import { Plus, Landmark, Smartphone, ChevronDown, Trash2, CornerDownLeft, RefreshCcw } from "lucide-react";

const CURRENCIES = [
  { code: "EGP", label: "جنيه مصري" },
  { code: "USD", label: "دولار أمريكي" },
  { code: "SAR", label: "ريال سعودي" },
];

interface Account {
  id: string;
  name: string;
  type: "bank" | "wallet";
  account_number: string | null;
  currency: string;
  balance: number;
  parent_account_id: string | null;
  include_in_net_worth?: boolean;
}

const emptyForm = { name: "", type: "bank", account_number: "", currency: "EGP", balance: "" };

function AccountsInner() {
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [subFormFor, setSubFormFor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, any>>({});
  const [form, setForm] = useState(emptyForm);
  const [subForm, setSubForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showBalances, setShowBalances] = useState(false);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<Account | null>(null);
  const [msg, setMsg] = useState("");
  const [msgIsError, setMsgIsError] = useState(false);
  const [baseCurrency, setBaseCurrency] = useState("EGP");
  const [rates, setRates] = useState<FxRates | null>(null);

  const showMsg = (text: string, isError = false) => {
    setMsg(text);
    setMsgIsError(isError);
    setTimeout(() => setMsg(""), isError ? 4000 : 2000);
  };

  const load = () => fetch("/api/accounts").then((r) => r.json()).then((d) => setAccounts(d.accounts || []));
  useEffect(() => {
    load();
    fetch("/api/me").then((r) => r.json()).then((d) => setBaseCurrency(d?.user?.base_currency || "EGP")).catch(() => {});
    fetch("/api/fx").then((r) => r.json()).then((d) => setRates(d.rates || null)).catch(() => {});
  }, []);

  // convert an account's balance into the app's base currency — via EGP,
  // since rates are all EGP-relative (see lib/fx.ts).
  const toBaseCurrency = (amount: number, currency: string) => {
    if (!rates || currency === baseCurrency) return null;
    return fromEGP(toEGP(amount, currency, rates), baseCurrency, rates);
  };

  const mains = accounts.filter((a) => !a.parent_account_id);
  const subsOf = (id: string) => accounts.filter((a) => a.parent_account_id === id);

  const submit = async () => {
    // empty name is just a warning now — the save still goes through
    // (server falls back to a placeholder name), per explicit request.
    if (!form.name) showMsg("تنبيه: الاسم فاضي، هيتحفظ الحساب باسم مؤقت لحد ما تعدّله", true);
    setSaving(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, balance: parseFloat(form.balance) || 0 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ ومتحفظش الحساب، حاول تاني", true); return; }
      setShowForm(false);
      setForm(emptyForm);
      if (form.name) showMsg("تم حفظ الحساب ✅");
      load();
    } catch {
      showMsg("مفيش اتصال بالإنترنت، حاول تاني", true);
    } finally {
      setSaving(false);
    }
  };

  const submitSub = async (parentId: string) => {
    if (!subForm.name) showMsg("تنبيه: الاسم فاضي، هيتحفظ الحساب الفرعي باسم مؤقت لحد ما تعدّله", true);
    setSaving(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...subForm, balance: parseFloat(subForm.balance) || 0, parent_account_id: parentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ ومتحفظش الحساب الفرعي، حاول تاني", true); return; }
      setSubFormFor(null);
      setSubForm(emptyForm);
      if (subForm.name) showMsg("تم حفظ الحساب الفرعي ✅");
      load();
    } catch {
      showMsg("مفيش اتصال بالإنترنت، حاول تاني", true);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (a: Account) => {
    setExpanded(expanded === a.id ? null : a.id);
    setEditing({ ...editing, [a.id]: { name: a.name, type: a.type, currency: a.currency, account_number: a.account_number || "", balance: String(a.balance), include_in_net_worth: a.include_in_net_worth !== false } });
  };

  const saveEdit = async (id: string) => {
    const patch = editing[id];
    setSaving(true);
    try {
      const res = await fetch(`/api/accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...patch, balance: parseFloat(patch.balance) || 0 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ ومتحفظش التعديل، حاول تاني", true); return; }
      setExpanded(null);
      load();
    } catch {
      showMsg("مفيش اتصال بالإنترنت، حاول تاني", true);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: Account) => {
    try {
      const res = await fetch(`/api/accounts/${a.id}`, { method: "DELETE" });
      setConfirmDelete(null);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showMsg(data.error || "حصل خطأ ومتحذفش الحساب، حاول تاني", true);
        return;
      }
      setExpanded(null);
      load();
    } catch {
      showMsg("مفيش اتصال بالإنترنت، حاول تاني", true);
    }
  };

  useEffect(() => {
    const target = searchParams.get("account");
    if (target && expanded !== target && accounts.some((a) => a.id === target)) {
      startEdit(accounts.find((a) => a.id === target)!);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length]);

  const submitBalances = async () => {
    setSaving(true);
    let failed = 0;
    for (const a of accounts) {
      const v = balances[a.id];
      if (v === undefined || v === "") continue;
      try {
        const res = await fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "balance_update", account_id: a.id, amount: parseFloat(v), currency: a.currency }),
        });
        if (!res.ok) failed++;
      } catch {
        failed++;
      }
    }
    setSaving(false);
    setBalances({});
    if (failed > 0) showMsg(`اتحدث بعض الأرصدة، لكن ${failed} فشل — حاول تاني`, true);
    else showMsg("تم تحديث الأرصدة ✅");
    load();
  };

  const totalByCurrency = accounts.reduce((acc: Record<string, number>, a) => {
    acc[a.currency] = (acc[a.currency] || 0) + Number(a.balance);
    return acc;
  }, {});

  const renderEditPanel = (a: Account) => {
    const e = editing[a.id] || {};
    return (
      <div className="mt-3 pt-3 border-t border-neutral-100 dark:border-neutral-800 space-y-2">
        <input placeholder="اسم الحساب" value={e.name || ""} onChange={(ev) => setEditing({ ...editing, [a.id]: { ...e, name: ev.target.value } })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
        <div className="grid grid-cols-2 gap-2">
          <select value={e.type} onChange={(ev) => setEditing({ ...editing, [a.id]: { ...e, type: ev.target.value } })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
            <option value="bank">حساب بنكي</option>
            <option value="wallet">محفظة موبايل</option>
          </select>
          <select value={e.currency} onChange={(ev) => setEditing({ ...editing, [a.id]: { ...e, currency: ev.target.value } })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </div>
        <input placeholder="رقم الحساب/المحفظة" value={e.account_number || ""} onChange={(ev) => setEditing({ ...editing, [a.id]: { ...e, account_number: ev.target.value } })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
        <input type="number" placeholder="الرصيد" value={e.balance} onChange={(ev) => setEditing({ ...editing, [a.id]: { ...e, balance: ev.target.value } })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
        {e.currency && e.currency !== baseCurrency && (
          <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 px-3 py-2 space-y-1.5">
            <label className="flex items-center justify-between text-xs text-neutral-700 dark:text-neutral-300">
              <span>احسب المبلغ المحوّل من الحساب ده ضمن صافي الثروة</span>
              <button
                type="button"
                onClick={() => setEditing({ ...editing, [a.id]: { ...e, include_in_net_worth: !e.include_in_net_worth } })}
                className={`w-11 h-6 rounded-full transition shrink-0 ${e.include_in_net_worth ? "bg-orange-600" : "bg-neutral-300 dark:bg-neutral-600"}`}
              >
                <span className={`block w-5 h-5 bg-white rounded-full shadow transition ${e.include_in_net_worth ? "translate-x-[-22px]" : "translate-x-[-2px]"}`} />
              </button>
            </label>
            <p className="text-[10px] leading-relaxed text-neutral-500">
              المبلغ اللي في الحساب ده متحسوب بعملة {e.currency}، ومضاف له معادله بالعملة الرئيسية ({baseCurrency}) عشان يدخل في حساب صافي الثروة. اقفل السويتش لو مش عايز المبلغ ده يتحسب ضمن صافي ثروتك.
            </p>
          </div>
        )}
        <div className="flex gap-2">
          <button disabled={saving} onClick={() => saveEdit(a.id)} className="flex-1 bg-orange-600 text-white rounded-lg py-2 text-sm font-medium">حفظ التعديلات</button>
          <button onClick={() => setConfirmDelete(a)} className="px-3 rounded-lg bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400"><Trash2 size={16} /></button>
        </div>
        {!a.parent_account_id && (
          <button
            onClick={() => { setSubFormFor(subFormFor === a.id ? null : a.id); setSubForm({ ...emptyForm, currency: a.currency }); }}
            className="w-full flex items-center justify-center gap-1 text-xs text-orange-600 dark:text-orange-400 py-2"
          >
            <CornerDownLeft size={14} /> إضافة حساب فرعي بعملة مختلفة
          </button>
        )}
      </div>
    );
  };

  const renderAccountCard = (a: Account, isSub = false) => {
    const converted = toBaseCurrency(Number(a.balance), a.currency);
    return (
    <div key={a.id} className={isSub ? "mr-6 border-r-2 border-orange-100 dark:border-orange-950 pr-3" : ""}>
      <Card className={isSub ? "bg-neutral-50/60 dark:bg-neutral-900/60" : ""}>
        <button onClick={() => startEdit(a)} className="w-full flex items-center gap-3 text-right">
          <div className="w-10 h-10 rounded-full bg-orange-50 dark:bg-orange-950 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0">
            {a.type === "bank" ? <Landmark size={18} /> : <Smartphone size={18} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{a.name}</p>
            {a.account_number && <p className="text-xs text-neutral-400 truncate">{a.account_number}</p>}
          </div>
          <div className="text-left shrink-0">
            <p className="font-bold text-sm">{fmt(Number(a.balance), a.currency)}</p>
            {converted !== null && (
              <p className="text-[10px] text-neutral-400">
                ≈ {fmt(converted, baseCurrency)}
                {a.include_in_net_worth === false && " (مش محسوبة في صافي الثروة)"}
              </p>
            )}
          </div>
          <ChevronDown size={16} className={`shrink-0 text-neutral-400 transition-transform ${expanded === a.id ? "rotate-180" : ""}`} />
        </button>
        {expanded === a.id && renderEditPanel(a)}
        {subFormFor === a.id && (
          <div className="mt-3 pt-3 border-t border-dashed border-neutral-200 dark:border-neutral-800 space-y-2">
            <input placeholder="اسم الحساب الفرعي" value={subForm.name} onChange={(ev) => setSubForm({ ...subForm, name: ev.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <select value={subForm.currency} onChange={(ev) => setSubForm({ ...subForm, currency: ev.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
              <input type="number" placeholder="الرصيد الحالي" value={subForm.balance} onChange={(ev) => setSubForm({ ...subForm, balance: ev.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
            </div>
            <button disabled={saving} onClick={() => submitSub(a.id)} className="w-full bg-orange-600 text-white rounded-lg py-2 text-sm font-medium">حفظ الحساب الفرعي</button>
          </div>
        )}
      </Card>
    </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">الحسابات</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-1 text-sm bg-orange-600 text-white rounded-full px-3 py-1.5"
        >
          <Plus size={16} /> إضافة حساب
        </button>
      </div>

      {msg && (
        <Card className={`text-sm text-center ${msgIsError ? "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400" : "bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300"}`}>
          {msg}
        </Card>
      )}

      {showForm && (
        <Card className="space-y-2">
          <input placeholder="اسم الحساب" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
              <option value="bank">حساب بنكي</option>
              <option value="wallet">محفظة موبايل</option>
            </select>
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </div>
          <input placeholder="رقم الحساب/المحفظة (اختياري)" value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          <input placeholder="الرصيد الحالي" type="number" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          <button disabled={saving} onClick={submit} className="w-full bg-orange-600 text-white rounded-lg py-2 text-sm font-medium">
            {saving ? "جاري الحفظ..." : "حفظ الحساب"}
          </button>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2">
        {Object.entries(totalByCurrency).map(([cur, total]) => (
          <Card key={cur} className="text-center bg-neutral-100 dark:bg-neutral-800/50 border-none">
            <p className="text-xs text-neutral-500">إجمالي ({cur})</p>
            <p className="text-lg font-bold mt-1">{total.toLocaleString()}</p>
          </Card>
        ))}
      </div>

      <div className="space-y-3">
        {mains.map((a) => (
          <div key={a.id} className="space-y-2">
            {renderAccountCard(a)}
            {subsOf(a.id).map((s) => renderAccountCard(s, true))}
          </div>
        ))}
        {mains.length === 0 && !showForm && (
          <p className="text-center text-sm text-neutral-400 mt-8">لم تُنشئ أي حساب بعد. اضغط "إضافة حساب" في الأعلى.</p>
        )}
      </div>

      <Card className="space-y-1">
        <button onClick={() => setShowBalances((s) => !s)} className="w-full flex items-center justify-between text-sm font-semibold">
          <span className="flex items-center gap-2"><RefreshCcw size={15} className="text-orange-600" /> تحديث كل الأرصدة دفعة واحدة</span>
          <ChevronDown size={16} className={`text-neutral-400 transition-transform ${showBalances ? "rotate-180" : ""}`} />
        </button>
        {showBalances && (
          <div className="pt-3 space-y-2">
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center gap-2">
                <span className="flex-1 text-sm">{a.name} <span className="text-neutral-400 text-xs">({a.currency})</span></span>
                <input
                  type="number"
                  placeholder={String(a.balance)}
                  value={balances[a.id] || ""}
                  onChange={(e) => setBalances({ ...balances, [a.id]: e.target.value })}
                  className="w-28 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm"
                />
              </div>
            ))}
            <button disabled={saving} onClick={submitBalances} className="w-full bg-orange-600 text-white rounded-lg py-2 text-sm font-medium">
              {saving ? "جاري الحفظ..." : "تحديث الأرصدة المدخلة"}
            </button>
          </div>
        )}
      </Card>

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-sm">هل تريد حذف حساب "{confirmDelete.name}"؟</p>
            <p className="text-xs text-neutral-400">سيتم أرشفة الحساب ولن يظهر في قوائمك، دون حذف حركاته السابقة.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm">إلغاء</button>
              <button onClick={() => remove(confirmDelete)} className="flex-1 rounded-lg bg-red-600 text-white py-2 text-sm">تأكيد الحذف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AccountsPage() {
  return (
    <Suspense fallback={null}>
      <AccountsInner />
    </Suspense>
  );
}
