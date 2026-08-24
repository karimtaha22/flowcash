"use client";
import { useEffect, useState, use as usePromise } from "react";
import Card from "@/components/Card";
import Footer from "@/components/Footer";
import { fmt } from "@/lib/format";
import { isValidPhone } from "@/lib/phone";
import { shrinkImage } from "@/lib/image";
import { ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, Camera } from "lucide-react";

// PUBLIC page — no login, no Sidebar/BottomNav (outside the (protected)
// route group on purpose). This is the "اللينك الحي" itself: whoever holds
// this exact token (debtor, creditor_view, or one specific witness — see
// lib/debtLinks.ts's top comment for the full per-role architecture) lands
// here and sees a role-appropriate read-only view of the debt, plus the one
// action their role is allowed (witness: acknowledge; debtor: object).
// Nothing here can ever change an amount or a date — that only ever
// happens inside the authenticated app, by the creditor.

const VALUE_TYPE_LABEL: Record<string, string> = { currency: "مبلغ مالي", gold: "ذهب", silver: "فضة", other: "أخرى" };
const EVENT_ICON: Record<string, string> = {
  created: "📜", payment_recorded: "💰", due_date_extended: "📅",
  witness_acknowledged: "✅", objection_raised: "⚠️", objection_resolved: "✅", link_revoked: "🚫",
};

