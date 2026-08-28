"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Card from "@/components/Card";
import { fmt } from "@/lib/format";
import {
  Plus, ChevronDown, Trash2, Pencil, Paperclip, Download, Share2, FileDown, Image as ImageIcon,
  Camera, Link2, Copy, ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2, X, ScanLine, Archive,
} from "lucide-react";
import { shrinkImage } from "@/lib/image";
import { downloadFile, shareFile } from "@/lib/shareFile";
import { isValidPhone } from "@/lib/phone";
import ReceiptActions from "@/components/ReceiptActions";
import { renderHtmlToCanvas, canvasToPdf } from "@/lib/pdfExport";
import { showToast } from "@/lib/toast";

// Round 25 fix — "مفتاح نسخ الرابط مش بينسخ": the old combined
// shareOrCopyText tried navigator.share first and only fell back to
// clipboard.writeText if share was unavailable/aborted, and if BOTH of
// those failed (e.g. a webview where navigator.clipboard is undefined or
// blocked, which is common) it silently did nothing — no error, no
// feedback, so a tap just looked broken. Split into two explicit, always-
// truthful actions: copyText (guaranteed to either copy or say so, via a
// three-tier fallback) and shareText (native share sheet only, never
// silently substitutes for copy).
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy fallback below
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

async function shareText(text: string, url: string, title = "FlowCash"): Promise<boolean> {
  const nav = navigator as Navigator & { share?: (data: any) => Promise<void> };
  if (!nav.share) return false;
  try {
    await nav.share({ title, text, url });
    return true;
  } catch {
    return false;
  }
}

const AYAH_DAYN =
  'يَا أَيُّهَا الَّذِينَ آمَنُوا إِذَا تَدَايَنتُم بِدَيْنٍ إِلَىٰ أَجَلٍ مُّسَمًّى فَاكْتُبُوهُ ۚ وَلْيَكْتُب بَّيْنَكُمْ كَاتِبٌ بِالْعَدْلِ ۚ وَلَا يَأْبَ كَاتِبٌ أَن يَكْتُبَ كَمَا عَلَّمَهُ اللَّهُ ۚ فَلْيَكْتُبْ وَلْيُمْلِلِ الَّذِي عَلَيْهِ الْحَقُّ وَلْيَتَّقِ اللَّهَ رَبَّهُ وَلَا يَبْخَسْ مِنْهُ شَيْئًا ۚ فَإِن كَانَ الَّذِي عَلَيْهِ الْحَقُّ سَفِيهًا أَوْ ضَعِيفًا أَوْ لَا يَسْتَطِيعُ أَن يُمِلَّ هُوَ فَلْيُمْلِلْ وَلِيُّهُ بِالْعَدْلِ ۚ وَاسْتَشْهِدُوا شَهِيدَيْنِ مِن رِّجَالِكُمْ ۖ فَإِن لَّمْ يَكُونَا رَجُلَيْنِ فَرَجُلٌ وَامْرَأَتَانِ مِمَّن تَرْضَوْنَ مِنَ الشُّهَدَاءِ أَن تَضِلَّ إِحْدَاهُمَا فَتُذَكِّرَ إِحْدَاهُمَا الْأُخْرَىٰ ۚ وَلَا يَأْبَ الشُّهَدَاءُ إِذَا مَا دُعُوا ۚ وَلَا تَسْأَمُوا أَن تَكْتُبُوهُ صَغِيرًا أَوْ كَبِيرًا إِلَىٰ أَجَلِهِ ۚ ذَٰلِكُمْ أَقْسَطُ عِندَ اللَّهِ وَأَقْوَمُ لِلشَّهَادَةِ وَأَدْنَىٰ أَلَّا تَرْتَابُوا ۖ إِلَّا أَن تَكُونَ تِجَارَةً حَاضِرَةً تُدِيرُونَهَا بَيْنَكُمْ فَلَيْسَ عَلَيْكُمْ جُنَاحٌ أَلَّا تَكْتُبُوهَا ۗ وَأَشْهِدُوا إِذَا تَبَايَعْتُمْ ۚ وَلَا يُضَارَّ كَاتِبٌ وَلَا شَهِيدٌ ۚ وَإِن تَفْعَلُوا فَإِنَّهُ فُسُوقٌ بِكُمْ ۗ وَاتَّقُوا اللَّهَ ۖ وَيُعَلِّمُكُمُ اللَّهُ ۗ وَاللَّهُ بِكُلِّ شَيْءٍ عَلِيمٌ';
