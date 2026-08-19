"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/Card";
import CategoryManager from "@/components/CategoryManager";
import PeopleManager from "@/components/PeopleManager";
import { useTheme } from "@/lib/useTheme";
import { useFontScale, type FontScale } from "@/lib/useFontScale";
import { Moon, Sun, LogOut, ShieldCheck, Plane, Fingerprint, TimerOff, Coins, Tags, Users, ChevronDown, Type } from "lucide-react";

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

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => {
      if (d.user) {
        setTravelMode(!!d.user.travel_mode);
        setBaseCurrency(d.user.base_currency || "EGP");
        const mins = Number(d.user.auto_logout_minutes) || 0;
        setAutoLogoutOn(mins > 0);
        if (mins > 0) setAutoLogoutMinutes(String(mins));
      }
    });
    setBioSupported(typeof window !== "undefined" && !!window.PublicKeyCredential);
  }, []);

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
      setBioMsg("تم تفعيل الدخول بالبصمة على الجهاز ده ✅");
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

      <a href="/admin">
        <Card className="flex items-center gap-2 text-sm">
          <ShieldCheck size={18} className="text-orange-600" />
          إعدادات المستخدمين وربط البوت / الشيت (Admin)
        </Card>
      </a>

      <button onClick={logout} className="w-full flex items-center justify-center gap-2 text-sm text-red-500 border border-red-200 dark:border-red-900 rounded-xl py-3">
        <LogOut size={16} /> تسجيل خروج
      </button>
    </div>
  );
}
