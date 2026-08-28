"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/Card";
import CategoryManager from "@/components/CategoryManager";
import PeopleManager from "@/components/PeopleManager";
import { useTheme } from "@/lib/useTheme";
import { useFontScale, type FontScale } from "@/lib/useFontScale";
import { formatHijriFromDate } from "@/lib/hijri";
import { isValidPhone } from "@/lib/phone";
import { shrinkImage } from "@/lib/image";
import { Moon, Sun, LogOut, ShieldCheck, ShieldAlert, Plane, Fingerprint, TimerOff, Coins, Tags, Users, ChevronDown, Type, CalendarClock, Minus, Plus, Send, BellRing, Camera, BadgeCheck, Archive } from "lucide-react";

// Round 32 — نص التحميل الموحّد لأي عملية بتكلّم Gemini في التطبيق كله.
const AI_LOADING_TEXT = "جاري الاتصال بخوادم IDEA...";

// نفس نمط الـ Modal المحلي المستخدم في installments/page.tsx — مفيش
// Modal مشترك في المشروع، كل صفحة بتعرّف نسختها الصغيرة.
function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// نسخة "توثيق حسابك" من نفس تدفق التوثيق الموجود بالفعل لكل فرد جوه جمعية
// (ParticipantDetailModal → VerifyParticipantModal في installments/page.tsx)
// — نفس المنطق بالظبط (صورة بطاقة + سيلفي حي، Gemini بيقارن)، بس هنا بيوثّق
// الحساب نفسه (app_users.is_verified عن طريق POST /api/verify-me) مش فرد في
// جمعية حد تاني منظّمها.
function SelfVerifyModal({ onClose, onDone, showMsg }: { onClose: () => void; onDone: () => void; showMsg: (t: string, e?: boolean) => void }) {
  const [front, setFront] = useState<string | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  const pick = async (file: File, setter: (v: string) => void) => setter(await shrinkImage(file));

  const submit = async () => {
    if (!front || !selfie) { showMsg("لازم صورة وش البطاقة والسيلفي على الأقل", true); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/verify-me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_photo_front: front, selfie_photo: selfie }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showMsg(data.error || "حصل خطأ في التوثيق", true); return; }
      setResult(data.result);
    } catch {
      showMsg("تعذر الاتصال بخوادم IDEA — اتأكد من النت وجرب تاني.", true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <p className="font-semibold text-sm">توثيق حسابك</p>
      <p className="text-[11px] text-neutral-400 leading-relaxed">
        دي مش عملية تحقق هوية رسمية زي البنوك — مجرد مقارنة آلية بين صورة البطاقة والسيلفي بتديك مؤشر ثقة بس. لو اتوثقت، هتظهر علامة موثّق جمب اسمك في الإدارة، وجمب اسمك في أي جمعية بتشترك فيها بنفس رقم موبايلك.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col items-center gap-1 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg p-2 text-[10px] text-center cursor-pointer">
          <Camera size={16} className="text-neutral-400" />
 {front ?"اتصورت":"وش البطاقة"}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f, setFront); }} />
        </label>
        <label className="flex flex-col items-center gap-1 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg p-2 text-[10px] text-center cursor-pointer">
          <Camera size={16} className="text-neutral-400" />
 {selfie ?"اتصورت":"سيلفي حي"}
          <input type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f, setSelfie); }} />
        </label>
      </div>

      {result && (
        <div className={`text-xs rounded-lg p-2 space-y-1 ${result.verified ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300" : "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300"}`}>
 <p className="font-medium">{result.verified ?"اتوثق":"مش متطابق / مش واضح"}</p>
          {result.notes && <p>{result.notes}</p>}
          {result.error && <p>{result.error}</p>}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onDone} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm">قفل</button>
        <button disabled={busy} onClick={submit} className="flex-1 bg-orange-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60">{busy ? AI_LOADING_TEXT : "ابدأ التحقق"}</button>
      </div>
    </Modal>
  );
}

const FONT_SCALES: { key: FontScale; label: string }[] = [
  { key: "small", label: "أصغر" },
  { key: "medium", label: "عادي" },
  { key: "large", label: "أكبر" },
];

