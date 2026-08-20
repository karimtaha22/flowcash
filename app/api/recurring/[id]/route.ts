import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";
import { confirmRecurringItem } from "@/lib/recurringConfirm";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const allowed = ["name", "amount", "currency", "account_id", "category_id", "day_of_month", "is_active", "frequency", "day_of_week"];
  const update: Record<string, any> = {};
  for (const k of allowed) if (k in body) update[k] = body[k];
  const { data, error } = await supabaseAdmin
    .from("recurring_items")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { error } = await supabaseAdmin.from("recurring_items").delete().eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// "دفعت" / "نزل" — mark the current period confirmed. By default this
// deducts/credits the linked account (deduct !== false), optionally against
// a DIFFERENT account than the item's own (account_id in the body). Passing
// deduct:false records the confirmation WITHOUT touching any balance — for
// when the user says it happened but doesn't want it counted as tracked
// spending (they'll see a warning in the UI either way).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const deduct = body.deduct !== false;
  try {
    const { transaction, item } = await confirmRecurringItem(userId, id, { deduct, account_id: body.account_id || null, source: "app" });
    return NextResponse.json({ ok: true, transaction, deducted: deduct, item });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
