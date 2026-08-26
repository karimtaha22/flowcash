// Round 37 — "أريد منك دمج سكريبت سحب الأسعار الحالي داخل تطبيق الويب
// الخاص بنا": المستخدم رفع سكريبت Playwright (multi_source_scraper.py)
// بيسحب أسماء/أسعار منتجات خام من أمازون مصر/نون/طلبات مارت، وطلب:
// "قم بتعديل جدول المنتجات ليشمل ... مع استخراجها تلقائيًا من اسم ووصف
// المنتج (Regex/Parsing)" — اسم الصنف، الماركة، الوزن/الحجم، وحدة القياس،
// المتجر. الدوال هنا هي الـ"Parser" ده بالظبط: بتاخد اسم منتج خام (زي اللي
// بيرجع من السكريبت) وتستخرج منه ماركة + قيمة رقمية + نوع وحدة، مستقلة
// تمامًا عن أي استدعاء شبكة/AI — نفس فلسفة parseQuantityLine في
// reminders/page.tsx (regex محلي بدل الاعتماد على مفتاح Gemini مش دايمًا
// موجود).
//
// بيتستخدم في مكانين: 1) POST /api/reminders/grocery/market-import (استيراد
// دفعة من نتائج السكريبت) و2) extract-receipt (تصنيف كل صنف طلع من فاتورة
// بنفس الطريقة، بدل ما يتسجل بدون وزن/وحدة/ماركة زي قبل الراوند ده).

export function normalizeGroceryName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ");
}

// وحدات القياس المطلوبة بالظبط من المستخدم: "زجاجة، كيس، صندوق، علبة، لتر،
// كيلو، جرام، قطعة". (منفصلة عن GROCERY_UNITS الأوسع بتاعة reminders/page.tsx
// — دي خاصة بتصنيف نص خام مسحوب من متجر، مش بإدخال المستخدم في التطبيق).
export type MarketUnitType = "زجاجة" | "كيس" | "صندوق" | "علبة" | "لتر" | "كيلو" | "جرام" | "قطعة";

export interface ParsedMarketName {
  brand: string | null;
  size_value: number | null;
  unit_type: MarketUnitType | null;
}

// قائمة ماركات معروفة شائعة في السوق المصري — قابلة للتوسيع بسهولة. الفحص
// بيتم على النص المطبَّع (بعد إزالة الهمزات/التاء المربوطة) عشان يمسك
// "المراعي"/"almarai" في نفس الوقت.
const KNOWN_BRANDS: string[] = [
  "المراعي", "almarai", "جهينة", "juhayna", "دومتي", "domty", "بيبسي", "pepsi",
  "كوكاكولا", "coca cola", "كوكا كولا", "نستله", "nestle", "نستلة",
  "سيريلاك", "cerelac", "نسكافيه", "nescafe", "لاكتاليس", "lactalis",
  "بامبرز", "pampers", "مولفيكس", "molfix", "بيبي جوي", "baby joy",
  "أولويز", "always", "برايفت", "private", "كوتكس", "kotex",
  "لوريال", "loreal", "l'oreal", "دوف", "dove", "بالمولايف", "palmolive",
  "فيري", "fairy", "برسيل", "persil", "أريال", "ariel",
  "سني", "sunny", "كريستال", "crystal", "الوطنية", "national",
  "هاينز", "heinz", "امريكانا", "americana", "كابيتانو", "kabo",
  "اندومي", "indomie", "ريجينا", "regina", "فاين", "fine",
  "بيوتي", "beyti", "المصرية للألبان", "danone", "دانون",
  "كنور", "knorr", "ماجي", "maggi", "لبني", "lipton", "ليبتون",
  "كودو", "kodo", "كارفور", "carrefour", "بست تشويس", "best choice",
];

// أنماط الوزن/الحجم/الوحدة — رقم (عربي أو لاتيني) + كلمة وحدة، بأي ترتيب
// شائع في أسماء المنتجات ("حليب 1 لتر"، "أرز 5كيلو"، "بامبرز 60 قطعة").
const ARABIC_DIGITS: Record<string, string> = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" };
const toLatinDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => ARABIC_DIGITS[d] || d);

