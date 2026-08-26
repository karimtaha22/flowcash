import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { saveMarketOption } from "@/lib/groceryPricing";

// Round 37 — "عند اختيار المنتج، يتم ملء الحقول تلقائيًا: (اسم الصنف،
// الماركة، الوزن، وحدة القياس، المتجر، والسعر)": المستخدم اختار اقتراح من
// قائمة الإكمال التلقائي (كتالوج السوق العام) — بننسخ الصف ده لكتالوجه
// الشخصي (grocery_items/grocery_item_options، source: "market") عشان يبقى
// متاح ليه زي أي سعر سجّله بنفسه (تصدير، وضع التسوق، إلخ)، بدل ما يفضل
// مربوط بالكتالوج العام بس.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const marketId = String(body.market_id || "");
  if (!marketId) return NextResponse.json({ error: "market_id مطلوب" }, { status: 400 });

  const { data: row, error } = await supabaseAdmin.from("market_catalog").select("*").eq("id", marketId).maybeSingle();
  if (error || !row) return NextResponse.json({ error: "الصنف ده مش موجود في كتالوج السوق" }, { status: 404 });

  const saved = await saveMarketOption(userId, row.item_name, {
    brand: row.brand,
    store_name: row.store_name,
    price: row.price,
    currency: row.currency,
    size_value: row.size_value,
    unit_type: row.unit_type,
  });

  return NextResponse.json({
    item_id: saved.item_id,
    item_name: row.item_name,
    options: saved.options,
    size_value: row.size_value,
    unit_type: row.unit_type,
  });
}
