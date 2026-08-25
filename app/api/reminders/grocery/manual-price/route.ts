import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { saveManualOption } from "@/lib/groceryPricing";

// "سجّل السعر يدويًا" — used when the AI lookup came back empty, or the user
// already knows the price and doesn't want to wait for a search call. Also
// the only path that works at all when no GEMINI_API_KEY is configured yet.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const itemName = String(body.item_name || "").trim();
  const price = Number(body.price);
  if (!itemName || !(price > 0)) return NextResponse.json({ error: "اسم الصنف والسعر مطلوبين" }, { status: 400 });

  const saved = await saveManualOption(userId, itemName, {
    brand: body.brand || null,
    store_name: body.store_name || null,
    price,
    currency: body.currency || "EGP",
  });
  return NextResponse.json({ item_id: saved.item_id, item_name: itemName, options: saved.options });
}
