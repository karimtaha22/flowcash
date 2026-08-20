"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Card from "@/components/Card";
import { fmt } from "@/lib/format";
import { Plus, ChevronDown, Trash2, Pencil, Paperclip, Download, Share2, FileDown, Image as ImageIcon } from "lucide-react";
import { shrinkImage } from "@/lib/image";
import { downloadFile, shareFile } from "@/lib/shareFile";
import ReceiptActions from "@/components/ReceiptActions";

const AYAH_DAYN =
  'يَا أَيُّهَا الَّذِينَ آمَنُوا إِذَا تَدَايَنتُم بِدَيْنٍ إِلَىٰ أَجَلٍ مُّسَمًّى فَاكْتُبُوهُ ۚ وَلْيَكْتُب بَّيْنَكُمْ كَاتِبٌ بِالْعَدْلِ ۚ وَلَا يَأْبَ كَاتِبٌ أَن يَكْتُبَ كَمَا عَلَّمَهُ اللَّهُ ۚ فَلْيَكْتُبْ وَلْيُمْلِلِ الَّذِي عَلَيْهِ الْحَقُّ وَلْيَتَّقِ اللَّهَ رَبَّهُ وَلَا يَبْخَسْ مِنْهُ شَيْئًا ۚ فَإِن كَانَ الَّذِي عَلَيْهِ الْحَقُّ سَفِيهًا أَوْ ضَعِيفًا أَوْ لَا يَسْتَطِيعُ أَن يُمِلَّ هُوَ فَلْيُمْلِلْ وَلِيُّهُ بِالْعَدْلِ ۚ وَاسْتَشْهِدُوا شَهِيدَيْنِ مِن رِّجَالِكُمْ ۖ فَإِن لَّمْ يَكُونَا رَجُلَيْنِ فَرَجُلٌ وَامْرَأَتَانِ مِمَّن تَرْضَوْنَ مِنَ الشُّهَدَاءِ أَن تَضِلَّ إِحْدَاهُمَا فَتُذَكِّرَ إِحْدَاهُمَا الْأُخْرَىٰ ۚ وَلَا يَأْبَ الشُّهَدَاءُ إِذَا مَا دُعُوا ۚ وَلَا تَسْأَمُوا أَن تَكْتُبُوهُ صَغِيرًا أَوْ كَبِيرًا إِلَىٰ أَجَلِهِ ۚ ذَٰلِكُمْ أَقْسَطُ عِندَ اللَّهِ وَأَقْوَمُ لِلشَّهَادَةِ وَأَدْنَىٰ أَلَّا تَرْتَابُوا ۖ إِلَّا أَن تَكُونَ تِجَارَةً حَاضِرَةً تُدِيرُونَهَا بَيْنَكُمْ فَلَيْسَ عَلَيْكُمْ جُنَاحٌ أَلَّا تَكْتُبُوهَا ۗ وَأَشْهِدُوا إِذَا تَبَايَعْتُمْ ۚ وَلَا يُضَارَّ كَاتِبٌ وَلَا شَهِيدٌ ۚ وَإِن تَفْعَلُوا فَإِنَّهُ فُسُوقٌ بِكُمْ ۗ وَاتَّقُوا اللَّهَ ۖ وَيُعَلِّمُكُمُ اللَّهُ ۗ وَاللَّهُ بِكُلِّ شَيْءٍ عَلِيمٌ';
