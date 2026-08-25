import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { fetchAiPrice, saveAiOptionsToCatalog } from "@/lib/groceryPricing";

// For a brand-new item with no local catalog match — calls Gemini with live
// Google Search grounding (see lib/groceryPricing.ts's fetchAiPrice for the
// full anti-hallucination prompt + grounding-tool details), then saves
// whatever real prices came back to the catalog so future lookups for the
// same item are instant local matches instead of another AI call.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const itemName = String(body.item_name || "").trim();
  if (!itemName) return NextResponse.json({ error: "اسم الصنف مطلوب" }, { status: 400 });

  const result = await fetchAiPrice(itemName);
  if (!result.ok) return NextResponse.json({ error: result.error || "تعذر البحث عن السعر" }, { status: 502 });
  if (!result.options.length) {
    return NextResponse.json({
      item_name: itemName,
      options: [],
      message: "معرفناش نلاقي سعر حقيقي معلن للصنف ده من المتاجر المعتمدة (كارفور، أمازون مصر، سبينيس، اللولو). تقدر تسجّل السعر يدويًا.",
    });
  }

  const saved = await saveAiOptionsToCatalog(userId, itemName, result.options);
  return NextResponse.json({ item_id: saved.item_id, item_name: itemName, options: saved.options });
}
