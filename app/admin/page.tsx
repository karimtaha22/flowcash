"use client";
import { useEffect, useState } from "react";
import Card from "@/components/Card";
import Footer from "@/components/Footer";
import Link from "next/link";
import { PAGE_KEYS, PAGE_LABELS, computeLicenseStatus, type PageKey } from "@/lib/license";
import { BadgeCheck } from "lucide-react";

// نسخة نصية بس من lib/gemini.ts's DEFAULT_MODEL — متعمّد إننا منستوردش
// lib/gemini.ts هنا (ملف "use client") عشان هو نفسه بيعمل dynamic import
// لـ supabaseAdmin (service role)، وأحسن ميتلمش ببندل العميل خالص حتى لو
// نظريًا lazy.
const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

interface AdminUser {
  id: string;
  name: string;
  base_currency: string;
  telegram_bot_username: string | null;
  telegram_chat_id: string | null;
  google_sheet_id: string | null;
  is_family: boolean;
  parent_user_id: string | null;
  debt_reminder_hour: number | null;
  recurring_reminder_hour: number | null;
  is_admin?: boolean | null;
  email?: string | null;
  phone?: string | null;
  is_verified?: boolean | null;
  license_code?: string | null;
  license_type?: "trial" | "permanent" | null;
  license_started_at?: string | null;
  license_expires_at?: string | null;
  license_allowed_pages?: string[] | null;
  license_redeemed_at?: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  admin: "حساب إدارة",
  unmanaged: "بدون ترخيص (وصول كامل)",
  unredeemed: "كود لسه ماتفعّلش",
  expired: "منتهي",
  active: "شغال",
};

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => `${h.toString().padStart(2, "0")}:00`;

interface LogEntry {
  id: string;
  user_id: string | null;
  source: string;
  action: string;
  payload: Record<string, any> | null;
  status: string;
  created_at: string;
  app_users?: { name: string } | null;
}