const AYAH_DAYN_OPENING = "يَا أَيُّهَا الَّذِينَ آمَنُوا إِذَا تَدَايَنتُم بِدَيْنٍ إِلَىٰ أَجَلٍ مُّسَمًّى فَاكْتُبُوهُ";

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
  debt_date: string | null;
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
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ person_id: "", new_person: "", title: "", reason: "", amount: "", currency: "EGP", debt_date: todayISO(), due_date: "" });
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, any>>({});
  const [confirmDelete, setConfirmDelete] = useState<Debt | null>(null);
  const [editError, setEditError] = useState("");
  const [payError, setPayError] = useState("");
  const [receiptDataUrl, setReceiptDataUrl] = useState<string | null>(null);
  const [showAyah, setShowAyah] = useState(false);
  const [exportFor, setExportFor] = useState<Debt | null>(null);
  const [exportIncludeAyah, setExportIncludeAyah] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

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
        body: JSON.stringify({
          person_id: personId,
          direction: tab,
          title: form.title,
          reason: form.reason,
          amount: parseFloat(form.amount),
          currency: form.currency,
          debt_date: form.debt_date || undefined,
          due_date: form.due_date || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormWarning(data.error || "حصل خطأ ومتحفظش الدين، حاول تاني");
        setSaving(false);
        return;
      }
      setShowForm(false);
      setForm({ person_id: "", new_person: "", title: "", reason: "", amount: "", currency: "EGP", debt_date: todayISO(), due_date: "" });
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
      debt_date: d.debt_date || "",
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

  // renders a hidden, styled card for the selected debt off-screen, rasterizes
  // it with html2canvas, then either shares/downloads it as a PNG or wraps it
  // in a matching-size PDF via jsPDF — same building blocks كشف الحساب uses.
  const generateDebtExport = async (format: "image" | "pdf") => {
    if (!exportFor) return;
    setExporting(true);
    setExportError("");
    const d = exportFor;
    try {
      const paidAmt = Number(d.original_amount) - Number(d.remaining_amount);
      const dirLabel = d.direction === "owed_to_me" ? "دين مستحق لي" : "دين مستحق عليّ";
      const node = document.createElement("div");
      node.style.position = "fixed";
      node.style.left = "-9999px";
      node.style.top = "0";
      node.style.width = "380px";
      node.style.background = "#ffffff";
      node.style.padding = "24px";
      node.style.fontFamily = "Cairo, sans-serif";
      node.style.direction = "rtl";
      node.style.color = "#111827";
      node.innerHTML = `
        <div style="text-align:center;margin-bottom:16px;">
          <p style="font-size:12px;color:#ea580c;font-weight:700;">FlowCash</p>
        </div>
        ${
          exportIncludeAyah
            ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:12px;margin-bottom:16px;text-align:center;">
                 <p style="font-size:13px;line-height:1.9;color:#78350f;">${AYAH_DAYN_OPENING}...</p>
                 <p style="font-size:10px;color:#b45309;margin-top:4px;">﴿البقرة: ٢٨٢﴾</p>
               </div>`
            : ""
        }
        <h2 style="font-size:16px;margin:0 0 4px;">${dirLabel}</h2>
        <p style="font-size:13px;color:#6b7280;margin:0 0 12px;">${d.title}${d.reason ? " — " + d.reason : ""}</p>
        <div style="border-top:1px solid #e5e7eb;padding-top:10px;font-size:12px;line-height:2;">
          <div style="display:flex;justify-content:space-between;"><span>الشخص</span><b>${d.people?.name || ""}</b></div>
          <div style="display:flex;justify-content:space-between;"><span>تاريخ الدين</span><b>${d.debt_date ? new Date(d.debt_date).toLocaleDateString("ar-EG") : "-"}</b></div>
          <div style="display:flex;justify-content:space-between;"><span>تاريخ الأجل</span><b>${d.due_date ? new Date(d.due_date).toLocaleDateString("ar-EG") : "غير محدد"}</b></div>
          <div style="display:flex;justify-content:space-between;"><span>المبلغ الأصلي</span><b>${fmt(Number(d.original_amount), d.currency)}</b></div>
          ${paidAmt > 0 ? `<div style="display:flex;justify-content:space-between;"><span>المسدد</span><b>${fmt(paidAmt, d.currency)}</b></div>` : ""}
          <div style="display:flex;justify-content:space-between;"><span>المتبقي</span><b>${fmt(Number(d.remaining_amount), d.currency)}</b></div>
          <div style="display:flex;justify-content:space-between;"><span>الحالة</span><b>${STATUS_LABEL[d.status]}</b></div>
        </div>
        ${
          d.debt_payments?.length
            ? `<div style="border-top:1px solid #e5e7eb;margin-top:10px;padding-top:10px;">
                 <p style="font-size:12px;font-weight:700;margin:0 0 6px;">السدادات الجزئية</p>
                 ${d.debt_payments
                   .map(
                     (p) =>
                       `<div style="display:flex;justify-content:space-between;font-size:11px;color:#6b7280;padding:2px 0;"><span>${new Date(
                         p.paid_at
                       ).toLocaleDateString("ar-EG")}</span><b>${fmt(Number(p.amount), d.currency)}</b></div>`
                   )
                   .join("")}
               </div>`
            : ""
        }
        <p style="font-size:10px;color:#9ca3af;text-align:center;margin-top:16px;">تم الإنشاء بواسطة FlowCash — ${new Date().toLocaleDateString("ar-EG")}</p>
      `;
      document.body.appendChild(node);
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
      document.body.removeChild(node);

      const filenameBase = `دين-${(d.people?.name || "").trim()}-${d.title}`.replace(/[\\/:*?"<>|]/g, "").slice(0, 60);
      if (format === "image") {
        const dataUrl = canvas.toDataURL("image/png");
        await shareFile(dataUrl, `${filenameBase}.png`);
      } else {
        const { jsPDF } = await import("jspdf");
        const w = canvas.width / 2;
        const h = canvas.height / 2;
        const pdf = new jsPDF({ unit: "px", format: [w, h] });
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, w, h);
        // use shareFile (native share sheet + hardened download fallback)
        // instead of pdf.save() directly — pdf.save() relies on the same
        // detached-anchor .click() pattern that fails silently in some
        // mobile/PWA-standalone webviews.
        const pdfDataUrl = pdf.output("dataurlstring");
        await shareFile(pdfDataUrl, `${filenameBase}.pdf`, "application/pdf");
      }
      setExportFor(null);
    } catch (err) {
      const detail = err instanceof Error && err.message ? ` (${err.message})` : "";
      setExportError(`حصل خطأ في تصدير الدين، حاول تاني${detail}`);
    } finally {
      setExporting(false);
    }
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

      {/* آية الدَّين — mus-haf-styled reminder box; tap to read the full verse */}
      <button
        onClick={() => setShowAyah((s) => !s)}
        className="w-full text-right rounded-2xl border-2 border-amber-900/40 bg-cover bg-center px-4 py-3 space-y-1.5"
        style={{ backgroundImage: "url(/images/ayah-bg.jpg)" }}
      >
        <p
          className="text-sm leading-loose font-serif"
          style={{ color: "#f3dfae", textShadow: "0 1px 4px rgba(0,0,0,0.85), 0 0 1px rgba(0,0,0,0.9)" }}
        >
          {showAyah ? AYAH_DAYN : `${AYAH_DAYN_OPENING}...`}{" "}
          <span className="text-[11px]" style={{ color: "#d9bd82", textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}>
            {"﴿البقرة: ٢٨٢﴾"}
          </span>
        </p>
        <p className="text-[10px] underline" style={{ color: "#e6cd93", textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}>
          {showAyah ? "اطوِ الآية" : "اقرأ الآية كاملة"}
        </p>
      </button>

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
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-neutral-400">تاريخ الدين</label>
              <input type="date" value={form.debt_date} onChange={(e) => setForm({ ...form, debt_date: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-neutral-400">تاريخ الأجل (اختياري)</label>
              <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
            </div>
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
                                <span className="flex items-center gap-1.5">
                                  <a href={p.receipt_url} target="_blank" rel="noopener noreferrer" className="text-orange-500 underline">الإيصال</a>
                                  <button type="button" onClick={() => downloadFile(p.receipt_url as string, "إيصال-سداد.jpg")} className="text-neutral-400 hover:text-orange-600"><Download size={12} /></button>
                                  <button type="button" onClick={() => shareFile(p.receipt_url as string, "إيصال-سداد.jpg")} className="text-neutral-400 hover:text-orange-600"><Share2 size={12} /></button>
                                </span>
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
                      <div>
                        <label className="text-[10px] text-neutral-400">تاريخ الدين</label>
                        <input type="date" value={editDraft.debt_date || ""} onChange={(e) => setEditDraft({ ...editDraft, debt_date: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="text-[10px] text-neutral-400">تاريخ الأجل</label>
                        <input type="date" value={editDraft.due_date || ""} onChange={(e) => setEditDraft({ ...editDraft, due_date: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
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
                  <button
                    onClick={() => { setExportFor(d); setExportIncludeAyah(true); setExportError(""); }}
                    className="w-full flex items-center justify-center gap-1.5 text-xs border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 rounded-lg py-2"
                  >
                    <FileDown size={13} /> تصدير تفاصيل الدين (صورة / PDF)
                  </button>
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

      {exportFor && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={() => !exporting && setExportFor(null)}>
          <div className="bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-sm">تصدير — {exportFor.title}</p>
            <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
              <input type="checkbox" checked={exportIncludeAyah} onChange={(e) => setExportIncludeAyah(e.target.checked)} />
              إرفاق آية الدَّين في أول الصفحة
            </label>
            <div className="flex gap-2">
              <button disabled={exporting} onClick={() => generateDebtExport("image")} className="flex-1 flex items-center justify-center gap-1.5 text-sm bg-neutral-800 dark:bg-neutral-700 text-white rounded-lg py-2 disabled:opacity-60">
                <ImageIcon size={14} /> صورة
              </button>
              <button disabled={exporting} onClick={() => generateDebtExport("pdf")} className="flex-1 flex items-center justify-center gap-1.5 text-sm bg-orange-600 text-white rounded-lg py-2 disabled:opacity-60">
                <FileDown size={14} /> PDF
              </button>
            </div>
            {exporting && <p className="text-[11px] text-center text-neutral-400">جاري التجهيز...</p>}
            {exportError && <p className="text-xs text-red-500 text-center">{exportError}</p>}
            <button onClick={() => { setExportFor(null); setExportError(""); }} disabled={exporting} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm disabled:opacity-60">إلغاء</button>
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
