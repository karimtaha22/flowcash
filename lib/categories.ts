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

// Master pool offered in the Settings ← التصنيفات picker (إضافة/إزالة).
// Seeded per-user as inactive rows the first time they open the manager;
// picking one moves it into their active set (what shows up app-wide).
export const MASTER_CATALOG: { name: string; icon: string; kind: "expense" | "income" }[] = [
  // income
  { name: "المرتب الأساسي", icon: "💼", kind: "income" },
  { name: "حوافز / مكافآت", icon: "🎯", kind: "income" },
  { name: "بيع ذهب / دولار / عملات", icon: "💱", kind: "income" },
  { name: "بدل / انتقالات", icon: "🚌", kind: "income" },
  { name: "شغل اضافي / Part Time", icon: "🧑‍💻", kind: "income" },
  { name: "فوائد شهادات بنكية", icon: "🏦", kind: "income" },
  { name: "فوائد حساب توفير", icon: "💰", kind: "income" },
  { name: "أرباح أسهم / بورصة", icon: "📈", kind: "income" },
  { name: "تحصيل إيجارات شقق / محلات", icon: "🏘️", kind: "income" },
  // expense
  { name: "إيجار شقة", icon: "🏠", kind: "expense" },
  { name: "فاتورة كهرباء", icon: "💡", kind: "expense" },
  { name: "فاتورة مياه", icon: "🚰", kind: "expense" },
  { name: "فاتورة غاز", icon: "🔥", kind: "expense" },
  { name: "فاتورة تليفون أرضي", icon: "☎️", kind: "expense" },
  { name: "فاتورة إنترنت منزلي", icon: "🌐", kind: "expense" },
  { name: "فاتورة موبايل / باقة", icon: "📱", kind: "expense" },
  { name: "غاز أنبوبة", icon: "🛢️", kind: "expense" },
  { name: "صيانة منزلية / سباك / كهربائي", icon: "🔧", kind: "expense" },
  { name: "سوبر ماركت / خضار / عيش", icon: "🛒", kind: "expense" },
  { name: "مواصلات / بنزين / أوبر / مترو", icon: "🚗", kind: "expense" },
  { name: "تسوق ملابس", icon: "👕", kind: "expense" },
  { name: "تسوق أجهزة / منزل", icon: "🖥️", kind: "expense" },
  { name: "أقساط (عربية، شقة، فيزا)", icon: "💳", kind: "expense" },
  { name: "قروض", icon: "🏦", kind: "expense" },
  { name: "جمعية", icon: "🤝", kind: "expense" },
  { name: "مدارس / جامعة", icon: "🎓", kind: "expense" },
  { name: "دروس خصوصية", icon: "📖", kind: "expense" },
  { name: "مصاريف مدرسة / مصاريف جامعة", icon: "🏫", kind: "expense" },
  { name: "كشف دكتور", icon: "🩺", kind: "expense" },
  { name: "أدوية", icon: "💊", kind: "expense" },
  { name: "تحاليل / أشعة", icon: "🧪", kind: "expense" },
  { name: "جيم / اشتراك نادي", icon: "🏋️", kind: "expense" },
  { name: "عناية شخصية", icon: "💅", kind: "expense" },
  { name: "صيانة عربية / قطع غيار", icon: "🔩", kind: "expense" },
  { name: "مخالفات مرور", icon: "🚓", kind: "expense" },
  { name: "ترخيص / تأمين عربية", icon: "📄", kind: "expense" },
  { name: "غسيل عربية", icon: "🚿", kind: "expense" },
  { name: "Netflix / Shahid / WatchIt", icon: "🎬", kind: "expense" },
  { name: "Spotify / Anghami", icon: "🎵", kind: "expense" },
  { name: "YouTube Premium", icon: "▶️", kind: "expense" },
  { name: "iCloud / Google One", icon: "☁️", kind: "expense" },
  { name: "اشتراكات برامج (Adobe, Canva, ChatGPT)", icon: "🖌️", kind: "expense" },
  { name: "باقات ألعاب (PlayStation Plus)", icon: "🎮", kind: "expense" },
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
