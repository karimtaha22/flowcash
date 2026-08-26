import { NextRequest, NextResponse } from "next/server";
import { upsertMarketProduct } from "@/lib/marketCatalog";

// Round 37 — "تعديلات سكريبت البايثون لحفظ البيانات في قاعدة البيانات
// مباشرة بدلاً من ملف JSON فقط": نقطة الدخول اللي سكريبت السحب (أو أي
// GitHub Action مجدول أسبوعيًا يشغّله — راجع .github/workflows/) بيبعت ليها
// نتائج السحب كدفعة واحدة (نفس شكل all_products في السكريبت: name/price/
// source/image/url/old_price)، فتتحفظ (upsert — تحديث لو موجودة، إدراج لو
// جديدة) في جدول market_catalog العام. مش endpoint مرتبط بجلسة مستخدم (مفيش
// "مستخدم مسجل دخول" وقت تشغيل GitHub Action) — محمي بمفتاح سري بدل كده،
// بنفس أسلوب CRON_SECRET المستخدم في مسارات /api/cron/* (Authorization:
// Bearer)، بس بمفتاح منفصل (MARKET_IMPORT_SECRET) عشان العزل — الاندبوينت
// ده بيستقبل كمية بيانات من مصدر خارجي، مختلف عن مسارات الكرون اللي بترد
// بس على "استاذنك" من غير أي جسم طلب.
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.MARKET_IMPORT_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const products: any[] = Array.isArray(body?.products) ? body.products : [];
  if (!products.length) return NextResponse.json({ error: "products فاضية" }, { status: 400 });

  // Vercel Hobby عنده حد أقصى لمدة تنفيذ الـ serverless function — عشان
  // نتجنب timeout على دفعات كبيرة، بنعالج بالتوازي على batches صغيرة بدل
  // await واحد ورا التاني. السكريبت المعدّل (multi_source_scraper.py) بيبعت
  // بالفعل على دفعات من ~200 صنف لكل نداء بدل ملف واحد ضخم لنفس السبب.
  const CONCURRENCY = 20;
  let inserted = 0, updated = 0, skipped = 0;
  const items = products.slice(0, 2000);
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    const batch = items.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((p) =>
        upsertMarketProduct({
          name: String(p.name || ""),
          price: Number(p.price),
          source: String(p.source || ""),
          image: p.image ?? null,
          url: p.url ?? null,
          old_price: p.old_price ?? null,
        }).catch(() => "skipped" as const)
      )
    );
    for (const r of results) {
      if (r === "inserted") inserted++;
      else if (r === "updated") updated++;
      else skipped++;
    }
  }

  return NextResponse.json({ ok: true, inserted, updated, skipped, total: products.length });
}
