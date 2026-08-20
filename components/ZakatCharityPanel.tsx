"use client";
import { useEffect, useMemo, useState } from "react";
import Card from "@/components/Card";
import { fmt } from "@/lib/format";
import { toEGP, fromEGP, type FxRates } from "@/lib/fx";
import { gregorianToHijri, formatHijri, formatHijriFromDate } from "@/lib/hijri";
import { Moon, HeartHandshake, Save, Send, ChevronDown, Sparkles, BellOff, Coins, CalendarDays, CalendarCheck, Scale } from "lucide-react";
import Link from "next/link";

const num = (s: string) => parseFloat(s) || 0;
const todayISO = () => new Date().toISOString().slice(0, 10);

// country -> commonly-traded local gold karat, used both to label the live
// price box and as the basis for the nisab/gold-value calculation. Egypt
// (21k) is the default since that's the market the reference design used.
const COUNTRY_KARAT: { code: string; label: string; karat: number; currency: string }[] = [
  { code: "EG", label: "مصر", karat: 21, currency: "EGP" },
  { code: "SA", label: "السعودية", karat: 24, currency: "SAR" },
  { code: "AE", label: "الإمارات", karat: 22, currency: "AED" },
  { code: "QA", label: "قطر", karat: 21, currency: "QAR" },
  { code: "LY", label: "ليبيا", karat: 21, currency: "LYD" },
];

const FAQ = [
  {
    q: "إمتى تكون الزكاة واجبة عليّ؟",
    a: "الزكاة واجبة إذا بلغ مالك الزكوي (ذهب، فضة، نقود، عروض تجارة) قيمة النصاب، وحال عليه الحول (مرّت سنة هجرية كاملة وهو باقٍ في ملكك بنفس القدر أو أكثر).",
  },
  {
    q: "إزاي بيتحسب النصاب؟",
    a: "الحاسبة هنا بتحسبه بقيمة ٨٥ جرام من الذهب الخالص (عيار ٢٤) بالسعر اللحظي — وده الأساس الشرعي المعتمد، بغض النظر عن عيار دهبك الفعلي. لو دهبك عيار أقل زي ١٨ أو ٢١، استخدم حاسبة تحويل العيار فوق عشان تعرف وزنه المعادل بعيار ٢٤ الأول.",
  },
  {
    q: "الديون بتأثر إزاي على الزكاة؟",
    a: "الديون المستحقة لك على الغير (وترجو تحصيلها) تُضاف لمالك الزكوي، أما الديون اللي عليك للغير فتُخصم منه قبل حساب الزكاة.",
  },
  {
    q: "هل الحاسبة دي فتوى شرعية؟",
    a: "لأ، دي حاسبة استرشادية عامة فقط، ومش بديل عن استشارة عالم شرعي أو دار الإفتاء لحالتك الخاصة.",
  },
];

