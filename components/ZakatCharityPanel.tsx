"use client";
import { useEffect, useState } from "react";
import Card from "@/components/Card";
import { fmt } from "@/lib/format";
import { Moon, HeartHandshake, Save, Send } from "lucide-react";

// The "صدقات وزكاة" tab — deliberately styled apart from the rest of
// التخطيط المالي (emerald instead of the app's orange) since the user asked
// for it to stand out. Two independent tools live here: a Sharia zakat
// calculator (stateless — nothing saved) and a charity reminder setup
// (persisted to app_users, picked up daily by the Telegram cron).
export default function ZakatCharityPanel() {
  const [baseCurrency, setBaseCurrency] = useState("EGP");
  const [telegramConnected, setTelegramConnected] = useState(false);

  // zakat calculator — all local, nothing persisted
  const [goldGrams, setGoldGrams] = useState("");
  const [goldPrice, setGoldPrice] = useState("");
  const [silverGrams, setSilverGrams] = useState("");
  const [silverPrice, setSilverPrice] = useState("");
  const [cash, setCash] = useState("");

  // charity settings
  const [charityAmount, setCharityAmount] = useState("");
  const [charityFrequency, setCharityFrequency] = useState<"daily" | "monthly">("daily");
  const [charityEnabled, setCharityEnabled] = useState(false);
  const [savingCharity, setSavingCharity] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => {
      if (!d.user) return;
      setBaseCurrency(d.user.base_currency || "EGP");
      setTelegramConnected(!!d.user.telegram_chat_id);
      if (d.user.charity_amount) setCharityAmount(String(d.user.charity_amount));
      if (d.user.charity_frequency) setCharityFrequency(d.user.charity_frequency);
      setCharityEnabled(!!d.user.charity_reminder_enabled);
    });
  }, []);

  const num = (s: string) => parseFloat(s) || 0;
  const goldValue = num(goldGrams) * num(goldPrice);
  const silverValue = num(silverGrams) * num(silverPrice);
  const totalWealth = goldValue + silverValue + num(cash);
  // 85g of gold is the standard reference for the nisab threshold used by
  // most Zakat calculators; needs today's gold price/gram to compute a value.
  const nisabValue = num(goldPrice) > 0 ? num(goldPrice) * 85 : null;
  const meetsNisab = nisabValue !== null && totalWealth >= nisabValue;
  const zakatDue = meetsNisab ? totalWealth * 0.025 : 0;

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
      setMsg(telegramConnected ? "تم الحفظ ✅ هتوصلك تذكرة الصدقة يوميًا على تليجرام" : "تم الحفظ ✅ — لسه لازم تربط بوت تليجرام عشان توصلك التذكرة اليومية");
    } catch {
      setMsg("مفيش اتصال بالإنترنت، حاول تاني");
    } finally {
      setSavingCharity(false);
    }
  };

  return (
    <div className="space-y-3">
      <Card className="space-y-3 !bg-emerald-50 dark:!bg-emerald-950/40 !border-emerald-200 dark:!border-emerald-900">
        <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2"><Moon size={17} /> حاسبة الزكاة الشرعية</p>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-emerald-700/70 dark:text-emerald-400/70">جرامات الذهب</label>
            <input type="number" value={goldGrams} onChange={(e) => setGoldGrams(e.target.value)} className="w-full rounded-lg border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-neutral-900 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-[10px] text-emerald-700/70 dark:text-emerald-400/70">سعر جرام الذهب ({baseCurrency})</label>
            <input type="number" value={goldPrice} onChange={(e) => setGoldPrice(e.target.value)} className="w-full rounded-lg border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-neutral-900 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-[10px] text-emerald-700/70 dark:text-emerald-400/70">جرامات الفضة</label>
            <input type="number" value={silverGrams} onChange={(e) => setSilverGrams(e.target.value)} className="w-full rounded-lg border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-neutral-900 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-[10px] text-emerald-700/70 dark:text-emerald-400/70">سعر جرام الفضة ({baseCurrency})</label>
            <input type="number" value={silverPrice} onChange={(e) => setSilverPrice(e.target.value)} className="w-full rounded-lg border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-neutral-900 px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="text-[10px] text-emerald-700/70 dark:text-emerald-400/70">مبلغ نقدي (كاش، مدخرات، إلخ) — {baseCurrency}</label>
          <input type="number" value={cash} onChange={(e) => setCash(e.target.value)} className="w-full rounded-lg border border-emerald-200 dark:border-emerald-900 bg-white dark:bg-neutral-900 px-3 py-2 text-sm" />
        </div>

        <div className="bg-white dark:bg-neutral-900 rounded-xl p-3 space-y-1.5">
          <div className="flex justify-between text-xs"><span className="text-neutral-500">إجمالي المال الزكوي</span><span className="font-medium">{fmt(totalWealth, baseCurrency)}</span></div>
          <div className="flex justify-between text-xs">
            <span className="text-neutral-500">النصاب (٨٥ جم ذهب)</span>
            <span className="font-medium">{nisabValue !== null ? fmt(nisabValue, baseCurrency) : "اكتب سعر جرام الذهب الأول"}</span>
          </div>
          <div className="flex justify-between items-center pt-1.5 border-t border-neutral-100 dark:border-neutral-800">
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">الزكاة الواجبة (٢.٥٪)</span>
            <span className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{fmt(zakatDue, baseCurrency)}</span>
          </div>
          {nisabValue !== null && !meetsNisab && (
            <p className="text-[11px] text-neutral-400">مالك لسه ماوصلش للنصاب — مفيش زكاة واجبة عليك حاليًا.</p>
          )}
        </div>

        <p className="text-[11px] leading-relaxed text-emerald-800/80 dark:text-emerald-300/70">
          <b>شرح مختصر:</b> الزكاة واجبة على المال (ذهب، فضة، نقود، عروض تجارة) إذا بلغ <b>النصاب</b> (المرجع الشائع: قيمة ٨٥ جرام ذهب) وحال عليه <b>الحول</b> (مرّت عليه سنة هجرية كاملة وهو في ملكك بنفس القدر أو أكثر). ومقدارها <b>٢.٥٪</b> من إجمالي المال الزكوي. الحاسبة دي للاسترشاد العام فقط، ومش بديل عن استشارة عالم شرعي أو دار الإفتاء لحالتك بالتحديد.
        </p>
      </Card>

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
              <option value="daily">يوميًا</option>
              <option value="monthly">شهريًا</option>
            </select>
          </div>
        </div>
        <label className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5"><Send size={13} /> تذكير يومي على تليجرام</span>
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
        {msg && <p className="text-xs text-center text-emerald-700 dark:text-emerald-400">{msg}</p>}

        <div className="border-t border-emerald-100 dark:border-emerald-900 pt-2 space-y-2 text-center">
          <p className="text-xs text-emerald-800/80 dark:text-emerald-300/70 leading-relaxed">"مَا نَقَصَ مَالُ عَبدٍ مِن صَدَقَةٍ"</p>
          <p className="text-xs text-emerald-800/80 dark:text-emerald-300/70 leading-relaxed">"وَمَا أَنفَقْتُم مِّن شَيْءٍ فَهُوَ يُخْلِفُهُ وَهُوَ خَيْرُ الرَّازِقِينَ" — {"{"}سبأ:٣٩{"}"}</p>
        </div>
      </Card>
    </div>
  );
}