const CURRENCIES = [
  { code: "EGP", label: "جنيه مصري" },
  { code: "USD", label: "دولار أمريكي" },
  { code: "SAR", label: "ريال سعودي" },
];

export default function SettingsPage() {
  const { dark, toggle } = useTheme();
  const { scale: fontScale, change: changeFontScale } = useFontScale();
  const router = useRouter();
  const [travelMode, setTravelMode] = useState(false);
  const [baseCurrency, setBaseCurrency] = useState("EGP");
  const [bioSupported, setBioSupported] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const [bioMsg, setBioMsg] = useState("");
  const [autoLogoutOn, setAutoLogoutOn] = useState(false);
  const [autoLogoutMinutes, setAutoLogoutMinutes] = useState("15");
  const [savingCurrency, setSavingCurrency] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [hijriCorrection, setHijriCorrection] = useState(0);
  const [savingHijri, setSavingHijri] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramMsg, setTelegramMsg] = useState("");
  const [telegramLink, setTelegramLink] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneMsg, setPhoneMsg] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [showSelfVerify, setShowSelfVerify] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState("");
  const [igEnabled, setIgEnabled] = useState(true);
  const [igMode, setIgMode] = useState<"interval" | "daily">("interval");
  const [igIntervalHours, setIgIntervalHours] = useState("6");
  const [igHour, setIgHour] = useState("8");
  const [savingIg, setSavingIg] = useState(false);

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => {
      if (d.user) {
        setTravelMode(!!d.user.travel_mode);
        setBaseCurrency(d.user.base_currency || "EGP");
        const mins = Number(d.user.auto_logout_minutes) || 0;
        setAutoLogoutOn(mins > 0);
        if (mins > 0) setAutoLogoutMinutes(String(mins));
        setHijriCorrection(Number(d.user.hijri_correction_days) || 0);
        setIsAdmin(!!d.user.is_admin);
        setTelegramLinked(!!d.user.telegram_chat_id);
        setIgEnabled(d.user.ig_reminders_enabled !== false);
        setIgMode(d.user.ig_reminder_mode === "daily" ? "daily" : "interval");
        setIgIntervalHours(String(d.user.ig_reminder_interval_hours ?? 6));
        setIgHour(String(d.user.ig_reminder_hour ?? 8));
        setPhone(d.user.phone || "");
        setIsVerified(!!d.user.is_verified);
      }
    });
    setBioSupported(typeof window !== "undefined" && !!window.PublicKeyCredential);
  }, []);

  // "اربط حسابك بتليجرام" — every customer now shares one official bot
  // (previously each customer needed their own bot, set up by the admin —
  // see claude/licensing-system.md's Telegram section). One tap here gets a
  // one-time deep link; opening it in Telegram and hitting Start finishes
  // the link automatically, no token/typing required on the customer's side.
  const linkTelegram = async () => {
    setTelegramBusy(true);
    setTelegramMsg("");
    try {
      const res = await fetch("/api/telegram/link", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setTelegramMsg(data.error || "حصل خطأ"); return; }
      setTelegramLink(data.link);
      if (typeof window !== "undefined") window.open(data.link, "_blank");
    } catch {
      setTelegramMsg("مفيش اتصال بالإنترنت، حاول تاني");
    } finally {
      setTelegramBusy(false);
    }
  };

  // فولباك "اربط رقمك" لمن تخطّى خانة الموبايل في التسجيل — نفس رقم الموبايل
  // اللي بيتسجل في تسجيل الدخول الأول، بس هنا ممكن يضيفه أو يعدّله في أي وقت.
  const savePhone = async () => {
    setPhoneMsg("");
    if (phone && !isValidPhone(phone)) { setPhoneMsg("رقم موبايل غير صالح"); return; }
    setSavingPhone(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone || null }),
      });
      const data = await res.json();
      if (!res.ok) { setPhoneMsg(data.error || "حصل خطأ"); return; }
 setPhoneMsg("اتحفظ الرقم");
    } catch {
      setPhoneMsg("مفيش اتصال بالإنترنت، حاول تاني");
    } finally {
      setSavingPhone(false);
    }
  };

  const unlinkTelegram = async () => {
    setTelegramBusy(true);
    setTelegramMsg("");
    try {
      const res = await fetch("/api/telegram/unlink", { method: "POST" });
      if (!res.ok) { setTelegramMsg("حصل خطأ"); return; }
      setTelegramLinked(false);
      setTelegramLink("");
 setTelegramMsg("تم إلغاء الربط");
    } catch {
      setTelegramMsg("مفيش اتصال بالإنترنت، حاول تاني");
    } finally {
      setTelegramBusy(false);
    }
  };

  const changeHijriCorrection = async (delta: number) => {
    const next = Math.max(-3, Math.min(3, hijriCorrection + delta));
    setHijriCorrection(next);
    setSavingHijri(true);
    try {
      await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hijri_correction_days: next }),
      });
    } finally {
      setSavingHijri(false);
    }
  };

  const saveAutoLogout = async (enabled: boolean, minutes: string) => {
    await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auto_logout_minutes: enabled ? parseInt(minutes) || 15 : null }),
    });
  };

  const toggleAutoLogout = () => {
    const next = !autoLogoutOn;
    setAutoLogoutOn(next);
    saveAutoLogout(next, autoLogoutMinutes);
  };

  const changeAutoLogoutMinutes = (val: string) => {
    setAutoLogoutMinutes(val);
    if (autoLogoutOn) saveAutoLogout(true, val);
  };

  const registerBiometric = async () => {
    setBioBusy(true);
    setBioMsg("");
    try {
      const { startRegistration } = await import("@simplewebauthn/browser");
      const optRes = await fetch("/api/webauthn/register-options", { method: "POST" });
      const optData = await optRes.json();
      if (!optRes.ok) { setBioMsg(optData.error || "حصل خطأ"); setBioBusy(false); return; }
      const response = await startRegistration({ optionsJSON: optData.options });
      const verifyRes = await fetch("/api/webauthn/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) { setBioMsg(verifyData.error || "فشل تفعيل البصمة"); setBioBusy(false); return; }
 setBioMsg("تم تفعيل الدخول بالبصمة على الجهاز ده");
    } catch {
      setBioMsg("اتلغى التسجيل أو الجهاز مش بيدعم البصمة");
    } finally {
      setBioBusy(false);
    }
  };

  const changeBaseCurrency = async (code: string) => {
    setBaseCurrency(code);
    setSavingCurrency(true);
    try {
      await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base_currency: code }),
      });
    } finally {
      setSavingCurrency(false);
    }
  };

  const toggleTravelMode = async () => {
    const next = !travelMode;
    setTravelMode(next);
    await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ travel_mode: next }),
    });
  };

  const saveIgSettings = async (patch: Record<string, any>) => {
    setSavingIg(true);
    try {
      await fetch("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    } finally {
      setSavingIg(false);
    }
  };

  const toggleIgEnabled = () => {
    const next = !igEnabled;
    setIgEnabled(next);
    saveIgSettings({ ig_reminders_enabled: next });
  };

  const changeIgMode = (mode: "interval" | "daily") => {
    setIgMode(mode);
    saveIgSettings({ ig_reminder_mode: mode });
  };

  const changeIgIntervalHours = (val: string) => {
    setIgIntervalHours(val);
    saveIgSettings({ ig_reminder_interval_hours: parseInt(val) || 6 });
  };

  const changeIgHour = (val: string) => {
    setIgHour(val);
    saveIgSettings({ ig_reminder_hour: parseInt(val) || 8 });
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">الإعدادات</h1>

      <Card className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          {dark ? <Moon size={18} /> : <Sun size={18} />}
          الوضع الليلي
        </div>
        <button onClick={toggle} className={`w-11 h-6 rounded-full transition ${dark ? "bg-orange-600" : "bg-neutral-300"}`}>
          <span className={`block w-5 h-5 bg-white rounded-full shadow transition ${dark ? "translate-x-[-22px]" : "translate-x-[-2px]"}`} />
        </button>
      </Card>

      <Card className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <BadgeCheck size={18} />
          توثيق حسابك
        </div>
        {isVerified ? (
 <p className="text-xs text-blue-500 flex items-center gap-1"><BadgeCheck size={14} /> حسابك موثّق — هتظهر علامة موثّق جمب اسمك في أي جمعية بتشترك فيها بنفس رقم موبايلك.</p>
        ) : (
          <>
            <p className="text-xs text-neutral-400">وثّق حسابك بصورة بطاقة وسيلفي — نفس فكرة التوثيق الموجودة في الجمعيات، بس على مستوى حسابك كله.</p>
            <button onClick={() => setShowSelfVerify(true)} className="w-full flex items-center justify-center gap-1 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm">
              <ShieldCheck size={14} /> ابدأ التوثيق
            </button>
          </>
        )}
        {verifyMsg && <p className="text-[11px] text-neutral-400">{verifyMsg}</p>}
      </Card>

      <Card className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Send size={18} />
          بوت تليجرام
        </div>
        <div>
          <label className="text-[10px] text-neutral-400">رقم الموبايل</label>
          <div className="flex gap-1.5">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="رقم موبايلك"
              className={`flex-1 min-w-0 rounded-lg border bg-transparent px-3 py-2 text-sm ${phone && !isValidPhone(phone) ? "border-red-400 dark:border-red-700" : "border-neutral-300 dark:border-neutral-700"}`}
            />
            <button disabled={savingPhone} onClick={savePhone} className="rounded-lg border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-xs shrink-0 disabled:opacity-60">
              {savingPhone ? "..." : "حفظ"}
            </button>
          </div>
 {phoneMsg && <p className={`text-[11px] mt-1 ${phoneMsg.startsWith("") ?"text-emerald-600 dark:text-emerald-400":"text-red-500"}`}>{phoneMsg}</p>}
        </div>
        {telegramLinked ? (
          <>
 <p className="text-xs text-emerald-600 dark:text-emerald-400">متصل — هتوصلك التذكيرات على تليجرام</p>
            <button
              disabled={telegramBusy}
              onClick={unlinkTelegram}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm disabled:opacity-60"
            >
              {telegramBusy ? "جاري الإلغاء..." : "إلغاء الربط"}
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-neutral-400">اربط حسابك عشان توصلك تذكيرات الدفعات المتكررة والديون والصدقة والزكاة على تليجرام.</p>
            <button
              disabled={telegramBusy}
              onClick={linkTelegram}
              className="w-full bg-orange-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60"
            >
              {telegramBusy ? "جاري التجهيز..." : "اربط حسابك بتليجرام"}
            </button>
            {telegramLink && (
              <p className="text-[11px] text-neutral-400 text-center">
                لو التطبيق ماودّاكش تلقائي لتليجرام،{" "}
                <a href={telegramLink} target="_blank" rel="noopener noreferrer" className="text-orange-600 underline">
                  دوس هنا
                </a>{" "}
                وابعت Start.
              </p>
            )}
          </>
        )}
        {telegramMsg && <p className="text-xs text-center text-red-500">{telegramMsg}</p>}
      </Card>

      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <BellRing size={18} />
            تذكير الأقساط والجمعيات
          </div>
          <button onClick={toggleIgEnabled} className={`w-11 h-6 rounded-full transition ${igEnabled ? "bg-orange-600" : "bg-neutral-300"}`}>
            <span className={`block w-5 h-5 bg-white rounded-full shadow transition ${igEnabled ? "translate-x-[-22px]" : "translate-x-[-2px]"}`} />
          </button>
        </div>
        {igEnabled ? (
          <>
            <p className="text-xs text-neutral-400">
              اختار إمتى توصلك تذكيرات الأقساط والجمعيات (بوت تليجرام + جرس التنبيهات في التطبيق) — كل قد إيه، ولا في معاد يومي ثابت.
            </p>
            <div className="grid grid-cols-2 gap-2 bg-neutral-100 dark:bg-neutral-800 rounded-xl p-1">
              <button onClick={() => changeIgMode("interval")} className={`py-2 rounded-lg text-xs font-medium ${igMode === "interval" ? "bg-white dark:bg-neutral-900 shadow text-orange-600" : "text-neutral-500"}`}>
                كل عدد ساعات
              </button>
              <button onClick={() => changeIgMode("daily")} className={`py-2 rounded-lg text-xs font-medium ${igMode === "daily" ? "bg-white dark:bg-neutral-900 shadow text-orange-600" : "text-neutral-500"}`}>
                معاد يومي ثابت
              </button>
            </div>
            {igMode === "interval" ? (
              <select
                value={igIntervalHours}
                onChange={(e) => changeIgIntervalHours(e.target.value)}
                disabled={savingIg}
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
              >
                <option value="1">كل ساعة</option>
                <option value="3">كل 3 ساعات</option>
                <option value="6">كل 6 ساعات</option>
                <option value="12">كل 12 ساعة</option>
                <option value="24">مرة كل يوم</option>
              </select>
            ) : (
              <select
                value={igHour}
                onChange={(e) => changeIgHour(e.target.value)}
                disabled={savingIg}
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                ))}
              </select>
            )}
          </>
        ) : (
          <p className="text-xs text-neutral-400">التذكيرات موقوفة دلوقتي — لسه هتشوف الأقساط/الجمعيات المستحقة في جرس التنبيهات جوه التطبيق، بس مش هتوصلك رسائل بوت أو دفعة استباقية.</p>
        )}
      </Card>

      <Card className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Type size={18} />
          حجم الخط
        </div>
        <div className="grid grid-cols-3 gap-2 bg-neutral-100 dark:bg-neutral-800 rounded-xl p-1">
          {FONT_SCALES.map((f) => (
            <button
              key={f.key}
              onClick={() => changeFontScale(f.key)}
              className={`py-2 rounded-lg text-sm font-medium ${fontScale === f.key ? "bg-white dark:bg-neutral-900 shadow text-orange-600" : ""}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Card>

      <Card className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Coins size={18} />
          العملة الأساسية
        </div>
        <select
          value={baseCurrency}
          onChange={(e) => changeBaseCurrency(e.target.value)}
          disabled={savingCurrency}
          className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
        >
          {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label} ({c.code})</option>)}
        </select>
        <p className="text-xs text-neutral-400">
          أي مبلغ أو حساب بعملة مختلفة عن العملة دي، هيظهرلك جمبه ما يعادله بيها تلقائي — في إضافة الحركة، وفي كشوفات الحساب والتقارير.
        </p>
      </Card>

      <Card className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <CalendarClock size={18} />
          تصحيح التاريخ الهجري
        </div>
        <p className="text-xs text-neutral-400">
          التقويم الهجري المحسوب تقريبي وممكن يفرق يوم عن إعلان الرؤية في بلدك — زوّد أو قلّل هنا لو محتاج يتظبط.
        </p>
        <div className="flex items-center justify-center gap-4">
          <button disabled={savingHijri} onClick={() => changeHijriCorrection(-1)} className="w-9 h-9 flex items-center justify-center rounded-full border border-neutral-300 dark:border-neutral-700 disabled:opacity-50">
            <Minus size={15} />
          </button>
          <div className="text-center">
            <p className="text-lg font-bold">{hijriCorrection > 0 ? `+${hijriCorrection}` : hijriCorrection}</p>
            <p className="text-[10px] text-neutral-400">يوم</p>
          </div>
          <button disabled={savingHijri} onClick={() => changeHijriCorrection(1)} className="w-9 h-9 flex items-center justify-center rounded-full border border-neutral-300 dark:border-neutral-700 disabled:opacity-50">
            <Plus size={15} />
          </button>
        </div>
        <p className="text-xs text-center text-neutral-500">النهاردة: {formatHijriFromDate(new Date(), hijriCorrection)}</p>
      </Card>

      <Card className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Plane size={18} />
            وضع السفر
          </div>
          <button onClick={toggleTravelMode} className={`w-11 h-6 rounded-full transition ${travelMode ? "bg-orange-600" : "bg-neutral-300"}`}>
            <span className={`block w-5 h-5 bg-white rounded-full shadow transition ${travelMode ? "translate-x-[-22px]" : "translate-x-[-2px]"}`} />
          </button>
        </div>
        <p className="text-xs text-neutral-400">
          تحويل العملة بيظهر دايمًا بغض النظر عن وضع السفر — الوضع ده لتفاصيل سفر إضافية لاحقًا.
        </p>
      </Card>

      {/* Round 48 — "في الإعدادات تعمل مفتاح اسمه الأرشيف": الديون اللي
          اتسددت بالكامل (أو اتعملها أرشفة يدوية) بتتحط هنا — راجع
          app/(protected)/debts-archive/page.tsx. */}
      <a href="/debts-archive">
        <Card className="flex items-center gap-2 text-sm">
          <Archive size={18} />
          أرشيف الديون المسددة
        </Card>
      </a>

      <Card className="space-y-1">
        <button onClick={() => setCategoriesOpen((s) => !s)} className="w-full flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm"><Tags size={18} /> التصنيفات</span>
          <ChevronDown size={16} className={`text-neutral-400 transition-transform ${categoriesOpen ? "rotate-180" : ""}`} />
        </button>
        {categoriesOpen && <div className="pt-2"><CategoryManager /></div>}
      </Card>

      <Card className="space-y-1">
        <button onClick={() => setPeopleOpen((s) => !s)} className="w-full flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm"><Users size={18} /> الأشخاص (الأسرة والتحويلات المتكررة)</span>
          <ChevronDown size={16} className={`text-neutral-400 transition-transform ${peopleOpen ? "rotate-180" : ""}`} />
        </button>
        {peopleOpen && <div className="pt-2"><PeopleManager /></div>}
      </Card>

      {bioSupported && (
        <Card className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Fingerprint size={18} />
            الدخول بالبصمة
          </div>
          <p className="text-xs text-neutral-400">فعّل بصمة الإصبع أو الوجه على الجهاز ده بدل ما تكتب الـ PIN كل مرة.</p>
          <button disabled={bioBusy} onClick={registerBiometric} className="w-full bg-orange-600 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium">
            {bioBusy ? "جاري التفعيل..." : "فعّل البصمة على الجهاز ده"}
          </button>
          {bioMsg && <p className="text-xs text-center text-neutral-500">{bioMsg}</p>}
        </Card>
      )}

      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <TimerOff size={18} />
            تسجيل خروج تلقائي
          </div>
          <button onClick={toggleAutoLogout} className={`w-11 h-6 rounded-full transition ${autoLogoutOn ? "bg-orange-600" : "bg-neutral-300"}`}>
            <span className={`block w-5 h-5 bg-white rounded-full shadow transition ${autoLogoutOn ? "translate-x-[-22px]" : "translate-x-[-2px]"}`} />
          </button>
        </div>
        {autoLogoutOn && (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={autoLogoutMinutes}
              onChange={(e) => changeAutoLogoutMinutes(e.target.value)}
              className="w-20 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm text-center"
            />
            <span className="text-xs text-neutral-400">دقيقة من غير استخدام يسجل خروجك تلقائي</span>
          </div>
        )}
        <p className="text-xs text-neutral-400">
          {autoLogoutOn
            ? "لو حد فتح الجهاز بعد المدة دي، هيحتاج يسجل دخول تاني (بالبصمة لو مفعّلة أو الـ PIN)."
            : "الخروج التلقائي متوقف — التطبيق هيفضل مسجل دخول لحد ما تخرج بنفسك."}
        </p>
      </Card>

      {isAdmin && (
        <a href="/admin">
          <Card className="flex items-center gap-2 text-sm">
            <ShieldCheck size={18} className="text-orange-600" />
            إعدادات المستخدمين وربط البوت / الشيت (Admin)
          </Card>
        </a>
      )}

      <button onClick={logout} className="w-full flex items-center justify-center gap-2 text-sm text-red-500 border border-red-200 dark:border-red-900 rounded-xl py-3">
        <LogOut size={16} /> تسجيل خروج
      </button>

      {showSelfVerify && (
        <SelfVerifyModal
          onClose={() => setShowSelfVerify(false)}
          onDone={() => {
            setShowSelfVerify(false);
            fetch("/api/me").then((r) => r.json()).then((d) => { if (d.user) setIsVerified(!!d.user.is_verified); });
          }}
          showMsg={(t) => setVerifyMsg(t)}
        />
      )}
    </div>
  );
}
