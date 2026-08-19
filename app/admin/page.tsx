"use client";
import { useEffect, useState } from "react";
import Card from "@/components/Card";
import Footer from "@/components/Footer";
import Link from "next/link";

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
}

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
  const [botStatus, setBotStatus] = useState<Record<string, any>>({});
  const [botBusy, setBotBusy] = useState<Record<string, boolean>>({});
  const [locked, setLocked] = useState(false);
  const [checkedAccess, setCheckedAccess] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logUserFilter, setLogUserFilter] = useState("");
  const [logsExhausted, setLogsExhausted] = useState(false);

  // /admin used to be reachable by anyone with no login at all — now the API
  // requires a session once a user already exists. Surface that clearly
  // instead of silently showing an empty/broken-looking panel.
  const load = () =>
    fetch("/api/admin/users").then((r) => {
      if (r.status === 401) { setLocked(true); setCheckedAccess(true); return { users: [] }; }
      setCheckedAccess(true);
      return r.json();
    }).then((d) => setUsers(d.users || []));
  useEffect(() => { load(); }, []);

  if (checkedAccess && locked) {
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

  const checkBotStatus = async (id: string) => {
    setBotBusy((b) => ({ ...b, [id]: true }));
    try {
      const res = await fetch(`/api/admin/telegram/${id}`);
      const data = await res.json();
      setBotStatus((s) => ({ ...s, [id]: data }));
    } finally {
      setBotBusy((b) => ({ ...b, [id]: false }));
    }
  };

  const resyncWebhook = async (id: string) => {
    setBotBusy((b) => ({ ...b, [id]: true }));
    try {
      const res = await fetch(`/api/admin/telegram/${id}`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        // shown inside this user's own Telegram card, not the page-wide banner —
        // it's specific to this bot, not a general "saved settings" message.
        setBotStatus((s) => ({ ...s, [id]: { ok: false, error: `فشلت إعادة التسجيل: ${data.error}`, computedUrl: data.computedUrl } }));
      } else {
        await checkBotStatus(id);
        setBotStatus((s) => ({ ...s, [id]: { ...s[id], resyncMsg: "تم إعادة تسجيل الويب هوك ✅ ابعت /start للبوت دلوقتي" } }));
      }
    } finally {
      setBotBusy((b) => ({ ...b, [id]: false }));
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
      setMsg(data.webhookResult ? `تم الحفظ — ربط البوت: ${data.webhookResult.ok ? "نجح ✅" : "فشل، راجع التوكن"}` : "تم الحفظ ✅");
      load();
    } else setMsg("حصل خطأ في الحفظ");
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-orange-700 dark:text-orange-400">FlowCash — صفحة الإعداد (Admin)</h1>
        <p className="text-sm text-neutral-500 mt-1">من هنا تضيف نفسك كمستخدم، وتربط بوت التليجرام والشيت الخاصين بيك.</p>
      </div>

      {msg && <Card className="text-sm bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-300 whitespace-pre-wrap break-all">{msg}</Card>}

      <Card className="space-y-3">
        <h2 className="font-semibold">١. إنشاء مستخدم جديد</h2>
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
        <h2 className="font-semibold">٢. ازاي تجيب توكن بوت تليجرام؟</h2>
        <ol className="text-sm space-y-1.5 list-decimal list-inside text-neutral-600 dark:text-neutral-300">
          <li>افتح تليجرام وابحث عن <b>@BotFather</b></li>
          <li>ابعتله الأمر <code className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded">/newbot</code></li>
          <li>اكتب اسم للبوت (مثال: FlowCash Karim)</li>
          <li>اكتب username ينتهي بـ <code>bot</code> (مثال: karim_flowcash_bot)</li>
          <li>هيبعتلك BotFather توكن شكله كده: <code className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded">123456:ABC-DEF...</code> — انسخه</li>
          <li>الصقه في خانة "توكن بوت تليجرام" تحت وادوس حفظ — هيتربط أوتوماتيك</li>
          <li>افتح شات مع بوتك وابعتله <code>/start</code></li>
        </ol>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">٣. مزامنة Google Sheets (مرآة اختيارية)</h2>
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
        <h2 className="font-semibold">٤. تفعيل تذكيرات الساعة المختارة + الصدقة كل ٣ ساعات</h2>
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
        <h2 className="font-semibold">٥. المستخدمون الحاليون</h2>
        {users.map((u) => (
          <Card key={u.id} className="space-y-2">
            <p className="font-medium text-sm">{u.name} {u.is_family && <span className="text-xs text-neutral-400">(عائلة)</span>}</p>
            <div className="text-xs text-neutral-400">
              معرّف المستخدم (للاستخدام الداخلي): <code>{u.id}</code>
            </div>
            <input
              placeholder="توكن بوت تليجرام"
              defaultValue={""}
              onChange={(e) => setEditing({ ...editing, [u.id]: { ...editing[u.id], telegram_bot_token: e.target.value } })}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
            />
            <div className="text-xs text-neutral-400">
              حالة البوت: {u.telegram_chat_id ? "متصل ✅" : "لسه مش متصل"}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={botBusy[u.id]}
                onClick={() => checkBotStatus(u.id)}
                className="flex-1 border border-neutral-300 dark:border-neutral-700 rounded-lg py-1.5 text-xs disabled:opacity-50"
              >
                {botBusy[u.id] ? "جاري الفحص..." : "افحص حالة البوت"}
              </button>
              <button
                type="button"
                disabled={botBusy[u.id]}
                onClick={() => resyncWebhook(u.id)}
                className="flex-1 border border-orange-300 dark:border-orange-800 text-orange-600 dark:text-orange-400 rounded-lg py-1.5 text-xs disabled:opacity-50"
              >
                أعد ربط الويب هوك
              </button>
            </div>

            {botStatus[u.id] && (
              <div className={`text-xs rounded-lg p-2 space-y-1 whitespace-pre-wrap break-all ${botStatus[u.id].ok && !botStatus[u.id].hasErrors ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300" : "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400"}`}>
                {botStatus[u.id].resyncMsg && <p className="text-green-700 dark:text-green-300">{botStatus[u.id].resyncMsg}</p>}
                {!botStatus[u.id].ok && (
                  <>
                    <p>خطأ: {botStatus[u.id].error}</p>
                    {botStatus[u.id].computedUrl && <p>الرابط اللي اتحاول تسجيله: {botStatus[u.id].computedUrl}</p>}
                  </>
                )}
                {botStatus[u.id].ok && (
                  <>
                    <p>الرابط المسجل عند تليجرام: {botStatus[u.id].url ? <code className="break-all">{botStatus[u.id].url}</code> : "مفيش رابط متسجل خالص ⚠️"}</p>
                    {botStatus[u.id].hasErrors && (
                      <p>آخر خطأ من تليجرام: {botStatus[u.id].last_error_message} {botStatus[u.id].last_error_date ? `(${new Date(botStatus[u.id].last_error_date).toLocaleString("ar-EG")})` : ""}</p>
                    )}
                    {!botStatus[u.id].hasErrors && botStatus[u.id].url && <p>الويب هوك شغال وملوش أخطاء ✅</p>}
                    <p>رسائل واقفة معلقة: {botStatus[u.id].pending_update_count}</p>
                  </>
                )}
              </div>
            )}

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
