"use client";
import { useEffect, useMemo, useState } from "react";
import Card from "@/components/Card";
import { fmt } from "@/lib/format";
import { toEGP, fromEGP, type FxRates } from "@/lib/fx";
import { Moon, HeartHandshake, Save, Send, ChevronDown, Sparkles, BellOff } from "lucide-react";
import Link from "next/link";

const num = (s: string) => parseFloat(s) || 0;
const todayISO = () => new Date().toISOString().slice(0, 10);

const FAQ = [
  {
    q: "إمتى تكون الزكاة واجبة عليّ؟",
    a: "الزكاة واجبة إذا بلغ مالك الزكوي (ذهب، فضة، نقود، عروض تجارة) قيمة النصاب، وحال عليه الحول (مرّت سنة هجرية كاملة وهو باقٍ في ملكك بنفس القدر أو أكثر).",
  },
  {
    q: "إزاي بيتحسب النصاب؟",
    a: "المرجع الشائع لنصاب النقود والعروض التجارية هو قيمة ٨٥ جرام من الذهب عيار ٢٤ بسعر السوق الحالي.",
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
// التخطيط المالي (emerald instead of the app's orange). Two tools live here:
// a Sharia zakat calculator (stateless — nothing saved, live gold price)
// and a charity reminder setup (persisted to app_users, sent via Telegram).
export default function ZakatCharityPanel() {
  const [baseCurrency, setBaseCurrency] = useState("EGP");
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [rates, setRates] = useState<FxRates | null>(null);

  // live gold price (USD/gram, both 21k for jewelry-style entry and 24k for
  // the nisab reference), fetched from /api/metal-prices (cached server-side).
  const [goldUsdPerGram21k, setGoldUsdPerGram21k] = useState<number | null>(null);
  const [goldUsdPerGram24k, setGoldUsdPerGram24k] = useState<number | null>(null);
  const [goldPriceError, setGoldPriceError] = useState("");

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
    });
    fetch("/api/fx").then((r) => r.json()).then((d) => setRates(d.rates || null));
    fetch("/api/metal-prices")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setGoldPriceError(d.error); return; }
        setGoldUsdPerGram21k(d.gold?.usd_per_gram_21k ?? null);
        setGoldUsdPerGram24k(d.gold?.usd_per_gram_24k ?? null);
      })
      .catch(() => setGoldPriceError("مقدرناش نجيب سعر الذهب الحالي — اكتب المبلغ يدوي في خانة النقد لو حابب."));
  }, []);

  const toBase = (usdAmount: number) => {
    if (!rates) return 0;
    return fromEGP(toEGP(usdAmount, "USD", rates), baseCurrency, rates);
  };

  const goldPricePerGram21kBase = goldUsdPerGram21k !== null ? toBase(goldUsdPerGram21k) : 0;
  const goldPricePerGram24kBase = goldUsdPerGram24k !== null ? toBase(goldUsdPerGram24k) : 0;

  const calc = useMemo(() => {
    const goldValue = num(goldGrams) * goldPricePerGram21kBase;
    const totalAssets = num(cash) + goldValue + num(investments) + num(realEstate) + num(tradeGoods) + num(debtsOwedToMe);
    const totalZakatable = Math.max(totalAssets - num(debtsIOwe), 0);
    // 85g of 24k gold is the standard reference for the nisab threshold.
    const nisabValue = goldPricePerGram24kBase > 0 ? goldPricePerGram24kBase * 85 : null;
    const meetsNisab = nisabValue !== null && totalZakatable >= nisabValue;
    const zakatDue = meetsNisab ? totalZakatable * 0.025 : 0;
    return { goldValue, totalAssets, totalZakatable, nisabValue, meetsNisab, zakatDue };
  }, [cash, goldGrams, investments, realEstate, tradeGoods, debtsOwedToMe, debtsIOwe, goldPricePerGram21kBase, goldPricePerGram24kBase]);

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

  return (
    <div className="space-y-3">
      {/* summary card — mirrors the reference design: total zakatable wealth,
          breakdown, nisab, zakat due, and a CTA to go log the payment. */}
      <div className="rounded-2xl p-4 space-y-3 bg-gradient-to-br from-emerald-700 to-emerald-900 text-white shadow-sm">
        <p className="text-xs font-medium text-emerald-100 flex items-center gap-1.5"><Sparkles size={14} /> إجمالي الأموال الزكوية</p>
        <p className="text-3xl font-bold">{fmt(calc.totalZakatable, baseCurrency)}</p>
        <div className="space-y-1 text-[11px] text-emerald-100/90">
          <div className="flex justify-between"><span>إجمالي الأصول</span><span>{fmt(calc.totalAssets, baseCurrency)}</span></div>
          {num(debtsIOwe) > 0 && <div className="flex justify-between"><span>ناقص: ديون عليك</span><span>-{fmt(num(debtsIOwe), baseCurrency)}</span></div>}
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 rounded-xl px-3 py-2 flex justify-between items-center text-xs">
          <span className="font-medium">نصاب الزكاة الحالي (٨٥ جم ذهب ٢٤)</span>
          <span className="font-bold">{calc.nisabValue !== null ? fmt(calc.nisabValue, baseCurrency) : "—"}</span>
        </div>

        <div className="bg-white/10 rounded-xl px-3 py-2.5 flex justify-between items-center">
          <span className="text-sm font-semibold">زكاتك المستحقة (٢.٥٪)</span>
          <span className="text-xl font-bold">{fmt(calc.zakatDue, baseCurrency)}</span>
        </div>
        {calc.nisabValue !== null && !calc.meetsNisab && (
          <p className="text-[11px] text-emerald-100/80">مالك لسه ماوصلش للنصاب — مفيش زكاة واجبة عليك حاليًا.</p>
        )}
        {goldPriceError && <p className="text-[11px] text-amber-200">{goldPriceError}</p>}

        <Link
          href={`/add?type=expense&amount=${calc.zakatDue > 0 ? calc.zakatDue.toFixed(2) : ""}&description=${encodeURIComponent("إخراج الزكاة")}`}
          onClick={() => setZakatOutMsg("وفقك الله 🤍")}
          className="block text-center bg-white text-emerald-800 rounded-lg py-2.5 text-sm font-bold"
        >
          أخرج زكاتك الآن
        </Link>
        {zakatOutMsg && <p className="text-center text-[11px] text-emerald-100">{zakatOutMsg}</p>}
      </div>

      {/* input boxes — any change here live-updates the summary card above */}
      <div className="rounded-2xl p-4 space-y-3 bg-white dark:bg-neutral-900 border border-emerald-200 dark:border-emerald-900">
        <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2"><Moon size={17} /> بيانات حاسبة الزكاة</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-emerald-700/70 dark:text-emerald-400/70">النقد ({baseCurrency})</label>
            <input type="number" value={cash} onChange={(e) => setCash(e.target.value)} className="w-full rounded-lg border border-emerald-200 dark:border-emerald-900 bg-transparent px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-[10px] text-emerald-700/70 dark:text-emerald-400/70">
              الذهب بالجرام {goldPricePerGram21kBase > 0 ? `(سعر الجرام: ${fmt(goldPricePerGram21kBase, baseCurrency)})` : ""}
            </label>
            <input type="number" value={goldGrams} onChange={(e) => setGoldGrams(e.target.value)} className="w-full rounded-lg border border-emerald-200 dark:border-emerald-900 bg-transparent px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-[10px] text-emerald-700/70 dark:text-emerald-400/70">الأسهم والاستثمارات ({baseCurrency})</label>
            <input type="number" value={investments} onChange={(e) => setInvestments(e.target.value)} className="w-full rounded-lg border border-emerald-200 dark:border-emerald-900 bg-transparent px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-[10px] text-emerald-700/70 dark:text-emerald-400/70">عقارات للتجارة ({baseCurrency})</label>
            <input type="number" value={realEstate} onChange={(e) => setRealEstate(e.target.value)} className="w-full rounded-lg border border-emerald-200 dark:border-emerald-900 bg-transparent px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-[10px] text-emerald-700/70 dark:text-emerald-400/70">البضائع التجارية ({baseCurrency})</label>
            <input type="number" value={tradeGoods} onChange={(e) => setTradeGoods(e.target.value)} className="w-full rounded-lg border border-emerald-200 dark:border-emerald-900 bg-transparent px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-[10px] text-emerald-700/70 dark:text-emerald-400/70">ديون لك عند الغير ({baseCurrency})</label>
            <input type="number" value={debtsOwedToMe} onChange={(e) => setDebtsOwedToMe(e.target.value)} className="w-full rounded-lg border border-emerald-200 dark:border-emerald-900 bg-transparent px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] text-emerald-700/70 dark:text-emerald-400/70">ديون عليك ({baseCurrency}) — بتتخصم من الإجمالي</label>
            <input type="number" value={debtsIOwe} onChange={(e) => setDebtsIOwe(e.target.value)} className="w-full rounded-lg border border-emerald-200 dark:border-emerald-900 bg-transparent px-3 py-2 text-sm" />
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-emerald-800/80 dark:text-emerald-300/70">
          الزكاة واجبة على المال إذا بلغ <b>النصاب</b> وحال عليه <b>الحول</b> (سنة هجرية كاملة). الحاسبة دي للاسترشاد العام فقط، ومش بديل عن استشارة عالم شرعي أو دار الإفتاء لحالتك بالتحديد.
        </p>
      </div>

      {/* FAQ — collapsed by default; tapping the arrow reveals the answer */}
      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-neutral-900 divide-y divide-emerald-100 dark:divide-emerald-900 overflow-hidden">
        <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300 px-4 pt-3 pb-1">أسئلة شائعة عن الزكاة</p>
        {FAQ.map((item, i) => (
          <div key={i}>
            <button
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
              className="w-full flex items-center justify-between text-right px-4 py-3 text-sm font-medium"
            >
              <span>{item.q}</span>
              <ChevronDown size={16} className={`shrink-0 text-emerald-600 transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
            </button>
            {openFaq === i && <p className="px-4 pb-3 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">{item.a}</p>}
          </div>
        ))}
      </div>

      <Card className="space-y-3 !bg-emerald-50 dark:!bg-emerald-950/40 !border-emerald-200 dark:!border-emerald-900">
        <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2"><HeartHandshake size={17} /> صدقات</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-emerald-700/70 dark:text-emerald-400/70">قيمة الصدقة ({baseCurrency})</label>
            <input type="number" value={charityAmount} onChange={(e) => setCharityAmount(e.target.value)} className="w-full rounded-lg border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-neutral-900 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-[10px] text-emerald-700/70 dark:text-emerald-400/70">كل قد إيه؟</label>
            <select value={charityFrequency} onChange={(e) => setCharityFrequency(e.target.value as any)} className="w-full rounded-lg border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-neutral-900 px-3 py-2 text-sm">
              <option value="daily">يوميًا (كل ٣ ساعات تذكير)</option>
              <option value="monthly">شهريًا</option>
            </select>
          </div>
        </div>
        <label className="flex items-center justify-between text-xs">
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
          <p className="text-xs text-emerald-800/80 dark:text-emerald-300/70 leading-relaxed">"مَا نَقَصَ مَالُ عَبدٍ مِن صَدَقَةٍ"</p>
          <p className="text-xs text-emerald-800/80 dark:text-emerald-300/70 leading-relaxed">"وَمَا أَنفَقْتُم مِّن شَيْءٍ فَهُوَ يُخْلِفُهُ وَهُوَ خَيْرُ الرَّازِقِينَ" — {"{"}سبأ:٣٩{"}"}</p>
        </div>
      </Card>
    </div>
  );
}
