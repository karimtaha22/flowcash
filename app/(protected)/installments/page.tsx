"use client";
import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Card from "@/components/Card";
import { fmt } from "@/lib/format";
import { shrinkImage } from "@/lib/image";
import {
  Plus, Trash2, Pencil, CreditCard, Users, CheckCircle2, Camera, ShieldCheck, ShieldAlert,
  Star, ArrowLeftRight, Calculator, ChevronDown, ChevronUp, X,
} from "lucide-react";

// ===================== types =====================
interface InstallmentPayment {
  id: string; month_index: number; due_date: string; amount: number; status: "pending" | "paid"; paid_at: string | null;
}
interface InstallmentPlan {
  id: string; item_name: string; company_name: string | null; original_price: number | null;
  total_amount: number; months_count: number; monthly_amount: number; currency: string;
  start_date: string; status: "active" | "completed" | "cancelled";
  installment_payments: InstallmentPayment[];
}
interface Gam3eyaParticipant {
  id: string; name: string; phone: string | null; account_number: string | null;
  id_photo_front: string | null; id_photo_back: string | null; selfie_photo: string | null;
  verified: boolean; verification_note: string | null; payout_order: number; rating: number | null;
}
interface Gam3eyaPayment {
  id: string; participant_id: string | null; month_index: number; due_date: string;
  amount: number; status: "pending" | "paid"; paid_at: string | null; receipt_url: string | null;
}
interface Gam3eya {
  id: string; type: "subscribed" | "organizing"; name: string | null; monthly_amount: number; currency: string;
  participants_count: number; months_count: number; start_date: string; my_payout_month: number | null;
  status: "active" | "completed" | "cancelled";
  gam3eya_participants: Gam3eyaParticipant[]; gam3eya_payments: Gam3eyaPayment[];
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function InstallmentsPage() {
  return (
    <Suspense fallback={<p className="text-center text-neutral-400 mt-10">جاري التحميل...</p>}>
      <InstallmentsPageInner />
    </Suspense>
  );
}

function InstallmentsPageInner() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState<"installments" | "gam3eya">(initialTab === "gam3eya" ? "gam3eya" : "installments");

