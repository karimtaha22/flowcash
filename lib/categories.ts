export const DEFAULT_CATEGORIES: { name: string; icon: string; kind: "expense" | "income"; keywords: string[] }[] = [
  { name: "مواصلات", icon: "🚗", kind: "expense", keywords: ["اوبر", "أوبر", "uber", "كريم", "careem", "تاكسي", "بنزين", "مواصلات", "أجرة", "اجرة"] },
  { name: "أكل وشرب", icon: "🍔", kind: "expense", keywords: ["مطعم", "أكل", "اكل", "طلبات", "talabat", "قهوة", "كافيه", "cafe", "فطار", "غداء", "عشاء"] },
  { name: "تسوق", icon: "🛍️", kind: "expense", keywords: ["تسوق", "ملابس", "امازون", "أمازون", "نون", "noon", "جوميا", "jumia"] },
  { name: "فواتير", icon: "🧾", kind: "expense", keywords: ["فاتورة", "كهرباء", "مياه", "غاز", "انترنت", "إنترنت", "موبايل", "تليفون"] },
  { name: "صحة", icon: "💊", kind: "expense", keywords: ["دكتور", "دواء", "صيدلية", "علاج", "مستشفى", "تحليل"] },
  { name: "تعليم", icon: "📚", kind: "expense", keywords: ["مدرسة", "كتب", "كورس", "جامعة", "دروس"] },
  { name: "ترفيه", icon: "🎬", kind: "expense", keywords: ["سينما", "نتفليكس", "netflix", "رحلة", "ترفيه", "لعبة"] },
  { name: "إيجار وسكن", icon: "🏠", kind: "expense", keywords: ["إيجار", "ايجار", "صيانة", "أثاث", "اثاث"] },
  { name: "أخرى", icon: "📦", kind: "expense", keywords: [] },
  { name: "مرتب", icon: "💼", kind: "income", keywords: ["مرتب", "راتب", "salary"] },
  { name: "فريلانس", icon: "💻", kind: "income", keywords: ["فريلانس", "مشروع", "freelance"] },
  { name: "هدية", icon: "🎁", kind: "income", keywords: ["هدية", "هبة"] },
  { name: "دخل آخر", icon: "➕", kind: "income", keywords: [] },
];

export function classifyExpense(description: string, categories: { id: string; name: string; keywords: string[]; kind: string }[]): string | null {
  const text = description.toLowerCase();
  for (const cat of categories) {
    if (cat.kind !== "expense") continue;
    for (const kw of cat.keywords || []) {
      if (kw && text.includes(kw.toLowerCase())) return cat.id;
    }
  }
  return null;
}
