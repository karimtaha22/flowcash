"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Card from "@/components/Card";
import { fmt } from "@/lib/format";
import {
  Plus, ChevronDown, Trash2, Pencil, Paperclip, Download, Share2, FileDown, Image as ImageIcon,
  Camera, Link2, Copy, ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, X, ScanLine,
} from "lucide-react";
import { shrinkImage } from "@/lib/image";
import { downloadFile, shareFile } from "@/lib/shareFile";
import { isValidPhone } from "@/lib/phone";
import ReceiptActions from "@/components/ReceiptActions";

// "نسخ/شارك رابط" — نفس فكرة shareFile بس للنص/الروابط مش للملفات: يفضّل
// نافذة المشاركة الأصلية للجهاز (واتساب، تليجرام...) لو متاحة، وإلا بينسخ
// الرابط للحافظة.
async function shareOrCopyText(text: string, title = "FlowCash") {
  const nav = navigator as Navigator & { share?: (data: any) => Promise<void> };
  if (nav.share) {
    try {
      await nav.share({ title, text });
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}

const AYAH_DAYN =
  'يَا أَيُّهَا الَّذِينَ آمَنُوا إِذَا تَدَايَنتُم بِدَيْنٍ إِلَىٰ أَجَلٍ مُّسَمًّى فَاكْتُبُوهُ ۚ وَلْيَكْتُب بَّيْنَكُمْ كَاتِبٌ بِالْعَدْلِ ۚ وَلَا يَأْبَ كَاتِبٌ أَن يَكْتُبَ كَمَا عَلَّمَهُ اللَّهُ ۚ فَلْيَكْتُبْ وَلْيُمْلِلِ الَّذِي عَلَيْهِ الْحَقُّ وَلْيَتَّقِ اللَّهَ رَبَّهُ وَلَا يَبْخَسْ مِنْهُ شَيْئًا ۚ فَإِن كَانَ الَّذِي عَلَيْهِ الْحَقُّ سَفِيهًا أَوْ ضَعِيفًا أَوْ لَا يَسْتَطِيعُ أَن يُمِلَّ هُوَ فَلْيُمْلِلْ وَلِيُّهُ بِالْعَدْلِ ۚ وَاسْتَشْهِدُوا شَهِيدَيْنِ مِن رِّجَالِكُمْ ۖ فَإِن لَّمْ يَكُونَا رَجُلَيْنِ فَرَجُلٌ وَامْرَأَتَانِ مِمَّن تَرْضَوْنَ مِنَ الشُّهَدَاءِ أَن تَضِلَّ إِحْدَاهُمَا فَتُذَكِّرَ إِحْدَاهُمَا الْأُخْرَىٰ ۚ وَلَا يَأْبَ الشُّهَدَاءُ إِذَا مَا دُعُوا ۚ وَلَا تَسْأَمُوا أَن تَكْتُبُوهُ صَغِيرًا أَوْ كَبِيرًا إِلَىٰ أَجَلِهِ ۚ ذَٰلِكُمْ أَقْسَطُ عِندَ اللَّهِ وَأَقْوَمُ لِلشَّهَادَةِ وَأَدْنَىٰ أَلَّا تَرْتَابُوا ۖ إِلَّا أَن تَكُونَ تِجَارَةً حَاضِرَةً تُدِيرُونَهَا بَيْنَكُمْ فَلَيْسَ عَلَيْكُمْ جُنَاحٌ أَلَّا تَكْتُبُوهَا ۗ وَأَشْهِدُوا إِذَا تَبَايَعْتُمْ ۚ وَلَا يُضَارَّ كَاتِبٌ وَلَا شَهِيدٌ ۚ وَإِن تَفْعَلُوا فَإِنَّهُ فُسُوقٌ بِكُمْ ۗ وَاتَّقُوا اللَّهَ ۖ وَيُعَلِّمُكُمُ اللَّهُ ۗ وَاللَّهُ بِكُلِّ شَيْءٍ عَلِيمٌ';
const AYAH_DAYN_OPENING = "يَا أَيُّهَا الَّذِينَ آمَنُوا إِذَا تَدَايَنتُم بِدَيْنٍ إِلَىٰ أَجَلٍ مُّسَمًّى فَاكْتُبُوهُ";

interface Payment { id: string; amount: number; paid_at: string; receipt_url: string | null; note: string | null }
interface Witness { id: string; slot_index: number; name: string; phone: string | null; address: string | null; id_photo_front: string | null }
interface DebtLink { id: string; token: string; role: "debtor" | "creditor_view" | "witness"; witness_id: string | null; viewed_at: string | null; acknowledged_at: string | null; revoked_at: string | null; url: string }
interface DebtEvent { event_type: string; description: string; actor_role: string | null; actor_name: string | null; created_at: string }
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
  value_type?: "currency" | "gold" | "silver" | "other";
  metal_karat?: number | null;
  is_advanced?: boolean;
  witness_mode?: "two_men" | "man_two_women" | null;
  objection_reason?: string | null;
  objection_created_at?: string | null;
  objection_resolved_at?: string | null;
  debt_witnesses?: Witness[];
  debt_links?: DebtLink[];
  debt_events?: DebtEvent[];
}

const WITNESS_MODE_LABEL: Record<string, string> = { two_men: "رجلين", man_two_women: "رجل وامرأتان" };
const WITNESS_SLOTS: Record<string, number> = { two_men: 2, man_two_women: 3 };
const EVENT_ICON: Record<string, string> = {
  created: "📜", payment_recorded: "💰", due_date_extended: "📅",
  witness_acknowledged: "✅", objection_raised: "⚠️", objection_resolved: "✅", link_revoked: "🚫",
};
const LINK_ROLE_LABEL: Record<string, string> = { debtor: "رابط المدين", creditor_view: "رابط صاحب الدين (يشوف بس)", witness: "رابط شاهد" };
const VALUE_TYPE_LABEL: Record<string, string> = { currency: "مبلغ مالي", gold: "ذهب", silver: "فضة", other: "أخرى" };

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
  const [showAdvancedForm, setShowAdvancedForm] = useState(false);
  const [justCreatedLinks, setJustCreatedLinks] = useState<DebtLink[] | null>(null);
  const [resolvingObjectionFor, setResolvingObjectionFor] = useState<string | null>(null);
  const [revokingLinkId, setRevokingLinkId] = useState<string | null>(null);
  const [exportError, setExportError] = useState("");
  const [copyMsg, setCopyMsg] = useState("");

  const emptyWitness = () => ({ name: "", phone: "", address: "", id_photo_front: null as string | null, matchResult: null as any, matching: false });
  const [advForm, setAdvForm] = useState({
    person_id: "",
    new_person: "",
    phone: "",
    address: "",
    id_number: "",
    id_photo_front: null as string | null,
    title: "",
    reason: "",
    amount: "",
    value_type: "currency" as "currency" | "gold" | "silver" | "other",
    metal_karat: "",
    unit_label: "",
    currency: "EGP",
    debt_date: todayISO(),
    due_date: "",
    witness_mode: "two_men" as "two_men" | "man_two_women",
  });
  const [advWitnesses, setAdvWitnesses] = useState([emptyWitness(), emptyWitness()]);
  const [advWarning, setAdvWarning] = useState("");
  const [advSaving, setAdvSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractSuggestion, setExtractSuggestion] = useState<{ name: string; id_number: string } | null>(null);

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

  const resolveObjection = async (debtId: string) => {
    setResolvingObjectionFor(debtId);
    try {
      const res = await fetch(`/api/debts/${debtId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolve_objection: true }),
      });
      if (!res.ok) { setEditError("حصل خطأ ومتحلش الاعتراض، حاول تاني"); return; }
      load();
    } finally {
      setResolvingObjectionFor(null);
    }
  };

  const revokeLink = async (debtId: string, linkId: string) => {
    setRevokingLinkId(linkId);
    try {
      await fetch(`/api/debts/${debtId}/links/${linkId}`, { method: "DELETE" });
      load();
    } finally {
      setRevokingLinkId(null);
    }
  };

  const copyLink = async (l: { url: string }, label: string) => {
    const r = await shareOrCopyText(`${label}\n${l.url}`);
    if (r === "copied") {
      setCopyMsg("تم نسخ الرابط");
      setTimeout(() => setCopyMsg(""), 2500);
    }
  };

  const setWitnessMode = (mode: "two_men" | "man_two_women") => {
    const n = WITNESS_SLOTS[mode];
    setAdvWitnesses((prev) => {
      const next = [...prev];
      while (next.length < n) next.push(emptyWitness());
      return next.slice(0, n);
    });
    setAdvForm((f) => ({ ...f, witness_mode: mode }));
  };

  const onAdvIdPhotoPicked = async (file: File) => {
    const dataUrl = await shrinkImage(file);
    setAdvForm((f) => ({ ...f, id_photo_front: dataUrl }));
    setExtractSuggestion(null);
  };

  const extractFromPhoto = async () => {
    if (!advForm.id_photo_front) return;
    setExtracting(true);
    setAdvWarning("");
    try {
      const res = await fetch("/api/debts/extract-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "extract", id_photo_front: advForm.id_photo_front }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.result?.is_id_legible) {
        setAdvWarning(data.result?.error || data.error || "متقدرناش نقرأ البيانات من الصورة، اكتبها يدوي");
        return;
      }
      setExtractSuggestion({ name: data.result.name, id_number: data.result.id_number });
    } finally {
      setExtracting(false);
    }
  };

  const acceptExtractSuggestion = () => {
    if (!extractSuggestion) return;
    setAdvForm((f) => ({
      ...f,
      new_person: f.person_id ? f.new_person : extractSuggestion.name || f.new_person,
      id_number: extractSuggestion.id_number || f.id_number,
    }));
    setExtractSuggestion(null);
  };

  const onWitnessPhotoPicked = async (i: number, file: File) => {
    const dataUrl = await shrinkImage(file);
    setAdvWitnesses((prev) => prev.map((w, idx) => (idx === i ? { ...w, id_photo_front: dataUrl, matchResult: null } : w)));
  };

  const checkWitnessMatch = async (i: number) => {
    const w = advWitnesses[i];
    if (!w.id_photo_front || !w.name.trim()) return;
    setAdvWitnesses((prev) => prev.map((x, idx) => (idx === i ? { ...x, matching: true } : x)));
    try {
      const res = await fetch("/api/debts/extract-id", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "match_name", id_photo_front: w.id_photo_front, claimed_name: w.name }),
      });
      const data = await res.json().catch(() => ({}));
      setAdvWitnesses((prev) => prev.map((x, idx) => (idx === i ? { ...x, matchResult: data.result || { error: data.error || "حصل خطأ" } } : x)));
    } finally {
      setAdvWitnesses((prev) => prev.map((x, idx) => (idx === i ? { ...x, matching: false } : x)));
    }
  };

  const resetAdvForm = () => {
    setAdvForm({
      person_id: "", new_person: "", phone: "", address: "", id_number: "", id_photo_front: null,
      title: "", reason: "", amount: "", value_type: "currency", metal_karat: "", unit_label: "",
      currency: "EGP", debt_date: todayISO(), due_date: "", witness_mode: "two_men",
    });
    setAdvWitnesses([emptyWitness(), emptyWitness()]);
    setExtractSuggestion(null);
  };

  const submitAdvanced = async () => {
    if (!advForm.person_id && !advForm.new_person.trim()) { setAdvWarning("لازم تختار شخص أو تكتب اسم جديد"); return; }
    if (!advForm.title.trim()) { setAdvWarning("اسم الدين لازم يتملى"); return; }
    if (!advForm.amount || parseFloat(advForm.amount) <= 0) { setAdvWarning("المبلغ لازم يتملى برقم أكبر من صفر"); return; }
    if (advForm.value_type === "gold" && !advForm.metal_karat) { setAdvWarning("لازم تحدد عيار الدهب"); return; }
    if (advForm.phone && !isValidPhone(advForm.phone)) { setAdvWarning("رقم موبايل الطرف التاني غير صالح"); return; }
    const n = WITNESS_SLOTS[advForm.witness_mode];
    const activeWitnesses = advWitnesses.slice(0, n);
    if (activeWitnesses.some((w) => !w.name.trim())) { setAdvWarning(`لازم اسم كل الشهود (${n})`); return; }
    if (activeWitnesses.some((w) => w.phone && !isValidPhone(w.phone))) { setAdvWarning("رقم موبايل غير صالح — راجع أرقام الشهود"); return; }
    setAdvWarning("");
    setAdvSaving(true);
    try {
      const res = await fetch("/api/debts/advanced", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direction: tab,
          person_id: advForm.person_id || undefined,
          new_person_name: advForm.person_id ? undefined : advForm.new_person,
          other_party: {
            phone: advForm.phone || undefined,
            address: advForm.address || undefined,
            id_number: advForm.id_number || undefined,
            id_photo_front: advForm.id_photo_front || undefined,
          },
          title: advForm.title,
          reason: advForm.reason,
          amount: parseFloat(advForm.amount),
          value_type: advForm.value_type,
          metal_karat: advForm.value_type === "gold" ? advForm.metal_karat : undefined,
          unit_label: advForm.value_type !== "currency" ? advForm.unit_label || undefined : undefined,
          currency: advForm.currency,
          debt_date: advForm.debt_date || undefined,
          due_date: advForm.due_date || null,
          witness_mode: advForm.witness_mode,
          witnesses: activeWitnesses.map((w) => ({
            name: w.name, phone: w.phone || undefined, address: w.address || undefined, id_photo_front: w.id_photo_front || undefined,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setAdvWarning(data.error || "حصل خطأ ومتحفظش الدين، حاول تاني"); return; }
      setJustCreatedLinks(data.links || []);
      setShowAdvancedForm(false);
      resetAdvForm();
      load();
    } catch {
      setAdvWarning("مفيش اتصال بالإنترنت، حاول تاني");
    } finally {
      setAdvSaving(false);
    }
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
        ${
          d.is_advanced && d.debt_witnesses?.length
            ? `<div style="border-top:1px solid #e5e7eb;margin-top:10px;padding-top:10px;">
                 <p style="font-size:12px;font-weight:700;margin:0 0 6px;">الشهود (${WITNESS_MODE_LABEL[d.witness_mode || ""] || ""})</p>
                 ${d.debt_witnesses
                   .map((w) => {
                     const link = d.debt_links?.find((l) => l.witness_id === w.id);
                     const status = link?.acknowledged_at ? "أشهد ✅" : "لسه ماأشهدش";
                     return `<div style="display:flex;justify-content:space-between;font-size:11px;color:#6b7280;padding:2px 0;"><span>${w.name}</span><b>${status}</b></div>`;
                   })
                   .join("")}
               </div>`
            : ""
        }
        ${
          d.is_advanced && d.debt_events?.length
            ? `<div style="border-top:1px solid #e5e7eb;margin-top:10px;padding-top:10px;">
                 <p style="font-size:12px;font-weight:700;margin:0 0 6px;">سجل الأحداث</p>
                 ${d.debt_events
                   .map(
                     (e) =>
                       `<div style="font-size:10px;color:#6b7280;padding:2px 0;">${new Date(e.created_at).toLocaleDateString("ar-EG")} — ${e.description}</div>`
                   )
                   .join("")}
               </div>`
            : ""
        }
        <div style="border-top:1px solid #e5e7eb;margin-top:16px;padding-top:10px;text-align:center;">
          <img src="/icons/icon-192.png" style="width:28px;height:28px;border-radius:6px;margin-bottom:4px;" />
          <p style="font-size:10px;color:#9ca3af;margin:0;">تم الإنشاء بواسطة FlowCash — ${new Date().toLocaleDateString("ar-EG")}</p>
          <p style="font-size:9px;color:#d1d5db;margin:2px 0 0;">© 2022–2026 IDEA-EG · www.ideaeg.online</p>
        </div>
      `;
      document.body.appendChild(node);
      // html2canvas (plain) throws "Attempting to parse an unsupported color
      // function 'lab'/'oklch'" the moment it walks up to <body>/<html> and
      // hits a Tailwind v4 utility color — Tailwind v4 generates its palette
      // with oklch(), and Chrome's getComputedStyle serializes some of those
      // as lab(), which the original html2canvas's color parser has never
      // supported (open upstream issue, unresolved). html2canvas-pro is a
      // maintained fork with the exact same API that adds lab/lch/oklab/
      // oklch support — a straight swap, no other code here changes.
      const html2canvas = (await import("html2canvas-pro")).default;
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
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">الأشخاص والديون</h1>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { setShowAdvancedForm((s) => !s); setShowForm(false); setAdvWarning(""); }}
            className="flex items-center gap-1 text-xs border border-orange-600 text-orange-600 dark:text-orange-400 rounded-full px-2.5 py-1.5"
          >
            <Link2 size={14} /> تسجيل متقدم
          </button>
          <button onClick={() => { setShowForm((s) => !s); setShowAdvancedForm(false); setFormWarning(""); }} className="flex items-center gap-1 text-sm bg-orange-600 text-white rounded-full px-3 py-1.5">
            <Plus size={16} /> دين جديد
          </button>
        </div>
      </div>
      {copyMsg && <p className="text-[11px] text-center text-emerald-600 dark:text-emerald-400">{copyMsg}</p>}

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

      {showAdvancedForm && (
        <Card className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold">تسجيل متقدم — بشهود ورابط حي</p>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              هيتولّد رابط منفصل لكل شاهد وللطرف التاني (المدين أو صاحب الدين)، كل واحد بيشوف بياناته بس ويقدر {advForm.witness_mode ? "يشهد أو يعترض" : ""} من غير ما يحتاج يعمل حساب. لو أي حد منهم عنده FlowCash بالفعل هيوصله إشعار تلقائي.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-neutral-500">بيانات {tab === "owed_to_me" ? "المدين" : "صاحب الدين"}</p>
            <select value={advForm.person_id} onChange={(e) => setAdvForm({ ...advForm, person_id: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
              <option value="">-- اختار شخص أو ضيف جديد تحت --</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {!advForm.person_id && (
              <input placeholder="الاسم بالكامل" value={advForm.new_person} onChange={(e) => setAdvForm({ ...advForm, new_person: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
            )}
            <input placeholder="رقم الموبايل (اختياري — بيستخدم لاكتشاف حسابه ولإرسال الإشعار)" value={advForm.phone} onChange={(e) => setAdvForm({ ...advForm, phone: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
            <input placeholder="العنوان (اختياري)" value={advForm.address} onChange={(e) => setAdvForm({ ...advForm, address: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
            <input placeholder="الرقم القومي (اختياري)" value={advForm.id_number} onChange={(e) => setAdvForm({ ...advForm, id_number: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />

            <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 cursor-pointer">
              <Camera size={14} />
              {advForm.id_photo_front ? "✅ صورة البطاقة اتصورت — دوس لتغييرها" : "صورة وش البطاقة (اختياري)"}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onAdvIdPhotoPicked(f); }} />
            </label>
            {advForm.id_photo_front && (
              <button type="button" disabled={extracting} onClick={extractFromPhoto} className="w-full flex items-center justify-center gap-1.5 text-xs border border-orange-300 dark:border-orange-800 text-orange-600 dark:text-orange-400 rounded-lg py-2 disabled:opacity-60">
                <ScanLine size={13} /> {extracting ? "جاري القراءة..." : "استخرج البيانات من الصورة"}
              </button>
            )}
            {extractSuggestion && (
              <div className="text-xs bg-neutral-100 dark:bg-neutral-800 rounded-lg p-2 space-y-1">
                <p>الاسم: <b>{extractSuggestion.name || "-"}</b> — الرقم القومي: <b>{extractSuggestion.id_number || "-"}</b></p>
                <div className="flex gap-2">
                  <button type="button" onClick={acceptExtractSuggestion} className="flex-1 bg-orange-600 text-white rounded-lg py-1.5 text-[11px]">استخدم البيانات دي</button>
                  <button type="button" onClick={() => setExtractSuggestion(null)} className="flex-1 border border-neutral-300 dark:border-neutral-700 rounded-lg py-1.5 text-[11px]">تجاهل</button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2 border-t border-neutral-200 dark:border-neutral-800 pt-2">
            <p className="text-xs font-semibold text-neutral-500">بيانات الدين</p>
            <input placeholder="اسم الدين (مثال: سلفة شقة)" value={advForm.title} onChange={(e) => setAdvForm({ ...advForm, title: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
            <input placeholder="السبب (اختياري)" value={advForm.reason} onChange={(e) => setAdvForm({ ...advForm, reason: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />

            <select value={advForm.value_type} onChange={(e) => setAdvForm({ ...advForm, value_type: e.target.value as any })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
              <option value="currency">مبلغ مالي</option>
              <option value="gold">ذهب</option>
              <option value="silver">فضة</option>
              <option value="other">قيمة أخرى (بضاعة، إلخ)</option>
            </select>

            {advForm.value_type === "currency" ? (
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="المبلغ" type="number" value={advForm.amount} onChange={(e) => setAdvForm({ ...advForm, amount: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                <select value={advForm.currency} onChange={(e) => setAdvForm({ ...advForm, currency: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
                  <option value="EGP">جنيه</option>
                  <option value="USD">دولار</option>
                  <option value="SAR">ريال</option>
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <input placeholder={advForm.value_type === "gold" ? "الوزن (جرام)" : advForm.value_type === "silver" ? "الوزن (جرام)" : "الكمية"} type="number" value={advForm.amount} onChange={(e) => setAdvForm({ ...advForm, amount: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                {advForm.value_type === "gold" ? (
                  <select value={advForm.metal_karat} onChange={(e) => setAdvForm({ ...advForm, metal_karat: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
                    <option value="">العيار</option>
                    <option value="18">عيار 18</option>
                    <option value="21">عيار 21</option>
                    <option value="24">عيار 24</option>
                  </select>
                ) : (
                  <input placeholder="وحدة القياس (مثال: كرتونة)" value={advForm.unit_label} onChange={(e) => setAdvForm({ ...advForm, unit_label: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-neutral-400">تاريخ الدين</label>
                <input type="date" value={advForm.debt_date} onChange={(e) => setAdvForm({ ...advForm, debt_date: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-[10px] text-neutral-400">تاريخ الأجل (اختياري)</label>
                <input type="date" value={advForm.due_date} onChange={(e) => setAdvForm({ ...advForm, due_date: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
              </div>
            </div>
          </div>

          <div className="space-y-3 border-t border-neutral-200 dark:border-neutral-800 pt-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-neutral-500">الشهود</p>
              <select value={advForm.witness_mode} onChange={(e) => setWitnessMode(e.target.value as any)} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1 text-xs">
                <option value="two_men">رجلين</option>
                <option value="man_two_women">رجل وامرأتان</option>
              </select>
            </div>
            {advWitnesses.slice(0, WITNESS_SLOTS[advForm.witness_mode]).map((w, i) => (
              <div key={i} className="space-y-1.5 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg p-2">
                <p className="text-[10px] text-neutral-400">شاهد {i + 1}</p>
                <input placeholder="اسم الشاهد" value={w.name} onChange={(e) => setAdvWitnesses((prev) => prev.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                <input placeholder="رقم موبايل الشاهد (اختياري)" value={w.phone} onChange={(e) => setAdvWitnesses((prev) => prev.map((x, idx) => (idx === i ? { ...x, phone: e.target.value } : x)))} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                <input placeholder="عنوان الشاهد (اختياري)" value={w.address} onChange={(e) => setAdvWitnesses((prev) => prev.map((x, idx) => (idx === i ? { ...x, address: e.target.value } : x)))} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
                <label className="flex items-center gap-2 text-[11px] text-neutral-600 dark:text-neutral-300 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-1.5 cursor-pointer">
                  <Camera size={12} />
                  {w.id_photo_front ? "✅ صورة بطاقة الشاهد اتصورت" : "صورة بطاقة الشاهد (اختياري)"}
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onWitnessPhotoPicked(i, f); }} />
                </label>
                {w.id_photo_front && w.name.trim() && (
                  <button type="button" disabled={w.matching} onClick={() => checkWitnessMatch(i)} className="w-full text-[11px] border border-orange-300 dark:border-orange-800 text-orange-600 dark:text-orange-400 rounded-lg py-1.5 disabled:opacity-60">
                    {w.matching ? "جاري التحقق..." : "تحقق إن الاسم مطابق للبطاقة"}
                  </button>
                )}
                {w.matchResult && (
                  <p className={`text-[11px] ${w.matchResult.name_matches ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                    {w.matchResult.error ? w.matchResult.error : w.matchResult.name_matches ? "✅ الاسم مطابق للبطاقة" : "⚠️ الاسم مش متطابق أو مش واضح"}
                  </p>
                )}
              </div>
            ))}
          </div>

          {advWarning && <p className="text-xs text-red-500">{advWarning}</p>}
          <div className="flex gap-2">
            <button onClick={() => { setShowAdvancedForm(false); setAdvWarning(""); }} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm">إلغاء</button>
            <button disabled={advSaving} onClick={submitAdvanced} className="flex-1 bg-orange-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60">
              {advSaving ? "جاري الحفظ..." : "حفظ وتوليد الروابط"}
            </button>
          </div>
        </Card>
      )}

      {justCreatedLinks && (
        <Card className="space-y-2 bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5"><CheckCircle2 size={14} /> اتسجل الدين — دي الروابط</p>
            <button onClick={() => setJustCreatedLinks(null)} className="text-emerald-600 dark:text-emerald-400"><X size={16} /></button>
          </div>
          <div className="space-y-1.5">
            {justCreatedLinks.map((l) => (
              <div key={l.id} className="flex items-center justify-between bg-white dark:bg-neutral-900 rounded-lg px-3 py-2 text-xs">
                <span>{LINK_ROLE_LABEL[l.role] || l.role}</span>
                <button onClick={() => copyLink(l, LINK_ROLE_LABEL[l.role] || l.role)} className="flex items-center gap-1 text-orange-600 dark:text-orange-400"><Copy size={12} /> نسخ/مشاركة</button>
              </div>
            ))}
          </div>
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

                  {d.is_advanced && (
                    <div className="space-y-3 border-t border-neutral-200 dark:border-neutral-800 pt-3">
                      <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
                        <ShieldCheck size={12} /> تسجيل متقدم — {WITNESS_MODE_LABEL[d.witness_mode || ""] || ""} {d.value_type && d.value_type !== "currency" ? `· ${VALUE_TYPE_LABEL[d.value_type]}` : ""}
                      </div>

                      {d.objection_created_at && !d.objection_resolved_at && (
                        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 rounded-lg p-2 space-y-1.5">
                          <p className="text-xs font-bold text-red-700 dark:text-red-300 flex items-center gap-1"><AlertTriangle size={12} /> في اعتراض من الطرف التاني</p>
                          <p className="text-xs text-red-600 dark:text-red-400">{d.objection_reason}</p>
                          <button disabled={resolvingObjectionFor === d.id} onClick={() => resolveObjection(d.id)} className="w-full text-[11px] bg-red-600 text-white rounded-lg py-1.5 disabled:opacity-60">
                            {resolvingObjectionFor === d.id ? "جاري الحل..." : "تم حل الاعتراض"}
                          </button>
                        </div>
                      )}
                      {d.objection_resolved_at && d.objection_reason && (
                        <div className="bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 rounded-lg p-2 space-y-1">
                          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1"><CheckCircle2 size={12} /> اعتراض سابق — تم حله</p>
                        </div>
                      )}

                      {d.debt_links && d.debt_links.filter((l) => l.role !== "witness").length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[10px] font-semibold text-neutral-400">رابط {d.direction === "owed_to_me" ? "المدين" : "صاحب الدين"}</p>
                          {d.debt_links.filter((l) => l.role !== "witness").map((l) => (
                            <div key={l.id} className="flex items-center justify-between bg-white dark:bg-neutral-900 rounded-lg px-2.5 py-1.5 text-[11px]">
                              <span className="flex items-center gap-1">
                                {l.revoked_at ? <span className="text-neutral-400">ملغي</span> : l.viewed_at ? <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2 size={11} /> اتفتح</span> : <span className="text-neutral-400 flex items-center gap-1"><ShieldAlert size={11} /> لسه مافتحوش</span>}
                              </span>
                              {!l.revoked_at && (
                                <span className="flex items-center gap-2">
                                  <button onClick={() => copyLink(l, LINK_ROLE_LABEL[l.role])} className="text-orange-600 dark:text-orange-400"><Copy size={12} /></button>
                                  <button disabled={revokingLinkId === l.id} onClick={() => revokeLink(d.id, l.id)} className="text-red-500 disabled:opacity-60"><X size={12} /></button>
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {d.debt_witnesses && d.debt_witnesses.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[10px] font-semibold text-neutral-400">الشهود</p>
                          {d.debt_witnesses.map((w) => {
                            const link = d.debt_links?.find((l) => l.witness_id === w.id);
                            return (
                              <div key={w.id} className="flex items-center justify-between bg-white dark:bg-neutral-900 rounded-lg px-2.5 py-1.5 text-[11px]">
                                <span>{w.name}</span>
                                <span className="flex items-center gap-2">
                                  {link?.revoked_at ? (
                                    <span className="text-neutral-400">ملغي</span>
                                  ) : link?.acknowledged_at ? (
                                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><ShieldCheck size={11} /> أشهد</span>
                                  ) : (
                                    <span className="text-neutral-400 flex items-center gap-1"><ShieldAlert size={11} /> لسه</span>
                                  )}
                                  {link && !link.revoked_at && (
                                    <>
                                      <button onClick={() => copyLink(link, `دعوة شهادة على دين — ${w.name}`)} className="text-orange-600 dark:text-orange-400"><Copy size={12} /></button>
                                      <button disabled={revokingLinkId === link.id} onClick={() => revokeLink(d.id, link.id)} className="text-red-500 disabled:opacity-60"><X size={12} /></button>
                                    </>
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {d.debt_events && d.debt_events.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[10px] font-semibold text-neutral-400">سجل الأحداث</p>
                          <div className="space-y-1">
                            {d.debt_events.map((e, i) => (
                              <div key={i} className="text-[10px] text-neutral-500 flex items-start gap-1.5">
                                <span>{EVENT_ICON[e.event_type] || "•"}</span>
                                <span className="flex-1">{e.description}</span>
                                <span className="text-neutral-400 shrink-0">{new Date(e.created_at).toLocaleDateString("ar-EG")}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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