  const [plans, setPlans] = useState<InstallmentPlan[]>([]);
  const [gam3eyat, setGam3eyat] = useState<Gam3eya[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [msgIsError, setMsgIsError] = useState(false);

  const showMsg = (text: string, isError = false) => {
    setMsg(text);
    setMsgIsError(isError);
    setTimeout(() => setMsg(""), isError ? 4500 : 2500);
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [p, g] = await Promise.all([
        fetch("/api/installments").then((r) => r.json()),
        fetch("/api/gam3eya").then((r) => r.json()),
      ]);
      setPlans(p.plans || []);
      setGam3eyat(g.gam3eyas || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadAll(); }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">أقساط وجمعيات</h1>

      {msg && (
        <Card className={`text-sm text-center ${msgIsError ? "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400" : "bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300"}`}>
          {msg}
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2 bg-neutral-100 dark:bg-neutral-800 rounded-xl p-1">
        <button
          onClick={() => setTab("installments")}
          className={`flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium ${tab === "installments" ? "bg-white dark:bg-neutral-900 shadow text-orange-600" : "text-neutral-500"}`}
        >
          <CreditCard size={14} /> أقساط
        </button>
        <button
          onClick={() => setTab("gam3eya")}
          className={`flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium ${tab === "gam3eya" ? "bg-white dark:bg-neutral-900 shadow text-orange-600" : "text-neutral-500"}`}
        >
          <Users size={14} /> جمعيات
        </button>
      </div>

      {loading && <p className="text-center text-sm text-neutral-400 py-6">جاري التحميل...</p>}

      {!loading && tab === "installments" && <InstallmentsTab plans={plans} reload={loadAll} showMsg={showMsg} />}
      {!loading && tab === "gam3eya" && <Gam3eyaTab gam3eyat={gam3eyat} plans={plans} reload={loadAll} showMsg={showMsg} />}
    </div>
  );
}

// ===================== أقساط =====================
function InstallmentsTab({ plans, reload, showMsg }: { plans: InstallmentPlan[]; reload: () => void; showMsg: (t: string, e?: boolean) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ item_name: "", company_name: "", original_price: "", total_amount: "", months_count: "", start_date: todayISO(), currency: "EGP" });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<InstallmentPlan | null>(null);
  const [escalation, setEscalation] = useState<InstallmentPlan | null>(null);
  const [busy, setBusy] = useState(false);

  const active = plans.filter((p) => p.status === "active");
  const completed = plans.filter((p) => p.status === "completed");
  const totalRemaining = active.reduce((s, p) => s + p.installment_payments.filter((x) => x.status === "pending").reduce((s2, x) => s2 + Number(x.amount), 0), 0);

  const submit = async () => {
    if (!form.item_name || !form.total_amount || !form.months_count) { showMsg("اسم السلعة والمبلغ الإجمالي وعدد الشهور لازم يتملوا", true); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/installments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_name: form.item_name,
          company_name: form.company_name || null,
          original_price: form.original_price ? parseFloat(form.original_price) : null,
          total_amount: parseFloat(form.total_amount),
          months_count: parseInt(form.months_count),
          start_date: form.start_date,
          currency: form.currency,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ ومتحفظش، حاول تاني", true); return; }
      setForm({ item_name: "", company_name: "", original_price: "", total_amount: "", months_count: "", start_date: todayISO(), currency: "EGP" });
      setShowForm(false);
      reload();
    } catch {
      showMsg("مفيش اتصال بالإنترنت، حاول تاني", true);
    } finally {
      setBusy(false);
    }
  };

  const markPaid = async (plan: InstallmentPlan, paymentId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/installments/${plan.id}/payments/${paymentId}`, { method: "POST" });
      if (!res.ok) { showMsg("حصل خطأ ومتسجلش، حاول تاني", true); return; }
      showMsg("✅ اتسجل القسط مدفوع");
      reload();
    } finally {
      setBusy(false);
    }
  };

  const payBothOverdue = async (plan: InstallmentPlan) => {
    const overdue = plan.installment_payments.filter((x) => x.status === "pending" && x.due_date < todayISO()).sort((a, b) => a.month_index - b.month_index);
    setBusy(true);
    try {
      for (const p of overdue) {
        await fetch(`/api/installments/${plan.id}/payments/${p.id}`, { method: "POST" });
      }
      showMsg(`✅ اتسجل ${overdue.length} قسط مدفوعين`);
      setEscalation(null);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const reschedule = async (plan: InstallmentPlan) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/installments/${plan.id}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months: 1 }),
      });
      if (!res.ok) { showMsg("حصل خطأ في إعادة الجدولة", true); return; }
      showMsg("✅ اتعادت جدولة الأقساط الباقية شهر لقدام");
      setEscalation(null);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const deletePlan = async (plan: InstallmentPlan) => {
    const res = await fetch(`/api/installments/${plan.id}`, { method: "DELETE" });
    setConfirmDelete(null);
    if (!res.ok) { showMsg("حصل خطأ ومتحذفش", true); return; }
    reload();
  };

  return (
    <div className="space-y-3">
      <Card className="bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-900 flex items-center justify-between">
        <div>
          <p className="text-xs text-orange-700 dark:text-orange-300">باقي عليك (كل الأقساط الشغالة)</p>
          <p className="text-lg font-bold text-orange-700 dark:text-orange-300">{fmt(totalRemaining, "EGP")}</p>
        </div>
        <div className="text-xs text-orange-600 dark:text-orange-400 text-left">
          <p>{active.length} قسط شغال</p>
          <p>{completed.length} خلص ✅</p>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">كل الأقساط</p>
        <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-1 text-xs bg-orange-600 text-white rounded-full px-3 py-1.5">
          <Plus size={14} /> قسط جديد
        </button>
      </div>

      {showForm && (
        <Card className="space-y-2">
          <input placeholder="اسم السلعة (مثال: تلاجة)" value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          <input placeholder="اسم الشركة (اختياري)" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          <div>
            <input type="number" placeholder="السعر الأصلي (اختياري — لحساب الفايدة)" value={form.original_price} onChange={(e) => setForm({ ...form, original_price: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" placeholder="المبلغ الإجمالي بالقسط" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
              <option value="EGP">جنيه</option><option value="USD">دولار</option><option value="SAR">ريال</option>
            </select>
          </div>
          <input type="number" placeholder="عدد الشهور" value={form.months_count} onChange={(e) => setForm({ ...form, months_count: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          <div>
            <label className="text-[10px] text-neutral-400">تاريخ أول قسط</label>
            <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          </div>
          {form.total_amount && form.months_count && (
            <p className="text-[11px] text-neutral-400">
              كل قسط تقريبًا: {fmt(parseFloat(form.total_amount) / (parseInt(form.months_count) || 1), form.currency)}
              {form.original_price && parseFloat(form.original_price) > 0 && (
                <> · الفايدة: {fmt(parseFloat(form.total_amount) - parseFloat(form.original_price), form.currency)} ({Math.round(((parseFloat(form.total_amount) - parseFloat(form.original_price)) / parseFloat(form.original_price)) * 100)}%)</>
              )}
            </p>
          )}
          <button disabled={busy} onClick={submit} className="w-full bg-orange-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60">حفظ</button>
        </Card>
      )}

      <div className="space-y-2">
        {plans.map((plan) => {
          const overduePending = plan.installment_payments.filter((x) => x.status === "pending" && x.due_date < todayISO());
          const nextPending = plan.installment_payments.find((x) => x.status === "pending");
          const paidCount = plan.installment_payments.filter((x) => x.status === "paid").length;
          const isOpen = expanded === plan.id;
          const interestPct = plan.original_price && plan.original_price > 0 ? Math.round(((plan.total_amount - plan.original_price) / plan.original_price) * 100) : null;

          return (
            <Card key={plan.id} className="!p-3 space-y-2">
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(isOpen ? null : plan.id)}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{plan.item_name}{plan.company_name ? ` — ${plan.company_name}` : ""}</p>
                  <p className="text-[11px] text-neutral-400">
                    {fmt(plan.monthly_amount, plan.currency)}/شهر · {paidCount}/{plan.months_count} اتدفعوا
                    {plan.status === "completed" && " · خلص ✅"}
                    {interestPct !== null && ` · فايدة ${interestPct}%`}
                  </p>
                  {nextPending && (
                    <p className={`text-[11px] mt-0.5 ${overduePending.length > 0 ? "text-red-500 font-medium" : "text-neutral-400"}`}>
                      {overduePending.length > 0 ? `⚠️ متأخر من ${nextPending.due_date}` : `القسط الجاي: ${nextPending.due_date}`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {overduePending.length >= 2 && (
                    <button onClick={(e) => { e.stopPropagation(); setEscalation(plan); }} className="text-[10px] bg-red-600 text-white rounded-full px-2 py-1">قسطين متأخرين</button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(plan); }} className="text-neutral-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
                  {isOpen ? <ChevronUp size={16} className="text-neutral-400" /> : <ChevronDown size={16} className="text-neutral-400" />}
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-neutral-100 dark:border-neutral-800 pt-2 space-y-1.5">
                  {plan.installment_payments.map((p) => {
                    const late = p.status === "pending" && p.due_date < todayISO();
                    return (
                      <div key={p.id} className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${late ? "bg-red-50 dark:bg-red-950 ring-1 ring-red-300 dark:ring-red-800" : "bg-neutral-50 dark:bg-neutral-800/50"}`}>
                        <span>قسط {p.month_index} — {p.due_date} — {fmt(Number(p.amount), plan.currency)}</span>
                        {p.status === "paid" ? (
                          <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2 size={12} /> مدفوع</span>
                        ) : (
                          <button disabled={busy} onClick={() => markPaid(plan, p.id)} className="bg-orange-600 text-white rounded-full px-2 py-1">تم الدفع</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
        {plans.length === 0 && <p className="text-center text-sm text-neutral-400 py-6">لسه مفيش أقساط مسجلة.</p>}
      </div>

      {escalation && (
        <Modal onClose={() => setEscalation(null)}>
          <p className="font-semibold text-sm">قسطين متأخرين في "{escalation.item_name}"</p>
          <p className="text-xs text-neutral-500">فاتك شهرين من غير ما تسدد. تحب تدفع القسطين مع بعض دلوقتي، ولا نعيد جدولة الباقي شهر لقدام (المعاد الجاي بس بيتأجل، من غير ما يتغير عدد الأقساط)؟</p>
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => reschedule(escalation)} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm disabled:opacity-60">أعد الجدولة</button>
            <button disabled={busy} onClick={() => payBothOverdue(escalation)} className="flex-1 bg-orange-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60">ادفع القسطين</button>
          </div>
        </Modal>
      )}

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)}>
          <p className="font-semibold text-sm">تأكيد الحذف</p>
          <p className="text-xs text-neutral-500">هتحذف "{confirmDelete.item_name}" وكل جدول أقساطه. الإجراء ده مش قابل للتراجع.</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(null)} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm">إلغاء</button>
            <button onClick={() => deletePlan(confirmDelete)} className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium">حذف نهائي</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function StarPicker({ value, onChange, readOnly = false }: { value: number | null; onChange?: (v: number) => void; readOnly?: boolean }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          className={readOnly ? "cursor-default" : "cursor-pointer"}
        >
          <Star size={14} className={(value || 0) >= n ? "fill-amber-400 text-amber-400" : "text-neutral-300 dark:text-neutral-700"} />
        </button>
      ))}
    </div>
  );
}