const AYAH_DAYN_OPENING = "يَا أَيُّهَا الَّذِينَ آمَنُوا إِذَا تَدَايَنتُم بِدَيْنٍ إِلَىٰ أَجَلٍ مُّسَمًّى فَاكْتُبُوهُ";

// Round 32 — نص التحميل الموحّد لأي عملية بتكلّم Gemini في التطبيق كله.
const AI_LOADING_TEXT = "جاري الاتصال بخوادم IDEA...";

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
  people: { name: string; phone: string | null; address?: string | null; id_photo_front?: string | null };
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
  creditor_name?: string;
  debtor_name?: string;
  archived_at?: string | null;
}

const WITNESS_MODE_LABEL: Record<string, string> = { two_men: "رجلين", man_two_women: "رجل وامرأتان" };
const EVENT_ICON: Record<string, string> = {
 created:"", payment_recorded:"", due_date_extended:"",
 witness_acknowledged:"", objection_raised:"", objection_resolved:"", link_revoked:"",
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
  const [payMode, setPayMode] = useState<"partial" | "full">("partial");
  const [payAmount, setPayAmount] = useState("");
  // Round 47 — "تم سداد الدين... يسألني اخصم من حساب نعم/لا": هل السداد ده
  // (جزئي أو كامل) هيتربط بحساب حقيقي في التطبيق ولا لأ. `null` = لسه محددتش.
  const [payUseAccount, setPayUseAccount] = useState<boolean | null>(null);
  const [payAccountId, setPayAccountId] = useState("");
  const [accounts, setAccounts] = useState<{ id: string; name: string; currency: string }[]>([]);
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    person_id: "", new_person: "", title: "", reason: "", amount: "", currency: "EGP", debt_date: todayISO(), due_date: "",
    // Round 47 — "اعمل مربع اختيار نوع الدين: ذهب وعيار / مبلغ مالي /
    // اختيار العملة" — نفس اختيار نوع القيمة الموجود أصلًا في فورم "تسجيل
    // متقدم" بس هنا للفورم البسيط كمان، عشان دين الذهب ميتحسبش "فلوس" غلط.
    value_type: "currency" as "currency" | "gold" | "silver" | "other",
    metal_karat: "",
    unit_label: "",
  });
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, any>>({});
  const [confirmDelete, setConfirmDelete] = useState<Debt | null>(null);
  const [deleteConfirmWord, setDeleteConfirmWord] = useState("");
  const [editError, setEditError] = useState("");
  const [payError, setPayError] = useState("");
  const [receiptDataUrl, setReceiptDataUrl] = useState<string | null>(null);
  const [showAyah, setShowAyah] = useState(false);
  const [exportFor, setExportFor] = useState<Debt | null>(null);
  const [exportIncludeAyah, setExportIncludeAyah] = useState(true);
  const [exportIncludePhones, setExportIncludePhones] = useState(false);
  const [exportIncludeAddresses, setExportIncludeAddresses] = useState(false);
  const [exportIncludePhotos, setExportIncludePhotos] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showAdvancedForm, setShowAdvancedForm] = useState(false);
  const [justCreatedLinks, setJustCreatedLinks] = useState<DebtLink[] | null>(null);
  const [resolvingObjectionFor, setResolvingObjectionFor] = useState<string | null>(null);
  const [revokingLinkId, setRevokingLinkId] = useState<string | null>(null);
  const [exportError, setExportError] = useState("");
  const [copyMsg, setCopyMsg] = useState("");

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
    // Round 25 — "اسم الدائن و المدين يتكتبوا يدويا": typed explicitly rather
    // than always derived from the linked person/account record (which can
    // carry an English name or a nickname). Prefilled where a sensible guess
    // exists (my own account name, or the picked person's name) but always
    // editable, and required before submit.
    creditor_name: "",
    debtor_name: "",
  });
  const [advWarning, setAdvWarning] = useState("");
  const [advSaving, setAdvSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractSuggestion, setExtractSuggestion] = useState<{ name: string; id_number: string } | null>(null);
  const [myAccountName, setMyAccountName] = useState("");

  const load = async () => {
    const d = await fetch("/api/debts").then((r) => r.json());
    setDebts(d.debts || []);
    const p = await fetch("/api/people").then((r) => r.json());
    setPeople((p.people || []).map((x: any) => ({ id: x.id, name: x.name })));
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => setMyAccountName(d.user?.name || "")).catch(() => {});
    // Round 47 — لازم قائمة الحسابات عشان سؤال "خصم من حساب؟ / أضيفه
    // لحسابك؟" وقت تسجيل السداد.
    fetch("/api/accounts").then((r) => r.json()).then((d) => setAccounts(d.accounts || [])).catch(() => {});
  }, []);

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
    if (form.value_type === "gold" && !form.metal_karat) {
      setFormWarning("لازم تحدد عيار الدهب");
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
          value_type: form.value_type,
          metal_karat: form.value_type === "gold" ? form.metal_karat : undefined,
          unit_label: form.value_type !== "currency" ? form.unit_label || undefined : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormWarning(data.error || "حصل خطأ ومتحفظش الدين، حاول تاني");
        setSaving(false);
        return;
      }
      setShowForm(false);
      setForm({ person_id: "", new_person: "", title: "", reason: "", amount: "", currency: "EGP", debt_date: todayISO(), due_date: "", value_type: "currency", metal_karat: "", unit_label: "" });
      load();
    } catch {
      setFormWarning("مفيش اتصال بالإنترنت، حاول تاني");
    } finally {
      setSaving(false);
    }
  };

  const submitPayment = async () => {
    if (!payFor) return;
    const amt = payMode === "full" ? Number(payFor.remaining_amount) : parseFloat(payAmount);
    if (!amt || amt <= 0) return;
    // Round 47 — "خصم من حساب نعم/لا... اختار الحساب": لو اختارت "نعم" لازم
    // تحدد حساب فعلي قبل ما نكمل، وإلا السداد هيتسجل من غير أي أثر على أي
    // حساب (نفس سلوك قبل الراوند ده، بس دلوقتي باختيار واعي مش لأن مفيش خيار).
    if (payUseAccount && !payAccountId) {
      setPayError("لازم تختار الحساب");
      return;
    }
    setPayError("");
    try {
      const res = await fetch(`/api/debts/${payFor.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amt,
          receipt_url: receiptDataUrl || undefined,
          account_id: payUseAccount ? payAccountId : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setPayError(data.error || "حصل خطأ ومتسجلش السداد، حاول تاني");
        return;
      }
      const data = await res.json().catch(() => ({}));
      // Round 47 fix — باج "مربع المتبقي جوه الكارت مش بيتحدث بعد سداد
      // جزئي": editDraft (state منفصل تمامًا عن قائمة الديون) كان بيتملى مرة
      // واحدة بس وقت فتح الكارت (toggleExpand)، وبعد كده مبيتحدثش تاني — حتى
      // لو الكارت فاضل مفتوح وسددنا جزء منه. `load()` بيحدّث `debts` بس مش
      // `editDraft`. نحدّثه هنا يدويًا بالقيمة الحقيقية الراجعة من السيرفر.
      if (expandedId === payFor.id) {
        setEditDraft((d) => ({ ...d, remaining_amount: String(data.remaining ?? 0) }));
      }
      // Round 48 — "لما الدين يتسد يتشال من القايمة و حط مربع يظهر ٥ ثواني
      // ويختفي": الدين اتقفل بالكامل هيتشال من القايمة تلقائيًا (الأرشفة
      // بتحصل في الباك إند نفسه — راجع POST /api/debts/[id]/payments)، هنا
      // بنعرض التوست بس.
      if (data.status === "paid") {
        showToast("تم نقل الدين المسدد إلى الأرشيف — يمكنك مراجعة الأرشيف من الإعدادات", "success", 5000);
      }
      setPayFor(null);
      setPayAmount("");
      setPayUseAccount(null);
      setPayAccountId("");
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

  // Round 48 — نقل يدوي لدين مقفول للأرشيف (راجع تعليق زرار "نقل إلى
  // الأرشيف" جوه الكارت).
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const archiveDebt = async (id: string) => {
    setArchivingId(id);
    try {
      const res = await fetch(`/api/debts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archive: true }),
      });
      if (!res.ok) { setEditError("حصل خطأ ومتنقلش الدين للأرشيف، حاول تاني"); return; }
      showToast("تم نقل الدين إلى الأرشيف — يمكنك مراجعة الأرشيف من الإعدادات", "success", 5000);
      setExpandedId(null);
      load();
    } catch {
      setEditError("مفيش اتصال بالإنترنت، حاول تاني");
    } finally {
      setArchivingId(null);
    }
  };

  const remove = async (d: Debt) => {
    const res = await fetch(`/api/debts/${d.id}`, { method: "DELETE" });
    setConfirmDelete(null);
    setDeleteConfirmWord("");
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

  // Round 25 (2nd fix) — "الرابط بيظهر ملزوق بالكلمة اللي جمبه فمش بيفتح
  // غير لما تمسحها": some paste targets (WhatsApp compose box, certain
  // Android share sheets) collapse/drop a bare "\n" line break, which glues
  // the label straight onto "https://..." with no separating character at
  // all — most link auto-detectors require whitespace immediately before a
  // URL, so a glued "رابط شاهدhttps://..." never linkifies. Fixed by always
  // keeping an explicit space (": ") between label and link IN ADDITION TO
  // the newline, so even in the worst case (newline stripped entirely) the
  // link still has a real space right before it and stays clickable.
  // Round 34 — "لما بنسخه من الويب بيظهر اسم لينك الشاهد فا لازم امسحها ب
  // أيدي": copyLink/shareLink used to bake the human-readable label
  // ("رابط شاهد — أحمد: ") directly into the copied/shared STRING. A
  // native share sheet (mobile) usually shows title/text as a separate
  // preview line and just hands the receiving app a clean link, so the
  // label "disappeared" there — but the plain web clipboard fallback
  // copies that whole string verbatim, so the label landed in the paste
  // target glued to the URL and had to be deleted by hand. Now copyLink
  // copies ONLY the bare URL (always paste-clean), and shareLink passes
  // the label as a separate `text`/`title` field to navigator.share so
  // richer share targets can still show a friendly label without it ever
  // being part of the copied/pasted link itself.
  const copyLink = async (l: { url: string }, _label: string) => {
    const ok = await copyText(l.url);
 setCopyMsg(ok ?"تم نسخ الرابط":`تعذّر النسخ التلقائي — الرابط: ${l.url}`);
    setTimeout(() => setCopyMsg(""), ok ? 2500 : 8000);
  };

  const shareLink = async (l: { url: string }, label: string) => {
    const ok = await shareText(label, l.url);
    if (!ok) await copyLink(l, label);
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

  const resetAdvForm = () => {
    setAdvForm({
      person_id: "", new_person: "", phone: "", address: "", id_number: "", id_photo_front: null,
      title: "", reason: "", amount: "", value_type: "currency", metal_karat: "", unit_label: "",
      currency: "EGP", debt_date: todayISO(), due_date: "", witness_mode: "two_men",
      creditor_name: "", debtor_name: "",
    });
    setExtractSuggestion(null);
  };

  const submitAdvanced = async () => {
    if (!advForm.person_id && !advForm.new_person.trim()) { setAdvWarning("لازم تختار شخص أو تكتب اسم جديد"); return; }
    if (!advForm.creditor_name.trim() || !advForm.debtor_name.trim()) { setAdvWarning("لازم تكتب اسم الدائن واسم المدين"); return; }
    if (!advForm.title.trim()) { setAdvWarning("اسم الدين لازم يتملى"); return; }
    if (!advForm.amount || parseFloat(advForm.amount) <= 0) { setAdvWarning("المبلغ لازم يتملى برقم أكبر من صفر"); return; }
    if (advForm.value_type === "gold" && !advForm.metal_karat) { setAdvWarning("لازم تحدد عيار الدهب"); return; }
    if (advForm.phone && !isValidPhone(advForm.phone)) { setAdvWarning("رقم موبايل الطرف التاني غير صالح"); return; }
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
          creditor_name: advForm.creditor_name,
          debtor_name: advForm.debtor_name,
          // no witness data sent — each witness fills their own name/phone/
          // address/photo when they open their own link (see
          // /app/debt/[token]/page.tsx); the API pads empty-slot witness
          // rows itself based on witness_mode's count.
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
      const html = `
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
          ${
            d.is_advanced
              ? `<div style="display:flex;justify-content:space-between;"><span>الدائن</span><b>${d.creditor_name || (d.direction === "owed_to_me" ? "أنا" : d.people?.name || "")}</b></div>
                 <div style="display:flex;justify-content:space-between;"><span>المدين</span><b>${d.debtor_name || (d.direction === "owed_to_me" ? d.people?.name || "" : "أنا")}</b></div>`
              : `<div style="display:flex;justify-content:space-between;"><span>الشخص</span><b>${d.people?.name || ""}</b></div>`
          }
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
          d.is_advanced && (exportIncludePhones || exportIncludeAddresses)
            ? `<div style="border-top:1px solid #e5e7eb;margin-top:10px;padding-top:10px;">
                 <p style="font-size:12px;font-weight:700;margin:0 0 6px;">بيانات ${d.direction === "owed_to_me" ? "المدين" : "الدائن"}</p>
                 <div style="font-size:11px;color:#6b7280;line-height:1.8;">
 ${exportIncludePhones && d.people?.phone ?`<div> ${d.people.phone}</div>`:""}
 ${exportIncludeAddresses && d.people?.address ?`<div> ${d.people.address}</div>`:""}
                 </div>
               </div>`
            : ""
        }
        ${
          d.is_advanced && exportIncludePhotos && d.people?.id_photo_front
            ? `<div style="border-top:1px solid #e5e7eb;margin-top:10px;padding-top:10px;">
                 <p style="font-size:12px;font-weight:700;margin:0 0 6px;">صورة بطاقة ${d.direction === "owed_to_me" ? "المدين" : "الدائن"}</p>
                 <img src="${d.people.id_photo_front}" style="width:100%;max-height:160px;object-fit:cover;border-radius:8px;" />
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
 const status = link?.acknowledged_at ?"أشهد":"لسه ماأشهدش";
                     const name = w.name?.trim() || `شاهد ${w.slot_index}`;
 const contact = [exportIncludePhones && w.phone ?`${w.phone}`:"", exportIncludeAddresses && w.address ?`${w.address}`:""].filter(Boolean).join("·");
                     return `
                       <div style="display:flex;justify-content:space-between;font-size:11px;color:#6b7280;padding:2px 0;"><span>${name}</span><b>${status}</b></div>
                       ${contact ? `<div style="font-size:10px;color:#9ca3af;padding:0 0 4px;">${contact}</div>` : ""}
                       ${exportIncludePhotos && w.id_photo_front ? `<img src="${w.id_photo_front}" style="width:100%;max-height:140px;object-fit:cover;border-radius:8px;margin-bottom:6px;" />` : ""}
                     `;
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
      // Round 48 — بناء الالتقاط + الـPDF بقى جوه lib/pdfExport.ts (نفس نقطة
      // الإصلاح المشتركة لكل تصديرات التطبيق — يحل "الصندوق الفاضي" ويقلل
      // حجم الملف). html2canvas-pro (بدل html2canvas العادي) لسه مستخدم
      // جوه الملف المشترك عشان يدعم ألوان oklch/lab اللي Tailwind v4 بيولّدها.
      const canvas = await renderHtmlToCanvas(html, 380);

      const filenameBase = `دين-${(d.people?.name || "").trim()}-${d.title}`.replace(/[\\/:*?"<>|]/g, "").slice(0, 60);
      if (format === "image") {
        const dataUrl = canvas.toDataURL("image/png");
        await shareFile(dataUrl, `${filenameBase}.png`);
      } else {
        const pdf = await canvasToPdf(canvas);
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
            onClick={() => {
              setShowAdvancedForm((s) => {
                const opening = !s;
                if (opening) {
                  // prefill (never overwrite an already-typed value) — "my"
                  // side defaults to the account name, the other side is left
                  // blank until a person is picked/typed (see onChange below)
                  setAdvForm((f) => ({
                    ...f,
                    creditor_name: f.creditor_name || (tab === "owed_to_me" ? myAccountName : ""),
                    debtor_name: f.debtor_name || (tab === "i_owe" ? myAccountName : ""),
                  }));
                }
                return opening;
              });
              setShowForm(false);
              setAdvWarning("");
            }}
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
          <div>
            <label className="text-[10px] text-neutral-400">نوع الدين</label>
            <select value={form.value_type} onChange={(e) => setForm({ ...form, value_type: e.target.value as any })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
              <option value="currency">مبلغ مالي</option>
              <option value="gold">ذهب</option>
              <option value="silver">فضة</option>
              <option value="other">قيمة أخرى (بضاعة، إلخ)</option>
            </select>
          </div>
          {form.value_type === "currency" ? (
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="المبلغ" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
                <option value="EGP">جنيه</option>
                <option value="USD">دولار</option>
                <option value="SAR">ريال</option>
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <input placeholder={form.value_type === "other" ? "الكمية" : "الوزن (جرام)"} type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
              {form.value_type === "gold" ? (
                <select value={form.metal_karat} onChange={(e) => setForm({ ...form, metal_karat: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
                  <option value="">العيار</option>
                  <option value="18">عيار 18</option>
                  <option value="21">عيار 21</option>
                  <option value="24">عيار 24</option>
                </select>
              ) : (
                <input placeholder="وحدة القياس (مثال: كرتونة)" value={form.unit_label} onChange={(e) => setForm({ ...form, unit_label: e.target.value })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
              )}
            </div>
          )}
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

          <div className="space-y-2 bg-neutral-50 dark:bg-neutral-900/60 rounded-lg p-2.5">
            <p className="text-xs font-semibold text-neutral-500">اسم الدائن واسم المدين اللي هيتكتبوا في المستند/التصدير</p>
            <p className="text-[10px] text-neutral-400 leading-relaxed">
              اكتبهم زي ما تحب يظهروا بالظبط — دول مش لازم يطابقوا الاسم المسجل في البرنامج (اللي أحيانًا بيبقى انجلش أو اسم مستعار).
            </p>
            <div>
              <label className="text-[10px] text-neutral-400">اسم الدائن</label>
              <input
                placeholder="اسم الدائن"
                value={advForm.creditor_name}
                onChange={(e) => setAdvForm({ ...advForm, creditor_name: e.target.value })}
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] text-neutral-400">اسم المدين</label>
              <input
                placeholder="اسم المدين"
                value={advForm.debtor_name}
                onChange={(e) => setAdvForm({ ...advForm, debtor_name: e.target.value })}
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-neutral-500">بيانات {tab === "owed_to_me" ? "المدين" : "صاحب الدين"} (للرابط والتواصل معاه)</p>
            <select
              value={advForm.person_id}
              onChange={(e) => {
                const pid = e.target.value;
                const picked = people.find((p) => p.id === pid);
                setAdvForm((f) => {
                  const otherPartyKey = tab === "owed_to_me" ? "debtor_name" : "creditor_name";
                  // prefill the "other party" name from the picked person — but
                  // never overwrite something already typed by hand.
                  const shouldFill = picked && !f[otherPartyKey].trim();
                  return { ...f, person_id: pid, ...(shouldFill ? { [otherPartyKey]: picked!.name } : {}) };
                });
              }}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
            >
              <option value="">-- اختار شخص أو ضيف جديد تحت --</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {!advForm.person_id && (
              <input
                placeholder="الاسم بالكامل"
                value={advForm.new_person}
                onChange={(e) => {
                  const name = e.target.value;
                  setAdvForm((f) => {
                    const otherPartyKey = tab === "owed_to_me" ? "debtor_name" : "creditor_name";
                    const shouldFill = !f[otherPartyKey].trim() || f[otherPartyKey] === f.new_person;
                    return { ...f, new_person: name, ...(shouldFill ? { [otherPartyKey]: name } : {}) };
                  });
                }}
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
              />
            )}
            <input placeholder="رقم الموبايل (اختياري — بيستخدم لاكتشاف حسابه ولإرسال الإشعار)" value={advForm.phone} onChange={(e) => setAdvForm({ ...advForm, phone: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
            <input placeholder="العنوان (اختياري)" value={advForm.address} onChange={(e) => setAdvForm({ ...advForm, address: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
            <input placeholder="الرقم القومي (اختياري)" value={advForm.id_number} onChange={(e) => setAdvForm({ ...advForm, id_number: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />

            <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 cursor-pointer">
              <Camera size={14} />
 {advForm.id_photo_front ?"صورة البطاقة اتصورت — دوس لتغييرها":"صورة وش البطاقة (اختياري)"}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onAdvIdPhotoPicked(f); }} />
            </label>
            {advForm.id_photo_front && (
              <button type="button" disabled={extracting} onClick={extractFromPhoto} className="w-full flex items-center justify-center gap-1.5 text-xs border border-orange-300 dark:border-orange-800 text-orange-600 dark:text-orange-400 rounded-lg py-2 disabled:opacity-60">
                <ScanLine size={13} /> {extracting ? AI_LOADING_TEXT : "استخرج البيانات من الصورة"}
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

          <div className="space-y-2 border-t border-neutral-200 dark:border-neutral-800 pt-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-neutral-500">الشهود</p>
              <select value={advForm.witness_mode} onChange={(e) => setAdvForm({ ...advForm, witness_mode: e.target.value as any })} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1 text-xs">
                <option value="two_men">رجلين</option>
                <option value="man_two_women">رجل وامرأتان</option>
              </select>
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              مش هتكتب بيانات الشهود بنفسك — بعد الحفظ هيتولّدلك رابط منفصل لكل شاهد، وانت بس تبعته له (واتساب مثلاً). لما هو يفتح الرابط، هيشوف "الدائن والمدين طالبين شهادتك على الدين" ويملا اسمه وبياناته بنفسه ويشهد.
            </p>
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
                <span className="flex items-center gap-2 shrink-0">
                  <button onClick={() => copyLink(l, LINK_ROLE_LABEL[l.role] || l.role)} className="flex items-center gap-1 text-orange-600 dark:text-orange-400"><Copy size={12} /> نسخ</button>
                  <button onClick={() => shareLink(l, LINK_ROLE_LABEL[l.role] || l.role)} className="flex items-center gap-1 text-orange-600 dark:text-orange-400"><Share2 size={12} /> مشاركة</button>
                </span>
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
            <Card key={d.id} className={`!p-0 overflow-hidden ${d.is_advanced ? "ring-1 ring-violet-300 dark:ring-violet-800" : ""}`}>
              <button className="w-full text-right p-4" onClick={() => toggleExpand(d)}>
                {d.is_advanced && (
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-violet-600 dark:text-violet-400 mb-1.5">
                    <ShieldCheck size={12} /> تسجيل متقدم — شهود ورابط حي · تفاصيله (عرض وتصدير)
                  </div>
                )}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-sm">{d.people?.name} — {d.title}</p>
                    {d.reason && <p className="text-xs text-neutral-400">{d.reason}</p>}
                    {d.value_type && d.value_type !== "currency" && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium mt-0.5">
                        {VALUE_TYPE_LABEL[d.value_type]}{d.value_type === "gold" && d.metal_karat ? ` — عيار ${d.metal_karat}` : ""}
                      </p>
                    )}
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

                  {(d.status === "open" || d.status === "overdue") && (
                    <div className="flex gap-2">
                      <button onClick={() => { setPayFor(d); setPayMode("partial"); setPayAmount(""); setPayUseAccount(null); setPayAccountId(""); setReceiptDataUrl(null); setPayError(""); }} className="flex-1 text-xs bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300 rounded-lg py-2">
                        تسجيل سداد جزئي
                      </button>
                      {/* Round 47 — "اعمل متاح على كل دين مكتوب عليه تم سدد
                          الدين": تسوية الدين بالكامل بضغطة واحدة، مع سؤال
                          الحساب (خصم/إضافة) جوه نفس مودال السداد تحت. */}
                      <button onClick={() => { setPayFor(d); setPayMode("full"); setPayAmount(String(d.remaining_amount)); setPayUseAccount(null); setPayAccountId(""); setReceiptDataUrl(null); setPayError(""); }} className="flex-1 flex items-center justify-center gap-1 text-xs bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded-lg py-2">
                        <CheckCircle2 size={13} /> تم سداد الدين
                      </button>
                    </div>
                  )}
                  {/* Round 48 — مفتاح أرشفة يدوي لأي دين مقفول (مسدد أو
                      معدوم) لسه مش في الأرشيف — شبكة أمان لو الأرشفة
                      التلقائية (وقت السداد الكامل) متطبقتش (زي ديون قديمة
                      من قبل الميزة دي، أو دين اتعمل عليه معدوم يدوي). */}
                  {(d.status === "paid" || d.status === "written_off") && (
                    <button
                      disabled={archivingId === d.id}
                      onClick={() => archiveDebt(d.id)}
                      className="w-full flex items-center justify-center gap-1.5 text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 rounded-lg py-2 disabled:opacity-60"
                    >
                      <Archive size={13} /> {archivingId === d.id ? "جاري النقل..." : "نقل إلى الأرشيف"}
                    </button>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(d.id)} className="flex-1 flex items-center justify-center gap-1 text-xs bg-orange-600 text-white rounded-lg py-2">
                      <Pencil size={13} /> حفظ التعديل
                    </button>
                    <button onClick={() => setConfirmDelete(d)} className="flex items-center justify-center gap-1 text-xs bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 rounded-lg py-2 px-3">
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <button
                    onClick={() => { setExportFor(d); setExportIncludeAyah(true); setExportIncludePhones(false); setExportIncludeAddresses(false); setExportIncludePhotos(false); setExportError(""); }}
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
                                  <button onClick={() => shareLink(l, LINK_ROLE_LABEL[l.role])} className="text-orange-600 dark:text-orange-400"><Share2 size={12} /></button>
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
                                <span>{w.name?.trim() || `شاهد ${w.slot_index} — لسه ما دخلش بياناته`}</span>
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
                                      <button onClick={() => copyLink(link, `دعوة شهادة على دين${w.name?.trim() ? ` — ${w.name}` : ""}`)} className="text-orange-600 dark:text-orange-400"><Copy size={12} /></button>
                                      <button onClick={() => shareLink(link, `دعوة شهادة على دين${w.name?.trim() ? ` — ${w.name}` : ""}`)} className="text-orange-600 dark:text-orange-400"><Share2 size={12} /></button>
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
          <div className="bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-4 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-sm">{payMode === "full" ? "تم سداد الدين بالكامل" : "سداد جزئي"} — {payFor.title}</p>
            <p className="text-xs text-neutral-400">الباقي: {fmt(Number(payFor.remaining_amount), payFor.currency)}</p>
            {payMode === "partial" && (
              <input autoFocus type="number" placeholder="المبلغ المدفوع" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
            )}

            {/* Round 47 — "يسألني لو الدين عليا يقولي خصم من حساب نعم/لا...
                لو مستحقات لي... يقولي أضيفه لحسابك لا/نعم اختيار الحساب" */}
            <div className="space-y-1.5 bg-neutral-50 dark:bg-neutral-900/60 rounded-lg p-2.5">
              <p className="text-xs font-medium">
                {payFor.direction === "i_owe" ? "تخصم المبلغ ده من حساب؟" : "تضيف المبلغ ده لحسابك؟"}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPayUseAccount(true)}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-medium ${payUseAccount === true ? "bg-orange-600 text-white" : "border border-neutral-300 dark:border-neutral-700"}`}
                >
                  نعم
                </button>
                <button
                  onClick={() => { setPayUseAccount(false); setPayAccountId(""); }}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-medium ${payUseAccount === false ? "bg-orange-600 text-white" : "border border-neutral-300 dark:border-neutral-700"}`}
                >
                  لا
                </button>
              </div>
              {payUseAccount === true && (
                accounts.length > 0 ? (
                  <select value={payAccountId} onChange={(e) => setPayAccountId(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
                    <option value="">-- اختار الحساب --</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-[11px] text-neutral-400">مفيش حسابات مسجلة — أضف حساب من صفحة الحسابات الأول</p>
                )
              )}
            </div>

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
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={() => { setConfirmDelete(null); setDeleteConfirmWord(""); }}>
          <div className="bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-sm">تأكيد الحذف</p>
            <p className="text-xs text-neutral-500">
              هتحذف دين "{confirmDelete.title}" مع كل تفاصيل السداد الخاصة بيه. الإجراء ده مش قابل للتراجع.
              {confirmDelete.is_advanced && " هيوصل إشعار لكل الأطراف (الطرف التاني والشهود اللي عندهم حساب FlowCash) إن الدين اتلغى."}
            </p>
            <div>
              <label className="text-[10px] text-neutral-400">اكتب كلمة idea في المربع علشان يتم الحذف</label>
              <input
                value={deleteConfirmWord}
                onChange={(e) => setDeleteConfirmWord(e.target.value)}
                placeholder="idea"
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setConfirmDelete(null); setDeleteConfirmWord(""); }} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm">إلغاء</button>
              <button
                disabled={deleteConfirmWord.trim().toLowerCase() !== "idea"}
                onClick={() => remove(confirmDelete)}
                className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-40"
              >
                حذف نهائي
              </button>
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
            {exportFor.is_advanced && (
              <div className="space-y-1.5 border-t border-neutral-100 dark:border-neutral-800 pt-2">
                <p className="text-[10px] text-neutral-400">بيانات إضافية (الطرف التاني + الشهود) — كل واحدة بسويتش منفصل</p>
                <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
                  <input type="checkbox" checked={exportIncludePhones} onChange={(e) => setExportIncludePhones(e.target.checked)} />
                  إرفاق أرقام الهواتف
                </label>
                <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
                  <input type="checkbox" checked={exportIncludeAddresses} onChange={(e) => setExportIncludeAddresses(e.target.checked)} />
                  إرفاق العناوين
                </label>
                <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
                  <input type="checkbox" checked={exportIncludePhotos} onChange={(e) => setExportIncludePhotos(e.target.checked)} />
                  إرفاق صور البطاقات
                </label>
              </div>
            )}
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
