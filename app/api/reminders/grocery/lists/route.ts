import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await supabaseAdmin
    .from("grocery_lists")
    .select("*, grocery_list_entries(*, grocery_items(name), grocery_item_options(brand,store_name,price,currency))")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lists: data });
}

// "حفظ القائمة" — saves the finished quick-list (with each line's chosen
// item/option/quantity) as one grocery_lists row + its entries, and computes
// the total budget server-side from the selected options at save time.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const entries: { raw_text: string; item_id?: string | null; selected_option_id?: string | null; quantity?: number; unit?: string | null; note?: string }[] = body.entries || [];
  if (!entries.length) return NextResponse.json({ error: "القائمة فاضية" }, { status: 400 });

  const { data: list, error: listErr } = await supabaseAdmin
    .from("grocery_lists")
    .insert({ user_id: userId, name: body.name || null, status: "saved", source: body.source === "telegram" ? "telegram" : "app" })
    .select()
    .single();
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

  const rows = entries.map((e) => ({
    list_id: list.id,
    raw_text: e.raw_text,
    item_id: e.item_id || null,
    selected_option_id: e.selected_option_id || null,
    quantity: e.quantity && e.quantity > 0 ? e.quantity : 1,
    unit: e.unit || null,
    note: e.note || null,
  }));
  const { data: insertedEntries, error: entriesErr } = await supabaseAdmin.from("grocery_list_entries").insert(rows).select();
  if (entriesErr) {
    await supabaseAdmin.from("grocery_lists").delete().eq("id", list.id);
    return NextResponse.json({ error: entriesErr.message }, { status: 500 });
  }

  return NextResponse.json({ list, entries: insertedEntries });
}