// The "صدقات وزكاة" tab — deliberately styled apart from the rest of
// التخطيط المالي (emerald instead of the app's orange). Three tools live
// here: a Sharia zakat calculator (live gold price), a "save + remind me
// next year" tracker, and a charity reminder setup — all persisted to
// app_users except the calculator inputs themselves, which are session-only.
export default function ZakatCharityPanel() {
  const [baseCurrency, setBaseCurrency] = useState("EGP");
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [rates, setRates] = useState<FxRates | null>(null);
  const [hijriCorrection, setHijriCorrection] = useState(0);

  // live gold price — /api/metal-prices returns the 24k (pure) USD/gram
  // price; every other karat is derived client-side from it (karat/24).
  const [goldUsdPerGram24k, setGoldUsdPerGram24k] = useState<number | null>(null);
  const [goldPriceError, setGoldPriceError] = useState("");
  const [country, setCountry] = useState("EG");
  const karat = COUNTRY_KARAT.find((c) => c.code === country)?.karat || 21;
  const countryCurrency = COUNTRY_KARAT.find((c) => c.code === country)?.currency || "EGP";

  // manual fallback price — for when the internet is down, or the user simply
  // trusts a price they've heard today more than the automatic fetch.
  const [manualGoldPrice, setManualGoldPrice] = useState("");
  const [showManualPrice, setShowManualPrice] = useState(false);

  // "حاسبة تحويل العيار" — zakat is always calculated on a pure (24k)
  // basis, so this helper converts jewelry at any other karat (18, 21...)
  // into its 24k-equivalent weight before it goes into the calculator below.
  const [karatGrams, setKaratGrams] = useState("");
  const [karatValue, setKaratValue] = useState("21");
  const karatResult = (num(karatGrams) * num(karatValue)) / 24;

  // zakat calculator inputs — all local, nothing persisted
  const [cash, setCash] = useState("");
  const [goldGrams, setGoldGrams] = useState("");
  const [investments, setInvestments] = useState("");
  const [realEstate, setRealEstate] = useState("");
  const [tradeGoods, setTradeGoods] = useState("");
  const [debtsOwedToMe, setDebtsOwedToMe] = useState("");
  const [debtsIOwe, setDebtsIOwe] = useState("");

  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [zakatOutMsg, setZakatOutMsg] = useState("");

  // "احفظ الزكاة" — records when zakat was paid and computes next year's
  // due date (one Hijri year later), then reminds via Telegram before it.
  const [zakatLastPaidAt, setZakatLastPaidAt] = useState<string | null>(null);
  const [zakatNextDueAt, setZakatNextDueAt] = useState<string | null>(null);
  const [showSaveZakat, setShowSaveZakat] = useState(false);
  const [zakatAsOfDate, setZakatAsOfDate] = useState(todayISO());
  const [savingZakat, setSavingZakat] = useState(false);
  const [zakatSaveMsg, setZakatSaveMsg] = useState("");

  // charity settings
  const [charityAmount, setCharityAmount] = useState("");
  const [charityFrequency, setCharityFrequency] = useState<"daily" | "monthly">("daily");
  const [charityEnabled, setCharityEnabled] = useState(false);
  const [charityMutedDate, setCharityMutedDate] = useState<string | null>(null);
  const [savingCharity, setSavingCharity] = useState(false);
  const [mutingCharity, setMutingCharity] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => {
      if (!d.user) return;
      setBaseCurrency(d.user.base_currency || "EGP");
      setTelegramConnected(!!d.user.telegram_chat_id);
      if (d.user.charity_amount) setCharityAmount(String(d.user.charity_amount));
      if (d.user.charity_frequency) setCharityFrequency(d.user.charity_frequency);
      setCharityEnabled(!!d.user.charity_reminder_enabled);
      setCharityMutedDate(d.user.charity_muted_date || null);
      setHijriCorrection(Number(d.user.hijri_correction_days) || 0);
      setZakatLastPaidAt(d.user.zakat_last_paid_at || null);
      setZakatNextDueAt(d.user.zakat_next_due_at || null);
      if (d.user.zakat_country) setCountry(d.user.zakat_country);
    });
    fetch("/api/fx").then((r) => r.json()).then((d) => setRates(d.rates || null));
    fetch("/api/metal-prices")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setGoldPriceError(d.error); return; }
        setGoldUsdPerGram24k(d.gold?.usd_per_gram_24k ?? null);
      })
      .catch(() => setGoldPriceError("مقدرناش نجيب سعر الذهب الحالي — اكتب المبلغ يدوي في خانة النقد لو حابب."));
  }, []);

  const toBase = (usdAmount: number) => {
    if (!rates) return 0;
    return fromEGP(toEGP(usdAmount, "USD", rates), baseCurrency, rates);
  };

  const manualPriceNum = num(manualGoldPrice);

  // pure (24k) gold price in EGP — used for the dual-currency display box,
  // and as the basis for every EGP/country-currency conversion below. Manual
  // entry (when there's no internet, or the user trusts their own number)
  // always wins over the fetched price.
  const goldPricePerGram24kEGP =
    manualPriceNum > 0 ? manualPriceNum : goldUsdPerGram24k !== null && rates ? toEGP(goldUsdPerGram24k, "USD", rates) : 0;
  const goldPricePerGram24kCountry =
    goldPricePerGram24kEGP > 0 && rates ? fromEGP(goldPricePerGram24kEGP, countryCurrency, rates) : null;
  // reference-only: what the selected country's commonly-traded karat is
  // worth, for local familiarity — NOT used in the actual zakat math anymore.
  const localKaratPriceEGP = goldPricePerGram24kEGP * (karat / 24);

  // pure (24k) gold price in the user's base currency — this is what actually
  // drives the gold-value input and the nisab below, so zakat is always
  // calculated on the pure-gold standard regardless of the selected country.
  const goldPricePerGramBase =
    manualPriceNum > 0 ? (rates ? fromEGP(manualPriceNum, baseCurrency, rates) : baseCurrency === "EGP" ? manualPriceNum : 0)
      : goldUsdPerGram24k !== null ? toBase(goldUsdPerGram24k) : 0;
  const goldPricePerOzBase = goldUsdPerGram24k !== null ? toBase(goldUsdPerGram24k) * 31.1034768 : manualPriceNum > 0 ? goldPricePerGramBase * 31.1034768 : 0;

  const changeCountry = (code: string) => {
    setCountry(code);
    fetch("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zakat_country: code }) }).catch(() => {});
  };

  const calc = useMemo(() => {
    const goldValue = num(goldGrams) * goldPricePerGramBase;
    const totalAssets = num(cash) + goldValue + num(investments) + num(realEstate) + num(tradeGoods) + num(debtsOwedToMe);
    const totalZakatable = Math.max(totalAssets - num(debtsIOwe), 0);
    // 85g at the SAME karat used for the gold-value input, so the "current
    // holdings" figure and the "nisab threshold" figure are always apples-to-apples.
    const nisabValue = goldPricePerGramBase > 0 ? goldPricePerGramBase * 85 : null;
    const meetsNisab = nisabValue !== null && totalZakatable >= nisabValue;
    const zakatDue = meetsNisab ? totalZakatable * 0.025 : 0;
    return { goldValue, totalAssets, totalZakatable, nisabValue, meetsNisab, zakatDue };
  }, [cash, goldGrams, investments, realEstate, tradeGoods, debtsOwedToMe, debtsIOwe, goldPricePerGramBase]);

  // "زكاتك المستحقة" shown in EGP and in the selected country's currency,
  // regardless of what the user's app base currency happens to be set to.
  const zakatDueEGP = rates ? toEGP(calc.zakatDue, baseCurrency, rates) : null;
  const zakatDueCountry = rates && zakatDueEGP !== null ? fromEGP(zakatDueEGP, countryCurrency, rates) : null;

  const saveCharity = async () => {
    setSavingCharity(true);
    setMsg("");
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          charity_amount: charityAmount ? parseFloat(charityAmount) : null,
          charity_frequency: charityFrequency,
          charity_reminder_enabled: charityEnabled,
        }),
      });
      if (!res.ok) { setMsg("حصل خطأ ومتحفظش، حاول تاني"); return; }
      setMsg(telegramConnected ? "تم الحفظ ✅ هتوصلك تذكرة الصدقة على تليجرام" : "تم الحفظ ✅ — لسه لازم تربط بوت تليجرام عشان توصلك التذكرة");
    } catch {
      setMsg("مفيش اتصال بالإنترنت، حاول تاني");
    } finally {
      setSavingCharity(false);
    }
  };

  const mutedToday = charityMutedDate === todayISO();

  const toggleMuteToday = async () => {
    setMutingCharity(true);
    try {
      const nextValue = mutedToday ? null : todayISO();
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ charity_muted_date: nextValue }),
      });
      if (!res.ok) { setMsg("حصل خطأ، حاول تاني"); return; }
      setCharityMutedDate(nextValue);
    } catch {
      setMsg("مفيش اتصال بالإنترنت، حاول تاني");
    } finally {
      setMutingCharity(false);
    }
  };

  const confirmSaveZakat = async () => {
    setSavingZakat(true);
    setZakatSaveMsg("");
    try {
      const res = await fetch("/api/zakat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ as_of_date: zakatAsOfDate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setZakatSaveMsg(data.error || "حصل خطأ ومتحفظش، حاول تاني"); return; }
      setZakatLastPaidAt(data.zakat.zakat_last_paid_at);
      setZakatNextDueAt(data.zakat.zakat_next_due_at);
      setShowSaveZakat(false);
      setZakatSaveMsg(
        telegramConnected
          ? `تم الحفظ ✅ — الزكاة الجاية بإذن الله: ${data.next_due_gregorian} (${data.next_due_hijri}). هنفكرك على تليجرام قبلها.`
          : `تم الحفظ ✅ — الزكاة الجاية بإذن الله: ${data.next_due_gregorian} (${data.next_due_hijri}). اربط بوت تليجرام (من صفحة الإعداد) عشان نفكرك.`
      );
    } catch {
      setZakatSaveMsg("مفيش اتصال بالإنترنت، حاول تاني");
    } finally {
      setSavingZakat(false);
    }
  };

  const asOfHijri = formatHijriFromDate(new Date(zakatAsOfDate + "T00:00:00"), hijriCorrection);

  return (
    <div className="space-y-3">
      {/* live gold price + country/karat selector — drives both the gold
          value input and the nisab basis below, so they're always consistent. */}
      <div className="rounded-2xl p-4 space-y-2 bg-white dark:bg-neutral-900 border border-emerald-200 dark:border-emerald-900">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2"><Coins size={17} /> سعر الذهب الآن (خالص عيار 24)</p>
          <select
            value={country}
            onChange={(e) => changeCountry(e.target.value)}
            className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-transparent px-2 py-1.5 text-xs shrink-0"
          >
            {COUNTRY_KARAT.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </div>

        <div>
          <p className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            {goldPricePerGram24kEGP > 0 ? fmt(goldPricePerGram24kEGP, "EGP") : "..."}
            <span className="text-xs font-normal text-neutral-500"> / جرام — تقريبًا سعر اليوم</span>
          </p>
          {goldPricePerGram24kCountry !== null && countryCurrency !== "EGP" && (
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              ≈ {fmt(goldPricePerGram24kCountry, countryCurrency)} <span className="text-[11px] font-normal text-neutral-500">— تقريبًا سعر اليوم</span>
            </p>
          )}
          {goldPricePerOzBase > 0 && <p className="text-[11px] text-neutral-500">{fmt(goldPricePerOzBase, baseCurrency)} / أوقية ({baseCurrency})</p>}
          {goldPricePerGram24kEGP > 0 && (
            <p className="text-[11px] text-neutral-500 mt-1">سعر عيار {karat} المتداول في {COUNTRY_KARAT.find((c) => c.code === country)?.label} (تقريبًا): {fmt(localKaratPriceEGP, "EGP")} / جرام</p>
          )}
        </div>

        {goldPriceError && <p className="text-[11px] text-amber-700 dark:text-amber-400">{goldPriceError}</p>}

        <button type="button" onClick={() => setShowManualPrice((s) => !s)} className="text-[11px] text-emerald-700 dark:text-emerald-400 underline">
          {showManualPrice ? "إخفاء إدخال السعر اليدوي" : "النت عندك مقطوع أو حابب تدخل سعرك الخاص؟ دوس هنا"}
        </button>
        {showManualPrice && (
          <div className="space-y-1 pt-1">
            <label className="text-[10px] text-neutral-600 dark:text-neutral-300">
              سعر جرام الذهب الخالص (عيار 24) بالجنيه المصري — استخدمه في حالة تعذر جلب السعر تلقائيًا، أو لو واثق في السعر اللي هتكتبه أكتر
            </label>
            <input
              type="number"
              value={manualGoldPrice}
              onChange={(e) => setManualGoldPrice(e.target.value)}
              placeholder="مثال: 4250"
              className="w-full rounded-lg border border-emerald-200 dark:border-emerald-900 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100"
            />
          </div>
        )}
      </div>

      {/* karat converter — zakat is always figured on pure (24k) gold, so this
          helps convert jewelry at any other karat into its 24k-equivalent weight. */}
      <div className="rounded-2xl p-4 space-y-2 bg-white dark:bg-neutral-900 border border-emerald-200 dark:border-emerald-900">
        <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2"><Scale size={17} /> حاسبة تحويل العيار</p>
        <p className="text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-300">
          الزكاة بتُحسب على أساس الذهب الخالص (عيار 24). لو دهبك عيار أقل (زي 18 أو 21)، استخدم الحاسبة دي عشان تعرف وزنه المعادل بعيار 24 قبل ما تحطه في خانة "الذهب بالجرام" تحت.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-neutral-600 dark:text-neutral-300">عدد الجرامات</label>
            <input type="number" value={karatGrams} onChange={(e) => setKaratGrams(e.target.value)} className="w-full rounded-lg border border-emerald-200 dark:border-emerald-900 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100" />
          </div>
          <div>
            <label className="text-[10px] text-neutral-600 dark:text-neutral-300">العيار</label>
            <input type="number" value={karatValue} onChange={(e) => setKaratValue(e.target.value)} placeholder="مثال: 18" className="w-full rounded-lg border border-emerald-200 dark:border-emerald-900 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100" />
          </div>
        </div>
        <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/40 rounded-lg px-3 py-2">
          <span className="text-xs text-emerald-800 dark:text-emerald-300">المعادل بعيار 24 خالص</span>
          <span className="text-sm font-bold text-emerald-900 dark:text-emerald-200">{karatResult > 0 ? karatResult.toFixed(3) : "0"} جم</span>
        </div>
        <button
          type="button"
          onClick={() => setGoldGrams(karatResult > 0 ? karatResult.toFixed(3) : "")}
          disabled={karatResult <= 0}
          className="w-full text-xs bg-emerald-600 text-white rounded-lg py-2 font-medium disabled:opacity-40"
        >
          استخدم الناتج في حاسبة الزكاة ↓
        </button>
      </div>

      {/* summary card — total zakatable wealth, breakdown, nisab, zakat due,
          and shortcuts to log the payment or save it for next year's reminder. */}
      <div className="rounded-2xl p-4 space-y-3 bg-gradient-to-br from-emerald-700 to-emerald-900 text-white shadow-sm">
        <p className="text-xs font-medium text-emerald-100 flex items-center gap-1.5"><Sparkles size={14} /> إجمالي الأموال الزكوية</p>
        <p className="text-3xl font-bold text-white">{fmt(calc.totalZakatable, baseCurrency)}</p>
        <div className="space-y-1 text-[11px] text-emerald-50">
          <div className="flex justify-between"><span>إجمالي الأصول</span><span>{fmt(calc.totalAssets, baseCurrency)}</span></div>
          {num(debtsIOwe) > 0 && <div className="flex justify-between"><span>ناقص: ديون عليك</span><span>-{fmt(num(debtsIOwe), baseCurrency)}</span></div>}
        </div>

        <div className="bg-amber-50 dark:bg-amber-100 text-amber-900 rounded-xl px-3 py-2.5 space-y-1">
          <p className="text-xs font-semibold">نصاب الزكاة الحالي (تقريبي)</p>
          <p className="text-sm font-bold">{calc.nisabValue !== null ? fmt(calc.nisabValue, baseCurrency) : "—"}</p>
          <p className="text-[11px] leading-relaxed">
            — ما يعادل 85 جرام ذهب خالص (عيار 24). إذا بلغ مالك هذا المبلغ ومرّ عليه عام هجري كامل، وجبت عليك الزكاة بنسبة 2.5%.
          </p>
        </div>

        <div className="bg-white rounded-xl px-3 py-2.5 space-y-0.5">
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold text-emerald-900">زكاتك المستحقة (٢.٥٪)</span>
            <span className="text-xl font-bold text-emerald-900">{fmt(calc.zakatDue, baseCurrency)}</span>
          </div>
          {zakatDueEGP !== null && baseCurrency !== "EGP" && (
            <p className="text-[11px] text-emerald-700 text-left">≈ {fmt(zakatDueEGP, "EGP")}</p>
          )}
          {zakatDueCountry !== null && countryCurrency !== "EGP" && countryCurrency !== baseCurrency && (
            <p className="text-[11px] text-emerald-700 text-left">≈ {fmt(zakatDueCountry, countryCurrency)}</p>
          )}
        </div>
        {calc.nisabValue !== null && !calc.meetsNisab && (
          <p className="text-[11px] text-emerald-100">مالك لسه ماوصلش للنصاب — مفيش زكاة واجبة عليك حاليًا.</p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`/add?type=expense&amount=${calc.zakatDue > 0 ? calc.zakatDue.toFixed(2) : ""}&description=${encodeURIComponent("إخراج الزكاة")}`}
            onClick={() => setZakatOutMsg("وفقك الله 🤍")}
            className="block text-center bg-white text-emerald-800 rounded-lg py-2.5 text-sm font-bold"
          >
            أخرج زكاتك الآن
          </Link>
          <button
            onClick={() => { setShowSaveZakat(true); setZakatAsOfDate(todayISO()); }}
            className="flex items-center justify-center gap-1.5 bg-emerald-950/40 border border-white/30 text-white rounded-lg py-2.5 text-sm font-bold"
          >
            <CalendarCheck size={15} /> احفظ الزكاة
          </button>
        </div>
        {zakatOutMsg && <p className="text-center text-[11px] text-emerald-100">{zakatOutMsg}</p>}

        {(zakatLastPaidAt || zakatNextDueAt) && (
          <div className="bg-white/10 rounded-xl px-3 py-2 text-[11px] text-emerald-50 space-y-0.5">
            {zakatLastPaidAt && <p>آخر مرة أخرجت الزكاة: {zakatLastPaidAt} ({formatHijri(gregorianToHijri(new Date(zakatLastPaidAt + "T00:00:00"), hijriCorrection))})</p>}
            {zakatNextDueAt && <p>الزكاة القادمة: {zakatNextDueAt} ({formatHijri(gregorianToHijri(new Date(zakatNextDueAt + "T00:00:00"), hijriCorrection))})</p>}
          </div>
        )}
      </div>

      {/* input boxes — any change here live-updates the summary card above */}
      <div className="rounded-2xl p-4 space-y-3 bg-white dark:bg-neutral-900 border border-emerald-200 dark:border-emerald-900">
        <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2"><Moon size={17} /> بيانات حاسبة الزكاة</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-neutral-600 dark:text-neutral-300">النقد ({baseCurrency})</label>
            <input type="number" value={cash} onChange={(e) => setCash(e.target.value)} className="w-full rounded-lg border border-emerald-200 dark:border-emerald-900 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100" />
          </div>
          <div>
            <label className="text-[10px] text-neutral-600 dark:text-neutral-300">
              الذهب بالجرام (عيار 24 خالص{goldPricePerGramBase > 0 ? ` — ${fmt(goldPricePerGramBase, baseCurrency)}/جم` : ""})
            </label>
            <input type="number" value={goldGrams} onChange={(e) => setGoldGrams(e.target.value)} className="w-full rounded-lg border border-emerald-200 dark:border-emerald-900 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100" />
          </div>
          <div>
            <label className="text-[10px] text-neutral-600 dark:text-neutral-300">الأسهم والاستثمارات ({baseCurrency})</label>
            <input type="number" value={investments} onChange={(e) => setInvestments(e.target.value)} className="w-full rounded-lg border border-emerald-200 dark:border-emerald-900 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100" />
          </div>
          <div>
            <label className="text-[10px] text-neutral-600 dark:text-neutral-300">عقارات للتجارة ({baseCurrency})</label>
            <input type="number" value={realEstate} onChange={(e) => setRealEstate(e.target.value)} className="w-full rounded-lg border border-emerald-200 dark:border-emerald-900 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100" />
          </div>
          <div>
            <label className="text-[10px] text-neutral-600 dark:text-neutral-300">البضائع التجارية ({baseCurrency})</label>
            <input type="number" value={tradeGoods} onChange={(e) => setTradeGoods(e.target.value)} className="w-full rounded-lg border border-emerald-200 dark:border-emerald-900 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100" />
          </div>
          <div>
            <label className="text-[10px] text-neutral-600 dark:text-neutral-300">ديون لك عند الغير ({baseCurrency})</label>
            <input type="number" value={debtsOwedToMe} onChange={(e) => setDebtsOwedToMe(e.target.value)} className="w-full rounded-lg border border-emerald-200 dark:border-emerald-900 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100" />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] text-neutral-600 dark:text-neutral-300">ديون عليك ({baseCurrency}) — بتتخصم من الإجمالي</label>
            <input type="number" value={debtsIOwe} onChange={(e) => setDebtsIOwe(e.target.value)} className="w-full rounded-lg border border-emerald-200 dark:border-emerald-900 bg-transparent px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100" />
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-300">
          الزكاة واجبة على المال إذا بلغ <b>النصاب</b> وحال عليه <b>الحول</b> (سنة هجرية كاملة). الحساب هنا بيتم كله على أساس الذهب الخالص (عيار 24) — لو دهبك عيار مختلف استخدم حاسبة تحويل العيار فوق. الحاسبة دي للاسترشاد العام فقط، ومش بديل عن استشارة عالم شرعي أو دار الإفتاء لحالتك بالتحديد.
        </p>
      </div>

      {/* FAQ — collapsed by default; tapping the arrow reveals the answer */}
      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-neutral-900 divide-y divide-emerald-100 dark:divide-emerald-900 overflow-hidden">
        <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300 px-4 pt-3 pb-1">أسئلة شائعة عن الزكاة</p>
        {FAQ.map((item, i) => (
          <div key={i}>
            <button
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
              className="w-full flex items-center justify-between text-right px-4 py-3 text-sm font-medium text-neutral-800 dark:text-neutral-100"
            >
              <span>{item.q}</span>
              <ChevronDown size={16} className={`shrink-0 text-emerald-600 transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
            </button>
            {openFaq === i && <p className="px-4 pb-3 text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">{item.a}</p>}
          </div>
        ))}
      </div>

      <Card className="space-y-3 !bg-emerald-50 dark:!bg-emerald-950/40 !border-emerald-200 dark:!border-emerald-900">
        <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2"><HeartHandshake size={17} /> صدقات</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-neutral-600 dark:text-neutral-300">قيمة الصدقة ({baseCurrency})</label>
            <input type="number" value={charityAmount} onChange={(e) => setCharityAmount(e.target.value)} className="w-full rounded-lg border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100" />
          </div>
          <div>
            <label className="text-[10px] text-neutral-600 dark:text-neutral-300">كل قد إيه؟</label>
            <select value={charityFrequency} onChange={(e) => setCharityFrequency(e.target.value as any)} className="w-full rounded-lg border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100">
              <option value="daily">يوميًا (كل ٣ ساعات تذكير)</option>
              <option value="monthly">شهريًا</option>
            </select>
          </div>
        </div>
        <label className="flex items-center justify-between text-xs text-neutral-700 dark:text-neutral-300">
          <span className="flex items-center gap-1.5"><Send size={13} /> تذكير الصدقة على تليجرام</span>
          <button type="button" onClick={() => setCharityEnabled((s) => !s)} className={`w-11 h-6 rounded-full transition ${charityEnabled ? "bg-emerald-600" : "bg-neutral-300"}`}>
            <span className={`block w-5 h-5 bg-white rounded-full shadow transition ${charityEnabled ? "translate-x-[-22px]" : "translate-x-[-2px]"}`} />
          </button>
        </label>
        {!telegramConnected && charityEnabled && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400">لازم تربط بوت تليجرام (من صفحة الإعداد Admin) عشان توصلك التذكرة.</p>
        )}
        <button disabled={savingCharity} onClick={saveCharity} className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-60">
          <Save size={15} /> {savingCharity ? "جاري الحفظ..." : "حفظ"}
        </button>

        {charityEnabled && (
          <button
            disabled={mutingCharity}
            onClick={toggleMuteToday}
            className={`w-full flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium border ${mutedToday ? "bg-emerald-600 text-white border-emerald-600" : "border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"}`}
          >
            <BellOff size={15} /> {mutedToday ? "تم إخراج الصدقة اليوم ✅ (دوس عشان تلغي)" : "تم إخراج الصدقة — سكّت تذكير النهاردة"}
          </button>
        )}
        {mutedToday && <p className="text-[11px] text-center text-emerald-700 dark:text-emerald-400">مش هتوصلك تذكيرات صدقة النهاردة، وهترجع تعمل عادي بكرة.</p>}

        {msg && <p className="text-xs text-center text-emerald-700 dark:text-emerald-400">{msg}</p>}

        <div className="border-t border-emerald-100 dark:border-emerald-900 pt-2 space-y-2 text-center">
          <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">"مَا نَقَصَ مَالُ عَبدٍ مِن صَدَقَةٍ"</p>
          <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">"وَمَا أَنفَقْتُم مِّن شَيْءٍ فَهُوَ يُخْلِفُهُ وَهُوَ خَيْرُ الرَّازِقِينَ" — {"{"}سبأ:٣٩{"}"}</p>
        </div>
      </Card>

      {showSaveZakat && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={() => setShowSaveZakat(false)}>
          <div className="bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold text-sm flex items-center gap-1.5"><CalendarDays size={16} className="text-emerald-600" /> حدد تاريخ إخراج الزكاة</p>
            <p className="text-xs text-neutral-500">حط التاريخ اللي حسبت عليه الزكاة دي — عليه هنحسب معاد الزكاة الجاية (بعد سنة هجرية كاملة) ونفكرك بيها قبلها.</p>
            <input
              type="date"
              value={zakatAsOfDate}
              max={todayISO()}
              onChange={(e) => setZakatAsOfDate(e.target.value || todayISO())}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
            />
            <p className="text-xs text-center text-emerald-700 dark:text-emerald-400">التاريخ الهجري المقابل: {asOfHijri}</p>
            {zakatSaveMsg && <p className="text-xs text-center text-red-500">{zakatSaveMsg}</p>}
            <div className="flex gap-2">
              <button onClick={() => setShowSaveZakat(false)} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm">إلغاء</button>
              <button disabled={savingZakat} onClick={confirmSaveZakat} className="flex-1 bg-emerald-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60">
                {savingZakat ? "جاري الحفظ..." : "تأكيد الحفظ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {!showSaveZakat && zakatSaveMsg && (
        <Card className="text-xs text-center !bg-emerald-50 dark:!bg-emerald-950/40 text-emerald-800 dark:text-emerald-300">{zakatSaveMsg}</Card>
      )}
    </div>
  );
}
