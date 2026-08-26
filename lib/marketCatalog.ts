// Round 37 — DB access layer للكتالوج العام (market_catalog، migration
// round37_market_catalog) اللي بيغذّيه سكريبت السحب (multi_source_scraper.py
// المعدَّل) والإكمال التلقائي في الواجهة بيقرأ منه. منفصل عن
// lib/groceryPricing.ts (كتالوج كل مستخدم الشخصي) — الملف ده بيدير الجدول
// المشترك اللي مالوش user_id.
import { supabaseAdmin } from "./supabaseAdmin";
import { normalizeGroceryName, parseMarketProductName, cleanStoreName, buildSearchKeywords } from "./marketCatalogParser";

export interface MarketCatalogRow {
  id: string;
  item_name: string;
  name_normalized: string;
  brand: string | null;
  size_value: number | null;
  unit_type: string | null;
  store_name: string;
  price: number;
  currency: string;
  image: string | null;
  source_url: string | null;
  search_keywords: string | null;
  last_updated: string;
}

export interface RawScrapedProduct {
  name: string;
  price: number;
  source: string; // زي "Amazon - سوبر_ماركت" — راجع cleanStoreName
  image?: string | null;
  url?: string | null;
  old_price?: number | null;
}

// "دون تكرار البيانات القديمة (upsert)" — صف واحد لكل (name_normalized,
// store_name) بفضل الـ unique index في migration round37_market_catalog؛
// موجود → تحديث السعر/التاريخ/الصورة، جديد → إدراج.
export async function upsertMarketProduct(p: RawScrapedProduct): Promise<"inserted" | "updated" | "skipped"> {
  const name = String(p.name || "").trim();
  const price = Number(p.price);
  if (!name || !(price > 0)) return "skipped";

  const storeName = cleanStoreName(String(p.source || "").trim() || "غير معروف");
  const name_normalized = normalizeGroceryName(name);
  const { brand, size_value, unit_type } = parseMarketProductName(name);
  const search_keywords = buildSearchKeywords(name, brand);

  const { data: existing } = await supabaseAdmin
    .from("market_catalog")
    .select("id")
    .eq("name_normalized", name_normalized)
    .eq("store_name", storeName)
    .maybeSingle();

  const payload = {
    item_name: name,
    name_normalized,
    brand,
    size_value,
    unit_type,
    store_name: storeName,
    price,
    currency: "EGP",
    image: p.image || null,
    source_url: p.url || null,
    search_keywords,
    last_updated: new Date().toISOString(),
  };

  if (existing?.id) {
    await supabaseAdmin.from("market_catalog").update(payload).eq("id", existing.id);
    return "updated";
  }
  await supabaseAdmin.from("market_catalog").insert(payload);
  return "inserted";
}

// الإكمال التلقائي — "عند كتابة أي صنف ... تظهر قائمة إكمال تلقائي سريعة
// تبحث في الكلمات المفتاحية". بحث احتوائي في الاتجاهين (زي lookupCatalog
// الشخصي بالظبط) على search_keywords وname_normalized، وبيرجّع أرخص سعر
// لكل (اسم، متجر) — الأصناف اللي عندها كذا متجر بترجع كذا صف (كل متجر
// بسعره) عشان المستخدم يقدر يقارن.
export async function searchMarketCatalog(query: string, limit = 8): Promise<MarketCatalogRow[]> {
  const q = normalizeGroceryName(query);
  if (q.length < 2) return [];

  // استعلامين منفصلين بـ.ilike() (مش .or() بنص خام) عشان أي فاصلة/قوس في
  // نص البحث ميكسرش صيغة فلتر PostgREST — بندمج النتائج ونشيل التكرار بعدين.
  const [byName, byKeywords] = await Promise.all([
    supabaseAdmin.from("market_catalog").select("*").ilike("name_normalized", `%${q}%`).order("price", { ascending: true }).limit(limit * 2),
    supabaseAdmin.from("market_catalog").select("*").ilike("search_keywords", `%${q}%`).order("price", { ascending: true }).limit(limit * 2),
  ]);
  const merged = new Map<string, MarketCatalogRow>();
  for (const r of [...(byName.data || []), ...(byKeywords.data || [])] as MarketCatalogRow[]) merged.set(r.id, r);
  const rows = Array.from(merged.values()).sort((a, b) => a.price - b.price);
  // فلترة إضافية للتأكد من تطابق فعلي (containment في أي اتجاه) — الـ ilike
  // فوق ممكن يرجّع تطابقات جزئية واسعة شوية، فبنتأكد كمان هنا.
  const filtered = rows.filter(
    (r) => r.name_normalized.includes(q) || q.includes(r.name_normalized) || (r.search_keywords || "").toLowerCase().includes(q)
  );
  return (filtered.length ? filtered : rows).slice(0, limit);
}
