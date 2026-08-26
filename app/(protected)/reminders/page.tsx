"use client";
import { useEffect, useRef, useState } from "react";
import Card from "@/components/Card";
import Switch from "@/components/Switch";
import { shrinkImage } from "@/lib/image";
import { shareFile } from "@/lib/shareFile";
import { fmt } from "@/lib/format";
import { MEAL_TIMING_LABELS, MEDICATION_FORM_LABELS, SCHEDULE_TYPE_LABELS } from "@/lib/medicationSchedule";
import { lookupDefaultUnit } from "@/lib/groceryDefaultUnits";
import { Trash2, Camera, Loader2, FileDown, CheckCircle2, Pill, Pencil, X, Upload, Image as ImageIcon, ShoppingCart, Receipt, ListChecks, Plus } from "lucide-react";

type Tab = "grocery" | "general" | "medications" | "utility";

const inputCls = "w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm";
const btnPrimary = "bg-orange-500 hover:bg-orange-600 text-white rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50";
const btnGhost = "border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 text-sm";

// النص الموحّد لأي عملية بتستنى رد من الذكاء الاصطناعي في التطبيق كله —
// طلب صريح من المستخدم (Round 32) إن أي نتيجة/بحث بالذكاء الاصطناعي يوضح
// إنه بيكلم خوادم IDEA بدل نص عام زي "جاري التحميل".
const AI_LOADING_TEXT = "جاري الاتصال بخوادم IDEA...";

// Round 34 postmortem — "تصدير قائمة السوبر ماركت لسه بايظ": مش نفس باج
// الـ bidi بتاع Round 33 (اللي كان في الـ EGP/USD)، ده باج تاني خالص — صنف
// واحد بس باسم طويل من غير مسافات (زي اسم منتج ملزوق من متجر) كان بيخلي
// عرض الـ <table> يتمدد لعرض النص كامل (table-layout: auto الافتراضي)
// وياخد الـ node كله معاه لبره حدوده الثابتة (700px)، فـ html2canvas بيقص
// أي حاجة طلعت برة الصندوق — يعني عمود الكمية والسعر بيختفوا تمامًا من كل
// الصفوف مش بس الصف الطويل. الحل: عرض أعمدة ثابت (table-layout: fixed) +
// word-break على أي عمود نص حر (اسم الصنف/التفاصيل) عشان الاسم الطويل
// ينزل سطر جديد جوه عموده بدل ما يمدد الجدول كله. + escapeHtml لأي نص حر
// (بيتحط في innerHTML مباشرة) عشان علامات زي < أو & متكسرش الرسم.
function escapeHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
// أي رقم/نص لاتيني لازم يتلف جوه سياق RTL (زي "×2" أو "12 / 20") بيتقلب
// بصريًا بخوارزمية bidi بتاعة المتصفح لو اتكتب خام — بنعزله جوه span بـ
// unicode-bidi: isolate + direction: ltr عشان يفضل بترتيبه الصح.
function ltrIsolate(s: string): string {
  return `<span dir="ltr" style="unicode-bidi:isolate;">${s}</span>`;
}

// "رفع او تصوير" (Round 32) — زرارين منفصلين بدل زرار واحد: واحد بيفتح
// الكاميرا مباشرة (capture="environment")، والتاني بيفتح معرض الصور العادي
// (من غير capture عشان بعض المتصفحات بتقفل اختيار المعرض لما capture متحطة).
function PhotoCaptureRow({ onPick }: { onPick: (dataUrl: string) => void }) {
  const handle = async (f: File | undefined) => {
    if (f) onPick(await shrinkImage(f));
  };
  return (
    <div className="flex gap-2">
      <label className={`${btnGhost} flex-1 flex items-center justify-center gap-1 cursor-pointer`}>
        <Camera size={14} /> تصوير
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handle(e.target.files?.[0])} />
      </label>
      <label className={`${btnGhost} flex-1 flex items-center justify-center gap-1 cursor-pointer`}>
        <Upload size={14} /> رفع من المعرض
        <input type="file" accept="image/*" className="hidden" onChange={(e) => handle(e.target.files?.[0])} />
      </label>
    </div>
  );
}

export default function RemindersPage() {
  const [tab, setTab] = useState<Tab>("grocery");
  const tabs: { key: Tab; label: string }[] = [
    { key: "grocery", label: "🛒 سوبر ماركت" },
    { key: "general", label: "📅 عامة" },
    { key: "medications", label: "💊 أدوية" },
    { key: "utility", label: "🔌 عدادات" },
  ];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">التذكيرات</h1>
      <div className="grid grid-cols-4 gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-xl p-1 text-[11px] sm:text-xs">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`py-2 rounded-lg font-medium ${tab === t.key ? "bg-white dark:bg-neutral-900 shadow" : "text-neutral-500"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "grocery" && <GroceryTab />}
      {tab === "general" && <GeneralTab />}
      {tab === "medications" && <MedicationsTab />}
      {tab === "utility" && <UtilityTab />}
    </div>
  );
}

/* ============================= سوبر ماركت ============================= */

interface OptionRow {
  id: string;
  brand: string | null;
  store_name: string | null;
  price: number;
  currency: string;
  source: string;
}
// Round 36 — "في الكمية او العبوه زود اضافة وحدة قياس": القائمة كانت 5
// وحدات بس ومش كافية تغطي الملف المرجعي اللي رفعه المستخدم (~310 صنف،
// 19 وحدة تعبئة شائعة مختلفة بعد التبسيط — راجع lib/groceryDefaultUnits.ts).
// اتضافت هنا كلها + خيار "وحدة أخرى" حر (custom_unit_mode تحت) لأي حاجة
// مش من ضمن القائمة.
const GROCERY_UNITS = [
  "علبة", "كيس", "كيلو", "لتر", "زجاجة", "صندوق كامل", "باكت", "برطمان",
  "أنبوبة", "قطعة", "لفة", "ظرف", "شكارة", "طبق", "جركن", "كانز",
  "كرتونة", "كوب", "عبوة",
];
const CUSTOM_UNIT_VALUE = "__custom__";

// Round 37 — نتيجة إكمال تلقائي واحدة من الكتالوج العام (market_catalog،
// متغذّي من سكريبت سحب الأسعار — راجع lib/marketCatalog.ts).
interface MarketSuggestion {
  id: string;
  item_name: string;
  brand: string | null;
  size_value: number | null;
  unit_type: string | null;
  store_name: string;
  price: number;
  currency: string;
}

// وحدات الكتالوج العام (زجاجة/كيس/صندوق/علبة/لتر/كيلو/جرام/قطعة — راجع
// lib/marketCatalogParser.ts) مش نفس أسماء GROCERY_UNITS بالظبط ("صندوق"
// هنا يقابل "صندوق كامل"، و"جرام" مالوش عمود مستقل أصلًا — بيتحط كوزن حر
// (grams) تحت وحدة "كيلو" زي أي صنف كيلو تاني في التطبيق). الدالة دي بتحول
// من تصنيف الكتالوج لشكل LineState الجاهز.
function marketUnitToLine(unitType: string | null, sizeValue: number | null): { unit: string; quantity: number; grams: number | null } {
  if (unitType === "صندوق") return { unit: "صندوق كامل", quantity: sizeValue || 1, grams: null };
  if (unitType === "جرام") return { unit: "كيلو", quantity: 1, grams: sizeValue || null };
  if (unitType && GROCERY_UNITS.includes(unitType)) return { unit: unitType, quantity: sizeValue || 1, grams: null };
  return { unit: "", quantity: sizeValue || 1, grams: null };
}
// how many rows' worth of "no catalog match" names get sent to Gemini in one
// call — the user hit a real quota-exceeded error and asked directly whether
// to batch lookups instead of one-call-per-item; grouping by 3 cuts the call
// count roughly 3x for a typical multi-item list while keeping each response
// small enough that a single failure doesn't stall the whole list.
const AI_BATCH_SIZE = 3;

interface LineState {
  id: number;
  raw_text: string;
  unit: string;
  item_id: string | null;
  item_name: string | null;
  options: OptionRow[];
  selectedOptionId: string | null;
  quantity: number;
  // Round 35 — "وزن حر جرام" لأصناف الكيلو: لو متسجل، بيبقى هو المرجّح
  // الفعلي للسعر بدل quantity (grams/1000)، بيسمح بوزن دقيق زي 750 جرام
  // بدل ما المستخدم يقرّب لأقرب نص/ربع كيلو. null = مفيش وزن حر متسجل،
  // quantity هو اللي بيتحسب بيه زي العادي.
  grams: number | null;
  loadingAi: boolean;
  aiMessage: string | null;
  // Round 36 — "خلي الخانه مفتوحه للكتابة جاهزه" بدل زرار "سجّل السعر
  // يدويًا" اللي كان بيكشف/يخفي الخانة: السعر بقى دايمًا معروض وقابل
  // للتعديل، ومتعبّى أوتوماتيك من أرخص سعر معروف لو موجود.
  manualStore: string;
  manualBrand: string;
  manualPrice: string;
  // Round 36 — "نكتفي تحت بعلامه خضراء ... حمرا": بيتسجل هنا إزاي السعر
  // اتلقى — "ai" (الذكاء الاصطناعي بحث عنه دلوقتي) أو "catalog" (كان
  // متسجل/متخزن قبل كده — سواء من كتالوج سابق أو إدخال يدوي)، وبيتعرض
  // كنقطة خضراء/حمراء واحدة تحت خيارات السعر بدل أيقونة Sparkles لكل خيار.
  resolvedVia: "ai" | "catalog" | null;
  // Round 36 — "زود اضافة وحدة قياس": true لو المستخدم مختار "وحدة أخرى"
  // من قائمة GROCERY_UNITS وبيكتب وحدة حرة في unit بدل ما يختارها من القائمة.
  customUnitMode: boolean;
}

function blankRow(id: number): LineState {
  return {
    id,
    raw_text: "",
    unit: "",
    item_id: null,
    item_name: null,
    options: [],
    selectedOptionId: null,
    quantity: 1,
    grams: null,
    loadingAi: false,
    aiMessage: null,
    manualStore: "",
    manualBrand: "",
    manualPrice: "",
    resolvedVia: null,
    customUnitMode: false,
  };
}

// effective multiplier for price math: a free-form gram weight (كيلو items
// only) overrides the plain quantity count when set.
const effQty = (quantity: number, grams: number | null | undefined) =>
  grams && grams > 0 ? grams / 1000 : quantity;

// Round 35 — "خلي البرنامج يفهم" quantity words in a free-typed grocery line
// ("كيلو لبن"، "نص كيلو أرز"، "٢كيلو طماطم"، "صندوق مياه"، "ثمن بن") and pull
// them out into quantity+unit, leaving a clean item name for catalog/price
// matching. Deliberately a local regex parser, not a Gemini call — this
// deployment currently has no live GEMINI_API_KEY configured anywhere (see
// lib/groceryPricing.ts's header comment), so anything AI-dependent here
// would silently do nothing; these phrasing patterns are well-defined enough
// for a plain parser to handle instantly and offline.
const ARABIC_DIGITS: Record<string, string> = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" };
const toLatinDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => ARABIC_DIGITS[d] || d);
const FRACTION_WORDS: Record<string, number> = { "نص": 0.5, "نصف": 0.5, "ربع": 0.25, "تمن": 0.125, "ثمن": 0.125 };
const UNIT_WORD_MAP: Record<string, string> = {
  "كيلو": "كيلو", "كجم": "كيلو", "كج": "كيلو",
  "لتر": "لتر",
  "كيس": "كيس",
  "علبة": "علبة", "علبه": "علبة",
  "زجاجة": "زجاجة", "زجاجه": "زجاجة",
  "صندوق": "صندوق كامل", "كرتونة": "صندوق كامل", "كرتونه": "صندوق كامل",
  "باكت": "باكت", "برطمان": "برطمان", "أنبوبة": "أنبوبة", "انبوبة": "أنبوبة",
  "قطعة": "قطعة", "قطعه": "قطعة", "لفة": "لفة", "لفه": "لفة",
  "ظرف": "ظرف", "شكارة": "شكارة", "شكاره": "شكارة", "طبق": "طبق",
  "جركن": "جركن", "كانز": "كانز", "كوب": "كوب", "عبوة": "عبوة", "عبوه": "عبوة",
};
const UNIT_WORD_ALT = "كيلو|كجم|كج|لتر|كيس|علبة|علبه|زجاجة|زجاجه|صندوق|كرتونة|كرتونه|باكت|برطمان|أنبوبة|انبوبة|قطعة|قطعه|لفة|لفه|ظرف|شكارة|شكاره|طبق|جركن|كانز|كوب|عبوة|عبوه";

function parseQuantityLine(raw: string): { name: string; quantity: number; unit: string } {
  let text = toLatinDigits(raw.trim());
  let quantity = 1;
  let unit = "";

  const fractionMatch = text.match(new RegExp(`^(نص|نصف|ربع|تمن|ثمن)\\s*(${UNIT_WORD_ALT})?\\s*`));
  if (fractionMatch) {
    quantity = FRACTION_WORDS[fractionMatch[1]] || 1;
    unit = "كيلو"; // fraction words (نص/ربع/تمن) are always kilo-based here
    text = text.slice(fractionMatch[0].length).trim();
  } else {
    const numMatch = text.match(new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*(${UNIT_WORD_ALT})?\\s*`));
    if (numMatch) {
      quantity = parseFloat(numMatch[1]) || 1;
      if (numMatch[2]) unit = UNIT_WORD_MAP[numMatch[2]] || "";
      text = text.slice(numMatch[0].length).trim();
    } else {
      const unitOnlyMatch = text.match(new RegExp(`^(${UNIT_WORD_ALT})\\s*`));
      if (unitOnlyMatch) {
        unit = UNIT_WORD_MAP[unitOnlyMatch[1]] || "";
        text = text.slice(unitOnlyMatch[0].length).trim();
      }
    }
  }

  return { name: text || raw.trim(), quantity, unit };
}

// Round 36 — "لو هو كتب مكتبش حط انت الاشهر": wraps parseQuantityLine and,
// only when the user's own text didn't specify a unit, fills in a sensible
// default from the uploaded 310-item reference table (lib/groceryDefaultUnits.ts).
// Used by both the detailed pricing flow (runMatch) and the new lightweight
// checklist flow (runQuickChecklist) so "كيلو لبن" → name=لبن/unit=كيلو stays
// consistent everywhere, and a bare "لبن" still gets a unit (لتر) automatically.
function parseGroceryLineWithDefault(raw: string): { name: string; quantity: number; unit: string } {
  const parsed = parseQuantityLine(raw);
  if (!parsed.unit) {
    const guessed = lookupDefaultUnit(parsed.name);
    if (guessed) parsed.unit = guessed;
  }
  return parsed;
}

