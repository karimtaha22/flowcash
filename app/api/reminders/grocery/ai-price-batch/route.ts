import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { fetchAiPriceBatch, saveAiOptionsToCatalog } from "@/lib/groceryPricing";

// Round 30 — batched sibling of /api/reminders/grocery/ai-price: looks up a
// small group of items (the GroceryTab UI groups up to 3 rows together, see
// the row-level auto-lookup queue there) in ONE Gemini call instead of one
// call per row, to conserve API quota after the user hit a real quota-exceeded
// error and directly asked whether batching would help.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const itemNames: string[] = Array.isArray(body.item_names) ? body.item_names.map((n: any) => String(n || "").trim()).filter(Boolean) : [];
  if (!itemNames.length) return NextResponse.json({ error: "لازم صنف واحد على الأقل" }, { status: 400 });

  const result = await fetchAiPriceBatch(itemNames);
  if (!result.ok) return NextResponse.json({ error: result.error || "تعذر البحث عن الأسعار" }, { status: 502 });

  const results: Record<string, { item_id: string | null; options: any[]; message?: string }> = {};
  for (const item of result.items) {
    if (!item.options.length) {
      results[item.item_name] = {
        item_id: null,
        options: [],
        message: "معرفناش نلاقي سعر حقيقي معلن للصنف ده من المتاجر المعتمدة (كارفور، أمازون مصر، سبينيس، اللولو). تقدر تسجّل السعر يدويًا.",
      };
      continue;
    }
    const saved = await saveAiOptionsToCatalog(userId, item.item_name, item.options);
    results[item.item_name] = { item_id: saved.item_id, options: saved.options };
  }

  return NextResponse.json({ results });
}