// كل مجموعة: كلمات الوحدة الخام → {unit_type, لو الوحدة أصلًا بتقاس بالجرام
// (مثلاً "جم"/"جرام") وقيمتها فوق 1000، بنحولها لكيلو (500 جرام تفضل جرام،
// بس 2000 جرام تتحول 2 كيلو) — نفس منطق grams/1000 في grocery_list_entries.
const UNIT_PATTERNS: { words: string[]; unit: MarketUnitType; isGrams?: boolean; isMl?: boolean }[] = [
  { words: ["لتر", "لتره", "liter", "litre", "l\\b"], unit: "لتر" },
  { words: ["مل", "ml"], unit: "لتر", isMl: true },
  { words: ["كجم", "كيلوجرام", "kg", "كيلو"], unit: "كيلو" },
  { words: ["جم", "جرام", "gram", "g\\b"], unit: "جرام", isGrams: true },
  { words: ["زجاجة", "زجاجه", "bottle"], unit: "زجاجة" },
  { words: ["كيس", "bag", "sachet"], unit: "كيس" },
  { words: ["صندوق", "كرتونة", "كرتونه", "box", "carton"], unit: "صندوق" },
  { words: ["علبة", "علبه", "pack", "pcs", "قطعة", "قطعه", "piece"], unit: "علبة" },
];

function extractSize(normalized: string): { size_value: number | null; unit_type: MarketUnitType | null } {
  const text = toLatinDigits(normalized);
  for (const group of UNIT_PATTERNS) {
    for (const w of group.words) {
      // رقم قبل الوحدة ("1 لتر"، "500جم") أو بعدها ("لتر 1" — أندر بس ممكن)
      const before = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:${w})`, "i");
      const m1 = text.match(before);
      if (m1) {
        let value = parseFloat(m1[1].replace(",", "."));
        if (group.isGrams) {
          if (value >= 1000) { value = value / 1000; return { size_value: value, unit_type: "كيلو" }; }
          return { size_value: value, unit_type: "جرام" };
        }
        if (group.isMl) {
          if (value >= 1000) { value = value / 1000; return { size_value: value, unit_type: "لتر" }; }
          return { size_value: value, unit_type: "جرام" }; // مل صغيرة (زي عبوة عطر/زيت) — نفضّل نعرضها كرقم خام بدل ما نخترع وحدة "مل" مش موجودة في القائمة المطلوبة
        }
        return { size_value: value, unit_type: group.unit };
      }
    }
  }
  return { size_value: null, unit_type: null };
}

function extractBrand(normalized: string): string | null {
  for (const b of KNOWN_BRANDS) {
    const nb = normalizeGroceryName(b);
    if (normalized.includes(nb)) {
      // رجّع الشكل الأصلي (مش المطبّع) لو عربي، وإلا الاسم زي ما هو مكتوب في القائمة
      return b;
    }
  }
  return null;
}

export function parseMarketProductName(rawName: string): ParsedMarketName {
  const normalized = normalizeGroceryName(rawName);
  const { size_value, unit_type } = extractSize(normalized);
  const brand = extractBrand(normalized);
  return { brand, size_value, unit_type };
}

// اسم المتجر النظيف من تسمية المصدر اللي بيرجعها السكريبت — زي "Amazon -
// سوبر_ماركت" أو "Talabat - بيض وألبان" أو "Noon - منظفات" — بناخد الجزء
// قبل " - " بس (اسم المتجر الفعلي، القسم مش محتاجينه في الكتالوج).
export function cleanStoreName(source: string): string {
  const idx = source.indexOf(" - ");
  return (idx >= 0 ? source.slice(0, idx) : source).trim() || source.trim();
}

// كلمات بحث للإكمال التلقائي — الاسم + الماركة + الاسم بدون الماركة، عشان
// "يكتب زيت تطلع ليه كل الزيت" (بحث بجزء من الاسم) و"يكتب المراعي" (بحث
// بالماركة) الاتنين يشتغلوا.
export function buildSearchKeywords(itemName: string, brand: string | null): string {
  const parts = [itemName];
  if (brand) parts.push(brand);
  return parts.join(" ").trim();
}