function GroceryTab() {
  const [listText, setListText] = useState("");
  const [lines, setLines] = useState<LineState[]>([]);
  const [matching, setMatching] = useState(false);
  // Round 36 — قائمة الشيك بوكس السريعة (runQuickChecklist) لوحدها، منفصلة
  // عن matching (قائمة الأسعار المفصّلة) عشان اللودينج يظهر على الزرار الصح.
  const [quickListSaving, setQuickListSaving] = useState(false);
  // Round 37 — نتائج الإكمال التلقائي من الكتالوج العام (market_catalog)
  // لكل صف على حدة، بمفتاح id الصف — راجع fetchMarketSuggestions/adoptMarketSuggestion تحت.
  const [marketSuggestions, setMarketSuggestions] = useState<Record<number, MarketSuggestion[]>>({});
  const [listName, setListName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedLists, setSavedLists] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportingImg, setExportingImg] = useState(false);
  // Round 33 — "ابدأ التسوق": القائمة (كاملة بجميع entries) اللي المستخدم
  // فاتحها في وضع التسوق دلوقتي، أو null لو مفيش وضع تسوق مفتوح.
  const [shoppingList, setShoppingList] = useState<any | null>(null);
  // Round 33 — "ارفع إيصال السوبر ماركت": حالة رفع/تحليل صورة الإيصال.
  const [receiptExtracting, setReceiptExtracting] = useState(false);
  const [receiptMsg, setReceiptMsg] = useState<{ text: string; ok: boolean } | null>(null);
  // Round 33 — id القائمة اللي جاري تحميلها لوضع التعديل التفصيلي دلوقتي
  // (منفصل عن matching عشان اللودينج يظهر على زرار القائمة المحددة بس).
  const [continuingListId, setContinuingListId] = useState<string | null>(null);
  // set when "تعديل القائمة"/"أكمل القائمة" is tapped on an existing saved
  // (or telegram draft) list — its raw lines get loaded back into the editor
  // above, and saving replaces it (deletes the old row, inserts the edited
  // version) instead of adding a duplicate for the same shopping trip.
  const [replacingListId, setReplacingListId] = useState<string | null>(null);
  // previous quantity/unit/selected-option per raw_text, carried over from
  // the list being edited so re-matching doesn't silently reset choices the
  // user already made — consumed (and cleared) the next time runMatch resolves.
  const [pendingEntries, setPendingEntries] = useState<Record<string, { quantity: number; unit: string; selected_option_id: string | null; grams: number | null }> | null>(null);

  const nextIdRef = useRef(1);
  // per-row debounce timer (name typed → catalog check) and the shared
  // "AI-lookup requested" queue that gets flushed to the batched AI endpoint
  // — see enqueueAi/flushAiQueue below. Round 42 — بقى بيتنادى بس لما
  // المستخدمة تدوس زرار "دوّر بالذكاء الاصطناعي" يدويًا (راجع الملاحظة جنب
  // matchRow)، مش تلقائي على كل صف من غير سعر.
  const rowTimersRef = useRef<Record<number, any>>({});
  const aiQueueRef = useRef<{ id: number; name: string }[]>([]);
  const aiFlushTimerRef = useRef<any>(null);

  const loadLists = () => fetch("/api/reminders/grocery/lists").then((r) => r.json()).then((d) => setSavedLists(d.lists || []));
  useEffect(() => {
    loadLists();
  }, []);

  const updateLine = (id: number, patch: Partial<LineState>) => setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  // Batches up to AI_BATCH_SIZE queued item names into one Gemini call. If
  // more arrive while a batch is in flight (or more than AI_BATCH_SIZE were
  // queued at once, e.g. from a big pasted list), the remainder is flushed
  // shortly after instead of all at once, so calls stay spaced out.
  const flushAiQueue = async () => {
    const batch = aiQueueRef.current.slice(0, AI_BATCH_SIZE);
    aiQueueRef.current = aiQueueRef.current.slice(AI_BATCH_SIZE);
    if (!batch.length) return;
    try {
      const res = await fetch("/api/reminders/grocery/ai-price-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_names: batch.map((b) => b.name) }),
      });
      const data = await res.json();
      if (!res.ok) {
        for (const b of batch) updateLine(b.id, { loadingAi: false, aiMessage: data.error || "تعذر البحث عن السعر" });
      } else {
        for (const b of batch) {
          const r = data.results?.[b.name];
          if (!r) { updateLine(b.id, { loadingAi: false, aiMessage: "تعذر البحث عن السعر" }); continue; }
          const opt = r.options?.[0] || null;
          updateLine(b.id, {
            loadingAi: false,
            item_id: r.item_id,
            options: r.options || [],
            selectedOptionId: opt?.id || null,
            aiMessage: r.message || null,
            // Round 36 — الذكاء الاصطناعي هو اللي جاب السعر ده دلوقتي → نقطة خضراء.
            resolvedVia: opt ? "ai" : null,
            manualPrice: opt ? String(opt.price) : "",
          });
        }
      }
    } catch {
      for (const b of batch) updateLine(b.id, { loadingAi: false, aiMessage: "تعذر الاتصال بنظام التسعير" });
    } finally {
      if (aiQueueRef.current.length) aiFlushTimerRef.current = setTimeout(flushAiQueue, 1200);
    }
  };

  const enqueueAi = (id: number, name: string) => {
    aiQueueRef.current = [...aiQueueRef.current.filter((q) => q.id !== id), { id, name }];
    updateLine(id, { loadingAi: true, aiMessage: null });
    if (aiFlushTimerRef.current) clearTimeout(aiFlushTimerRef.current);
    aiFlushTimerRef.current = setTimeout(flushAiQueue, 900);
  };

  // Round 37 — "تظهر قائمة إكمال تلقائي سريعة تبحث في الكلمات المفتاحية":
  // بحث في الكتالوج العام المشترك (market_catalog، متغذّي من سكريبت السحب)
  // — مستقل تمامًا عن matchRow (اللي بيبحث في كتالوج المستخدم الشخصي).
  const fetchMarketSuggestions = async (id: number, name: string) => {
    try {
      const res = await fetch(`/api/reminders/grocery/search?q=${encodeURIComponent(name)}`);
      const data = await res.json();
      setMarketSuggestions((prev) => ({ ...prev, [id]: data.results || [] }));
    } catch {
      // best-effort — الإكمال التلقائي تحسين إضافي، مش أساسي لعمل الصف
    }
  };

  // "عند اختيار المنتج، يتم ملء الحقول تلقائيًا: (اسم الصنف، الماركة،
  // الوزن، وحدة القياس، المتجر، والسعر)" — بنملأ الصف من الاقتراح على طول،
  // وبنادي adopt-market-price عشان ننسخ السعر ده لكتالوج المستخدم الشخصي
  // (source: "market") زي أي سعر تاني هو اختاره.
  const adoptMarketSuggestion = async (id: number, s: MarketSuggestion) => {
    const mapped = marketUnitToLine(s.unit_type, s.size_value);
    updateLine(id, {
      raw_text: s.item_name,
      unit: mapped.unit,
      customUnitMode: false,
      quantity: mapped.quantity,
      grams: mapped.grams,
    });
    setMarketSuggestions((prev) => ({ ...prev, [id]: [] }));
    try {
      const res = await fetch("/api/reminders/grocery/adopt-market-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ market_id: s.id }),
      });
      const data = await res.json();
      if (!res.ok) return;
      const options: OptionRow[] = data.options || [];
      const opt = options.find((o) => o.store_name === s.store_name && Number(o.price) === s.price) || options[0] || null;
      updateLine(id, {
        item_id: data.item_id,
        item_name: data.item_name,
        options,
        selectedOptionId: opt?.id || null,
        resolvedVia: "catalog",
        manualPrice: opt ? String(opt.price) : String(s.price),
      });
    } catch {
      // best-effort — الحقول اتملت محليًا فوق حتى لو النسخ لكتالوج المستخدم فشل
    }
  };

  // Round 42 — "احنا لاغينا فكرة جيميناي وبيعتمد علي الاسكربت": مبقاش فيه
  // نداء تلقائي لـ Gemini لما الكتالوج الشخصي ميلاقيش تطابق. قبل كده
  // matchRow كانت بتعمل enqueueAi تلقائيًا هنا، وده اللي كان بيظهر "جاري
  // الاتصال بخوادم IDEA" وبعدها رسالة "الأسعار مشغولة دلوقتي" (رسالة quota
  // خاصة بـ Gemini) — مربّك للمستخدمة اللي مش متوقعة نداء ذكاء اصطناعي
  // أصلًا بعد ما اتعمد الاعتماد على سكريبت السحب (market_catalog، عبر
  // fetchMarketSuggestions تحت) بدل البحث بالذكاء الاصطناعي. دلوقتي: لو
  // الكتالوج الشخصي ميلاقيش تطابق، الصف بيفضل من غير سعر — المستخدمة تقدر
  // تختار من اقتراحات السوق (لو ظهرت) أو تكتب السعر يدويًا (خانة السعر
  // مفتوحة دايمًا أصلًا من راوند 36).
  const matchRow = async (id: number, name: string) => {
    try {
      const res = await fetch("/api/reminders/grocery/match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines: [name] }) });
      const data = await res.json();
      const m = data.matches?.[0];
      if (!res.ok || !m || !m.options?.length) return;
      const opt = m.options[0];
      updateLine(id, {
        item_id: m.item_id,
        item_name: m.item_name,
        options: m.options,
        selectedOptionId: opt?.id || null,
        // Round 36 — السعر ده كان متسجل قبل كده (كتالوج/يدوي)، مفيش ذكاء
        // اصطناعي اتنادى دلوقتي → نقطة حمراء.
        resolvedVia: "catalog",
        manualPrice: opt ? String(opt.price) : "",
      });
    } catch {
      // best-effort — the manual-price fallback is always available
    }
  };

  // Called on every keystroke in a row's name field — debounced so it only
  // fires ~700ms after the user stops typing, matching "مجرد ما كتب لبن في
  // الخلفيه بيحصل استدعاء للقوائم المحفوظه" from the feedback.
  //
  // Round 36 — لو المستخدم لسه مختارش وحدة قياس بنفسه للسطر ده، بندور على
  // وحدة افتراضية من جدول الأصناف المرجعي (lib/groceryDefaultUnits.ts) —
  // "لو هو كتب مكتبش حط انت الاشهر" — لكن من غير ما نلغي وحدة "أخرى" حرة
  // كان المستخدم كاتبها بنفسه (customUnitMode).
  const onNameChange = (id: number, value: string) => {
    updateLine(id, { raw_text: value, item_id: null, item_name: null, options: [], selectedOptionId: null, aiMessage: null, resolvedVia: null });
    if (rowTimersRef.current[id]) clearTimeout(rowTimersRef.current[id]);
    aiQueueRef.current = aiQueueRef.current.filter((q) => q.id !== id);
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setMarketSuggestions((prev) => ({ ...prev, [id]: [] }));
      return;
    }
    const current = lines.find((l) => l.id === id);
    if (current && !current.unit && !current.customUnitMode) {
      const guessed = lookupDefaultUnit(trimmed);
      if (guessed) updateLine(id, { unit: guessed });
    }
    rowTimersRef.current[id] = setTimeout(() => {
      matchRow(id, trimmed);
      fetchMarketSuggestions(id, trimmed);
    }, 700);
  };

  const addRow = () => setLines((prev) => [...prev, blankRow(nextIdRef.current++)]);

  const removeLine = (id: number) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
    setMarketSuggestions((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (rowTimersRef.current[id]) { clearTimeout(rowTimersRef.current[id]); delete rowTimersRef.current[id]; }
    aiQueueRef.current = aiQueueRef.current.filter((q) => q.id !== id);
  };

  // Round 33 — extracted out of runMatch so "تعديل القائمة" can reuse the
  // exact same matching logic and land the user directly on the full
  // detailed rows (with options/price/quantity already populated), instead
  // of dumping them back into the "قائمة سريعة" textarea and making them
  // press "إنشاء القائمة" a second time just to see/edit price+quantity —
  // that extra hop was the user's exact complaint ("تعديل القائمه يفتح
  // القائمه الكامله مش القائمة السريعه علشان يعدل سعر كميه").
  const matchLines = async (
    rawLines: string[],
    pending: Record<string, { quantity: number; unit: string; selected_option_id: string | null; grams: number | null }> | null
  ): Promise<LineState[]> => {
    const res = await fetch("/api/reminders/grocery/match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines: rawLines }) });
    const data = await res.json();
    if (!res.ok) { setMsg(data.error || "حصل خطأ"); return []; }
    return (data.matches || []).map((m: any) => {
      const prev = pending?.[m.raw_text];
      const prevOptionStillValid = prev?.selected_option_id && (m.options || []).some((o: any) => o.id === prev.selected_option_id);
      const selectedOptionId = prevOptionStillValid ? prev!.selected_option_id : m.options?.[0]?.id || null;
      const selectedOption = (m.options || []).find((o: any) => o.id === selectedOptionId) || null;
      const row = blankRow(nextIdRef.current++);
      return {
        ...row,
        raw_text: m.raw_text,
        unit: prev?.unit || "",
        item_id: m.item_id,
        item_name: m.item_name,
        options: m.options || [],
        selectedOptionId,
        quantity: prev?.quantity || 1,
        grams: prev?.grams || null,
        // Round 36 — لو /match لقى سعر جاهز فورًا، ده كان متسجل قبل كده
        // (كتالوج) → نقطة حمراء؛ لو مفيش سعر، هيتحط "ai" لما enqueueAi يلاقي
        // حاجة بعد كده (راجع flushAiQueue).
        resolvedVia: selectedOption ? "catalog" : null,
        manualPrice: selectedOption ? String(selectedOption.price) : "",
      };
    });
  };

  // "قائمة أسعار مفصّلة" (اسمها القديم كان "أنشأ قائمة تسوق سريعة" — Round 36
  // صحّح التسمية دي، راجع الملاحظة فوق الكارت في الـ JSX) — paste several
  // items at once (one per line). Each becomes a row exactly like a
  // manually-added one: instant catalog check, then an automatic (batched)
  // AI lookup for anything not already in the catalog.
  //
  // Round 35 — each line is first run through parseQuantityLine so a phrase
  // like "٢كيلو طماطم" splits into quantity=2/unit=كيلو/name="طماطم" before
  // catalog matching even happens (cleaner name → better catalog hit rate
  // too), instead of quantity always defaulting to 1 and the whole phrase
  // being used as the item name.
  // Round 36 — parseQuantityLine بقى parseGroceryLineWithDefault: لو السطر
  // مفيهوش وحدة صريحة، بيتحط له وحدة افتراضية من الجدول المرجعي.
  const runMatch = async () => {
    const raw = listText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!raw.length) return;
    setMatching(true);
    try {
      const parsed = raw.map(parseGroceryLineWithDefault);
      const names = parsed.map((p) => p.name);
      const matchedRows = await matchLines(names, pendingEntries);
      const newRows = matchedRows.map((row, i) => {
        // a carried-over pending entry (from "تعديل القائمة") already set its
        // own quantity/unit — don't let the parser override a real edit.
        if (pendingEntries?.[row.raw_text]) return row;
        return { ...row, quantity: parsed[i]?.quantity || row.quantity, unit: parsed[i]?.unit || row.unit };
      });
      setLines((prevLines) => [...prevLines, ...newRows]);
      setPendingEntries(null);
      setListText("");
      // Round 42 — مبقاش فيه نداء تلقائي لـ Gemini هنا للصفوف اللي من غير
      // سعر؛ المستخدمة تقدر تدوس "دوّر بالذكاء الاصطناعي" يدويًا لكل صف لو
      // حابة (راجع ملاحظة matchRow فوق).
    } finally {
      setMatching(false);
    }
  };

  // Round 36 — "حط مفتاح انشا قائمة تسوق سريعه تطلع قائمه فيها المنتجات و
  // جمبها شيك بوكس ... لو هطلب حاجه مثلا من السوبر ماركت بالتليفون": قائمة
  // شيك-بوكس خفيفة بالكامل، منفصلة تمامًا عن قائمة الأسعار المفصّلة فوق —
  // بتتحفظ فورًا من غير أي مطابقة كتالوج أو بحث ذكاء اصطناعي عن سعر (مفيش
  // داعي لسعر أصلاً هنا)، وبتفتح على طول في وضع التسوق (ShoppingModeModal)
  // اللي أصلاً مبني بالظبط للاستخدام ده — علّم على كل صنف طلبته.
  //
  // Round 35 كان بيسمي الزرار القديم (اللي فعليًا بيعمل runMatch/القائمة
  // العادية) "أنشأ قائمة تسوق سريعة" — ده كان الخلط اللي المستخدم اشتكى منه
  // ("انشا قائمة التسوق تنزل القائمة العاديه"). الزرار القديم اتسمى بوضوح
  // "إنشاء قائمة أسعار مفصّلة" تحت، والزرار ده بقى هو "قائمة سريعة" الحقيقية.
  const runQuickChecklist = async () => {
    const raw = listText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!raw.length) return;
    setQuickListSaving(true);
    try {
      const parsed = raw.map(parseGroceryLineWithDefault);
      const res = await fetch("/api/reminders/grocery/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: listName || null,
          entries: parsed.map((p) => ({ raw_text: p.name, item_id: null, selected_option_id: null, quantity: p.quantity, unit: p.unit || null })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || "حصل خطأ في الحفظ"); return; }
      setListText("");
      setListName("");
      setShoppingList({ ...data.list, grocery_list_entries: data.entries || [] });
      loadLists();
    } finally {
      setQuickListSaving(false);
    }
  };

  // Round 36 — الخانة بقت دايمًا مفتوحة (مفيش زرار "سجّل السعر يدويًا"
  // بيكشفها بقى)، فـ saveManual بتتنادى من زرار "حفظ" جنب الخانة مباشرة.
  const saveManual = async (id: number) => {
    const l = lines.find((x) => x.id === id);
    if (!l) return;
    const price = Number(l.manualPrice);
    if (!(price > 0)) return;
    const res = await fetch("/api/reminders/grocery/manual-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: l.raw_text, price, brand: l.manualBrand || null, store_name: l.manualStore || null }),
    });
    const data = await res.json();
    if (!res.ok) return;
    const options: OptionRow[] = data.options || [];
    const justSaved =
      options.find((o) => o.source === "manual" && Number(o.price) === price && (o.store_name || "") === (l.manualStore || "يدوي")) ||
      options[0] ||
      null;
    updateLine(id, {
      item_id: data.item_id,
      options,
      selectedOptionId: justSaved?.id || null,
      resolvedVia: "catalog",
      manualPrice: justSaved ? String(justSaved.price) : l.manualPrice,
    });
  };

  const total = lines.reduce((sum, l) => {
    const opt = l.options.find((o) => o.id === l.selectedOptionId);
    return opt ? sum + opt.price * effQty(l.quantity, l.grams) : sum;
  }, 0);

  const saveList = async () => {
    const usable = lines.filter((l) => l.raw_text.trim());
    if (!usable.length) return;
    setSaving(true);
    try {
      const res = await fetch("/api/reminders/grocery/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: listName || null,
          entries: usable.map((l) => ({ raw_text: l.raw_text, item_id: l.item_id, selected_option_id: l.selectedOptionId, quantity: l.quantity, unit: l.unit || null, grams: l.grams || null })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || "حصل خطأ في الحفظ"); return; }
      if (replacingListId) {
        await fetch(`/api/reminders/grocery/lists/${replacingListId}`, { method: "DELETE" });
        setReplacingListId(null);
      }
      setMsg("تم حفظ القائمة ✅");
      setListName("");
      setLines([]);
      setListText("");
      loadLists();
    } finally {
      setSaving(false);
    }
  };

  const deleteList = async (id: string) => {
    await fetch(`/api/reminders/grocery/lists/${id}`, { method: "DELETE" });
    loadLists();
  };

  // "تعديل القائمة"/"أكمل القائمة" (Round 33 — أعيد كتابتها) — كانت بتحمّل
  // أسماء الأصناف في مربع "قائمة سريعة" وتسيب المستخدم يدوس "إنشاء القائمة"
  // تاني بنفسه عشان يشوف صفوف السعر/الكمية القابلة للتعديل — خطوة زيادة
  // كانت هي شكوى المستخدم بالظبط. دلوقتي بتعمل المطابقة فورًا وتفتح على طول
  // على الصفوف التفصيلية (زي ما لو كان دوس "إنشاء القائمة" بنفسه)، فيقدر
  // يعدل السعر/الكمية على طول من غير خطوة وسط.
  const continueList = async (sl: any) => {
    const entries = sl.grocery_list_entries || [];
    const rawLines = entries.map((e: any) => e.raw_text);
    const pending: Record<string, { quantity: number; unit: string; selected_option_id: string | null; grams: number | null }> = {};
    for (const e of entries) pending[e.raw_text] = { quantity: e.quantity || 1, unit: e.unit || "", selected_option_id: e.selected_option_id || null, grams: e.grams || null };
    setListName(sl.name || "");
    setReplacingListId(sl.id);
    setLines([]);
    setListText("");
    setMsg("");
    setContinuingListId(sl.id);
    try {
      const newRows = await matchLines(rawLines, pending);
      setLines(newRows);
      // Round 42 — نفس التعديل: مفيش نداء تلقائي لـ Gemini هنا كمان.
    } finally {
      setContinuingListId(null);
    }
  };

  // "تصدير" — rasterizes the current (in-progress or saved) list as a
  // shareable PDF/image, same off-screen-HTML → html2canvas-pro pattern used
  // everywhere else in the app for Arabic text (see app/(protected)/export/page.tsx).
  //
  // Round 33 postmortem — "التنسيق مش مظبوط" complaint: الأسعار كانت بتتكتب
  // كنص خام "١٢٣ EGP" (رقم + حروف لاتينية) جوه عنصر اتجاهه RTL — خوارزمية
  // bidi بتاعة المتصفح/html2canvas بتقلب ترتيب الحروف اللاتينية جوه سياق
  // عربي فيطلع معكوس "EGP 123" بدل "123 EGP". اتأكد الفرض ده برندر فعلي
  // للـ HTML بمتصفح Chromium وتصويره — الفرق واضح لما نستخدم fmt() (بترجع
  // رمز عملة عربي "ج.م" بدل الحروف اللاتينية) بدل التركيب اليدوي.
  const rasterizeRows = async (rows: { label: string; optionLabel: string; price: number; currency: string; qty: number; qtyLabel?: string }[], total: number, title: string) => {
    const node = document.createElement("div");
    node.style.position = "fixed";
    node.style.left = "-9999px";
    node.style.top = "0";
    node.style.width = "700px";
    node.style.background = "#ffffff";
    node.style.padding = "24px";
    node.style.fontFamily = "Cairo, sans-serif";
    node.style.direction = "rtl";
    node.style.color = "#111827";
    const cellWrap = "word-break:break-word;overflow-wrap:anywhere;";
    const rowsHtml = rows
      .map(
        (r) => `<tr>
          <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:12px;${cellWrap}">${escapeHtml(r.label)}</td>
          <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:11px;color:#6b7280;${cellWrap}">${escapeHtml(r.optionLabel)}</td>
          <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:11px;">${ltrIsolate(r.qtyLabel || `×${r.qty}`)}</td>
          <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:12px;font-weight:600;white-space:nowrap;">${fmt(r.price * r.qty, r.currency)}</td>
        </tr>`
      )
      .join("");
    node.innerHTML = `
      <div style="text-align:center;margin-bottom:16px;">
        <p style="font-size:12px;color:#ea580c;font-weight:700;">FlowCash</p>
        <h2 style="font-size:17px;margin:6px 0 2px;">${escapeHtml(title)}</h2>
      </div>
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
        <colgroup><col style="width:34%;"/><col style="width:30%;"/><col style="width:12%;"/><col style="width:24%;"/></colgroup>
        <thead><tr style="background:#f9fafb;"><th style="padding:6px 4px;font-size:11px;text-align:right;">الصنف</th><th style="padding:6px 4px;font-size:11px;text-align:right;">التفاصيل</th><th style="padding:6px 4px;font-size:11px;text-align:right;">الكمية</th><th style="padding:6px 4px;font-size:11px;text-align:right;">السعر</th></tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="4" style="font-size:11px;color:#9ca3af;padding:6px 4px;">لا يوجد</td></tr>'}</tbody>
      </table>
      <div style="border-top:1px solid #e5e7eb;margin-top:12px;padding-top:10px;display:flex;justify-content:space-between;">
        <p style="font-size:13px;font-weight:700;">الإجمالي</p>
        <p style="font-size:13px;font-weight:700;color:#ea580c;">${fmt(total, "EGP")}</p>
      </div>
      <div style="border-top:1px solid #e5e7eb;margin-top:12px;padding-top:10px;text-align:center;">
        <p style="font-size:10px;color:#9ca3af;margin:0;">تم الإنشاء بواسطة FlowCash — ${new Date().toLocaleDateString("ar-EG")}</p>
      </div>`;
    document.body.appendChild(node);
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      if (document.fonts?.ready) await document.fonts.ready;
      return await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
    } finally {
      document.body.removeChild(node);
    }
  };

  const exportRows = async (rows: { label: string; optionLabel: string; price: number; currency: string; qty: number }[], total: number, title: string) => {
    setExporting(true);
    try {
      const canvas = await rasterizeRows(rows, total, title);
      const { jsPDF } = await import("jspdf");
      const w = canvas.width / 2;
      const h = canvas.height / 2;
      const pdf = new jsPDF({ unit: "px", format: [w, h] });
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, w, h);
      await shareFile(pdf.output("dataurlstring"), `${title}.pdf`, "application/pdf");
    } finally {
      setExporting(false);
    }
  };

  // Round 33 — "خلي في تنسيق صوره كمان": نفس الرسم بالظبط، بس PNG مباشر من
  // غير لفّه في PDF.
  const exportRowsImage = async (rows: { label: string; optionLabel: string; price: number; currency: string; qty: number }[], total: number, title: string) => {
    setExportingImg(true);
    try {
      const canvas = await rasterizeRows(rows, total, title);
      await shareFile(canvas.toDataURL("image/png"), `${title}.png`, "image/png");
    } finally {
      setExportingImg(false);
    }
  };

  const currentListRows = () =>
    lines.map((l) => {
      const opt = l.options.find((o) => o.id === l.selectedOptionId);
      return {
        label: l.raw_text,
        optionLabel: opt ? `${opt.brand ? opt.brand + " — " : ""}${opt.store_name || ""}` : "بدون سعر",
        price: opt?.price || 0,
        currency: opt?.currency || "EGP",
        qty: effQty(l.quantity, l.grams),
        qtyLabel: l.grams ? `${l.grams} جم` : undefined,
      };
    });
  const exportCurrentList = () => exportRows(currentListRows(), total, `قائمة سوبر ماركت${listName ? " — " + listName : ""}`);
  const exportCurrentListImage = () => exportRowsImage(currentListRows(), total, `قائمة سوبر ماركت${listName ? " — " + listName : ""}`);

  const savedListRows = (sl: any) => {
    const entries = sl.grocery_list_entries || [];
    const rows = entries.map((e: any) => ({
      label: e.raw_text,
      optionLabel: e.grocery_item_options ? `${e.grocery_item_options.brand ? e.grocery_item_options.brand + " — " : ""}${e.grocery_item_options.store_name || ""}` : "بدون سعر",
      price: e.grocery_item_options?.price || 0,
      currency: e.grocery_item_options?.currency || "EGP",
      qty: effQty(e.quantity || 1, e.grams),
      qtyLabel: e.grams ? `${e.grams} جم` : undefined,
    }));
    const listTotal = rows.reduce((s: number, r: any) => s + r.price * r.qty, 0);
    return { rows, listTotal };
  };
  const exportSavedList = (sl: any) => {
    const { rows, listTotal } = savedListRows(sl);
    exportRows(rows, listTotal, `قائمة سوبر ماركت${sl.name ? " — " + sl.name : ""}`);
  };
  const exportSavedListImage = (sl: any) => {
    const { rows, listTotal } = savedListRows(sl);
    exportRowsImage(rows, listTotal, `قائمة سوبر ماركت${sl.name ? " — " + sl.name : ""}`);
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <p className="text-sm font-medium">إضافة أصناف</p>
        <p className="text-xs text-neutral-400">اكتب كل صنف في سطر، وتقدر تكتب الكمية معاه — مثال: كيلو لبن، نص كيلو أرز، ٢كيلو طماطم، صندوق مياه</p>
        <textarea value={listText} onChange={(e) => setListText(e.target.value)} rows={4} className={inputCls} placeholder={"كيلو لبن\nنص كيلو أرز\n٢كيلو طماطم\nصندوق مياه"} />
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={runMatch} disabled={matching || quickListSaving} className={btnPrimary}>
            {matching ? <Loader2 size={14} className="animate-spin inline" /> : "إنشاء قائمة أسعار مفصّلة"}
          </button>
          {/* Round 36 — قائمة الشيك بوكس السريعة الحقيقية: بتتحفظ فورًا من
              غير أي بحث سعر وتفتح على طول في وضع التسوق — للاستخدام وقت
              الطلب بالتليفون. */}
          <button onClick={runQuickChecklist} disabled={matching || quickListSaving} className={`${btnGhost} flex items-center gap-1`}>
            {quickListSaving ? <Loader2 size={14} className="animate-spin" /> : <ListChecks size={14} />} قائمة سريعة (شيك بوكس)
          </button>
        </div>
        <p className="text-[11px] text-neutral-400">"إنشاء قائمة أسعار مفصّلة" بيدوّر على سعر كل صنف. "قائمة سريعة (شيك بوكس)" بتحفظ الأصناف على طول وتفتحلك تعليم عليها — مناسبة لو هتطلب بالتليفون.</p>
        {msg && <p className="text-xs text-orange-600">{msg}</p>}
      </Card>

      <ReceiptUploadCard
        extracting={receiptExtracting}
        result={receiptMsg}
        onPick={async (dataUrl) => {
          setReceiptExtracting(true);
          setReceiptMsg(null);
          try {
            const res = await fetch("/api/reminders/grocery/extract-receipt", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ image: dataUrl }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data) {
              setReceiptMsg({ ok: false, text: (data && data.error) || "تعذر قراءة الإيصال" });
              return;
            }
            if (!data.saved?.length) {
              setReceiptMsg({ ok: false, text: "معرفناش نقرأ أي صنف بسعره بوضوح من الإيصال ده." });
              return;
            }
            const names = data.saved.map((s: any) => s.name).join("، ");
            setReceiptMsg({ ok: true, text: `تم تحديث سعر ${data.saved.length} صنف من الإيصال: ${names} ✅` });
          } catch {
            setReceiptMsg({ ok: false, text: "تعذر الاتصال بخوادم IDEA — جرب تاني بعد شوية." });
          } finally {
            setReceiptExtracting(false);
          }
        }}
      />

      {/* Round 42 — "اضف صف خليها واضحه و حطها في المكان الي بين رفع فاتوره
          وانشاء قائمه": زرار واضح لإضافة صف يدوي، بين كارت رفع الفاتورة
          وقائمة الأصناف — بدل ما يكون مدفون تحت في آخر الصفحة بس. */}
      <button onClick={addRow} className={`${btnGhost} w-full flex items-center justify-center gap-1.5`}>
        <Plus size={14} /> إضافة صنف جديد يدويًا
      </button>

      <div className="space-y-2">
        {lines.map((l) => (
          <Card key={l.id} className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                placeholder="اسم الصنف — مثال: لبن"
                value={l.raw_text}
                onChange={(e) => onNameChange(l.id, e.target.value)}
                // Round 42 — "خلي في اوبشن لو داس انتر من الموبيل او الكيبورد
                // يحط صف جديد": دوس Enter في خانة اسم أي صف (موبايل أو
                // كيبورد فعلي) يضيف صف جديد فاضي تحته على طول.
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addRow();
                  }
                }}
                className={`${inputCls} flex-1`}
              />
              {l.loadingAi && <Loader2 size={14} className="animate-spin text-orange-500 shrink-0" />}
              <button onClick={() => removeLine(l.id)} className="text-red-500 p-1 shrink-0">
                <Trash2 size={14} />
              </button>
            </div>

            {/* Round 37 — إكمال تلقائي من الكتالوج العام (سكريبت السحب):
                "عند كتابة أي صنف ... تظهر قائمة إكمال تلقائي سريعة". */}
            {(marketSuggestions[l.id]?.length ?? 0) > 0 && (
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 divide-y divide-neutral-100 dark:divide-neutral-800 overflow-hidden">
                {marketSuggestions[l.id].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => adoptMarketSuggestion(l.id, s)}
                    className="w-full text-right px-2 py-1.5 text-[11px] hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center justify-between gap-2"
                  >
                    <span className="flex-1 truncate">
                      {s.item_name}
                      {s.brand ? ` — ${s.brand}` : ""}
                      {s.size_value ? ` (${s.size_value} ${s.unit_type || ""})` : ""}
                    </span>
                    <span className="text-neutral-400 shrink-0">{s.store_name}</span>
                    <span className="font-medium shrink-0">{fmt(s.price, s.currency)}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {/* Round 36 — "زود اضافة وحدة قياس": بالإضافة لقائمة الوحدات
                  الموسّعة، خيار "وحدة أخرى" بيفتح خانة كتابة حرة. */}
              <select
                value={l.customUnitMode ? CUSTOM_UNIT_VALUE : l.unit}
                onChange={(e) => {
                  if (e.target.value === CUSTOM_UNIT_VALUE) updateLine(l.id, { customUnitMode: true, unit: "", grams: null });
                  else updateLine(l.id, { customUnitMode: false, unit: e.target.value, grams: e.target.value === "كيلو" ? l.grams : null });
                }}
                className={inputCls}
              >
                <option value="">الكمية / العبوة</option>
                {GROCERY_UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
                <option value={CUSTOM_UNIT_VALUE}>وحدة أخرى (اكتب)...</option>
              </select>
              <input
                type="number"
                min={0.125}
                step={0.125}
                value={l.quantity}
                onChange={(e) => updateLine(l.id, { quantity: Math.max(0.125, Number(e.target.value) || 1), grams: null })}
                className={`${inputCls} text-center`}
                placeholder="العدد"
              />
            </div>
            {l.customUnitMode && (
              <input
                placeholder="اكتب وحدة القياس"
                value={l.unit}
                onChange={(e) => updateLine(l.id, { unit: e.target.value })}
                className={inputCls}
              />
            )}

            {l.unit === "كيلو" && (
              <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700 p-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    placeholder="وزن حر بالجرام (اختياري — بيلغي العدد فوق)"
                    value={l.grams ?? ""}
                    onChange={(e) => updateLine(l.id, { grams: e.target.value ? Math.max(1, Number(e.target.value)) : null })}
                    className={`${inputCls} flex-1`}
                  />
                  <span className="text-xs text-neutral-400 shrink-0">جرام</span>
                </div>
                {(() => {
                  const opt = l.options.find((o) => o.id === l.selectedOptionId);
                  if (!opt) return <p className="text-[11px] text-neutral-400">اختار سعر تحت الأول عشان تشوف حساب النص/الربع/الثمن.</p>;
                  return (
                    <p className="text-[11px] text-neutral-500">
                      سعر الكيلو {fmt(opt.price, opt.currency)} — نص: {fmt(opt.price / 2, opt.currency)} · ربع: {fmt(opt.price / 4, opt.currency)} · ثمن: {fmt(opt.price / 8, opt.currency)}
                    </p>
                  );
                })()}
              </div>
            )}

            {l.options.length > 0 ? (
              <div className="space-y-1">
                {l.options.map((o) => (
                  <label key={o.id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={l.selectedOptionId === o.id}
                      onChange={() => {
                        const nowSelected = l.selectedOptionId === o.id ? null : o.id;
                        updateLine(l.id, { selectedOptionId: nowSelected, manualPrice: nowSelected ? String(o.price) : l.manualPrice });
                      }}
                    />
                    <span className="flex-1">
                      {o.brand ? `${o.brand} — ` : ""}
                      {o.store_name || (o.source === "manual" ? "يدوي" : "")}
                    </span>
                    <span className="font-medium">{fmt(o.price, o.currency)}</span>
                  </label>
                ))}
                {/* Round 36 — "نكتفي تحت بعلامه خضراء دي معناها الذكاء
                    الاصطناعي ساعد في القائمه، حمرا القائمه كانت مخزنه في
                    السيرفر": نقطة واحدة تحت خيارات السعر بدل أيقونة لكل خيار. */}
                {l.resolvedVia && (
                  <p className="flex items-center gap-1.5 text-[10px] text-neutral-400">
                    <span className={`inline-block w-2 h-2 rounded-full ${l.resolvedVia === "ai" ? "bg-green-500" : "bg-red-500"}`} />
                    {l.resolvedVia === "ai" ? "الذكاء الاصطناعي ساعد في السعر ده" : "السعر ده كان متسجل عندنا قبل كده"}
                  </p>
                )}
              </div>
            ) : (
              // Round 42 — بدل ما البحث بالذكاء الاصطناعي يتنادى تلقائي (وده
              // اللي كان بيظهر "جاري الاتصال بخوادم IDEA" مربكة)، بقى زرار
              // يدوي اختياري — المستخدمة تدوس عليه بس لو حابة فعلًا.
              !l.loadingAi && l.raw_text.trim() && (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-neutral-400">مفيش سعر مسجل للصنف ده لسه.</p>
                  <button onClick={() => enqueueAi(l.id, l.raw_text.trim())} className="text-[11px] text-pink-500 shrink-0 underline">🔍 دوّر بالذكاء الاصطناعي</button>
                </div>
              )
            )}

            {l.loadingAi && <p className="text-xs text-orange-500 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> {AI_LOADING_TEXT}</p>}
            {l.aiMessage && <p className="text-xs text-orange-500">{l.aiMessage}</p>}

            {/* Round 36 — "بدل كلمة دخل خانة السعر يدوي خلي الخانه مفتوحه
                للكتابة جاهزه لو عندك السعر حطه اتوماتيك معندكش سيب العميل
                يكتبه": الخانة بقت دايمًا ظاهرة ومتعبّية أوتوماتيك لو السعر
                معروف، بدل زرار "سجّل السعر يدويًا" اللي كان بيكشفها. */}
            <div className="grid grid-cols-3 gap-1">
              <input placeholder="السعر" type="number" value={l.manualPrice} onChange={(e) => updateLine(l.id, { manualPrice: e.target.value })} className={inputCls} />
              <input placeholder="الماركة (اختياري)" value={l.manualBrand} onChange={(e) => updateLine(l.id, { manualBrand: e.target.value })} className={inputCls} />
              <div className="flex gap-1">
                <input placeholder="المتجر (اختياري)" value={l.manualStore} onChange={(e) => updateLine(l.id, { manualStore: e.target.value })} className={inputCls} />
                <button onClick={() => saveManual(l.id)} className={btnPrimary}>حفظ</button>
              </div>
            </div>
          </Card>
        ))}

        <button onClick={addRow} className={`${btnGhost} w-full`}>+ إضافة صف</button>

        {lines.length > 0 && (
          <Card className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <p className="text-neutral-400">عدد الأصناف</p>
              <p className="font-medium">{lines.filter((l) => l.raw_text.trim()).length}</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">الإجمالي التقريبي{replacingListId ? " (استكمال قائمة)" : ""}</p>
              <p className="text-lg font-bold text-orange-600">{fmt(total, "EGP")}</p>
            </div>
            <p className="text-[11px] text-neutral-400">ملحوظة: الأسعار متوسط استرشادي من كارفور، أمازون مصر، سبينيس، واللولو — ممكن تختلف شوية حسب الفرع.</p>
            {/* Round 37 — نص التنبيه المطلوب حرفيًا تحت القائمة. */}
            <p className="text-[11px] text-neutral-400">هذا السعر تقريبي بناءً على آخر تحديث لقائمة الأسعار المرتبطة بسيرفرات IDEA</p>
            <input placeholder="اسم القائمة (اختياري)" value={listName} onChange={(e) => setListName(e.target.value)} className={inputCls} />
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={saveList} disabled={saving} className={btnPrimary}>
                {saving ? <Loader2 size={14} className="animate-spin inline" /> : "احفظ القائمة"}
              </button>
              <button onClick={exportCurrentList} disabled={exporting || exportingImg} className={`${btnGhost} flex items-center gap-1`}>
                {exporting ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />} تصدير PDF
              </button>
              <button onClick={exportCurrentListImage} disabled={exporting || exportingImg} className={`${btnGhost} flex items-center gap-1`}>
                {exportingImg ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />} تصدير صورة
              </button>
              {replacingListId && (
                <button onClick={() => { setReplacingListId(null); setPendingEntries(null); setLines([]); setListText(""); setListName(""); }} className="text-red-500 p-1"><X size={14} /></button>
              )}
            </div>
          </Card>
        )}
      </div>

      {savedLists.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">قوائم محفوظة</p>
          {savedLists.map((sl) => {
            const entries = sl.grocery_list_entries || [];
            const listTotal = entries.reduce((s: number, e: any) => s + (e.grocery_item_options?.price || 0) * effQty(e.quantity || 1, e.grams), 0);
            const done = sl.status === "done";
            return (
              <Card key={sl.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-medium ${done ? "line-through text-neutral-400" : ""}`}>
                    {sl.name || "قائمة بدون اسم"}
                    {sl.source === "telegram" ? " (تليجرام)" : ""}
                    {sl.status === "draft" ? " — مسودة" : ""}
                    {done ? " — تم التسوق ✅" : ""}
                  </p>
                  <button onClick={() => deleteList(sl.id)} className="text-red-500 p-1"><Trash2 size={14} /></button>
                </div>
                <p className={`text-xs text-neutral-400 ${done ? "line-through" : ""}`}>{entries.map((e: any) => e.raw_text).join("، ")}</p>
                <p className={`text-xs font-medium ${done ? "line-through text-neutral-400" : ""}`}>الإجمالي: {fmt(listTotal, "EGP")}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {!done && (
                    <button onClick={() => setShoppingList(sl)} className={`${btnPrimary} flex items-center gap-1`}>
                      <ShoppingCart size={12} /> ابدأ التسوق
                    </button>
                  )}
                  <button onClick={() => continueList(sl)} disabled={continuingListId === sl.id} className={`${btnGhost} flex items-center gap-1`}>
                    {continuingListId === sl.id ? <Loader2 size={12} className="animate-spin" /> : <Pencil size={12} />} {sl.status === "draft" ? "أكمل القائمة" : "تعديل القائمة"}
                  </button>
                  <button onClick={() => exportSavedList(sl)} disabled={exporting || exportingImg} className={`${btnGhost} flex items-center gap-1`}>
                    {exporting ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />} تصدير PDF
                  </button>
                  <button onClick={() => exportSavedListImage(sl)} disabled={exporting || exportingImg} className={`${btnGhost} flex items-center gap-1`}>
                    {exportingImg ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />} تصدير صورة
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {shoppingList && (
        <ShoppingModeModal
          list={shoppingList}
          onClose={() => setShoppingList(null)}
          onFinished={() => { setShoppingList(null); loadLists(); }}
        />
      )}
    </div>
  );
}

// Round 33 — "ارفع إيصال السوبر ماركت لتحديث الأسعار": الزرار الرئيسي المطلوب
// إنه "يظهر بوضوح شديد" — دائرة نيون برتقالية نابضة حواليه (CSS keyframes
// محلية للمكوّن، مفيش ملف global CSS في المشروع أصلاً فده أبسط تغيير معزول).
function ReceiptUploadCard({
  extracting,
  result,
  onPick,
}: {
  extracting: boolean;
  result: { text: string; ok: boolean } | null;
  onPick: (dataUrl: string) => void;
}) {
  const handle = async (f: File | undefined) => {
    if (f) onPick(await shrinkImage(f));
  };
  return (
    <Card className="space-y-2 text-center">
      <style>{`
        @keyframes receiptPulseRing {
          0% { box-shadow: 0 0 0 0 rgba(234,88,12,0.55); }
          70% { box-shadow: 0 0 0 14px rgba(234,88,12,0); }
          100% { box-shadow: 0 0 0 0 rgba(234,88,12,0); }
        }
        .receipt-pulse-btn { animation: receiptPulseRing 1.8s infinite; }
      `}</style>
      <label className={`receipt-pulse-btn ${extracting ? "opacity-70" : ""} inline-flex flex-col items-center gap-2 mx-auto bg-orange-500 text-white rounded-2xl px-5 py-4 cursor-pointer max-w-xs`}>
        {extracting ? <Loader2 size={22} className="animate-spin" /> : <Receipt size={22} />}
        <span className="text-xs font-medium leading-relaxed">
          ارفع إيصال السوبر ماركت لتحديث الأسعار ومساعدتك في الشراء المرات القادمة
        </span>
        <input type="file" accept="image/*" capture="environment" className="hidden" disabled={extracting} onChange={(e) => handle(e.target.files?.[0])} />
      </label>
      <label className="text-xs text-orange-600 underline cursor-pointer block">
        أو ارفع من المعرض
        <input type="file" accept="image/*" className="hidden" disabled={extracting} onChange={(e) => handle(e.target.files?.[0])} />
      </label>
      {extracting && <p className="text-xs text-orange-500 flex items-center justify-center gap-1"><Loader2 size={12} className="animate-spin" /> {AI_LOADING_TEXT}</p>}
      {result && <p className={`text-xs ${result.ok ? "text-green-600" : "text-red-500"}`}>{result.text}</p>}
    </Card>
  );
}

// Round 33 — "ابدأ التسوق": عرض القائمة كأصناف تحت بعض، كل واحد بجمبه شيك
// بوكس ("اتحط في العربة")، وزرار "انتهى التسوق" في الآخر. لو فيه أصناف
// معلمهاش، بيتنبّه قبل ما يقفل القائمة فعليًا (status: "done").
function ShoppingModeModal({ list, onClose, onFinished }: { list: any; onClose: () => void; onFinished: () => void }) {
  const entries: any[] = list.grocery_list_entries || [];
  const [picked, setPicked] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const e of entries) init[e.id] = !!e.picked;
    return init;
  });
  const [confirming, setConfirming] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const togglePick = async (entryId: string) => {
    const next = !picked[entryId];
    setPicked((p) => ({ ...p, [entryId]: next }));
    try {
      await fetch(`/api/reminders/grocery/lists/${list.id}/entries/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ picked: next }),
      });
    } catch {
      // best-effort — لو فشل التحديث، الحالة المحلية لسه بتفضل صح لحد نهاية التسوق
    }
  };

  const unpickedEntries = entries.filter((e) => !picked[e.id]);

  const finishShopping = async () => {
    if (unpickedEntries.length && !confirming) {
      setConfirming(true);
      return;
    }
    setFinishing(true);
    try {
      await fetch(`/api/reminders/grocery/lists/${list.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      });
      onFinished();
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-neutral-900 rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-4 space-y-3 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="font-semibold text-sm flex items-center gap-1"><ShoppingCart size={16} /> {list.name || "قائمة التسوق"}</p>
          <button onClick={onClose} className="text-neutral-400 p-1"><X size={16} /></button>
        </div>
        <p className="text-[11px] text-neutral-400">علّم على كل صنف حطيته في العربة.</p>
        <div className="space-y-1">
          {entries.map((e) => (
            <label key={e.id} className="flex items-center gap-2 py-1.5 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
              <input type="checkbox" checked={!!picked[e.id]} onChange={() => togglePick(e.id)} className="shrink-0" />
              <span className={`flex-1 text-sm ${picked[e.id] ? "line-through text-neutral-400" : ""}`}>
                {e.raw_text}{e.grams ? ` ${e.grams}جم` : e.quantity && e.quantity !== 1 ? ` ×${e.quantity}` : ""}{e.unit ? ` (${e.unit})` : ""}
              </span>
            </label>
          ))}
        </div>

        {confirming && unpickedEntries.length > 0 && (
          <div className="text-xs rounded-lg p-2 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 space-y-1">
            <p>لسه عندك {unpickedEntries.length} صنف معلمتش عليه: {unpickedEntries.map((e) => e.raw_text).join("، ")}.</p>
            <p>عايز تنهي التسوق برضو؟</p>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button onClick={finishShopping} disabled={finishing} className={`${btnPrimary} flex-1`}>
            {finishing ? <Loader2 size={14} className="animate-spin inline" /> : confirming ? "أيوه، إنهاء التسوق" : "انتهى التسوق"}
          </button>
          {confirming && (
            <button onClick={() => setConfirming(false)} className={btnGhost}>رجوع</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================= تذكيرات عامة ============================= */

const REPEAT_LABELS: Record<string, string> = { none: "أبدًا (مرة واحدة)", daily: "يوميًا", weekly: "أسبوعيًا", monthly: "شهريًا" };

function GeneralTab() {
  const [reminders, setReminders] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [repeatFrequency, setRepeatFrequency] = useState("none");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editRemindAt, setEditRemindAt] = useState("");
  const [editRepeatFrequency, setEditRepeatFrequency] = useState("none");
  const [editSaving, setEditSaving] = useState(false);

  const load = () => fetch("/api/reminders/general").then((r) => r.json()).then((d) => setReminders(d.reminders || []));
  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/reminders/general", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, remind_at: remindAt || null, repeat_frequency: repeatFrequency }) });
      setTitle("");
      setRemindAt("");
      setRepeatFrequency("none");
      load();
    } finally {
      setSaving(false);
    }
  };

  const patch = async (id: string, body: any) => {
    await fetch(`/api/reminders/general/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    load();
  };
  const del = async (id: string) => {
    await fetch(`/api/reminders/general/${id}`, { method: "DELETE" });
    load();
  };

  const startEdit = (r: any) => {
    setEditingId(r.id);
    setEditTitle(r.title);
    setEditRemindAt(r.remind_at ? r.remind_at.slice(0, 16) : "");
    setEditRepeatFrequency(r.repeat_frequency || "none");
  };
  const saveEdit = async (id: string) => {
    if (!editTitle.trim()) return;
    setEditSaving(true);
    try {
      await patch(id, { title: editTitle, remind_at: editRemindAt || null, repeat_frequency: editRepeatFrequency });
      setEditingId(null);
    } finally {
      setEditSaving(false);
    }
  };

  const statusLabel: Record<string, string> = { active: "نشط", completed: "مكتمل", cancelled: "ملغي" };
  const statusColor: Record<string, string> = { active: "text-green-600", completed: "text-blue-600", cancelled: "text-neutral-400" };

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <p className="text-sm font-medium">تذكير جديد</p>
        <input placeholder="العنوان" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        <input type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} className={inputCls} />
        <select value={repeatFrequency} onChange={(e) => setRepeatFrequency(e.target.value)} className={inputCls}>
          {Object.entries(REPEAT_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <button onClick={submit} disabled={saving} className={btnPrimary}>
          {saving ? <Loader2 size={14} className="animate-spin inline" /> : "إضافة"}
        </button>
      </Card>

      <div className="space-y-2">
        {reminders.map((r) =>
          editingId === r.id ? (
            <Card key={r.id} className="space-y-2">
              <input placeholder="العنوان" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={inputCls} />
              <input type="datetime-local" value={editRemindAt} onChange={(e) => setEditRemindAt(e.target.value)} className={inputCls} />
              <select value={editRepeatFrequency} onChange={(e) => setEditRepeatFrequency(e.target.value)} className={inputCls}>
                {Object.entries(REPEAT_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <button onClick={() => saveEdit(r.id)} disabled={editSaving} className={btnPrimary}>
                  {editSaving ? <Loader2 size={14} className="animate-spin inline" /> : "حفظ"}
                </button>
                <button onClick={() => setEditingId(null)} className={btnGhost}>إلغاء</button>
              </div>
            </Card>
          ) : (
            <Card key={r.id} className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{r.title}{r.source === "telegram" ? " (تليجرام)" : ""}</p>
                <Switch checked={r.status === "active"} onChange={(v) => patch(r.id, { active: v })} />
              </div>
              <div className="flex items-center justify-between text-xs">
                <p className="text-neutral-400">
                  {r.remind_at ? new Date(r.remind_at).toLocaleString("ar-EG") : "بدون معاد"}
                  {r.repeat_frequency && r.repeat_frequency !== "none" ? ` — ${REPEAT_LABELS[r.repeat_frequency]}` : ""}
                </p>
                <p className={statusColor[r.status]}>{statusLabel[r.status]}</p>
              </div>
              <div className="flex items-center gap-2">
                {r.status !== "completed" && (
                  <button onClick={() => patch(r.id, { status: "completed" })} className={`${btnGhost} flex items-center gap-1`}>
                    <CheckCircle2 size={12} /> تم
                  </button>
                )}
                <button onClick={() => startEdit(r)} className="text-neutral-400 hover:text-orange-600 p-1"><Pencil size={14} /></button>
                <button onClick={() => del(r.id)} className="text-red-500 p-1"><Trash2 size={14} /></button>
              </div>
            </Card>
          )
        )}
        {!reminders.length && <p className="text-sm text-neutral-400 text-center py-6">مفيش تذكيرات لسه</p>}
      </div>
    </div>
  );
}

/* ============================= أدوية وروشتات ============================= */

const FORM_EMOJI: Record<string, string> = { injection: "💉", capsule: "💊", tablet: "🔵", effervescent: "🫧", syrup: "🧴", drops: "💧" };

// Round 30 — full set of schedule types (was meal/interval only).
const SCHEDULE_TYPES: string[] = ["meal", "interval", "daily", "weekly", "monthly"];
// "بداية أول جرعة" only matters as an anchor for schedules that repeat by a
// fixed clock-time+day step — meal times are already fixed daily slots, so
// there's nothing for an anchor to add there.
const NEEDS_FIRST_DOSE = (t: string) => t !== "meal";

function medScheduleLabel(m: any) {
  if (m.schedule_type === "meal") return MEAL_TIMING_LABELS[m.meal_timing] || SCHEDULE_TYPE_LABELS.meal;
  if (m.schedule_type === "interval") return `كل ${m.interval_hours} ساعة`;
  if (m.schedule_type && SCHEDULE_TYPE_LABELS[m.schedule_type]) return SCHEDULE_TYPE_LABELS[m.schedule_type];
  return "بدون جدول";
}

// Round 36 — "تصدير الكشف للدكتور بيطلع بايظ": نفس فئة باج bidi بتاعة
// Round 33 (راجع reminders-feature.md) بس هنا — medScheduleLabel بترجع
// نص فيه رقم مختلط بالعربي ("كل 8 ساعة") بيتحط في جدول HTML مصدَّر من غير
// عزل، فيتقلب بصريًا. نسخة خاصة بسياقات التصدير (HTML) بتعزل الرقم بس عن
// طريق ltrIsolate، مش النص كله (عزل النص كله كان هيقلب ترتيب الكلمتين
// العربي حواليه). الاستخدام العادي في الواجهة (medScheduleLabel الخام) فضل
// من غير تغيير.
function medScheduleLabelHtml(m: any) {
  if (m.schedule_type === "interval") return `كل ${ltrIsolate(String(m.interval_hours))} ساعة`;
  return escapeHtml(medScheduleLabel(m));
}

function MedicationsTab() {
  const [meds, setMeds] = useState<any[]>([]);
  const [appts, setAppts] = useState<any[]>([]);
  // Round 34 — "قسم الادويه في مجموعات ... دواء حر ولا مجموعه": groups
  // (medication_groups) كل واحدة فيها بيانات طبيب، وكذا دواء ممكن ينضم
  // لنفس المجموعة عشان نطلع كشف واحد ليها كلها.
  const [groups, setGroups] = useState<any[]>([]);
  const [exportingGroupId, setExportingGroupId] = useState<string | null>(null);
  // Round 36 — سوتشات "إرفاق التحاليل" / "إرفاق نتيجة السكر والضغط" جوه
  // تصدير كشف الدكتور لكل مجموعة على حدة (افتراضيًا مقفولين).
  const [groupExportOpts, setGroupExportOpts] = useState<Record<string, { attachLabs: boolean; attachHealth: boolean }>>({});
  const [form, setForm] = useState<any>({
    name: "",
    formType: "tablet",
    pack_size: "",
    schedule_type: "meal",
    meal_timing: "after_breakfast",
    interval_hours: "8",
    first_dose_at: "",
    course_duration_days: "",
    reminder_enabled: true,
    remind_before_minutes: "15",
    low_stock_threshold: "2",
    kind: "free", // "free" | "group"
    group_id: "",
    new_group_name: "",
    new_group_doctor_name: "",
    new_group_doctor_phone: "",
    new_group_doctor_address: "",
    new_group_doctor_specialty: "",
  });
  const [saving, setSaving] = useState(false);
  const [medError, setMedError] = useState("");
  const apptFormRef = useRef<HTMLDivElement>(null);
  const [apptForm, setApptForm] = useState<any>({
    kind: "checkup",
    title: "",
    appointment_at: "",
    medication_id: "",
    prescription_image: "",
    doctor_name: "",
    doctor_address: "",
    doctor_phone: "",
    doctor_specialty: "",
    parent_appointment_id: "",
  });
  const [savingAppt, setSavingAppt] = useState(false);
  const [apptError, setApptError] = useState("");
  const [apptExtracting, setApptExtracting] = useState(false);
  const [apptExtractMsg, setApptExtractMsg] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportingImg, setExportingImg] = useState(false);
  const [editingMedId, setEditingMedId] = useState<string | null>(null);
  const [editMedForm, setEditMedForm] = useState<any>(null);
  const [editMedSaving, setEditMedSaving] = useState(false);
  const [editingApptId, setEditingApptId] = useState<string | null>(null);
  const [doctorCardAppt, setDoctorCardAppt] = useState<any>(null);
  const [editApptForm, setEditApptForm] = useState<any>(null);
  const [editApptSaving, setEditApptSaving] = useState(false);
  const [editApptExtracting, setEditApptExtracting] = useState(false);
  const [editApptExtractMsg, setEditApptExtractMsg] = useState("");

  // "استخراج اسم الدكتور و التخصص و العنوان بالذكاء الاصطناعي" (Round 32) —
  // بيتنادى تلقائيًا أول ما صورة الروشتة تتحط (تصوير أو رفع)، وبيملى بس
  // الحقول اللي لسه فاضية عشان منكتبش فوق حاجة المستخدم كتبها بإيده.
  const extractDoctorInfo = async (dataUrl: string, isEdit: boolean) => {
    (isEdit ? setEditApptExtracting : setApptExtracting)(true);
    (isEdit ? setEditApptExtractMsg : setApptExtractMsg)("");
    try {
      const res = await fetch("/api/reminders/appointments/extract-doctor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        (isEdit ? setEditApptExtractMsg : setApptExtractMsg)(data.error || "تعذر استخراج بيانات الطبيب من الصورة");
        return;
      }
      if (isEdit) {
        setEditApptForm((f: any) => ({
          ...f,
          doctor_name: f.doctor_name || data.doctor_name || f.doctor_name,
          doctor_specialty: f.doctor_specialty || data.doctor_specialty || f.doctor_specialty,
          doctor_address: f.doctor_address || data.doctor_address || f.doctor_address,
        }));
      } else {
        setApptForm((f: any) => ({
          ...f,
          doctor_name: f.doctor_name || data.doctor_name || f.doctor_name,
          doctor_specialty: f.doctor_specialty || data.doctor_specialty || f.doctor_specialty,
          doctor_address: f.doctor_address || data.doctor_address || f.doctor_address,
        }));
      }
      if (data.doctor_name || data.doctor_specialty || data.doctor_address) {
        (isEdit ? setEditApptExtractMsg : setApptExtractMsg)("تم استخراج بيانات الطبيب من الصورة — راجعها قبل الحفظ ✅");
      } else {
        (isEdit ? setEditApptExtractMsg : setApptExtractMsg)("معرفناش نستخرج بيانات طبيب واضحة من الصورة دي — اكتبها يدويًا.");
      }
    } catch {
      (isEdit ? setEditApptExtractMsg : setApptExtractMsg)("تعذر الاتصال بخوادم IDEA للاستخراج.");
    } finally {
      (isEdit ? setEditApptExtracting : setApptExtracting)(false);
    }
  };

  const loadMeds = () => fetch("/api/reminders/medications").then((r) => r.json()).then((d) => setMeds(d.medications || []));
  const loadAppts = () => fetch("/api/reminders/appointments").then((r) => r.json()).then((d) => setAppts(d.appointments || []));
  const loadGroups = () => fetch("/api/reminders/medications/groups").then((r) => r.json()).then((d) => setGroups(d.groups || []));
  useEffect(() => {
    loadMeds();
    loadAppts();
    loadGroups();
  }, []);

  // "إضافة دواء مش بينزل" (Round 30 postmortem): the old submitMed never
  // checked res.ok, so a DB rejection (the schedule_type constraint bug that
  // caused this exact report) failed completely silently — the button just
  // looked like it did nothing. Every submit function below now checks res.ok
  // and surfaces the real error message instead.
  const submitMed = async () => {
    if (!form.name.trim()) { setMedError("اسم الدواء مطلوب"); return; }
    if (form.kind === "group" && !form.group_id && !form.new_group_name.trim()) {
      setMedError("اختار مجموعة موجودة أو اكتب اسم مجموعة جديدة");
      return;
    }
    setSaving(true);
    setMedError("");
    try {
      // Round 34 — "دواء حر ولا مجموعه": لو "مجموعة" واختار إنشاء مجموعة
      // جديدة (مش من القائمة)، بننشئها الأول (فيها بيانات الطبيب) وناخد
      // الـ id بتاعها، وبعدين نبعت الدواء نفسه مربوط بيها.
      let groupId = form.kind === "group" ? form.group_id : null;
      if (form.kind === "group" && !groupId && form.new_group_name.trim()) {
        const gRes = await fetch("/api/reminders/medications/groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.new_group_name,
            doctor_name: form.new_group_doctor_name || null,
            doctor_phone: form.new_group_doctor_phone || null,
            doctor_address: form.new_group_doctor_address || null,
            doctor_specialty: form.new_group_doctor_specialty || null,
          }),
        });
        const gData = await gRes.json();
        if (!gRes.ok) { setMedError(gData.error || "حصل خطأ أثناء إنشاء المجموعة"); return; }
        groupId = gData.group.id;
      }

      const res = await fetch("/api/reminders/medications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          form: form.formType,
          pack_size: form.pack_size || null,
          schedule_type: form.schedule_type,
          meal_timing: form.schedule_type === "meal" ? form.meal_timing : null,
          interval_hours: form.schedule_type === "interval" ? Number(form.interval_hours) : null,
          first_dose_at: NEEDS_FIRST_DOSE(form.schedule_type) && form.first_dose_at ? new Date(form.first_dose_at).toISOString() : null,
          course_duration_days: form.course_duration_days ? Number(form.course_duration_days) : null,
          reminder_enabled: form.reminder_enabled,
          remind_before_minutes: form.schedule_type === "meal" ? 0 : Number(form.remind_before_minutes) || 0,
          low_stock_threshold: Number(form.low_stock_threshold) || 2,
          group_id: groupId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMedError(data.error || "حصل خطأ أثناء إضافة الدواء"); return; }
      setForm({ ...form, name: "", pack_size: "", first_dose_at: "", course_duration_days: "", new_group_name: "", new_group_doctor_name: "", new_group_doctor_phone: "", new_group_doctor_address: "", new_group_doctor_specialty: "" });
      loadMeds();
      loadGroups();
    } catch {
      setMedError("تعذر الاتصال بالسيرفر — حاول تاني.");
    } finally {
      setSaving(false);
    }
  };

  const logDose = async (id: string) => {
    await fetch(`/api/reminders/medications/${id}/dose`, { method: "POST" });
    loadMeds();
  };
  const toggleReminder = async (id: string, v: boolean) => {
    await fetch(`/api/reminders/medications/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reminder_enabled: v }) });
    loadMeds();
  };
  const delMed = async (id: string) => {
    await fetch(`/api/reminders/medications/${id}`, { method: "DELETE" });
    loadMeds();
  };

  const startEditMed = (m: any) => {
    setEditingMedId(m.id);
    setEditMedForm({
      name: m.name,
      formType: m.form || "tablet",
      pack_size: m.pack_size ?? "",
      schedule_type: m.schedule_type || "meal",
      meal_timing: m.meal_timing || "after_breakfast",
      interval_hours: m.interval_hours ? String(m.interval_hours) : "8",
      first_dose_at: m.first_dose_at ? m.first_dose_at.slice(0, 16) : "",
      course_duration_days: m.course_duration_days ?? "",
      reminder_enabled: m.reminder_enabled,
      remind_before_minutes: m.remind_before_minutes ?? 0,
      low_stock_threshold: m.low_stock_threshold ?? 2,
    });
  };
  const saveEditMed = async (id: string) => {
    if (!editMedForm.name.trim()) return;
    setEditMedSaving(true);
    setMedError("");
    try {
      const res = await fetch(`/api/reminders/medications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editMedForm.name,
          form: editMedForm.formType,
          pack_size: editMedForm.pack_size || null,
          schedule_type: editMedForm.schedule_type,
          meal_timing: editMedForm.schedule_type === "meal" ? editMedForm.meal_timing : null,
          interval_hours: editMedForm.schedule_type === "interval" ? Number(editMedForm.interval_hours) : null,
          first_dose_at: NEEDS_FIRST_DOSE(editMedForm.schedule_type) && editMedForm.first_dose_at ? new Date(editMedForm.first_dose_at).toISOString() : null,
          course_duration_days: editMedForm.course_duration_days ? Number(editMedForm.course_duration_days) : null,
          reminder_enabled: editMedForm.reminder_enabled,
          remind_before_minutes: editMedForm.schedule_type === "meal" ? 0 : Number(editMedForm.remind_before_minutes) || 0,
          low_stock_threshold: Number(editMedForm.low_stock_threshold) || 2,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMedError(data.error || "حصل خطأ أثناء الحفظ"); return; }
      setEditingMedId(null);
      loadMeds();
    } catch {
      setMedError("تعذر الاتصال بالسيرفر — حاول تاني.");
    } finally {
      setEditMedSaving(false);
    }
  };

  // "تسجيل استشارة متابعة" على كشف طبي — يملي فورم الموعد فوق بربط
  // parent_appointment_id بالكشف ده، وبمعلومات الطبيب لو موجودة، فيبقى محتاج
  // بس يحدد المعاد ويحفظ.
  const startFollowUp = (checkup: any) => {
    setApptForm({
      kind: "consultation",
      title: checkup.title ? `متابعة: ${checkup.title}` : "استشارة متابعة",
      appointment_at: "",
      medication_id: "",
      prescription_image: "",
      doctor_name: checkup.doctor_name || "",
      doctor_address: checkup.doctor_address || "",
      doctor_phone: checkup.doctor_phone || "",
      doctor_specialty: checkup.doctor_specialty || "",
      parent_appointment_id: checkup.id,
    });
    setApptError("");
    apptFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const submitAppt = async () => {
    if (!apptForm.appointment_at) { setApptError("معاد الكشف/الاستشارة مطلوب"); return; }
    setSavingAppt(true);
    setApptError("");
    try {
      const res = await fetch("/api/reminders/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: apptForm.kind,
          title: apptForm.title || null,
          appointment_at: apptForm.appointment_at,
          medication_id: apptForm.medication_id || null,
          prescription_image: apptForm.prescription_image || null,
          doctor_name: apptForm.doctor_name || null,
          doctor_address: apptForm.doctor_address || null,
          doctor_phone: apptForm.doctor_phone || null,
          doctor_specialty: apptForm.doctor_specialty || null,
          parent_appointment_id: apptForm.parent_appointment_id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setApptError(data.error || "حصل خطأ أثناء إضافة الموعد"); return; }
      setApptForm({ kind: "checkup", title: "", appointment_at: "", medication_id: "", prescription_image: "", doctor_name: "", doctor_address: "", doctor_phone: "", doctor_specialty: "", parent_appointment_id: "" });
      loadAppts();
    } catch {
      setApptError("تعذر الاتصال بالسيرفر — حاول تاني.");
    } finally {
      setSavingAppt(false);
    }
  };
  const delAppt = async (id: string) => {
    await fetch(`/api/reminders/appointments/${id}`, { method: "DELETE" });
    loadAppts();
  };
  const markApptDone = async (id: string) => {
    await fetch(`/api/reminders/appointments/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "done" }) });
    loadAppts();
  };

  const startEditAppt = (a: any) => {
    setEditingApptId(a.id);
    setEditApptForm({
      kind: a.kind,
      title: a.title || "",
      appointment_at: a.appointment_at ? a.appointment_at.slice(0, 16) : "",
      medication_id: a.medication_id || "",
      prescription_image: a.prescription_image || "",
      doctor_name: a.doctor_name || "",
      doctor_address: a.doctor_address || "",
      doctor_phone: a.doctor_phone || "",
      doctor_specialty: a.doctor_specialty || "",
    });
  };
  const saveEditAppt = async (id: string) => {
    if (!editApptForm.appointment_at) return;
    setEditApptSaving(true);
    try {
      await fetch(`/api/reminders/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: editApptForm.kind,
          title: editApptForm.title || null,
          appointment_at: editApptForm.appointment_at,
          prescription_image: editApptForm.prescription_image || null,
          doctor_name: editApptForm.doctor_name || null,
          doctor_address: editApptForm.doctor_address || null,
          doctor_phone: editApptForm.doctor_phone || null,
          doctor_specialty: editApptForm.doctor_specialty || null,
        }),
      });
      setEditingApptId(null);
      loadAppts();
    } finally {
      setEditApptSaving(false);
    }
  };

  // export the medication + appointment schedule as a shareable PDF/image —
  // exact rasterize-off-screen-HTML pattern used in app/(protected)/export/page.tsx
  // (jsPDF's built-in fonts can't shape Arabic text at all).
  //
  // Round 32 postmortem — "التنسيق بايظ" complaint: الجدولين هنا كانوا من غير
  // <thead>/<th> عناوين أعمدة (كل عمود كان مجرد <td> من غير أي عنوان فوقه)،
  // على عكس النمط اللي شغال صح في app/(protected)/export/page.tsx — فكان
  // الجدول بيطلع كأعمدة مبهمة من غير سياق. اتصلح بإضافة <thead> لكل الجداول،
  // وبعد كده ضفنا بيانات الطبيب (اللي اتضافت للـ schema في Round 30) لصف
  // المواعيد اللي كانت بتتجاهله تمامًا.
  // Round 34 — "تصدير الادويه بيصدر معاها كشف الدكتور و الاستشاره المفروض
  // يصدر الجزء بتاع الادويه فقط": شيلنا جدول "المواعيد الطبية" (اللي كان
  // فيه بيانات الدكتور) من التصدير العام للأدوية خالص — التصدير ده بقى
  // بيطلع جدول الأدوية بس. تصدير الكشف اللي فيه بيانات الدكتور بقى ليه
  // زرار منفصل لكل "مجموعة" (exportGroupReferral، تحت) بيتصدّر مخصوص عشان
  // ياخده المريض للدكتور، مش مبني جوه التصدير العام. نفس إصلاحات الـ Round
  // 34 لباج التنسيق (table-layout: fixed + word-break + إعزال أرقام
  // المتبقي/العبوة اللي كانت بتتقلب بصريًا برضو).
  const buildScheduleNode = () => {
    const node = document.createElement("div");
    node.style.position = "fixed";
    node.style.left = "-9999px";
    node.style.top = "0";
    node.style.width = "700px";
    node.style.background = "#ffffff";
    node.style.padding = "24px";
    node.style.fontFamily = "Cairo, sans-serif";
    node.style.direction = "rtl";
    node.style.color = "#111827";
    const cellWrap = "word-break:break-word;overflow-wrap:anywhere;";
    const medRows = meds
      .map(
        (m) => `<tr>
          <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:12px;${cellWrap}">${FORM_EMOJI[m.form] || ""} ${escapeHtml(m.name)}</td>
          <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:11px;${cellWrap}">${medScheduleLabelHtml(m)}</td>
          <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:11px;">${ltrIsolate(`${m.remaining_doses ?? "-"} / ${m.pack_size ?? "-"}`)}</td>
        </tr>`
      )
      .join("");
    node.innerHTML = `
      <div style="text-align:center;margin-bottom:16px;">
        <p style="font-size:12px;color:#ea580c;font-weight:700;">FlowCash</p>
        <h2 style="font-size:17px;margin:6px 0 2px;">جدول الأدوية</h2>
      </div>
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
        <colgroup><col style="width:44%;"/><col style="width:32%;"/><col style="width:24%;"/></colgroup>
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:6px 4px;font-size:11px;text-align:right;">الدواء</th>
            <th style="padding:6px 4px;font-size:11px;text-align:right;">الجرعات</th>
            <th style="padding:6px 4px;font-size:11px;text-align:right;">المتبقي / العبوة</th>
          </tr>
        </thead>
        <tbody>${medRows || '<tr><td colspan="3" style="font-size:11px;color:#9ca3af;padding:6px 4px;">لا يوجد</td></tr>'}</tbody>
      </table>
      <div style="border-top:1px solid #e5e7eb;margin-top:16px;padding-top:10px;text-align:center;">
        <p style="font-size:10px;color:#9ca3af;margin:0;">تم الإنشاء بواسطة FlowCash — ${new Date().toLocaleDateString("ar-EG")}</p>
      </div>`;
    return node;
  };

  const rasterizeSchedule = async () => {
    const node = buildScheduleNode();
    document.body.appendChild(node);
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      if (document.fonts?.ready) await document.fonts.ready;
      return await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
    } finally {
      document.body.removeChild(node);
    }
  };

  const exportSchedule = async () => {
    setExporting(true);
    try {
      const canvas = await rasterizeSchedule();
      const { jsPDF } = await import("jspdf");
      const w = canvas.width / 2;
      const h = canvas.height / 2;
      const pdf = new jsPDF({ unit: "px", format: [w, h] });
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, w, h);
      await shareFile(pdf.output("dataurlstring"), "جدول-الأدوية.pdf", "application/pdf");
    } finally {
      setExporting(false);
    }
  };

  // Round 32 — "ضيف تصدير صوره كمان": نفس الرسم بالظبط، بس من غير لف الصورة
  // في PDF — بنشارك canvas.toDataURL مباشرة كـ PNG.
  const exportScheduleImage = async () => {
    setExportingImg(true);
    try {
      const canvas = await rasterizeSchedule();
      await shareFile(canvas.toDataURL("image/png"), "جدول-الأدوية.png", "image/png");
    } finally {
      setExportingImg(false);
    }
  };

  // Round 34 — "كشف يروح للدكتور": تصدير مخصوص لمجموعة واحدة — عنوانه
  // بيانات الطبيب فوق، وتحته بس أدوية المجموعة دي (عكس exportSchedule
  // العام اللي بقى بيصدّر الأدوية بس من غير أي طبيب).
  //
  // Round 36 fixes:
  // 1. "بيطلع بايظ" — نفس فئة باج bidi: medScheduleLabel ("كل 8 ساعة") ورقم
  //    تليفون الدكتور كانوا بيتحطوا جوه HTML مصدَّر من غير عزل. اتصلح بـ
  //    medScheduleLabelHtml() + عزل رقم التليفون بس (مش السطر كله).
  // 2. "سوتش ارفاق التحاليل، سوتش ارفاق نتيجة السكر والضغط": المجموعة
  //    (medication_groups) مش عندها measurements/labs خاصة بيها في الـ
  //    state هنا (دي جوه HealthSection منفصلة) — فبنجيبها بطلب API مباشر
  //    وقت التصدير بس لو السويتش المعني مفعّل، بدل ما تتحمل دايمًا.
  //    نتائج التحاليل (صور) بتتضاف كصفحات إضافية في نفس ملف الـ PDF.
  const exportGroupReferral = async (g: any, opts: { attachLabs: boolean; attachHealth: boolean }) => {
    setExportingGroupId(g.id);
    try {
      const groupMeds = meds.filter((m) => m.group_id === g.id);

      let healthRows: any[] = [];
      if (opts.attachHealth) {
        try {
          const res = await fetch("/api/reminders/health/measurements");
          const data = await res.json();
          healthRows = (data.measurements || []).slice(0, 10);
        } catch {
          // best-effort — التصدير يكمل من غير القياسات لو الطلب فشل
        }
      }
      let labImages: string[] = [];
      if (opts.attachLabs) {
        try {
          const res = await fetch("/api/reminders/health/labs");
          const data = await res.json();
          labImages = (data.labs || []).filter((l: any) => l.group_id === g.id).map((l: any) => l.image);
        } catch {
          // best-effort — التصدير يكمل من غير التحاليل لو الطلب فشل
        }
      }

      const node = document.createElement("div");
      node.style.position = "fixed";
      node.style.left = "-9999px";
      node.style.top = "0";
      node.style.width = "700px";
      node.style.background = "#ffffff";
      node.style.padding = "24px";
      node.style.fontFamily = "Cairo, sans-serif";
      node.style.direction = "rtl";
      node.style.color = "#111827";
      const cellWrap = "word-break:break-word;overflow-wrap:anywhere;";
      const rows = groupMeds
        .map(
          (m) => `<tr>
            <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:12px;${cellWrap}">${FORM_EMOJI[m.form] || ""} ${escapeHtml(m.name)}</td>
            <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:11px;${cellWrap}">${medScheduleLabelHtml(m)}</td>
          </tr>`
        )
        .join("");
      const doctorLine = [
        g.doctor_name ? `د. ${escapeHtml(g.doctor_name)}` : "",
        g.doctor_specialty ? escapeHtml(g.doctor_specialty) : "",
        g.doctor_phone ? ltrIsolate(escapeHtml(g.doctor_phone)) : "",
        g.doctor_address ? escapeHtml(g.doctor_address) : "",
      ].filter(Boolean).join(" — ");

      const healthRowsHtml = healthRows
        .map((m) => {
          const valueLabel = m.kind === "blood_pressure" ? `${m.value1}/${m.value2}` : String(m.value1);
          return `<tr>
            <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:12px;${cellWrap}">${HEALTH_KIND_EMOJI[m.kind] || ""} ${escapeHtml(HEALTH_KIND_LABELS[m.kind] || m.kind)}</td>
            <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:12px;">${ltrIsolate(valueLabel)}</td>
            <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:11px;color:#6b7280;">${ltrIsolate(escapeHtml(new Date(m.measured_at).toLocaleString("ar-EG")))}</td>
          </tr>`;
        })
        .join("");
      const healthSection = opts.attachHealth
        ? `<div style="margin-top:16px;">
            <h3 style="font-size:13px;margin:0 0 6px;">قياسات السكر والضغط</h3>
            <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
              <colgroup><col style="width:34%;"/><col style="width:26%;"/><col style="width:40%;"/></colgroup>
              <thead><tr style="background:#f9fafb;"><th style="padding:6px 4px;font-size:11px;text-align:right;">النوع</th><th style="padding:6px 4px;font-size:11px;text-align:right;">القراءة</th><th style="padding:6px 4px;font-size:11px;text-align:right;">التاريخ</th></tr></thead>
              <tbody>${healthRowsHtml || '<tr><td colspan="3" style="font-size:11px;color:#9ca3af;padding:6px 4px;">لا يوجد</td></tr>'}</tbody>
            </table>
          </div>`
        : "";

      node.innerHTML = `
        <div style="text-align:center;margin-bottom:16px;">
          <p style="font-size:12px;color:#ea580c;font-weight:700;">FlowCash</p>
          <h2 style="font-size:17px;margin:6px 0 2px;">كشف أدوية — ${escapeHtml(g.name)}</h2>
          ${doctorLine ? `<p style="font-size:12px;color:#6b7280;margin:2px 0 0;">${doctorLine}</p>` : ""}
        </div>
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
          <colgroup><col style="width:55%;"/><col style="width:45%;"/></colgroup>
          <thead><tr style="background:#f9fafb;"><th style="padding:6px 4px;font-size:11px;text-align:right;">الدواء</th><th style="padding:6px 4px;font-size:11px;text-align:right;">الجرعات</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="2" style="font-size:11px;color:#9ca3af;padding:6px 4px;">لا يوجد</td></tr>'}</tbody>
        </table>
        ${healthSection}
        <div style="border-top:1px solid #e5e7eb;margin-top:16px;padding-top:10px;text-align:center;">
          <p style="font-size:10px;color:#9ca3af;margin:0;">تم الإنشاء بواسطة FlowCash — ${new Date().toLocaleDateString("ar-EG")}${opts.attachLabs && labImages.length ? ` — مرفق ${labImages.length} نتيجة تحليل في الصفحات التالية` : ""}</p>
        </div>`;
      document.body.appendChild(node);
      try {
        const html2canvas = (await import("html2canvas-pro")).default;
        if (document.fonts?.ready) await document.fonts.ready;
        const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
        const { jsPDF } = await import("jspdf");
        const w = canvas.width / 2;
        const h = canvas.height / 2;
        const pdf = new jsPDF({ unit: "px", format: [w, h] });
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, w, h);
        for (const imgUrl of labImages) {
          try {
            const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve({ w: img.width, h: img.height });
              img.onerror = reject;
              img.src = imgUrl;
            });
            pdf.addPage([dims.w, dims.h], dims.w >= dims.h ? "landscape" : "portrait");
            pdf.addImage(imgUrl, "JPEG", 0, 0, dims.w, dims.h);
          } catch {
            // صورة تحليل واحدة فشلت تتحمل — نكمل بالباقي بدل ما نوقف التصدير كله
          }
        }
        await shareFile(pdf.output("dataurlstring"), `كشف-${g.name}.pdf`, "application/pdf");
      } finally {
        document.body.removeChild(node);
      }
    } finally {
      setExportingGroupId(null);
    }
  };

  // كارت دواء واحد (عرض أو تعديل) — بيستخدم في قسمي "أدوية حرة" وكل
  // مجموعة على حدة، عشان الكود متكررش (Round 34 restructure).
  const medCard = (m: any) =>
    editingMedId === m.id ? (
      <Card key={m.id} className="space-y-2">
        <input placeholder="اسم الدواء" value={editMedForm.name} onChange={(e) => setEditMedForm({ ...editMedForm, name: e.target.value })} className={inputCls} />
        <div className="flex flex-wrap gap-1">
          {Object.entries(MEDICATION_FORM_LABELS).map(([key, label]) => (
            <button key={key} onClick={() => setEditMedForm({ ...editMedForm, formType: key })} className={`px-2 py-1 rounded-lg text-xs border ${editMedForm.formType === key ? "bg-orange-500 text-white border-orange-500" : "border-neutral-300 dark:border-neutral-700"}`}>
              {FORM_EMOJI[key]} {label}
            </button>
          ))}
        </div>
        <input
          type="number"
          placeholder="عدد الحبات داخل العلبة"
          value={editMedForm.pack_size}
          onChange={(e) => setEditMedForm({ ...editMedForm, pack_size: e.target.value })}
          className="w-40 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-xs"
        />
        <div className="grid grid-cols-3 gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-1 text-xs">
          {SCHEDULE_TYPES.map((t) => (
            <button key={t} onClick={() => setEditMedForm({ ...editMedForm, schedule_type: t })} className={`py-1.5 rounded-md ${editMedForm.schedule_type === t ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>
              {SCHEDULE_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        {editMedForm.schedule_type === "meal" && (
          <select value={editMedForm.meal_timing} onChange={(e) => setEditMedForm({ ...editMedForm, meal_timing: e.target.value })} className={inputCls}>
            {Object.entries(MEAL_TIMING_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        )}
        {editMedForm.schedule_type === "interval" && (
          <select value={editMedForm.interval_hours} onChange={(e) => setEditMedForm({ ...editMedForm, interval_hours: e.target.value })} className={inputCls}>
            {[6, 8, 12, 24].map((h) => (
              <option key={h} value={h}>كل {h} ساعة</option>
            ))}
          </select>
        )}
        {NEEDS_FIRST_DOSE(editMedForm.schedule_type) && (
          <div className="space-y-1">
            <p className="text-xs text-neutral-400">بداية أول جرعة</p>
            <input type="datetime-local" value={editMedForm.first_dose_at} onChange={(e) => setEditMedForm({ ...editMedForm, first_dose_at: e.target.value })} className={inputCls} />
          </div>
        )}
        <div className="flex items-center justify-between">
          <p className="text-sm">ذكرني</p>
          <Switch checked={editMedForm.reminder_enabled} onChange={(v) => setEditMedForm({ ...editMedForm, reminder_enabled: v })} />
        </div>
        {editMedForm.reminder_enabled && (
          editMedForm.schedule_type === "meal" ? (
            <p className="text-xs text-neutral-400">هيتبعتلك تذكير في معاد الوجبة نفسه تلقائيًا.</p>
          ) : (
            <div>
              <p className="text-xs text-neutral-400 mb-1">تنبيه قبل الموعد بكام دقيقة</p>
              <input type="number" placeholder="مثلاً 15" value={editMedForm.remind_before_minutes} onChange={(e) => setEditMedForm({ ...editMedForm, remind_before_minutes: e.target.value })} className={inputCls} />
            </div>
          )
        )}
        <input type="number" placeholder="مدة العلاج بالأيام (اختياري)" value={editMedForm.course_duration_days} onChange={(e) => setEditMedForm({ ...editMedForm, course_duration_days: e.target.value })} className={inputCls} />
        <div>
          <p className="text-xs text-neutral-400 mb-1">تنبيه لو باقي كام حبة في العبوة</p>
          <input type="number" placeholder="مثلاً 2" value={editMedForm.low_stock_threshold} onChange={(e) => setEditMedForm({ ...editMedForm, low_stock_threshold: e.target.value })} className={inputCls} />
        </div>
        {medError && <p className="text-xs text-red-500">{medError}</p>}
        <div className="flex items-center gap-2">
          <button onClick={() => saveEditMed(m.id)} disabled={editMedSaving} className={btnPrimary}>
            {editMedSaving ? <Loader2 size={14} className="animate-spin inline" /> : "حفظ"}
          </button>
          <button onClick={() => { setEditingMedId(null); setMedError(""); }} className={btnGhost}>إلغاء</button>
        </div>
      </Card>
    ) : (
      <Card key={m.id} className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{FORM_EMOJI[m.form] || <Pill size={14} className="inline" />} {m.name}{m.source === "telegram" ? " (تليجرام)" : ""}</p>
          <Switch checked={m.reminder_enabled} onChange={(v) => toggleReminder(m.id, v)} />
        </div>
        <p className="text-xs text-neutral-400">
          {medScheduleLabel(m)}
          {m.next_dose_at ? ` — الجرعة الجاية: ${new Date(m.next_dose_at).toLocaleString("ar-EG")}` : ""}
        </p>
        {m.course_duration_days != null && (
          <p className="text-xs text-neutral-400">مدة العلاج: {m.course_duration_days} يوم</p>
        )}
        {m.pack_size != null && (
          <p className={`text-xs ${m.remaining_doses <= m.low_stock_threshold ? "text-red-500 font-medium" : "text-neutral-400"}`}>
            باقي {m.remaining_doses} من {m.pack_size}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button onClick={() => logDose(m.id)} className={`${btnGhost} flex items-center gap-1`}>
            <CheckCircle2 size={12} /> سجّل جرعة اتاخدت
          </button>
          <button onClick={() => startEditMed(m)} className="text-neutral-400 hover:text-orange-600 p-1"><Pencil size={14} /></button>
          <button onClick={() => delMed(m.id)} className="text-red-500 p-1"><Trash2 size={14} /></button>
        </div>
      </Card>
    );

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <p className="text-sm font-medium">دواء جديد</p>
        <input placeholder="اسم الدواء" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
        <div className="flex flex-wrap gap-1">
          {Object.entries(MEDICATION_FORM_LABELS).map(([key, label]) => (
            <button key={key} onClick={() => setForm({ ...form, formType: key })} className={`px-2 py-1 rounded-lg text-xs border ${form.formType === key ? "bg-orange-500 text-white border-orange-500" : "border-neutral-300 dark:border-neutral-700"}`}>
              {FORM_EMOJI[key]} {label}
            </button>
          ))}
        </div>
        <input
          type="number"
          placeholder="عدد الحبات داخل العلبة (اختياري)"
          value={form.pack_size}
          onChange={(e) => setForm({ ...form, pack_size: e.target.value })}
          className="w-40 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-xs"
        />

        {/* Round 34 — "دواء حر ولا مجموعه": دواء حر (زي مسكن/أنسولين) من
            غير ربط بطبيب، أو دواء ضمن مجموعة مرتبطة بطبيب معين — كذا دواء
            ممكن ينضموا لنفس المجموعة عشان ياخدوا كشف واحد يروح للدكتور. */}
        <div className="space-y-2 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-2">
          <div className="grid grid-cols-2 gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-1 text-xs">
            <button onClick={() => setForm({ ...form, kind: "free" })} className={`py-1.5 rounded-md ${form.kind === "free" ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>دواء حر</button>
            <button onClick={() => setForm({ ...form, kind: "group" })} className={`py-1.5 rounded-md ${form.kind === "group" ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>مرتبط بطبيب (مجموعة)</button>
          </div>
          {form.kind === "group" && (
            <div className="space-y-2">
              {groups.length > 0 && (
                <select
                  value={form.group_id}
                  onChange={(e) => setForm({ ...form, group_id: e.target.value })}
                  className={inputCls}
                >
                  <option value="">+ مجموعة جديدة</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}{g.doctor_name ? ` — د. ${g.doctor_name}` : ""}</option>
                  ))}
                </select>
              )}
              {!form.group_id && (
                <div className="space-y-1.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 p-2">
                  <input placeholder="اسم المجموعة (مثلاً: علاج الضغط)" value={form.new_group_name} onChange={(e) => setForm({ ...form, new_group_name: e.target.value })} className={inputCls} />
                  <input placeholder="اسم الطبيب المعالج" value={form.new_group_doctor_name} onChange={(e) => setForm({ ...form, new_group_doctor_name: e.target.value })} className={inputCls} />
                  <div className="grid grid-cols-2 gap-1.5">
                    <input placeholder="التخصص" value={form.new_group_doctor_specialty} onChange={(e) => setForm({ ...form, new_group_doctor_specialty: e.target.value })} className={inputCls} />
                    <input placeholder="رقم الهاتف" value={form.new_group_doctor_phone} onChange={(e) => setForm({ ...form, new_group_doctor_phone: e.target.value })} className={inputCls} />
                  </div>
                  <input placeholder="عنوان العيادة" value={form.new_group_doctor_address} onChange={(e) => setForm({ ...form, new_group_doctor_address: e.target.value })} className={inputCls} />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-1 text-xs">
          {SCHEDULE_TYPES.map((t) => (
            <button key={t} onClick={() => setForm({ ...form, schedule_type: t })} className={`py-1.5 rounded-md ${form.schedule_type === t ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>
              {SCHEDULE_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        {form.schedule_type === "meal" && (
          <select value={form.meal_timing} onChange={(e) => setForm({ ...form, meal_timing: e.target.value })} className={inputCls}>
            {Object.entries(MEAL_TIMING_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        )}
        {form.schedule_type === "interval" && (
          <select value={form.interval_hours} onChange={(e) => setForm({ ...form, interval_hours: e.target.value })} className={inputCls}>
            {[6, 8, 12, 24].map((h) => (
              <option key={h} value={h}>كل {h} ساعة</option>
            ))}
          </select>
        )}
        {NEEDS_FIRST_DOSE(form.schedule_type) && (
          <div className="space-y-1">
            <p className="text-xs text-neutral-400">بداية أول جرعة — بيتحسب عليها كل المواعيد الجاية</p>
            <input type="datetime-local" value={form.first_dose_at} onChange={(e) => setForm({ ...form, first_dose_at: e.target.value })} className={inputCls} />
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm">ذكرني</p>
          <Switch checked={form.reminder_enabled} onChange={(v) => setForm({ ...form, reminder_enabled: v })} />
        </div>
        {form.reminder_enabled && (
          form.schedule_type === "meal" ? (
            <p className="text-xs text-neutral-400">هيتبعتلك تذكير في معاد الوجبة نفسه تلقائيًا.</p>
          ) : (
            <div>
              <p className="text-xs text-neutral-400 mb-1">تنبيه قبل الموعد بكام دقيقة</p>
              <input type="number" placeholder="مثلاً 15" value={form.remind_before_minutes} onChange={(e) => setForm({ ...form, remind_before_minutes: e.target.value })} className={inputCls} />
            </div>
          )
        )}
        <input type="number" placeholder="مدة العلاج بالأيام (اختياري) — يتقفل تلقائي بعدها" value={form.course_duration_days} onChange={(e) => setForm({ ...form, course_duration_days: e.target.value })} className={inputCls} />
        <div>
          <p className="text-xs text-neutral-400 mb-1">تنبيه لو باقي كام حبة في العبوة (نفاد المخزون)</p>
          <input type="number" placeholder="مثلاً 2" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} className={inputCls} />
        </div>

        {medError && <p className="text-xs text-red-500">{medError}</p>}
        <button onClick={submitMed} disabled={saving} className={btnPrimary}>
          {saving ? <Loader2 size={14} className="animate-spin inline" /> : "إضافة الدواء"}
        </button>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">الأدوية المسجلة</p>
        {(meds.length > 0 || appts.length > 0) && (
          <div className="flex items-center gap-1">
            <button onClick={exportSchedule} disabled={exporting || exportingImg} className={`${btnGhost} flex items-center gap-1`}>
              {exporting ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />} تصدير PDF
            </button>
            <button onClick={exportScheduleImage} disabled={exporting || exportingImg} className={`${btnGhost} flex items-center gap-1`}>
              {exportingImg ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />} تصدير صورة
            </button>
          </div>
        )}
      </div>
      {/* Round 34 — "قسم الادويه في مجموعات": أدوية حرة (من غير مجموعة)
          في قسم منفصل، وكل مجموعة (مرتبطة بطبيب) في قسمها بعنوانها وزرار
          "تصدير كشف للدكتور" الخاص بيها. */}
      <div className="space-y-4">
        {meds.filter((m) => !m.group_id).length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-neutral-500">💊 أدوية حرة</p>
            {meds.filter((m) => !m.group_id).map(medCard)}
          </div>
        )}
        {groups.map((g) => {
          const groupMeds = meds.filter((m) => m.group_id === g.id);
          if (!groupMeds.length) return null;
          const opts = groupExportOpts[g.id] || { attachLabs: false, attachHealth: false };
          const setOpts = (patch: Partial<{ attachLabs: boolean; attachHealth: boolean }>) =>
            setGroupExportOpts((prev) => ({ ...prev, [g.id]: { ...opts, ...patch } }));
          return (
            <div key={g.id} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-neutral-500 truncate">📋 {g.name}{g.doctor_name ? ` — د. ${g.doctor_name}` : ""}</p>
                <button onClick={() => exportGroupReferral(g, opts)} disabled={exportingGroupId === g.id} className={`${btnGhost} flex items-center gap-1 text-[10px] shrink-0`}>
                  {exportingGroupId === g.id ? <Loader2 size={11} className="animate-spin" /> : <FileDown size={11} />} تصدير كشف للدكتور
                </button>
              </div>
              {/* Round 36 — سوتشات إرفاق التحاليل / نتيجة السكر والضغط جوه
                  التصدير، لكل مجموعة على حدة. */}
              <div className="flex items-center gap-3 pr-1">
                <label className="flex items-center gap-1 text-[10px] text-neutral-500 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={opts.attachLabs}
                    onChange={(e) => setOpts({ attachLabs: e.target.checked })}
                    className="accent-orange-500"
                  />
                  إرفاق التحاليل
                </label>
                <label className="flex items-center gap-1 text-[10px] text-neutral-500 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={opts.attachHealth}
                    onChange={(e) => setOpts({ attachHealth: e.target.checked })}
                    className="accent-orange-500"
                  />
                  إرفاق نتيجة السكر والضغط
                </label>
              </div>
              {groupMeds.map(medCard)}
            </div>
          );
        })}
        {!meds.length && <p className="text-sm text-neutral-400 text-center py-4">مفيش أدوية مسجلة</p>}
      </div>

      <div ref={apptFormRef}>
      <Card className="space-y-2">
        <p className="text-sm font-medium">موعد طبي جديد</p>
        <div className="grid grid-cols-2 gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-1 text-xs">
          <button onClick={() => setApptForm({ ...apptForm, kind: "checkup" })} className={`py-1.5 rounded-md ${apptForm.kind === "checkup" ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>كشف طبي</button>
          <button onClick={() => setApptForm({ ...apptForm, kind: "consultation" })} className={`py-1.5 rounded-md ${apptForm.kind === "consultation" ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>استشارة</button>
        </div>
        {apptForm.parent_appointment_id && (
          <div className="flex items-center justify-between bg-orange-50 dark:bg-orange-950/30 rounded-lg px-2 py-1.5">
            <p className="text-xs text-orange-600">مربوطة كمتابعة لكشف سابق</p>
            <button onClick={() => setApptForm({ ...apptForm, parent_appointment_id: "" })} className="text-orange-600 p-0.5"><X size={12} /></button>
          </div>
        )}
        <input placeholder="العنوان (اختياري)" value={apptForm.title} onChange={(e) => setApptForm({ ...apptForm, title: e.target.value })} className={inputCls} />
        <input type="datetime-local" value={apptForm.appointment_at} onChange={(e) => setApptForm({ ...apptForm, appointment_at: e.target.value })} className={inputCls} />
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="اسم الطبيب المعالج" value={apptForm.doctor_name} onChange={(e) => setApptForm({ ...apptForm, doctor_name: e.target.value })} className={inputCls} />
          <input placeholder="التخصص" value={apptForm.doctor_specialty} onChange={(e) => setApptForm({ ...apptForm, doctor_specialty: e.target.value })} className={inputCls} />
        </div>
        <input placeholder="رقم الهاتف" value={apptForm.doctor_phone} onChange={(e) => setApptForm({ ...apptForm, doctor_phone: e.target.value })} className={inputCls} />
        <input placeholder="عنوان العيادة" value={apptForm.doctor_address} onChange={(e) => setApptForm({ ...apptForm, doctor_address: e.target.value })} className={inputCls} />
        {meds.length > 0 && (
          <select value={apptForm.medication_id} onChange={(e) => setApptForm({ ...apptForm, medication_id: e.target.value })} className={inputCls}>
            <option value="">بدون ربط بدواء</option>
            {meds.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        )}
        <div className="space-y-1">
          <p className="text-xs text-neutral-400">صورة الروشتة (اختياري) — بنستخرج بيانات الطبيب منها تلقائيًا بالذكاء الاصطناعي</p>
          <PhotoCaptureRow onPick={(dataUrl) => { setApptForm({ ...apptForm, prescription_image: dataUrl }); extractDoctorInfo(dataUrl, false); }} />
        </div>
        {apptForm.prescription_image && <img src={apptForm.prescription_image} alt="روشتة" className="rounded-lg max-h-32 mx-auto" />}
        {apptExtracting && <p className="text-xs text-orange-500 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> {AI_LOADING_TEXT}</p>}
        {apptExtractMsg && !apptExtracting && <p className="text-xs text-orange-500">{apptExtractMsg}</p>}
        <p className="text-xs text-neutral-400">هيتبعتلك تذكير قبلها بيوم، وتاني قبلها بـ 3 ساعات.</p>
        {apptError && <p className="text-xs text-red-500">{apptError}</p>}
        <button onClick={submitAppt} disabled={savingAppt} className={btnPrimary}>
          {savingAppt ? <Loader2 size={14} className="animate-spin inline" /> : "إضافة الموعد"}
        </button>
      </Card>
      </div>

      <div className="space-y-2">
        {appts.map((a) => {
          const followUp = a.kind === "checkup" ? appts.find((x) => x.parent_appointment_id === a.id) : null;
          const parent = a.parent_appointment_id ? appts.find((x) => x.id === a.parent_appointment_id) : null;
          return editingApptId === a.id ? (
            <Card key={a.id} className="space-y-2">
              <div className="grid grid-cols-2 gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-1 text-xs">
                <button onClick={() => setEditApptForm({ ...editApptForm, kind: "checkup" })} className={`py-1.5 rounded-md ${editApptForm.kind === "checkup" ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>كشف طبي</button>
                <button onClick={() => setEditApptForm({ ...editApptForm, kind: "consultation" })} className={`py-1.5 rounded-md ${editApptForm.kind === "consultation" ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>استشارة</button>
              </div>
              <input placeholder="العنوان (اختياري)" value={editApptForm.title} onChange={(e) => setEditApptForm({ ...editApptForm, title: e.target.value })} className={inputCls} />
              <input type="datetime-local" value={editApptForm.appointment_at} onChange={(e) => setEditApptForm({ ...editApptForm, appointment_at: e.target.value })} className={inputCls} />
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="اسم الطبيب المعالج" value={editApptForm.doctor_name} onChange={(e) => setEditApptForm({ ...editApptForm, doctor_name: e.target.value })} className={inputCls} />
                <input placeholder="التخصص" value={editApptForm.doctor_specialty} onChange={(e) => setEditApptForm({ ...editApptForm, doctor_specialty: e.target.value })} className={inputCls} />
              </div>
              <input placeholder="رقم الهاتف" value={editApptForm.doctor_phone} onChange={(e) => setEditApptForm({ ...editApptForm, doctor_phone: e.target.value })} className={inputCls} />
              <input placeholder="عنوان العيادة" value={editApptForm.doctor_address} onChange={(e) => setEditApptForm({ ...editApptForm, doctor_address: e.target.value })} className={inputCls} />
              <PhotoCaptureRow onPick={(dataUrl) => { setEditApptForm({ ...editApptForm, prescription_image: dataUrl }); extractDoctorInfo(dataUrl, true); }} />
              {editApptForm.prescription_image && <img src={editApptForm.prescription_image} alt="روشتة" className="rounded-lg max-h-32 mx-auto" />}
              {editApptExtracting && <p className="text-xs text-orange-500 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> {AI_LOADING_TEXT}</p>}
              {editApptExtractMsg && !editApptExtracting && <p className="text-xs text-orange-500">{editApptExtractMsg}</p>}
              <div className="flex items-center gap-2">
                <button onClick={() => saveEditAppt(a.id)} disabled={editApptSaving} className={btnPrimary}>
                  {editApptSaving ? <Loader2 size={14} className="animate-spin inline" /> : "حفظ"}
                </button>
                <button onClick={() => setEditingApptId(null)} className={btnGhost}>إلغاء</button>
              </div>
            </Card>
          ) : (
            <Card key={a.id} className="space-y-1">
              <div
                className={(a.doctor_name || a.doctor_specialty || a.doctor_phone || a.doctor_address) ? "space-y-1 cursor-pointer" : "space-y-1"}
                onClick={() => { if (a.doctor_name || a.doctor_specialty || a.doctor_phone || a.doctor_address) setDoctorCardAppt(a); }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{a.kind === "consultation" ? "استشارة طبية" : "كشف طبي"}{a.title ? ` — ${a.title}` : ""}</p>
                  {a.status === "upcoming" && (
                    <button onClick={(e) => { e.stopPropagation(); markApptDone(a.id); }} className="text-xs text-blue-600">تم ✓</button>
                  )}
                </div>
                <p className="text-xs text-neutral-400">{new Date(a.appointment_at).toLocaleString("ar-EG")}{a.medications?.name ? ` — ${a.medications.name}` : ""}</p>
                {(a.doctor_name || a.doctor_specialty || a.doctor_phone || a.doctor_address) && (
                  <p className="text-xs text-orange-600">👨‍⚕️ بيانات الطبيب — اضغط للتفاصيل</p>
                )}
              </div>
              {parent && <p className="text-xs text-orange-500">متابعة لكشف: {parent.title || new Date(parent.appointment_at).toLocaleDateString("ar-EG")}</p>}
              {followUp && <p className="text-xs text-orange-500">فيه استشارة متابعة يوم {new Date(followUp.appointment_at).toLocaleString("ar-EG")}</p>}
              {a.prescription_image && <img src={a.prescription_image} alt="روشتة" className="rounded-lg max-h-24" />}
              <div className="flex items-center gap-2 flex-wrap">
                {a.kind === "checkup" && !followUp && (
                  <button onClick={() => startFollowUp(a)} className={`${btnGhost} text-xs`}>تسجيل استشارة متابعة</button>
                )}
                <button onClick={() => startEditAppt(a)} className="text-neutral-400 hover:text-orange-600 p-1"><Pencil size={14} /></button>
                <button onClick={() => delAppt(a.id)} className="text-red-500 p-1"><Trash2 size={14} /></button>
              </div>
            </Card>
          );
        })}
        {!appts.length && <p className="text-sm text-neutral-400 text-center py-4">مفيش مواعيد مسجلة</p>}
      </div>

      {/* Round 34 — "نحط قياس سكر قياس ضغط ... وتحته مكان رفع صورة نتائج
          تحاليل": جوه نفس تبويب الأدوية زي ما طلب المستخدم بالظبط. */}
      <HealthSection groups={groups} />

      {/* Round 34 — "لنا أدوس علي كشف لو استشاره يطلع كارت فيه بيانات
          الدكتور": بطاقة منبثقة بس لبيانات الطبيب، بعيدة تمامًا عن أزرار
          التعديل/المسح (اللي فضلت برة الكارت زي ما هي). */}
      {doctorCardAppt && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDoctorCardAppt(null)}>
          <div
            className="max-w-sm w-full space-y-2 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4 shadow-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">بيانات الطبيب</p>
              <button onClick={() => setDoctorCardAppt(null)} className="text-neutral-400 p-1"><X size={16} /></button>
            </div>
            <p className="text-base font-semibold">{doctorCardAppt.doctor_name ? `د. ${doctorCardAppt.doctor_name}` : "بدون اسم"}</p>
            {doctorCardAppt.doctor_specialty && <p className="text-sm text-neutral-500">التخصص: {doctorCardAppt.doctor_specialty}</p>}
            {doctorCardAppt.doctor_phone && <p className="text-sm text-neutral-500">الهاتف: {doctorCardAppt.doctor_phone}</p>}
            {doctorCardAppt.doctor_address && <p className="text-sm text-neutral-500">العنوان: {doctorCardAppt.doctor_address}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================= قياس سكر/ضغط + نتائج التحاليل (Round 34) ============================= */

const HEALTH_KIND_LABELS: Record<string, string> = { blood_sugar: "قياس سكر", blood_pressure: "قياس ضغط" };
const HEALTH_KIND_EMOJI: Record<string, string> = { blood_sugar: "🩸", blood_pressure: "❤️" };

function nowLocalInputValue() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

// "قياس سكر قياس ضغط و يتربط بمعاد وتاريخ كل تسجيل، و تحته مكان رفع صورة
// نتائج تحاليل وممكن ربطه مع دكتور وتصدير صورة و PDF" — قسمين داخل نفس
// الكارت: قياسات (health_measurements) وتحاليل مرفوعة كصور (lab_results).
function HealthSection({ groups }: { groups: any[] }) {
  const [measurements, setMeasurements] = useState<any[]>([]);
  const [kind, setKind] = useState<"blood_sugar" | "blood_pressure">("blood_sugar");
  const [value1, setValue1] = useState("");
  const [value2, setValue2] = useState("");
  const [measuredAt, setMeasuredAt] = useState(nowLocalInputValue());
  const [savingMeasure, setSavingMeasure] = useState(false);
  const [measureError, setMeasureError] = useState("");

  const [labs, setLabs] = useState<any[]>([]);
  const [labImage, setLabImage] = useState("");
  const [labGroupId, setLabGroupId] = useState("");
  const [savingLab, setSavingLab] = useState(false);
  const [labError, setLabError] = useState("");
  const [exportingLabId, setExportingLabId] = useState<string | null>(null);
  const [exportingLabImgId, setExportingLabImgId] = useState<string | null>(null);

  const loadMeasurements = () => fetch("/api/reminders/health/measurements").then((r) => r.json()).then((d) => setMeasurements(d.measurements || []));
  const loadLabs = () => fetch("/api/reminders/health/labs").then((r) => r.json()).then((d) => setLabs(d.labs || []));
  useEffect(() => {
    loadMeasurements();
    loadLabs();
  }, []);

  const submitMeasurement = async () => {
    if (!(Number(value1) >= 0)) { setMeasureError("القيمة مطلوبة"); return; }
    if (kind === "blood_pressure" && !(Number(value2) >= 0)) { setMeasureError("قياس الضغط محتاج الانقباضي والانبساطي"); return; }
    setSavingMeasure(true);
    setMeasureError("");
    try {
      const res = await fetch("/api/reminders/health/measurements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, value1: Number(value1), value2: kind === "blood_pressure" ? Number(value2) : null, measured_at: new Date(measuredAt).toISOString() }),
      });
      const data = await res.json();
      if (!res.ok) { setMeasureError(data.error || "حصل خطأ ومتسجلش القياس"); return; }
      setValue1("");
      setValue2("");
      setMeasuredAt(nowLocalInputValue());
      loadMeasurements();
    } finally {
      setSavingMeasure(false);
    }
  };
  const delMeasurement = async (id: string) => {
    await fetch(`/api/reminders/health/measurements/${id}`, { method: "DELETE" });
    loadMeasurements();
  };

  const submitLab = async () => {
    if (!labImage) { setLabError("صورة نتيجة التحليل مطلوبة"); return; }
    setSavingLab(true);
    setLabError("");
    try {
      const res = await fetch("/api/reminders/health/labs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: labImage, group_id: labGroupId || null }),
      });
      const data = await res.json();
      if (!res.ok) { setLabError(data.error || "حصل خطأ ومترفعتش الصورة"); return; }
      setLabImage("");
      setLabGroupId("");
      loadLabs();
    } finally {
      setSavingLab(false);
    }
  };
  const delLab = async (id: string) => {
    await fetch(`/api/reminders/health/labs/${id}`, { method: "DELETE" });
    loadLabs();
  };

  const exportLabImage = async (lab: any) => {
    setExportingLabImgId(lab.id);
    try {
      await shareFile(lab.image, `تحليل-${lab.id.slice(0, 8)}.jpg`, "image/jpeg");
    } finally {
      setExportingLabImgId(null);
    }
  };
  const exportLabPdf = async (lab: any) => {
    setExportingLabId(lab.id);
    try {
      const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.width, h: img.height });
        img.onerror = reject;
        img.src = lab.image;
      });
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ unit: "px", format: [dims.w, dims.h] });
      pdf.addImage(lab.image, "JPEG", 0, 0, dims.w, dims.h);
      await shareFile(pdf.output("dataurlstring"), `تحليل-${lab.id.slice(0, 8)}.pdf`, "application/pdf");
    } finally {
      setExportingLabId(null);
    }
  };

  return (
    <Card className="space-y-4">
      <p className="text-sm font-medium">القياسات ونتائج التحاليل</p>

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-1 text-xs">
          <button onClick={() => setKind("blood_sugar")} className={`py-1.5 rounded-md ${kind === "blood_sugar" ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>🩸 قياس سكر</button>
          <button onClick={() => setKind("blood_pressure")} className={`py-1.5 rounded-md ${kind === "blood_pressure" ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>❤️ قياس ضغط</button>
        </div>
        {kind === "blood_sugar" ? (
          <input type="number" placeholder="قراءة السكر" value={value1} onChange={(e) => setValue1(e.target.value)} className={inputCls} />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <input type="number" placeholder="الانقباضي (العلوي)" value={value1} onChange={(e) => setValue1(e.target.value)} className={inputCls} />
            <input type="number" placeholder="الانبساطي (السفلي)" value={value2} onChange={(e) => setValue2(e.target.value)} className={inputCls} />
          </div>
        )}
        <input type="datetime-local" value={measuredAt} onChange={(e) => setMeasuredAt(e.target.value)} className={inputCls} />
        {measureError && <p className="text-xs text-red-500">{measureError}</p>}
        <button onClick={submitMeasurement} disabled={savingMeasure} className={btnPrimary}>
          {savingMeasure ? <Loader2 size={14} className="animate-spin inline" /> : "تسجيل القياس"}
        </button>
      </div>

      {/* Round 36 — "خلي كل واحد لوحده جدول يمين و شمال": بدل قائمة واحدة
          مختلطة، جدولين جنب بعض — قياسات السكر وقياسات الضغط كل واحد في
          عموده. الحاوية RTL فالعنصر الأول في الـ DOM (سكر) بيطلع على
          اليمين، والتاني (ضغط) على الشمال. */}
      <div className="grid grid-cols-2 gap-2">
        {(["blood_sugar", "blood_pressure"] as const).map((k) => {
          const rows = measurements.filter((m) => m.kind === k).slice(0, 8);
          return (
            <div key={k} className="space-y-1.5">
              <p className="text-[11px] font-medium text-neutral-500 text-center">{HEALTH_KIND_EMOJI[k]} {HEALTH_KIND_LABELS[k]}</p>
              <div className="space-y-1">
                {rows.map((m) => (
                  <div key={m.id} className="flex flex-col gap-0.5 rounded-lg bg-neutral-50 dark:bg-neutral-800/50 px-2 py-1.5 text-[11px]">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-medium">{m.kind === "blood_pressure" ? `${m.value1}/${m.value2}` : m.value1}</span>
                      <button onClick={() => delMeasurement(m.id)} className="text-red-500 p-0.5 shrink-0"><Trash2 size={11} /></button>
                    </div>
                    <span className="text-neutral-400 text-[10px]">{new Date(m.measured_at).toLocaleString("ar-EG")}</span>
                  </div>
                ))}
                {!rows.length && <p className="text-[11px] text-neutral-400 text-center py-2">مفيش قياسات</p>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-neutral-100 dark:border-neutral-800 pt-3 space-y-2">
        <p className="text-sm font-medium">نتائج التحاليل</p>
        <PhotoCaptureRow onPick={(dataUrl) => setLabImage(dataUrl)} />
        {labImage && <img src={labImage} alt="نتيجة التحليل" className="rounded-lg max-h-32 mx-auto" />}
        {groups.length > 0 && (
          <select value={labGroupId} onChange={(e) => setLabGroupId(e.target.value)} className={inputCls}>
            <option value="">بدون ربط بطبيب</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}{g.doctor_name ? ` — د. ${g.doctor_name}` : ""}</option>
            ))}
          </select>
        )}
        {labError && <p className="text-xs text-red-500">{labError}</p>}
        <button onClick={submitLab} disabled={savingLab} className={btnPrimary}>
          {savingLab ? <Loader2 size={14} className="animate-spin inline" /> : "رفع نتيجة التحليل"}
        </button>
      </div>

      <div className="space-y-2">
        {labs.map((l) => (
          <div key={l.id} className="rounded-lg bg-neutral-50 dark:bg-neutral-800/50 p-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <img src={l.image} alt="تحليل" className="w-14 h-14 object-cover rounded-lg shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-neutral-400">{new Date(l.created_at).toLocaleDateString("ar-EG")}</p>
                {l.medication_groups?.name && <p className="text-xs text-orange-600 truncate">📋 {l.medication_groups.name}</p>}
              </div>
              <button onClick={() => delLab(l.id)} className="text-red-500 p-1 shrink-0"><Trash2 size={13} /></button>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => exportLabPdf(l)} disabled={exportingLabId === l.id} className={`${btnGhost} flex items-center gap-1 text-[10px]`}>
                {exportingLabId === l.id ? <Loader2 size={11} className="animate-spin" /> : <FileDown size={11} />} تصدير PDF
              </button>
              <button onClick={() => exportLabImage(l)} disabled={exportingLabImgId === l.id} className={`${btnGhost} flex items-center gap-1 text-[10px]`}>
                {exportingLabImgId === l.id ? <Loader2 size={11} className="animate-spin" /> : <ImageIcon size={11} />} تصدير صورة
              </button>
            </div>
          </div>
        ))}
        {!labs.length && <p className="text-xs text-neutral-400 text-center py-2">مفيش نتائج تحاليل مرفوعة</p>}
      </div>
    </Card>
  );
}

/* ============================= قراءة العدادات ============================= */

const METER_LABELS: Record<string, string> = { electricity: "كهرباء", gas: "غاز", water: "مياه" };
const METER_EMOJI: Record<string, string> = { electricity: "⚡", gas: "🔥", water: "💧" };

function UtilityTab() {
  const [meterType, setMeterType] = useState("electricity");
  const [readingValue, setReadingValue] = useState("");
  const [readingDate, setReadingDate] = useState(new Date().toISOString().slice(0, 10));
  const [photo, setPhoto] = useState("");
  const [readings, setReadings] = useState<any[]>([]);
  const [insights, setInsights] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractMsg, setExtractMsg] = useState("");
  const [extractFailed, setExtractFailed] = useState(false);
  const [editExtracting, setEditExtracting] = useState(false);
  const [editExtractMsg, setEditExtractMsg] = useState("");
  const [editExtractFailed, setEditExtractFailed] = useState(false);

  const load = () => {
    fetch("/api/reminders/utility-meters").then((r) => r.json()).then((d) => setReadings(d.readings || []));
    fetch("/api/reminders/utility-meters/insights").then((r) => r.json()).then((d) => setInsights(d.insights || []));
  };
  useEffect(() => {
    load();
  }, []);

  // "استخراج القراة بالذكاء الاصطناعي" (Round 32) — بيتنادى تلقائيًا أول ما
  // صورة العداد تتحط، وبيملى خانة القراءة بالرقم اللي اتقرا (المستخدم لسه
  // يقدر يعدلها قبل الحفظ لو مش مضبوطة).
  // Round 34 — "لو مقدرتش تسحب القراءة اكتب فشل القراءة وادخلها يدويًا":
  // الصورة كانت بتتحفظ دايمًا (زي ما هي، من غير تغيير) بس رسالة الفشل كانت
  // عامة ومكنش واضح فيها إن المطلوب دلوقتي إدخال يدوي. دلوقتي فيه علم
  // extractFailed واضح بيحط رسالة "فشل القراءة" صريحة وبيلوّن خانة القراءة
  // باللون الأحمر تشجيعًا للمستخدم يدخلها بنفسه.
  const extractReading = async (dataUrl: string, type: string, isEdit: boolean) => {
    (isEdit ? setEditExtracting : setExtracting)(true);
    (isEdit ? setEditExtractMsg : setExtractMsg)("");
    (isEdit ? setEditExtractFailed : setExtractFailed)(false);
    try {
      const res = await fetch("/api/reminders/utility-meters/extract-reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl, meter_type: type }),
      });
      const data = await res.json();
      if (!res.ok || data.reading_value == null) {
        (isEdit ? setEditExtractMsg : setExtractMsg)("❌ فشل القراءة تلقائيًا — من فضلك ادخل الرقم يدويًا تحت.");
        (isEdit ? setEditExtractFailed : setExtractFailed)(true);
        return;
      }
      if (isEdit) setEditForm((f: any) => ({ ...f, reading_value: String(data.reading_value) }));
      else setReadingValue(String(data.reading_value));
      (isEdit ? setEditExtractMsg : setExtractMsg)(`اتقرأت القراءة: ${data.reading_value} — راجعها قبل الحفظ ✅`);
    } catch {
      (isEdit ? setEditExtractMsg : setExtractMsg)("❌ فشل القراءة (تعذر الاتصال بخوادم IDEA) — من فضلك ادخل الرقم يدويًا تحت.");
      (isEdit ? setEditExtractFailed : setExtractFailed)(true);
    } finally {
      (isEdit ? setEditExtracting : setExtracting)(false);
    }
  };

  const submit = async () => {
    if (!(Number(readingValue) >= 0)) return;
    setSaving(true);
    try {
      await fetch("/api/reminders/utility-meters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meter_type: meterType, reading_value: Number(readingValue), reading_date: readingDate, photo: photo || null }),
      });
      setReadingValue("");
      setPhoto("");
      load();
    } finally {
      setSaving(false);
    }
  };
  const del = async (id: string) => {
    await fetch(`/api/reminders/utility-meters/${id}`, { method: "DELETE" });
    load();
  };

  const startEdit = (r: any) => {
    setEditingId(r.id);
    setEditForm({ meter_type: r.meter_type, reading_value: String(r.reading_value), reading_date: r.reading_date, photo: r.photo || "" });
  };
  const saveEdit = async (id: string) => {
    if (!(Number(editForm.reading_value) >= 0)) return;
    setEditSaving(true);
    try {
      await fetch(`/api/reminders/utility-meters/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meter_type: editForm.meter_type, reading_value: Number(editForm.reading_value), reading_date: editForm.reading_date, photo: editForm.photo || null }),
      });
      setEditingId(null);
      load();
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <p className="text-sm font-medium">تسجيل قراءة جديدة</p>
        <div className="grid grid-cols-3 gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-1 text-xs">
          {Object.entries(METER_LABELS).map(([key, label]) => (
            <button key={key} onClick={() => setMeterType(key)} className={`py-1.5 rounded-md ${meterType === key ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>
              {METER_EMOJI[key]} {label}
            </button>
          ))}
        </div>
        <input type="number" placeholder={extractFailed ? "فشل القراءة — ادخلها يدويًا" : "قيمة القراءة"} value={readingValue} onChange={(e) => { setReadingValue(e.target.value); if (extractFailed) setExtractFailed(false); }} className={`${inputCls} ${extractFailed ? "border-red-400 dark:border-red-600" : ""}`} />
        <input type="date" value={readingDate} onChange={(e) => setReadingDate(e.target.value)} className={inputCls} />
        <div className="space-y-1">
          <p className="text-xs text-neutral-400">صورة العداد (اختياري) — بنقرا القراءة منها تلقائيًا بالذكاء الاصطناعي</p>
          <PhotoCaptureRow onPick={(dataUrl) => { setPhoto(dataUrl); extractReading(dataUrl, meterType, false); }} />
        </div>
        {photo && <img src={photo} alt="العداد" className="rounded-lg max-h-32 mx-auto" />}
        {extracting && <p className="text-xs text-orange-500 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> {AI_LOADING_TEXT}</p>}
        {extractMsg && !extracting && <p className={`text-xs ${extractFailed ? "text-red-500" : "text-orange-500"}`}>{extractMsg}</p>}
        <button onClick={submit} disabled={saving} className={btnPrimary}>
          {saving ? <Loader2 size={14} className="animate-spin inline" /> : "تسجيل القراءة"}
        </button>
      </Card>

      {insights.length > 0 && (
        <Card className="space-y-1">
          <p className="text-sm font-medium">مقارنة الاستهلاك</p>
          {insights.map((i) => (
            <p key={i.meter_type} className="text-xs">
              {METER_EMOJI[i.meter_type]} {i.label}:{" "}
              {i.comparable ? (i.diff_pct === null ? "مش كفاية بيانات للمقارنة" : `${i.diff_pct > 0 ? "أعلى" : "أقل"} بـ ${Math.abs(i.diff_pct)}% عن الفترة اللي قبلها`) : "محتاج قراءتين على الأقل للمقارنة"}
            </p>
          ))}
        </Card>
      )}

      {/* Round 34 — "الغاز تحتيه قرائات الغاز و الكهرباء تحتها قرائات
          الكهرباء": كانت القائمة كلها flat مخلوطة، دلوقتي مقسّمة لقسم منفصل
          لكل نوع عداد بعنوانه، بنفس ترتيب METER_LABELS. */}
      <div className="space-y-4">
        <p className="text-sm font-medium">آخر القراءات</p>
        {Object.entries(METER_LABELS).map(([typeKey, typeLabel]) => {
          const group = readings.filter((r) => r.meter_type === typeKey);
          if (!group.length) return null;
          return (
            <div key={typeKey} className="space-y-2">
              <p className="text-xs font-medium text-neutral-500">{METER_EMOJI[typeKey]} {typeLabel}</p>
              {group.map((r) =>
                editingId === r.id ? (
                  <Card key={r.id} className="space-y-2">
                    <div className="grid grid-cols-3 gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-1 text-xs">
                      {Object.entries(METER_LABELS).map(([key, label]) => (
                        <button key={key} onClick={() => setEditForm({ ...editForm, meter_type: key })} className={`py-1.5 rounded-md ${editForm.meter_type === key ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>
                          {METER_EMOJI[key]} {label}
                        </button>
                      ))}
                    </div>
                    <input type="number" placeholder={editExtractFailed ? "فشل القراءة — ادخلها يدويًا" : "قيمة القراءة"} value={editForm.reading_value} onChange={(e) => { setEditForm({ ...editForm, reading_value: e.target.value }); if (editExtractFailed) setEditExtractFailed(false); }} className={`${inputCls} ${editExtractFailed ? "border-red-400 dark:border-red-600" : ""}`} />
                    <input type="date" value={editForm.reading_date} onChange={(e) => setEditForm({ ...editForm, reading_date: e.target.value })} className={inputCls} />
                    <PhotoCaptureRow onPick={(dataUrl) => { setEditForm({ ...editForm, photo: dataUrl }); extractReading(dataUrl, editForm.meter_type, true); }} />
                    {editForm.photo && <img src={editForm.photo} alt="العداد" className="rounded-lg max-h-32 mx-auto" />}
                    {editExtracting && <p className="text-xs text-orange-500 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> {AI_LOADING_TEXT}</p>}
                    {editExtractMsg && !editExtracting && <p className={`text-xs ${editExtractFailed ? "text-red-500" : "text-orange-500"}`}>{editExtractMsg}</p>}
                    <div className="flex items-center gap-2">
                      <button onClick={() => saveEdit(r.id)} disabled={editSaving} className={btnPrimary}>
                        {editSaving ? <Loader2 size={14} className="animate-spin inline" /> : "حفظ"}
                      </button>
                      <button onClick={() => setEditingId(null)} className={btnGhost}>إلغاء</button>
                    </div>
                  </Card>
                ) : (
                  <Card key={r.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{METER_EMOJI[r.meter_type]} {r.reading_value.toLocaleString()}</p>
                      <p className="text-xs text-neutral-400">{r.reading_date}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => startEdit(r)} className="text-neutral-400 hover:text-orange-600 p-1"><Pencil size={14} /></button>
                      <button onClick={() => del(r.id)} className="text-red-500 p-1"><Trash2 size={14} /></button>
                    </div>
                  </Card>
                )
              )}
            </div>
          );
        })}
        {!readings.length && <p className="text-sm text-neutral-400 text-center py-4">مفيش قراءات مسجلة</p>}
      </div>
    </div>
  );
}
