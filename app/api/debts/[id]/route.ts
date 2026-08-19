import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const allowed = ["title", "reason", "currency", "due_date", "status", "person_id", "original_amount", "remaining_amount"];
  const update: Record<string, any> = {};
  for (const k of allowed) if (k in body) update[k] = body[k];
  if ("original_amount" in update) update.original_amount = Number(update.original_amount) || 0;
  if ("remaining_amount" in update) update.remaining_amount = Number(update.remaining_amount) || 0;
  update.updated_at = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("debts")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ debt: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data: debt } = await supabaseAdmin.from("debts").select("id").eq("id", id).eq("user_id", userId).single();
  if (!debt) return NextResponse.json({ error: "not found" }, { status: 404 });
  await supabaseAdmin.from("debt_payments").delete().eq("debt_id", id);
  await supabaseAdmin.from("transactions").update({ debt_id: null }).eq("debt_id", id);
  const { error } = await supabaseAdmin.from("debts").delete().eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