// ===================== جمعيات =====================
type NewParticipant = { name: string; phone: string; account_number: string };

function Gam3eyaTab({
  gam3eyat, plans, reload, showMsg,
}: {
  gam3eyat: Gam3eya[]; plans: InstallmentPlan[]; reload: () => void; showMsg: (t: string, e?: boolean) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"subscribed" | "organizing">("subscribed");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Gam3eya | null>(null);
  const [showSimulator, setShowSimulator] = useState(false);
  const [verifyPanel, setVerifyPanel] = useState<{ gam3eyaId: string; participantId: string } | null>(null);
  const [swapMode, setSwapMode] = useState<string | null>(null); // gam3eya id currently in swap-picker mode
  const [swapFirst, setSwapFirst] = useState<string | null>(null); // first participant picked for swap

  const [subForm, setSubForm] = useState({ name: "", monthly_amount: "", currency: "EGP", months_count: "", my_payout_month: "", start_date: todayISO() });
  const [orgForm, setOrgForm] = useState({ name: "", monthly_amount: "", currency: "EGP", start_date: todayISO() });
  const [orgParticipants, setOrgParticipants] = useState<NewParticipant[]>([{ name: "", phone: "", account_number: "" }, { name: "", phone: "", account_number: "" }]);

  const active = gam3eyat.filter((g) => g.status === "active");

  const submitSubscribed = async () => {
    if (!subForm.monthly_amount || !subForm.months_count || !subForm.my_payout_month) { showMsg("المبلغ الشهري وعدد الشهور ومعاد قبضك لازم يتملوا", true); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/gam3eya", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "subscribed",
          name: subForm.name || null,
          monthly_amount: parseFloat(subForm.monthly_amount),
          currency: subForm.currency,
          months_count: parseInt(subForm.months_count),
          my_payout_month: parseInt(subForm.my_payout_month),
          start_date: subForm.start_date,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ ومتحفظش", true); return; }
      setSubForm({ name: "", monthly_amount: "", currency: "EGP", months_count: "", my_payout_month: "", start_date: todayISO() });
      setShowForm(false);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const submitOrganizing = async () => {
    const validParticipants = orgParticipants.filter((p) => p.name.trim());
    if (!orgForm.monthly_amount || validParticipants.length < 2) { showMsg("المبلغ الشهري وأسماء الأفراد (٢ على الأقل) لازم يتملوا", true); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/gam3eya", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "organizing",
          name: orgForm.name || null,
          monthly_amount: parseFloat(orgForm.monthly_amount),
          currency: orgForm.currency,
          start_date: orgForm.start_date,
          participants: validParticipants,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ ومتحفظش", true); return; }
      setOrgForm({ name: "", monthly_amount: "", currency: "EGP", start_date: todayISO() });
      setOrgParticipants([{ name: "", phone: "", account_number: "" }, { name: "", phone: "", account_number: "" }]);
      setShowForm(false);
      reload();
    } finally {
      setBusy(false);
    }
  };

  const markPaid = async (g: Gam3eya, paymentId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/gam3eya/${g.id}/payments/${paymentId}`, { method: "POST" });
      if (!res.ok) { showMsg("حصل خطأ ومتسجلش", true); return; }
      showMsg("✅ اتسجلت الدفعة");
      reload();
    } finally {
      setBusy(false);
    }
  };

  const deleteGam3eya = async (g: Gam3eya) => {
    const res = await fetch(`/api/gam3eya/${g.id}`, { method: "DELETE" });
    setConfirmDelete(null);
    if (!res.ok) { showMsg("حصل خطأ ومتحذفش", true); return; }
    reload();
  };

  const rateParticipant = async (g: Gam3eya, participantId: string, rating: number) => {
    await fetch(`/api/gam3eya/${g.id}/participants/${participantId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating }),
    });
    reload();
  };

  const pickForSwap = async (g: Gam3eya, participantId: string) => {
    if (!swapFirst) { setSwapFirst(participantId); return; }
    if (swapFirst === participantId) { setSwapFirst(null); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/gam3eya/${g.id}/participants/swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participant_a: swapFirst, participant_b: participantId }),
      });
      if (!res.ok) { showMsg("حصل خطأ في التبديل", true); return; }
      showMsg("✅ اتبدل الدور");
      setSwapFirst(null);
      setSwapMode(null);
      reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">{active.length} جمعية شغالة</p>
        <div className="flex gap-2">
          <button onClick={() => setShowSimulator(true)} className="flex items-center gap-1 text-xs border border-orange-300 dark:border-orange-800 text-orange-600 dark:text-orange-400 rounded-full px-3 py-1.5">
            <Calculator size={14} /> محاكاة
          </button>
          <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-1 text-xs bg-orange-600 text-white rounded-full px-3 py-1.5">
            <Plus size={14} /> جمعية جديدة
          </button>
        </div>
      </div>

      {showForm && (
        <Card className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setFormType("subscribed")} className={`rounded-lg py-2 text-xs border ${formType === "subscribed" ? "bg-orange-600 text-white border-orange-600" : "border-neutral-300 dark:border-neutral-700"}`}>مشترك في جمعية</button>
            <button onClick={() => setFormType("organizing")} className={`rounded-lg py-2 text-xs border ${formType === "organizing" ? "bg-orange-600 text-white border-orange-600" : "border-neutral-300 dark:border-neutral-700"}`}>أبدأ جمعية</button>
          </div>

          {formType === "subscribed" ? (
            <div className="space-y-2">
              <input placeholder="اسم الجمعية (اختياري)" value={subForm.name} onChange={(e) => setSubForm({ ...subForm, name: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="المبلغ الشهري" value={subForm.monthly_amount} onChange={(e) => setSubForm({ ...subForm, monthly_amount: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                <select value={subForm.currency} onChange={(e) => setSubForm({ ...subForm, currency: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
                  <option value="EGP">جنيه</option><option value="USD">دولار</option><option value="SAR">ريال</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-neutral-400">عدد شهور الجمعية</label>
                  <input type="number" value={subForm.months_count} onChange={(e) => setSubForm({ ...subForm, months_count: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-[10px] text-neutral-400">هتقبض في الشهر رقم</label>
                  <input type="number" value={subForm.my_payout_month} onChange={(e) => setSubForm({ ...subForm, my_payout_month: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-neutral-400">تاريخ أول دفعة</label>
                <input type="date" value={subForm.start_date} onChange={(e) => setSubForm({ ...subForm, start_date: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
              </div>
              <button disabled={busy} onClick={submitSubscribed} className="w-full bg-orange-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60">حفظ</button>
            </div>
          ) : (
            <div className="space-y-2">
              <input placeholder="اسم الجمعية (اختياري)" value={orgForm.name} onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="المبلغ الشهري لكل فرد" value={orgForm.monthly_amount} onChange={(e) => setOrgForm({ ...orgForm, monthly_amount: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                <select value={orgForm.currency} onChange={(e) => setOrgForm({ ...orgForm, currency: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
                  <option value="EGP">جنيه</option><option value="USD">دولار</option><option value="SAR">ريال</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-neutral-400">تاريخ أول شهر (وترتيب القبض هيكون بترتيب الأفراد تحت)</label>
                <input type="date" value={orgForm.start_date} onChange={(e) => setOrgForm({ ...orgForm, start_date: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
              </div>
              <p className="text-[11px] text-neutral-400">عدد الشهور = عدد الأفراد أوتوماتيك (كل شهر واحد يقبض).</p>
              <div className="space-y-1.5">
                {orgParticipants.map((p, i) => (
                  <div key={i} className="flex gap-1.5 items-center">
                    <span className="text-[10px] text-neutral-400 w-4 shrink-0">{i + 1}</span>
                    <input placeholder="الاسم" value={p.name} onChange={(e) => setOrgParticipants(orgParticipants.map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x)))} className="flex-1 min-w-0 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-xs" />
                    <input placeholder="رقم الموبايل" value={p.phone} onChange={(e) => setOrgParticipants(orgParticipants.map((x, xi) => (xi === i ? { ...x, phone: e.target.value } : x)))} className="w-28 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-xs" />
                    <button onClick={() => setOrgParticipants(orgParticipants.filter((_, xi) => xi !== i))} className="text-neutral-400 hover:text-red-600 p-1 shrink-0"><X size={13} /></button>
                  </div>
                ))}
              </div>
              <button onClick={() => setOrgParticipants([...orgParticipants, { name: "", phone: "", account_number: "" }])} className="text-xs text-orange-600 dark:text-orange-400 font-medium">+ إضافة فرد</button>
              <p className="text-[11px] text-neutral-400">تقدر تضيف رقم حساب/محفظة وصورة بطاقة كل فرد بعد ما تحفظ الجمعية، من كارت الجمعية نفسها.</p>
              <button disabled={busy} onClick={submitOrganizing} className="w-full bg-orange-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60">حفظ الجمعية</button>
            </div>
          )}
        </Card>
      )}

      <div className="space-y-2">
        {gam3eyat.map((g) => (
          <Gam3eyaCard
            key={g.id}
            g={g}
            isOpen={expanded === g.id}
            onToggle={() => setExpanded(expanded === g.id ? null : g.id)}
            onDelete={() => setConfirmDelete(g)}
            onMarkPaid={(paymentId) => markPaid(g, paymentId)}
            onRate={(participantId, rating) => rateParticipant(g, participantId, rating)}
            busy={busy}
            swapMode={swapMode === g.id}
            swapFirst={swapFirst}
            onToggleSwapMode={() => { setSwapMode(swapMode === g.id ? null : g.id); setSwapFirst(null); }}
            onPickSwap={(pid) => pickForSwap(g, pid)}
            onOpenVerify={(pid) => setVerifyPanel({ gam3eyaId: g.id, participantId: pid })}
            onAddedParticipant={reload}
            showMsg={showMsg}
          />
        ))}
        {gam3eyat.length === 0 && <p className="text-center text-sm text-neutral-400 py-6">لسه مفيش جمعيات مسجلة.</p>}
      </div>

      {confirmDelete && (
        <Modal onClose={() => setConfirmDelete(null)}>
          <p className="font-semibold text-sm">تأكيد الحذف</p>
          <p className="text-xs text-neutral-500">هتحذف جمعية "{confirmDelete.name || (confirmDelete.type === "subscribed" ? "بدون اسم" : "بدون اسم")}" وكل بياناتها. الإجراء ده مش قابل للتراجع.</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(null)} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm">إلغاء</button>
            <button onClick={() => deleteGam3eya(confirmDelete)} className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium">حذف نهائي</button>
          </div>
        </Modal>
      )}

      {verifyPanel && (
        <VerifyParticipantModal
          gam3eyaId={verifyPanel.gam3eyaId}
          participantId={verifyPanel.participantId}
          onClose={() => setVerifyPanel(null)}
          onDone={() => { setVerifyPanel(null); reload(); }}
          showMsg={showMsg}
        />
      )}

      {showSimulator && (
        <SimulatorModal onClose={() => setShowSimulator(false)} plans={plans} gam3eyat={gam3eyat} />
      )}
    </div>
  );
}

function Gam3eyaCard({
  g, isOpen, onToggle, onDelete, onMarkPaid, onRate, busy, swapMode, swapFirst, onToggleSwapMode, onPickSwap, onOpenVerify, onAddedParticipant, showMsg,
}: {
  g: Gam3eya; isOpen: boolean; onToggle: () => void; onDelete: () => void; onMarkPaid: (paymentId: string) => void;
  onRate: (participantId: string, rating: number) => void; busy: boolean;
  swapMode: boolean; swapFirst: string | null; onToggleSwapMode: () => void; onPickSwap: (pid: string) => void;
  onOpenVerify: (pid: string) => void; onAddedParticipant: () => void; showMsg: (t: string, e?: boolean) => void;
}) {
  const today = todayISO();
  const [addingParticipant, setAddingParticipant] = useState(false);
  const [newParticipant, setNewParticipant] = useState({ name: "", phone: "", account_number: "" });
  const [addBusy, setAddBusy] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ phone: "", account_number: "" });
  const [phoneHistory, setPhoneHistory] = useState<{ gam3eyat_count: number; average_rating: number | null; ever_verified: boolean } | null>(null);
  const [phoneHistoryBusy, setPhoneHistoryBusy] = useState(false);

  const checkPhoneHistory = async (phone: string) => {
    if (!phone.trim()) return;
    setPhoneHistoryBusy(true);
    setPhoneHistory(null);
    try {
      const res = await fetch(`/api/gam3eya/credit-score?phone=${encodeURIComponent(phone.trim())}`);
      const data = await res.json();
      if (res.ok) setPhoneHistory(data);
    } finally {
      setPhoneHistoryBusy(false);
    }
  };

  const submitNewParticipant = async () => {
    if (!newParticipant.name.trim()) { showMsg("اسم الفرد لازم يتملى", true); return; }
    setAddBusy(true);
    try {
      const res = await fetch(`/api/gam3eya/${g.id}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newParticipant),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ ومتضافش الفرد", true); return; }
      setNewParticipant({ name: "", phone: "", account_number: "" });
      setAddingParticipant(false);
      onAddedParticipant();
    } finally {
      setAddBusy(false);
    }
  };

  const startEditParticipant = (p: Gam3eyaParticipant) => {
    setEditingParticipant(editingParticipant === p.id ? null : p.id);
    setEditDraft({ phone: p.phone || "", account_number: p.account_number || "" });
  };

  const saveEditParticipant = async (pid: string) => {
    await fetch(`/api/gam3eya/${g.id}/participants/${pid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editDraft),
    });
    setEditingParticipant(null);
    onAddedParticipant();
  };

  if (g.type === "subscribed") {
    const paidCount = g.gam3eya_payments.filter((p) => p.status === "paid").length;
    const nextPending = g.gam3eya_payments.find((p) => p.status === "pending");
    const overdue = g.gam3eya_payments.filter((p) => p.status === "pending" && p.due_date < today).length;
    return (
      <Card className="!p-3 space-y-2">
        <div className="flex items-center justify-between cursor-pointer" onClick={onToggle}>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{g.name || "جمعية (مشترك فيها)"}</p>
            <p className="text-[11px] text-neutral-400">
              {fmt(g.monthly_amount, g.currency)}/شهر · {paidCount}/{g.months_count} اتدفعوا · هتقبض في الشهر {g.my_payout_month}
              {g.status === "completed" && " · خلصت ✅"}
            </p>
            {nextPending && <p className={`text-[11px] mt-0.5 ${overdue > 0 ? "text-red-500 font-medium" : "text-neutral-400"}`}>{overdue > 0 ? `⚠️ متأخر من ${nextPending.due_date}` : `الدفعة الجاية: ${nextPending.due_date}`}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-neutral-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
            {isOpen ? <ChevronUp size={16} className="text-neutral-400" /> : <ChevronDown size={16} className="text-neutral-400" />}
          </div>
        </div>
        {isOpen && (
          <div className="border-t border-neutral-100 dark:border-neutral-800 pt-2 space-y-1.5">
            {g.gam3eya_payments.map((p) => {
              const late = p.status === "pending" && p.due_date < today;
              const isPayout = p.month_index === g.my_payout_month;
              return (
                <div key={p.id} className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${late ? "bg-red-50 dark:bg-red-950 ring-1 ring-red-300 dark:ring-red-800" : isPayout ? "bg-emerald-50 dark:bg-emerald-950" : "bg-neutral-50 dark:bg-neutral-800/50"}`}>
                  <span>شهر {p.month_index} — {p.due_date}{isPayout ? " 🎁 معاد قبضك" : ""} — {fmt(Number(p.amount), g.currency)}</span>
                  {p.status === "paid" ? (
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2 size={12} /> مدفوع</span>
                  ) : (
                    <button disabled={busy} onClick={() => onMarkPaid(p.id)} className="bg-orange-600 text-white rounded-full px-2 py-1">تم الدفع</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    );
  }

  // organizing
  const sortedParticipants = [...g.gam3eya_participants].sort((a, b) => a.payout_order - b.payout_order);
  const currentMonth = g.gam3eya_payments.filter((p) => p.due_date <= today).reduce((max, p) => Math.max(max, p.month_index), 1);
  const collector = sortedParticipants.find((p) => p.payout_order === currentMonth);
  const paymentsThisMonth = g.gam3eya_payments.filter((p) => p.month_index === currentMonth);
  const paidThisMonth = paymentsThisMonth.filter((p) => p.status === "paid").length;

  return (
    <Card className="!p-3 space-y-2">
      <div className="flex items-center justify-between cursor-pointer" onClick={onToggle}>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{g.name || "جمعية (بتديرها)"}</p>
          <p className="text-[11px] text-neutral-400">
            {fmt(g.monthly_amount, g.currency)}/فرد شهريًا · {g.participants_count} فرد
            {g.status === "completed" && " · خلصت ✅"}
          </p>
          {g.status === "active" && (
            <p className="text-[11px] mt-0.5 text-neutral-500">
              الشهر {currentMonth} — بيقبض: <b>{collector?.name || "—"}</b> · اتدفع {paidThisMonth}/{paymentsThisMonth.length}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-neutral-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
          {isOpen ? <ChevronUp size={16} className="text-neutral-400" /> : <ChevronDown size={16} className="text-neutral-400" />}
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-neutral-100 dark:border-neutral-800 pt-2 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-neutral-400">ترتيب القبض والأفراد</p>
            <div className="flex gap-1.5">
              <button onClick={() => setAddingParticipant((s) => !s)} className="flex items-center gap-1 text-[10px] rounded-full px-2 py-1 border border-neutral-300 dark:border-neutral-700 text-neutral-500">
                <Plus size={11} /> فرد
              </button>
              <button onClick={onToggleSwapMode} className={`flex items-center gap-1 text-[10px] rounded-full px-2 py-1 ${swapMode ? "bg-orange-600 text-white" : "border border-neutral-300 dark:border-neutral-700 text-neutral-500"}`}>
                <ArrowLeftRight size={11} /> {swapMode ? "دوس على شخصين للتبديل" : "بدّل الأدوار"}
              </button>
            </div>
          </div>

          {addingParticipant && (
            <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-2 space-y-1.5">
              <input placeholder="اسم الفرد الجديد" value={newParticipant.name} onChange={(e) => setNewParticipant({ ...newParticipant, name: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-xs" />
              <div className="grid grid-cols-2 gap-1.5">
                <input placeholder="رقم الموبايل" value={newParticipant.phone} onBlur={(e) => checkPhoneHistory(e.target.value)} onChange={(e) => { setNewParticipant({ ...newParticipant, phone: e.target.value }); setPhoneHistory(null); }} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-xs" />
                <input placeholder="رقم حساب/محفظة" value={newParticipant.account_number} onChange={(e) => setNewParticipant({ ...newParticipant, account_number: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-xs" />
              </div>
              {phoneHistoryBusy && <p className="text-[10px] text-neutral-400">جاري البحث عن تاريخه...</p>}
              {phoneHistory && (
                phoneHistory.gam3eyat_count > 0 ? (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400">
                    ⭐ دخل {phoneHistory.gam3eyat_count} جمعية معاك قبل كده{phoneHistory.average_rating ? ` — متوسط تقييمه ${phoneHistory.average_rating.toFixed(1)}/٥` : ""}{phoneHistory.ever_verified ? " · اتوثق قبل كده" : ""}
                  </p>
                ) : (
                  <p className="text-[10px] text-neutral-400">مفيش تاريخ سابق للرقم ده عندك.</p>
                )
              )}
              <p className="text-[10px] text-neutral-400">هيتضاف آخر الدور، وهيتحسبله شهر جديد في الجدول لكل الأفراد.</p>
              <button disabled={addBusy} onClick={submitNewParticipant} className="w-full bg-orange-600 text-white rounded-lg py-1.5 text-xs font-medium disabled:opacity-60">إضافة</button>
            </div>
          )}

          {sortedParticipants.map((p) => {
            const myPayment = g.gam3eya_payments.find((x) => x.participant_id === p.id && x.month_index === currentMonth);
            const isCollectorNow = p.payout_order === currentMonth;
            const selected = swapFirst === p.id;
            return (
              <div key={p.id} className={`rounded-lg px-2.5 py-2 text-xs space-y-1.5 ${isCollectorNow ? "bg-emerald-50 dark:bg-emerald-950" : "bg-neutral-50 dark:bg-neutral-800/50"} ${selected ? "ring-2 ring-orange-500" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <button
                    disabled={!swapMode}
                    onClick={() => swapMode && onPickSwap(p.id)}
                    className="flex items-center gap-1.5 flex-1 min-w-0 text-right disabled:cursor-default"
                  >
                    <span className="text-neutral-400 shrink-0">#{p.payout_order}</span>
                    <span className="font-medium truncate">{p.name}</span>
                    {isCollectorNow && <span className="text-[10px] shrink-0">🎁 بيقبض الشهر ده</span>}
                    {p.verified ? <ShieldCheck size={13} className="text-emerald-600 shrink-0" /> : <ShieldAlert size={13} className="text-neutral-300 dark:text-neutral-600 shrink-0" />}
                  </button>
                  {!swapMode && myPayment && (
                    myPayment.status === "paid" ? (
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 shrink-0"><CheckCircle2 size={12} /> دفع</span>
                    ) : (
                      <button disabled={busy} onClick={() => onMarkPaid(myPayment.id)} className="bg-orange-600 text-white rounded-full px-2 py-1 shrink-0">تم الدفع</button>
                    )
                  )}
                </div>
                {!swapMode && (
                  <div className="flex items-center justify-between">
                    <StarPicker value={p.rating} onChange={(v) => onRate(p.id, v)} />
                    <div className="flex items-center gap-2">
                      <button onClick={() => onOpenVerify(p.id)} className="text-[10px] text-orange-600 dark:text-orange-400 flex items-center gap-1">
                        <Camera size={11} /> {p.verified ? "توثيق تاني" : "توثيق (اختياري)"}
                      </button>
                      <button onClick={() => startEditParticipant(p)} className="text-neutral-400 hover:text-orange-600"><Pencil size={12} /></button>
                    </div>
                  </div>
                )}
                {!swapMode && !editingParticipant && (p.phone || p.account_number) && (
                  <p className="text-[10px] text-neutral-400">{p.phone && `📱 ${p.phone}`}{p.phone && p.account_number ? " · " : ""}{p.account_number && `💳 ${p.account_number}`}</p>
                )}
                {!swapMode && editingParticipant === p.id && (
                  <div className="space-y-1.5 pt-1 border-t border-neutral-200 dark:border-neutral-700">
                    <div className="grid grid-cols-2 gap-1.5">
                      <input placeholder="رقم الموبايل" value={editDraft.phone} onChange={(e) => setEditDraft({ ...editDraft, phone: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-xs" />
                      <input placeholder="رقم حساب/محفظة" value={editDraft.account_number} onChange={(e) => setEditDraft({ ...editDraft, account_number: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-xs" />
                    </div>
                    <button onClick={() => saveEditParticipant(p.id)} className="w-full bg-orange-600 text-white rounded-lg py-1.5 text-xs font-medium">حفظ</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function VerifyParticipantModal({
  gam3eyaId, participantId, onClose, onDone, showMsg,
}: { gam3eyaId: string; participantId: string; onClose: () => void; onDone: () => void; showMsg: (t: string, e?: boolean) => void }) {
  const [front, setFront] = useState<string | null>(null);
  const [back, setBack] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  const pick = async (file: File, setter: (v: string) => void) => setter(await shrinkImage(file));

  const submit = async () => {
    if (!front || !selfie) { showMsg("لازم صورة وش البطاقة والسيلفي على الأقل", true); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/gam3eya/${gam3eyaId}/participants/${participantId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_photo_front: front, id_photo_back: back, selfie_photo: selfie }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ في التوثيق", true); return; }
      setResult(data.result);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <p className="font-semibold text-sm">توثيق العضو (اختياري)</p>
      <p className="text-[11px] text-neutral-400 leading-relaxed">
        دي مش عملية تحقق هوية رسمية زي البنوك — مجرد مقارنة بالذكاء الاصطناعي بين صورة البطاقة والسيلفي، بتديك مؤشر ثقة بس. البيانات بتتحفظ عندك في حسابك فقط.
      </p>

      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col items-center gap-1 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg p-2 text-[10px] text-center cursor-pointer">
          <Camera size={16} className="text-neutral-400" />
          {front ? "✅ اتصورت" : "وش البطاقة"}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f, setFront); }} />
        </label>
        <label className="flex flex-col items-center gap-1 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg p-2 text-[10px] text-center cursor-pointer">
          <Camera size={16} className="text-neutral-400" />
          {back ? "✅ اتصورت" : "ضهر البطاقة (اختياري)"}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f, setBack); }} />
        </label>
        <label className="flex flex-col items-center gap-1 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg p-2 text-[10px] text-center cursor-pointer">
          <Camera size={16} className="text-neutral-400" />
          {selfie ? "✅ اتصورت" : "سيلفي حي"}
          <input type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f, setSelfie); }} />
        </label>
      </div>

      {result && (
        <div className={`text-xs rounded-lg p-2 space-y-1 ${result.verified ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300" : "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300"}`}>
          <p className="font-medium">{result.verified ? "✅ اتوثق" : "⚠️ مش متطابق / مش واضح"}</p>
          {result.notes && <p>{result.notes}</p>}
          {result.error && <p>{result.error}</p>}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onDone} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm">قفل</button>
        <button disabled={busy} onClick={submit} className="flex-1 bg-orange-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60">{busy ? "جاري التحقق..." : "ابدأ التحقق"}</button>
      </div>
    </Modal>
  );
}

function SimulatorModal({ onClose, plans, gam3eyat }: { onClose: () => void; plans: InstallmentPlan[]; gam3eyat: Gam3eya[] }) {
  const [amount, setAmount] = useState("");
  const [income, setIncome] = useState("");

  const currentCommitment = useMemo(() => {
    const installmentsSum = plans.filter((p) => p.status === "active").reduce((s, p) => s + Number(p.monthly_amount), 0);
    const subscribedSum = gam3eyat.filter((g) => g.status === "active" && g.type === "subscribed").reduce((s, g) => s + Number(g.monthly_amount), 0);
    return installmentsSum + subscribedSum;
  }, [plans, gam3eyat]);

  const newAmount = parseFloat(amount) || 0;
  const newTotal = currentCommitment + newAmount;
  const incomeNum = income ? parseFloat(income) : null;
  const remaining = incomeNum !== null ? incomeNum - newTotal : null;

  return (
    <Modal onClose={onClose}>
      <p className="font-semibold text-sm">محاكاة جمعية جديدة</p>
      <p className="text-[11px] text-neutral-400">قبل ما تدخل جمعية جديدة، شوف هل ميزانيتك هتستحملها مع الأقساط والجمعيات التانية اللي عليك.</p>
      <input type="number" placeholder="المبلغ الشهري للجمعية الجديدة" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
      <input type="number" placeholder="دخلك الشهري (اختياري، عشان نديك تقييم أدق)" value={income} onChange={(e) => setIncome(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />

      <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800/50 p-2.5 text-xs space-y-1">
        <p>التزاماتك الشهرية الحالية (أقساط + جمعيات مشترك فيها): {fmt(currentCommitment, "EGP")}</p>
        <p>+ الجمعية الجديدة: {fmt(newAmount, "EGP")}</p>
        <p className="font-medium">= الإجمالي الشهري: {fmt(newTotal, "EGP")}</p>
      </div>

      {remaining !== null && (
        <div className={`rounded-lg p-2.5 text-xs font-medium ${remaining >= 0 ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300" : "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400"}`}>
          {remaining >= 0 ? `✅ هيفضلك حوالي ${fmt(remaining, "EGP")} من دخلك بعد كل الالتزامات` : `⚠️ الالتزامات هتتخطى دخلك بـ ${fmt(Math.abs(remaining), "EGP")}`}
        </div>
      )}

      <button onClick={onClose} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm">قفل</button>
    </Modal>
  );
}
