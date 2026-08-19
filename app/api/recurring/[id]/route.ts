import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";
import { createTransaction } from "@/lib/transactions";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const allowed = ["name", "amount", "currency", "account_id", "category_id", "day_of_month", "is_active"];
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

// mark this month as paid: creates the transaction and stamps last_confirmed_month
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data: item } = await supabaseAdmin.from("recurring_items").select("*").eq("id", id).eq("user_id", userId).single();
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
  try {
    const tx = await createTransaction({
      user_id: userId,
      type: item.kind === "income" ? "income" : "expense",
      account_id: item.account_id,
      amount: item.amount,
      currency: item.currency,
      category_id: item.category_id,
      description: item.name,
      source: "app",
    });
    await supabaseAdmin.from("recurring_items").update({ last_confirmed_month: monthKey }).eq("id", id);
    return NextResponse.json({ ok: true, transaction: tx });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