export default function DebtLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = usePromise(params);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [ackChecked, setAckChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [objectionReason, setObjectionReason] = useState("");
  const [showObjectionForm, setShowObjectionForm] = useState(false);
  // Round 25 — الشاهد بيدخل بياناته بنفسه هنا (مش الدائن بالنيابة عنه)
  const [wName, setWName] = useState("");
  const [wPhone, setWPhone] = useState("");
  const [wAddress, setWAddress] = useState("");
  const [wPhoto, setWPhoto] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/debt-link/${token}`);
      const d = await res.json();
      if (!res.ok) { setError(d.error || "الرابط غير صالح"); return; }
      setData(d);
      if (d.myWitness) {
        setWName(d.myWitness.name || "");
        setWPhone(d.myWitness.phone || "");
        setWAddress(d.myWitness.address || "");
        setWPhoto(d.myWitness.id_photo_front || null);
      }
    } catch {
      setError("مفيش اتصال بالإنترنت، حاول تاني");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [token]);

  const acknowledge = async () => {
    if (!wName.trim()) { setMsg("اسمك لازم يتملى الأول"); return; }
    if (wPhone && !isValidPhone(wPhone)) { setMsg("رقم موبايل غير صالح"); return; }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/debt-link/${token}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: wName, phone: wPhone || null, address: wAddress || null, id_photo_front: wPhoto || null }),
      });
      const d = await res.json();
      if (!res.ok) { setMsg(d.error || "حصل خطأ"); return; }
      setMsg("✅ تم تسجيل شهادتك");
      load();
    } finally {
      setBusy(false);
    }
  };

  const submitObjection = async () => {
    if (!objectionReason.trim()) { setMsg("لازم تكتب سبب الاعتراض"); return; }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/debt-link/${token}/object`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: objectionReason }),
      });
      const d = await res.json();
      if (!res.ok) { setMsg(d.error || "حصل خطأ"); return; }
      setMsg("✅ تم تسجيل اعتراضك — هيظهر للدائن والشهود");
      setShowObjectionForm(false);
      setObjectionReason("");
      load();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="min-h-full flex items-center justify-center p-6"><p className="text-sm text-neutral-400">جاري التحميل...</p></div>;
  }
  if (error || !data) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-6 gap-2 text-center">
        <AlertTriangle className="text-red-500" size={28} />
        <p className="text-sm text-neutral-500">{error || "حصل خطأ"}</p>
      </div>
    );
  }

  const { role, acknowledgedAt, debt, creditorName, debtorName, witnesses, events } = data;
  const paidAmt = Number(debt.original_amount) - Number(debt.remaining_amount);
  const hasOpenObjection = debt.objection_created_at && !debt.objection_resolved_at;

  return (
    <div className="min-h-full flex flex-col max-w-md mx-auto w-full p-4 space-y-4">
      <div className="text-center space-y-1 pt-2">
        <p className="text-xs font-bold text-orange-600">FlowCash</p>
        <h1 className="text-lg font-bold">
          {role === "debtor" ? "بيانات دين عليك" : role === "creditor_view" ? "بيانات دين ليك" : "دعوة شهادة على دين"}
        </h1>
      </div>

      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">{debt.title}</h2>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800">{VALUE_TYPE_LABEL[debt.value_type] || "مبلغ مالي"}</span>
        </div>
        {debt.reason && <p className="text-xs text-neutral-400">{debt.reason}</p>}
        <div className="border-t border-neutral-100 dark:border-neutral-800 pt-2 text-xs space-y-1.5">
          <Row label="الدائن" value={creditorName} />
          <Row label="المدين" value={debtorName} />
          <Row label="تاريخ الدين" value={debt.debt_date ? new Date(debt.debt_date).toLocaleDateString("ar-EG") : "-"} />
          <Row label="تاريخ الأجل" value={debt.due_date ? new Date(debt.due_date).toLocaleDateString("ar-EG") : "غير محدد"} />
          <Row label="المبلغ الأصلي" value={fmt(Number(debt.original_amount), debt.currency)} bold />
          {paidAmt > 0 && <Row label="المسدد" value={fmt(paidAmt, debt.currency)} />}
          <Row label="المتبقي" value={fmt(Number(debt.remaining_amount), debt.currency)} bold />
          <Row label="الحالة" value={debt.status === "paid" ? "تم السداد بالكامل" : debt.status === "overdue" ? "متأخر" : "مفتوح"} />
        </div>
      </Card>

      {hasOpenObjection && (
        <Card className="bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900 space-y-1">
          <p className="text-xs font-bold text-red-700 dark:text-red-300 flex items-center gap-1"><AlertTriangle size={13} /> في اعتراض قائم على الدين ده</p>
          <p className="text-xs text-red-600 dark:text-red-400">{debt.objection_reason}</p>
        </Card>
      )}
      {debt.objection_resolved_at && !hasOpenObjection && debt.objection_reason && (
        <Card className="bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900 space-y-1">
          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1"><CheckCircle2 size={13} /> اعتراض سابق — تم حله</p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400">{debt.objection_reason}</p>
        </Card>
      )}

      <Card className="space-y-2">
        <p className="text-xs font-semibold">الشهود</p>
        <div className="space-y-1.5">
          {witnesses.map((w: any, i: number) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span>{w.name?.trim() || `شاهد ${w.slot_index} — لسه محددش بياناته`}</span>
              {w.acknowledged ? (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><ShieldCheck size={12} /> أشهد</span>
              ) : (
                <span className="text-neutral-400 flex items-center gap-1"><ShieldAlert size={12} /> لسه ماأشهدش</span>
              )}
            </div>
          ))}
        </div>
      </Card>

      {role === "witness" && (
        <Card className="space-y-2">
          {acknowledgedAt ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5"><CheckCircle2 size={16} /> اتسجلت شهادتك على الدين ده بالفعل</p>
          ) : (
            <>
              <p className="text-xs text-neutral-500 leading-relaxed">
                <b>{creditorName}</b> و<b>{debtorName}</b> طالبين شهادتك على الدين ده. املا بياناتك تحت وأكّد شهادتك.
              </p>
              <div>
                <label className="text-[10px] text-neutral-400">اسمك بالكامل</label>
                <input value={wName} onChange={(e) => setWName(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-[10px] text-neutral-400">رقم موبايلك (اختياري)</label>
                <input value={wPhone} onChange={(e) => setWPhone(e.target.value)} className={`w-full rounded-lg border bg-transparent px-3 py-2 text-sm ${wPhone && !isValidPhone(wPhone) ? "border-red-400 dark:border-red-700" : "border-neutral-300 dark:border-neutral-700"}`} />
                {wPhone && !isValidPhone(wPhone) && <p className="text-[10px] text-red-500 mt-0.5">رقم موبايل غير صالح</p>}
              </div>
              <div>
                <label className="text-[10px] text-neutral-400">عنوانك (اختياري)</label>
                <input value={wAddress} onChange={(e) => setWAddress(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
              </div>
              <label className="flex items-center gap-2 text-[11px] text-neutral-600 dark:text-neutral-300 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 cursor-pointer">
                <Camera size={14} />
                {wPhoto ? "✅ صورة بطاقتك اتصورت — دوس لتغييرها" : "صورة بطاقتك (اختياري)"}
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setWPhoto(await shrinkImage(f)); }} />
              </label>
              <label className="flex items-start gap-2 text-xs cursor-pointer pt-1">
                <input type="checkbox" checked={ackChecked} onChange={(e) => setAckChecked(e.target.checked)} className="mt-0.5" />
                <span>قرأت بيانات الدين بالتفصيل واشهد على هذا الدين</span>
              </label>
              <button disabled={!ackChecked || !wName.trim() || busy} onClick={acknowledge} className="w-full bg-orange-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
                {busy ? "جاري التسجيل..." : "تأكيد الشهادة"}
              </button>
            </>
          )}
        </Card>
      )}

      {role === "debtor" && !hasOpenObjection && (
        <Card className="space-y-2">
          {!showObjectionForm ? (
            <button onClick={() => setShowObjectionForm(true)} className="w-full flex items-center justify-center gap-1.5 text-sm bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 rounded-lg py-2 font-medium">
              <AlertTriangle size={14} /> اعتراض
            </button>
          ) : (
            <>
              <p className="text-xs text-neutral-400">اكتب سبب اعتراضك — هيظهر بشكل واضح للدائن والشهود ولا يقدر أي حد يمسحه غيرك أو الدائن (لما يتحل).</p>
              <textarea value={objectionReason} onChange={(e) => setObjectionReason(e.target.value)} rows={3} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" placeholder="سبب الاعتراض" />
              <div className="flex gap-2">
                <button onClick={() => setShowObjectionForm(false)} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm">إلغاء</button>
                <button disabled={busy} onClick={submitObjection} className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">{busy ? "جاري الإرسال..." : "تسجيل الاعتراض"}</button>
              </div>
            </>
          )}
        </Card>
      )}

      {msg && <p className="text-xs text-center text-neutral-500">{msg}</p>}

      {events?.length > 0 && (
        <Card className="space-y-2">
          <p className="text-xs font-semibold">سجل الأحداث</p>
          <div className="space-y-1.5">
            {events.map((e: any, i: number) => (
              <div key={i} className="text-[11px] text-neutral-500 flex items-start gap-1.5">
                <span>{EVENT_ICON[e.event_type] || "•"}</span>
                <span className="flex-1">{e.description}</span>
                <span className="text-neutral-400 shrink-0">{new Date(e.created_at).toLocaleDateString("ar-EG")}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Footer />
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-neutral-400">{label}</span>
      <span className={bold ? "font-bold" : "font-medium"}>{value}</span>
    </div>
  );
}
