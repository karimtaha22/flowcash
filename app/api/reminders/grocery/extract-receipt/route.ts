import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { extractReceiptItems } from "@/lib/gemini";
import { saveAiOptionsToCatalog } from "@/lib/groceryPricing";

// Round 33 — "ارفع إيصال السوبر ماركت لتحديث الأسعار ومساعدتك في الشراء
// المرات القادمة". بيقرأ الإيصال بالذكاء الاصطناعي، وكل صنف طلع بيه اسم
// وسعر واضحين بيتسجل في كتالوج المستخدم (grocery_items/grocery_item_options،
// source: "ai") — بالظبط نفس آلية saveAiOptionsToCatalog اللي بيسعير الأصناف
// الجديدة بيها، فالمرة الجاية اللي المستخدم يكتب نفس الصنف في قائمة، السعر
// ده هيبقى جاهز فورًا من غير أي نداء تاني للذكاء الاصطناعي.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const image = String(body.image || "");
  if (!image) return NextResponse.json({ error: "صورة الإيصال مطلوبة" }, { status: 400 });

  const result = await extractReceiptItems(image);
  if (!result.ok) return NextResponse.json({ error: result.error || "تعذر قراءة الإيصال" }, { status: 502 });

  const saved: { name: string; price: number }[] = [];
  for (const item of result.items) {
    try {
      await saveAiOptionsToCatalog(userId, item.name, [
        { brand: null, store_name: result.store_name || "من الإيصال", price: item.price, currency: "EGP" },
      ]);
      saved.push(item);
    } catch {
      // best-effort per item — لو صنف واحد فشل حفظه، الباقي يكمل عادي
    }
  }

  return NextResponse.json({ ok: true, store_name: result.store_name, saved });
}