const SOURCE_LABEL: Record<string, string> = { app: "التطبيق", bot: "تليجرام", sheet: "شيت", voice: "صوت", ocr: "إيصال", admin: "الإعداد", system: "النظام" };
const ACTION_LABEL: Record<string, string> = {
  transaction_created: "إضافة حركة",
  transaction_updated: "تعديل حركة",
  transaction_deleted: "حذف حركة",
  account_created: "إضافة حساب",
  account_updated: "تعديل حساب",
  account_archived: "أرشفة حساب",
};

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [newUser, setNewUser] = useState({ name: "", pin: "", is_family: false, parent_user_id: "" });
  const [editing, setEditing] = useState<Record<string, any>>({});
  const [msg, setMsg] = useState("");
  // Global bot status now (one shared bot for every customer) — was
  // per-customer before (Record<id, ...>) back when each customer had their
  // own bot token. See "بوت تليجرام المركزي" card below and
  // /api/admin/telegram-setup.
  const [sharedBotStatus, setSharedBotStatus] = useState<any>(null);
  const [sharedBotBusy, setSharedBotBusy] = useState(false);
  const [geminiStatus, setGeminiStatus] = useState<any>(null);
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [geminiModelInput, setGeminiModelInput] = useState("");
  const [geminiBusy, setGeminiBusy] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState<any>(null);
  const [geminiMsg, setGeminiMsg] = useState("");
  const [locked, setLocked] = useState(false);
  const [checkedAccess, setCheckedAccess] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logUserFilter, setLogUserFilter] = useState("");
  const [logsExhausted, setLogsExhausted] = useState(false);

  const [newLicense, setNewLicense] = useState<{ name: string; email: string; type: "trial" | "permanent"; days: string; allowed_pages: PageKey[] }>({
    name: "",
    email: "",
    type: "trial",
    days: "14",
    allowed_pages: [],
  });
  const [licenseBusy, setLicenseBusy] = useState(false);
  const [lastIssuedCode, setLastIssuedCode] = useState<{ name: string; code: string } | null>(null);
  const [licenseEdit, setLicenseEdit] = useState<Record<string, { type: "trial" | "permanent"; days: string; lifetime: boolean; allowed_pages: PageKey[]; email: string }>>({});
  const [licenseEditOpen, setLicenseEditOpen] = useState<Record<string, boolean>>({});
  const [licenseBusyId, setLicenseBusyId] = useState<Record<string, boolean>>({});
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [broadcastBusy, setBroadcastBusy] = useState(false);

  // /admin is also gated server-side now (see app/admin/layout.tsx) — this
  // client-side check is defense-in-depth, not the only line of defense.
  // Deliberately FAILS CLOSED: `locked` starts true and only clears on an
  // explicit successful (200 + real data) response. A 401, a network error,
  // a timeout, anything other than a clean success — all leave the page
  // showing the login-required screen instead of an open (if empty-looking)
  // admin panel.
  const load = () =>
    fetch("/api/admin/users")
      .then((r) => {
        if (!r.ok) { setLocked(true); setCheckedAccess(true); return null; }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        setUsers(d.users || []);
        setLocked(false);
        setCheckedAccess(true);
      })
      .catch(() => { setLocked(true); setCheckedAccess(true); });
  useEffect(() => { load(); }, []);

  // "React error #310" (رصدت ديسمبر — Round 31 postmortem): كان الـ useEffect
  // ده متعرّف بعد الـ early return statements تحت (`if (!checkedAccess) return`
  // و`if (locked) return`) — يعني في أول render (قبل ما checkedAccess/locked
  // يتحددوا) الصفحة كانت بترجع من غير ما توصل للـ hook ده خالص، وفي render
  // بعد كده لما تعدي العودتين المبكرتين كانت بتسجّله لأول مرة — عدد الـ hooks
  // بيختلف من render لتاني، وده بالظبط اللي React بيرفضه ويوقّف الصفحة كلها
  // عن الظهور (رسالة "the page failed to load" اللي واجهها المستخدم). القاعدة:
  // كل الـ hooks (useState/useEffect) لازم تتنادى دايمًا بنفس الترتيب في كل
  // render — أي return مبكر لازم يكون بعد كل الـ hooks، مش قبلهم.
  const loadGeminiStatus = async () => {
    const res = await fetch("/api/admin/gemini-settings");
    const data = await res.json();
    setGeminiStatus(data);
    setGeminiModelInput(data.dbModelOverride || "");
  };
  useEffect(() => { if (!locked && checkedAccess) loadGeminiStatus(); }, [locked, checkedAccess]);

  if (!checkedAccess) {
    return <div className="max-w-md mx-auto p-4 pt-16 text-center text-sm text-neutral-400">جاري التحقق...</div>;
  }

  if (locked) {
    return (
      <div className="max-w-md mx-auto p-4 pt-16 text-center space-y-4">
        <p className="text-lg font-semibold">لازم تسجل دخول الأول</p>
        <p className="text-sm text-neutral-500">صفحة الإعداد بقت محمية دلوقتي — سجل دخول بحسابك الأول عشان تدخلها.</p>
        <Link href="/login" className="inline-block bg-orange-600 text-white rounded-lg px-5 py-2 text-sm font-medium">
          روح صفحة الدخول
        </Link>
      </div>
    );
  }

  const checkSharedBotStatus = async () => {
    setSharedBotBusy(true);
    try {
      const res = await fetch("/api/admin/telegram-setup");
      const data = await res.json();
      setSharedBotStatus(data);
    } finally {
      setSharedBotBusy(false);
    }
  };

  const resyncSharedWebhook = async () => {
    setSharedBotBusy(true);
    try {
      const res = await fetch("/api/admin/telegram-setup", { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        setSharedBotStatus({ ok: false, error: `فشلت إعادة التسجيل: ${data.error}`, computedUrl: data.computedUrl });
      } else {
        await checkSharedBotStatus();
        setSharedBotStatus((s: any) => ({ ...s, resyncMsg: "تم تسجيل الويب هوك ✅ جرب دلوقتي: افتح البوت وابعت /start" }));
      }
    } finally {
      setSharedBotBusy(false);
    }
  };

  const saveGeminiSettings = async (patch: Record<string, any>) => {
    setGeminiBusy(true);
    setGeminiMsg("");
    try {
      const res = await fetch("/api/admin/gemini-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!res.ok) { setGeminiMsg("حصل خطأ ومتحفظش"); return; }
      setGeminiMsg("اتحفظ ✅");
      setGeminiKeyInput("");
      await loadGeminiStatus();
    } finally {
      setGeminiBusy(false);
    }
  };

  const testGemini = async () => {
    setGeminiBusy(true);
    setGeminiTestResult(null);
    try {
      const res = await fetch("/api/admin/gemini-settings/test", { method: "POST" });
      const data = await res.json();
      setGeminiTestResult(data);
    } finally {
      setGeminiBusy(false);
    }
  };

  const loadLogs = async (older = false) => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (logUserFilter) params.set("user_id", logUserFilter);
      if (older && logs.length) params.set("before", logs[logs.length - 1].created_at);
      const res = await fetch(`/api/admin/logs?${params}`);
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || "حصل خطأ في تحميل اللوج"); return; }
      const batch: LogEntry[] = data.logs || [];
      setLogs((prev) => (older ? [...prev, ...batch] : batch));
      setLogsExhausted(batch.length < 50);
    } finally {
      setLogsLoading(false);
    }
  };

  const openLogs = () => {
    const next = !logsOpen;
    setLogsOpen(next);
    if (next) loadLogs(false);
  };

  const createUser = async () => {
    if (!newUser.name || newUser.pin.length < 4) { setMsg("الاسم و PIN (٤ أرقام على الأقل) مطلوبين"); return; }
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUser.is_family ? newUser : { name: newUser.name, pin: newUser.pin }),
    });
    if (res.ok) { setNewUser({ name: "", pin: "", is_family: false, parent_user_id: "" }); setMsg("تم إنشاء المستخدم ✅"); load(); }
    else setMsg("حصل خطأ");
  };

  const saveUserSettings = async (id: string) => {
    const patch = editing[id] || {};
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (res.ok) {
      setMsg("تم الحفظ ✅");
      load();
    } else setMsg("حصل خطأ في الحفظ");
  };

  const togglePage = (list: PageKey[], key: PageKey): PageKey[] =>
    list.includes(key) ? list.filter((p) => p !== key) : [...list, key];

  const createLicense = async () => {
    if (!newLicense.name.trim()) { setMsg("اكتب اسم العميل الأول"); return; }
    if (newLicense.type === "trial" && (!newLicense.days || Number(newLicense.days) <= 0)) {
      setMsg("اكتب عدد أيام التجربة"); return;
    }
    setLicenseBusy(true);
    try {
      const res = await fetch("/api/admin/licenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newLicense.name.trim(),
          email: newLicense.email.trim(),
          type: newLicense.type,
          days: newLicense.days ? Number(newLicense.days) : null,
          allowed_pages: newLicense.allowed_pages,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || "حصل خطأ في إصدار الكود"); return; }
      setLastIssuedCode({ name: newLicense.name.trim(), code: data.code });
      setMsg(`تم إصدار الكود ✅ — ${data.code}`);
      setNewLicense({ name: "", email: "", type: "trial", days: "14", allowed_pages: [] });
      load();
    } finally {
      setLicenseBusy(false);
    }
  };

  const openLicenseEdit = (u: AdminUser) => {
    setLicenseEditOpen((s) => ({ ...s, [u.id]: !s[u.id] }));
    if (!licenseEdit[u.id]) {
      const daysLeft = u.license_expires_at ? Math.max(1, Math.ceil((new Date(u.license_expires_at).getTime() - Date.now()) / 86_400_000)) : "";
      setLicenseEdit((s) => ({
        ...s,
        [u.id]: {
          type: (u.license_type as "trial" | "permanent") || "permanent",
          days: u.license_expires_at ? String(daysLeft) : "",
          lifetime: !u.license_expires_at,
          allowed_pages: ((u.license_allowed_pages || []) as PageKey[]),
          email: u.email || "",
        },
      }));
    }
  };

  const saveLicenseEdit = async (id: string) => {
    const edit = licenseEdit[id];
    if (!edit) return;
    setLicenseBusyId((s) => ({ ...s, [id]: true }));
    try {
      const res = await fetch(`/api/admin/licenses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: edit.type,
          days: edit.lifetime ? null : Number(edit.days) || null,
          allowed_pages: edit.allowed_pages,
          email: edit.email,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || "حصل خطأ في تعديل الترخيص"); return; }
      setMsg("تم تعديل الترخيص ✅");
      load();
    } finally {
      setLicenseBusyId((s) => ({ ...s, [id]: false }));
    }
  };

  const convertToPermanent = (u: AdminUser) => {
    setLicenseEdit((s) => ({
      ...s,
      [u.id]: {
        type: "permanent",
        days: "365",
        lifetime: false,
        allowed_pages: ((u.license_allowed_pages || []) as PageKey[]),
        email: u.email || "",
      },
    }));
    setLicenseEditOpen((s) => ({ ...s, [u.id]: true }));
  };

  const deleteCustomer = async (u: AdminUser) => {
    setLicenseBusyId((s) => ({ ...s, [u.id]: true }));
    try {
      const res = await fetch(`/api/admin/licenses/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete" }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || "حصل خطأ في حذف العميل"); return; }
      setMsg(`تم إنهاء اشتراك ${u.name} — بياناته هتفضل محفوظة ٣٠ يوم قبل ما تتمسح نهائي`);
      load();
    } finally {
      setLicenseBusyId((s) => ({ ...s, [u.id]: false }));
    }
  };

  const sendBroadcast = async () => {
    if (!broadcastMsg.trim()) { setMsg("اكتب الرسالة الأول"); return; }
    setBroadcastBusy(true);
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: broadcastMsg.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || "حصل خطأ في إرسال الرسالة"); return; }
      setMsg(`تم إرسال الرسالة لكل العملاء ✅ (تليجرام: ${data.telegramSent} وصلت${data.telegramFailed ? `، ${data.telegramFailed} فشلت` : ""})`);
      setBroadcastMsg("");
    } finally {
      setBroadcastBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-orange-700 dark:text-orange-400">FlowCash — صفحة الإعداد (Admin)</h1>
        <p className="text-sm text-neutral-500 mt-1">من هنا تضيف نفسك كمستخدم، وتربط بوت التليجرام والشيت الخاصين بيك.</p>
      </div>

      {msg && <Card className="text-sm bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300 whitespace-pre-wrap break-all">{msg}</Card>}

      <Card className="space-y-3">
        <h2 className="font-semibold">بوت تليجرام المركزي</h2>
        <p className="text-xs text-neutral-500 leading-relaxed">
          بوت واحد بتاعك يستخدمه كل العملاء (مش بوت منفصل لكل عميل). اعمل بوت مرة واحدة من @BotFather على تليجرام، وسجّل في Vercel متغيرين: <code className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded">TELEGRAM_BOT_TOKEN</code> (التوكن) و<code className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded">TELEGRAM_BOT_USERNAME</code> (يوزر البوت من غير @). بعدها دوس "سجّل الويب هوك" هنا مرة واحدة بس. أي عميل بعد كده بيربط حسابه بنفسه من الإعدادات عنده — من غير ما تعمل أي حاجة يدويًا لأي عميل.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={sharedBotBusy}
            onClick={checkSharedBotStatus}
            className="flex-1 border border-neutral-300 dark:border-neutral-700 rounded-lg py-1.5 text-xs disabled:opacity-50"
          >
            {sharedBotBusy ? "جاري الفحص..." : "افحص حالة البوت"}
          </button>
          <button
            type="button"
            disabled={sharedBotBusy}
            onClick={resyncSharedWebhook}
            className="flex-1 border border-orange-300 dark:border-orange-800 text-orange-600 dark:text-orange-400 rounded-lg py-1.5 text-xs disabled:opacity-50"
          >
            سجّل الويب هوك
          </button>
        </div>
        {sharedBotStatus && (
          <div className={`text-xs rounded-lg p-2 space-y-1 whitespace-pre-wrap break-all ${sharedBotStatus.ok && !sharedBotStatus.hasErrors ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300" : "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400"}`}>
            {sharedBotStatus.resyncMsg && <p className="text-green-700 dark:text-green-300">{sharedBotStatus.resyncMsg}</p>}
            {!sharedBotStatus.ok && (
              <>
                <p>خطأ: {sharedBotStatus.error}</p>
                {sharedBotStatus.computedUrl && <p>الرابط اللي اتحاول تسجيله: {sharedBotStatus.computedUrl}</p>}
              </>
            )}
            {sharedBotStatus.ok && (
              <>
                <p>الرابط المسجل عند تليجرام: {sharedBotStatus.url ? <code className="break-all">{sharedBotStatus.url}</code> : "مفيش رابط متسجل خالص ⚠️"}</p>
                {sharedBotStatus.hasErrors && (
                  <p>آخر خطأ من تليجرام: {sharedBotStatus.last_error_message} {sharedBotStatus.last_error_date ? `(${new Date(sharedBotStatus.last_error_date).toLocaleString("ar-EG")})` : ""}</p>
                )}
                {!sharedBotStatus.hasErrors && sharedBotStatus.url && <p>الويب هوك شغال وملوش أخطاء ✅</p>}
                <p>رسائل واقفة معلقة: {sharedBotStatus.pending_update_count}</p>
              </>
            )}
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">التحقق بالذكاء الاصطناعي (Gemini)</h2>
        <p className="text-xs text-neutral-500 leading-relaxed">
          المفتاح والموديل بييجوا افتراضيًا من <code className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded">GEMINI_API_KEY</code>/<code className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded">GEMINI_MODEL</code> في Vercel، لكن تقدر تغيّرهم من هنا مباشرة من غير ما تحتاج ريدبلوي — اللي تحفظه هنا بيبقى له الأولوية.
        </p>
        {geminiStatus && (
          <div className={`text-xs rounded-lg p-2 space-y-1 ${geminiStatus.hasKey ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300" : "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400"}`}>
            <p>المفتاح: {geminiStatus.hasKey ? `متسجل ✅ (${geminiStatus.keySource === "db" ? "من هنا" : "من Vercel"})` : "مش متسجل خالص ⚠️"}</p>
            <p>الموديل الفعلي دلوقتي: <code className="break-all">{geminiStatus.effectiveModel}</code></p>
          </div>
        )}
        <div>
          <label className="text-[10px] text-neutral-400">مفتاح Gemini جديد (سيبه فاضي لو مش هتغيّره)</label>
          <input
            type="password"
            placeholder="AIza..."
            value={geminiKeyInput}
            onChange={(e) => setGeminiKeyInput(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-[10px] text-neutral-400">الموديل (سيبه فاضي عشان يرجع للافتراضي الذكي — {DEFAULT_GEMINI_MODEL})</label>
          <input
            placeholder={DEFAULT_GEMINI_MODEL}
            value={geminiModelInput}
            onChange={(e) => setGeminiModelInput(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={geminiBusy}
            onClick={() => saveGeminiSettings({ ...(geminiKeyInput ? { gemini_api_key: geminiKeyInput } : {}), gemini_model: geminiModelInput })}
            className="flex-1 bg-orange-600 text-white rounded-lg py-1.5 text-xs disabled:opacity-50"
          >
            احفظ
          </button>
          <button type="button" disabled={geminiBusy} onClick={testGemini} className="flex-1 border border-neutral-300 dark:border-neutral-700 rounded-lg py-1.5 text-xs disabled:opacity-50">
            {geminiBusy ? "جاري الاختبار..." : "اختبر النموذج"}
          </button>
        </div>
        {geminiMsg && <p className="text-xs text-center text-neutral-500">{geminiMsg}</p>}
        {geminiTestResult && (
          <div className={`text-xs rounded-lg p-2 ${geminiTestResult.ok ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300" : "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400"}`}>
            {geminiTestResult.ok ? `شغال ✅ (${geminiTestResult.model}) — الرد: "${geminiTestResult.reply}"` : `فشل (${geminiTestResult.model}): ${geminiTestResult.error}`}
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">إصدار كود ترخيص لعميل جديد (SaaS)</h2>
        <p className="text-xs text-neutral-500">
          العميل بياخد الكود ده وياخد ب بينه PIN من صفحة "تفعيل الحساب" (/activate). لو نسيت تحدد صفحات، الحساب بيتقفل كله للقراءة فقط لحد ما تحدد.
        </p>
        <input
          placeholder="اسم العميل"
          value={newLicense.name}
          onChange={(e) => setNewLicense({ ...newLicense, name: e.target.value })}
          className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
        />
        <div>
          <input
            type="email"
            placeholder="إيميل العميل (اختياري — لو نسي كود التفعيل هيتبعتله عليه)"
            value={newLicense.email}
            onChange={(e) => setNewLicense({ ...newLicense, email: e.target.value })}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
          />
          <p className="text-[10px] text-neutral-400 mt-1">
            لو سبته فاضي، مش هيقدر يسترجع الكود لوحده لو نسيه — هيحتاج يتواصل معاك.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setNewLicense({ ...newLicense, type: "trial" })}
            className={`flex-1 rounded-lg py-2 text-xs border ${newLicense.type === "trial" ? "bg-orange-600 text-white border-orange-600" : "border-neutral-300 dark:border-neutral-700"}`}
          >
            نسخة تجريبية
          </button>
          <button
            type="button"
            onClick={() => setNewLicense({ ...newLicense, type: "permanent" })}
            className={`flex-1 rounded-lg py-2 text-xs border ${newLicense.type === "permanent" ? "bg-orange-600 text-white border-orange-600" : "border-neutral-300 dark:border-neutral-700"}`}
          >
            عميل دائم
          </button>
        </div>
        <div>
          <label className="text-[10px] text-neutral-400">
            {newLicense.type === "trial" ? "مدة التجربة (بالأيام)" : "مدة الاشتراك (بالأيام) — سيبها فاضية لمدى الحياة"}
          </label>
          <input
            type="number"
            min={1}
            placeholder={newLicense.type === "trial" ? "مثال: 14" : "اسيبها فاضية = مدى الحياة"}
            value={newLicense.days}
            onChange={(e) => setNewLicense({ ...newLicense, days: e.target.value })}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
          />
        </div>
        <div>
          <p className="text-[10px] text-neutral-400 mb-1">الصفحات المفتوحة بالكامل (اللي مش متعلّم عليها بتبقى للقراءة فقط)</p>
          <div className="grid grid-cols-2 gap-1.5">
            {PAGE_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={newLicense.allowed_pages.includes(key)}
                  onChange={() => setNewLicense({ ...newLicense, allowed_pages: togglePage(newLicense.allowed_pages, key) })}
                />
                {PAGE_LABELS[key]}
              </label>
            ))}
          </div>
        </div>
        <button onClick={createLicense} disabled={licenseBusy} className="w-full bg-orange-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
          {licenseBusy ? "جاري الإصدار..." : "إصدار الكود"}
        </button>
        {lastIssuedCode && (
          <div className="text-sm rounded-lg p-3 bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 text-center">
            كود {lastIssuedCode.name}: <span className="font-bold tracking-wider">{lastIssuedCode.code}</span>
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">رسالة عامة لكل العملاء</h2>
        <p className="text-xs text-neutral-500">هتتبعت كإشعار في بوت تليجرام الخاص بكل عميل، وهتظهر كبانر جوه البرنامج لحد ما كل عميل يقفلها.</p>
        <textarea
          placeholder="اكتب الرسالة هنا..."
          value={broadcastMsg}
          onChange={(e) => setBroadcastMsg(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
        />
        <button onClick={sendBroadcast} disabled={broadcastBusy} className="w-full bg-neutral-800 dark:bg-neutral-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
          {broadcastBusy ? "جاري الإرسال..." : "إرسال لكل العملاء"}
        </button>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">١. إنشاء مستخدم جديد</h2>
        <p className="text-xs text-neutral-500">
          ده لحساب مش خاضع لنظام الترخيص خالص — وصول كامل دايمًا، من غير كود، من غير تاريخ انتهاء (زي حساب الإدارة بتاعك، أو فرد من عيلتك). لعميل بتبيعله البرنامج، استخدم "إصدار كود ترخيص" فوق بدل الكارت ده.
        </p>
        <input placeholder="الاسم" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
        <input placeholder="PIN (٤ أرقام على الأقل)" type="password" inputMode="numeric" value={newUser.pin} onChange={(e) => setNewUser({ ...newUser, pin: e.target.value.replace(/\D/g, "") })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={newUser.is_family} onChange={(e) => setNewUser({ ...newUser, is_family: e.target.checked })} />
          حساب عائلة (صلاحيات محدودة، تابع لمستخدم رئيسي)
        </label>
        {newUser.is_family && (
          <select value={newUser.parent_user_id} onChange={(e) => setNewUser({ ...newUser, parent_user_id: e.target.value })} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
            <option value="">-- اختار المستخدم الرئيسي --</option>
            {users.filter((u) => !u.is_family).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        <button onClick={createUser} className="w-full bg-orange-600 text-white rounded-lg py-2 text-sm font-medium">إنشاء المستخدم</button>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">٢. مزامنة Google Sheets (مرآة اختيارية)</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          قاعدة البيانات الأساسية للتطبيق شغالة لحظيًا بدون Google Sheets. لو عايز نسخة قابلة للقراءة/التعديل في شيت،
          محتاجين منك:
        </p>
        <ol className="text-sm space-y-1.5 list-decimal list-inside text-neutral-600 dark:text-neutral-300">
          <li>افتح <b>console.cloud.google.com</b> واعمل مشروع جديد</li>
          <li>من "APIs &amp; Services" فعّل <b>Google Sheets API</b> و <b>Google Drive API</b></li>
          <li>اعمل <b>Service Account</b> جديد، وحمّل مفتاحه (JSON key)</li>
          <li>افتح Google Sheet بتاعك وشير الصلاحية (Editor) على إيميل الـ Service Account</li>
          <li>ابعت لنا محتوى ملف الـ JSON ده وهنربطه بحسابك</li>
        </ol>
        <p className="text-xs text-neutral-400">هذه الخطوة اختيارية ومؤجلة للمرحلة القادمة من التطبيق.</p>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">٣. تفعيل تذكيرات الساعة المختارة + الصدقة كل ٣ ساعات</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          خطة Vercel المجانية (Hobby) بتشغّل الـ Cron بتاعها مرة واحدة بس في اليوم — عشان تذكير الديون/الالتزامات يشتغل في
          الساعة اللي تختارها لكل مستخدم تحت، وتذكير الصدقة يتكرر كل ٣ ساعات، لازم خدمة مجانية خارجية تنده على رابط واحد كل ساعة:
        </p>
        <ol className="text-sm space-y-1.5 list-decimal list-inside text-neutral-600 dark:text-neutral-300">
          <li>افتح <b>cron-job.org</b> واعمل حساب مجاني</li>
          <li>اعمل "Cronjob" جديد بالرابط: <code className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded break-all">https://flowcash-ruddy.vercel.app/api/cron/tick</code></li>
          <li>خلي التكرار "Every hour" (كل ساعة)</li>
          <li>من "Advanced" ضيف Header باسم <code className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded">Authorization</code> وقيمته <code className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded">Bearer &lt;CRON_SECRET بتاعك&gt;</code> — هو نفس الـ CRON_SECRET المسجل في Vercel، مفيش سيكرت جديد مطلوب</li>
          <li>احفظ — من دلوقتي هيوصلك تذكير الديون/الالتزامات في الساعة اللي اخترتها تحت، وتذكير الصدقة كل ٣ ساعات</li>
        </ol>
        <p className="text-xs text-neutral-400">الـ Cron اليومي القديم في vercel.json فاضل شغال كـ احتياطي — لو الخدمة الخارجية وقفت لأي سبب، برضو هتوصلك تذكيرات (مرة واحدة باليوم بدل بالساعة).</p>
      </Card>

      <div className="space-y-3">
        <h2 className="font-semibold">٤. المستخدمون الحاليون</h2>
        {users.map((u) => (
          <Card key={u.id} className="space-y-2">
            <p className="font-medium text-sm flex items-center gap-1">
              {u.name}
              {u.is_verified && <BadgeCheck size={14} className="text-blue-500" />}
              {u.is_family && <span className="text-xs text-neutral-400">(عائلة)</span>}
            </p>
            <div className="text-xs text-neutral-400">
              معرّف المستخدم (للاستخدام الداخلي): <code>{u.id}</code>
            </div>

            {!u.is_admin && (() => {
              const status = computeLicenseStatus(u);
              const badgeColor =
                status.kind === "active" ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300"
                : status.kind === "expired" ? "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400"
                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500";
              return (
                <div className="border border-neutral-100 dark:border-neutral-800 rounded-lg p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs rounded-full px-2 py-0.5 ${badgeColor}`}>{STATUS_LABEL[status.kind]}</span>
                    {u.license_code && <code className="text-xs">{u.license_code}</code>}
                  </div>
                  {status.kind === "active" && (
                    <p className="text-xs text-neutral-500">
                      {status.type === "trial" ? "تجريبي" : "دائم"} — {status.expiresAt ? `باقي ${status.daysLeft} يوم` : "مدى الحياة"}
                      {status.type === "trial" && `، الصفحات المفتوحة: ${status.allowedPages.length ? status.allowedPages.map((p) => PAGE_LABELS[p]).join("، ") : "كلها للقراءة فقط"}`}
                    </p>
                  )}
                  {status.kind === "expired" && <p className="text-xs text-neutral-500">بياناته هتفضل محفوظة ٣٠ يوم من تاريخ الانتهاء قبل ما تتمسح نهائي.</p>}

                  {(status.kind === "active" || status.kind === "expired" || status.kind === "unredeemed") && (
                    <div className="flex gap-2 flex-wrap">
                      {status.kind === "active" && status.type === "trial" && (
                        <button type="button" onClick={() => convertToPermanent(u)} className="text-xs border border-orange-300 dark:border-orange-800 text-orange-600 dark:text-orange-400 rounded-lg px-2.5 py-1">
                          تحويل لعميل دائم
                        </button>
                      )}
                      <button type="button" onClick={() => openLicenseEdit(u)} className="text-xs border border-neutral-300 dark:border-neutral-700 rounded-lg px-2.5 py-1">
                        {licenseEditOpen[u.id] ? "إخفاء التعديل" : "تجديد / تعديل الصلاحيات"}
                      </button>
                      <button type="button" disabled={licenseBusyId[u.id]} onClick={() => deleteCustomer(u)} className="text-xs border border-red-300 dark:border-red-900 text-red-600 dark:text-red-400 rounded-lg px-2.5 py-1 disabled:opacity-50">
                        حذف العميل
                      </button>
                    </div>
                  )}

                  {licenseEditOpen[u.id] && licenseEdit[u.id] && (
                    <div className="space-y-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                      <div>
                        <input
                          type="email"
                          placeholder="إيميل العميل (لاسترجاع كود التفعيل)"
                          value={licenseEdit[u.id].email}
                          onChange={(e) => setLicenseEdit((s) => ({ ...s, [u.id]: { ...s[u.id], email: e.target.value } }))}
                          className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setLicenseEdit((s) => ({ ...s, [u.id]: { ...s[u.id], type: "trial" } }))}
                          className={`flex-1 rounded-lg py-1.5 text-xs border ${licenseEdit[u.id].type === "trial" ? "bg-orange-600 text-white border-orange-600" : "border-neutral-300 dark:border-neutral-700"}`}
                        >
                          تجريبي
                        </button>
                        <button
                          type="button"
                          onClick={() => setLicenseEdit((s) => ({ ...s, [u.id]: { ...s[u.id], type: "permanent" } }))}
                          className={`flex-1 rounded-lg py-1.5 text-xs border ${licenseEdit[u.id].type === "permanent" ? "bg-orange-600 text-white border-orange-600" : "border-neutral-300 dark:border-neutral-700"}`}
                        >
                          دائم
                        </button>
                      </div>
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={licenseEdit[u.id].lifetime}
                          onChange={(e) => setLicenseEdit((s) => ({ ...s, [u.id]: { ...s[u.id], lifetime: e.target.checked } }))}
                        />
                        مدى الحياة (بدون تاريخ انتهاء)
                      </label>
                      {!licenseEdit[u.id].lifetime && (
                        <input
                          type="number"
                          min={1}
                          placeholder="عدد الأيام من دلوقتي"
                          value={licenseEdit[u.id].days}
                          onChange={(e) => setLicenseEdit((s) => ({ ...s, [u.id]: { ...s[u.id], days: e.target.value } }))}
                          className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
                        />
                      )}
                      <div className="grid grid-cols-2 gap-1.5">
                        {PAGE_KEYS.map((key) => (
                          <label key={key} className="flex items-center gap-1.5 text-xs">
                            <input
                              type="checkbox"
                              checked={licenseEdit[u.id].allowed_pages.includes(key)}
                              onChange={() => setLicenseEdit((s) => ({ ...s, [u.id]: { ...s[u.id], allowed_pages: togglePage(s[u.id].allowed_pages, key) } }))}
                            />
                            {PAGE_LABELS[key]}
                          </label>
                        ))}
                      </div>
                      <button
                        type="button"
                        disabled={licenseBusyId[u.id]}
                        onClick={() => saveLicenseEdit(u.id)}
                        className="w-full bg-orange-600 text-white rounded-lg py-1.5 text-xs disabled:opacity-50"
                      >
                        {licenseBusyId[u.id] ? "جاري الحفظ..." : "حفظ الترخيص"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="border-t border-neutral-100 dark:border-neutral-800 pt-2 space-y-2">
              <p className="text-xs font-medium text-neutral-500">تغيير الاسم أو رمز الدخول (PIN) — سيبها فاضية لو مش عايز تغيّرها</p>
              <input
                placeholder="اسم جديد"
                defaultValue={""}
                onChange={(e) => setEditing({ ...editing, [u.id]: { ...editing[u.id], name: e.target.value } })}
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
              />
              <input
                placeholder="PIN جديد (٤ أرقام على الأقل)"
                type="password"
                inputMode="numeric"
                defaultValue={""}
                onChange={(e) => setEditing({ ...editing, [u.id]: { ...editing[u.id], pin: e.target.value.replace(/\D/g, "") } })}
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
              />
            </div>

            <div className="text-xs text-neutral-400">
              تليجرام: {u.telegram_chat_id ? "متصل ✅" : "لسه مش رابط حسابه"} — كل العملاء بيستخدموا بوت واحد مشترك دلوقتي (شوف كارت "بوت تليجرام المركزي" فوق)، العميل بيربط نفسه من الإعدادات عنده.
            </div>

            <input
              placeholder="Google Sheet ID (اختياري، لاحقًا)"
              defaultValue={u.google_sheet_id || ""}
              onChange={(e) => setEditing({ ...editing, [u.id]: { ...editing[u.id], google_sheet_id: e.target.value } })}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
            />

            <div className="border-t border-neutral-100 dark:border-neutral-800 pt-2 space-y-2">
              <p className="text-xs font-medium text-neutral-500">وقت تذكيرات تليجرام (بتوقيت القاهرة) — بتتفعّل بالساعة لو ربطت الـ tick الخارجي (شوف تعليمات cron-job.org)</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-neutral-400">تذكير الديون المتأخرة</label>
                  <select
                    defaultValue={u.debt_reminder_hour ?? 8}
                    onChange={(e) => setEditing({ ...editing, [u.id]: { ...editing[u.id], debt_reminder_hour: parseInt(e.target.value) } })}
                    className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
                  >
                    {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-neutral-400">تذكير الالتزامات الشهرية</label>
                  <select
                    defaultValue={u.recurring_reminder_hour ?? 8}
                    onChange={(e) => setEditing({ ...editing, [u.id]: { ...editing[u.id], recurring_reminder_hour: parseInt(e.target.value) } })}
                    className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
                  >
                    {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <button onClick={() => saveUserSettings(u.id)} className="w-full bg-neutral-800 dark:bg-neutral-700 text-white rounded-lg py-2 text-xs">
              حفظ إعدادات {u.name}
            </button>
          </Card>
        ))}
      </div>

      <Card className="space-y-3">
        <button onClick={openLogs} className="w-full flex items-center justify-between text-sm font-semibold">
          <span>٦. لوج النظام (سجل كل ما حصل)</span>
          <span className="text-xs text-neutral-400">{logsOpen ? "إخفاء" : "عرض"}</span>
        </button>
        {logsOpen && (
          <div className="space-y-2">
            <p className="text-xs text-neutral-500">
              كل عملية إضافة/تعديل/حذف حركة أو حساب — من التطبيق أو من تليجرام — بتتسجل هنا. لو أي حساب اتلخبط، رجّع الصفحات دي عشان تلاقي إمتى وإزاي.
            </p>
            <select
              value={logUserFilter}
              onChange={(e) => { setLogUserFilter(e.target.value); setLogs([]); setLogsExhausted(false); }}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
            >
              <option value="">كل المستخدمين</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <button onClick={() => loadLogs(false)} disabled={logsLoading} className="w-full border border-neutral-300 dark:border-neutral-700 rounded-lg py-1.5 text-xs disabled:opacity-50">
              {logsLoading ? "جاري التحميل..." : "تحديث"}
            </button>
            {logs.length === 0 && !logsLoading && <p className="text-center text-xs text-neutral-400 py-4">لسه مفيش حاجة مسجلة.</p>}
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {logs.map((l) => (
                <div key={l.id} className={`text-xs rounded-lg p-2 border ${l.status === "error" ? "border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950" : "border-neutral-200 dark:border-neutral-800"}`}>
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{ACTION_LABEL[l.action] || l.action}</span>
                    <span className="text-neutral-400">{new Date(l.created_at).toLocaleString("ar-EG")}</span>
                  </div>
                  <div className="text-neutral-400 mt-0.5">
                    {l.app_users?.name || "—"} · {SOURCE_LABEL[l.source] || l.source}
                  </div>
                  {l.payload && (
                    <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] text-neutral-500">{JSON.stringify(l.payload)}</pre>
                  )}
                </div>
              ))}
            </div>
            {logs.length > 0 && !logsExhausted && (
              <button onClick={() => loadLogs(true)} disabled={logsLoading} className="w-full border border-neutral-300 dark:border-neutral-700 rounded-lg py-1.5 text-xs disabled:opacity-50">
                {logsLoading ? "جاري التحميل..." : "حمّل الأقدم"}
              </button>
            )}
          </div>
        )}
      </Card>

      <Footer />
    </div>
  );
}
