import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";
import { logDebtEvent } from "@/lib/debtLinks";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  // "تم حل الاعتراض" — creditor-only (this whole route is already scoped to
  // .eq("user_id", userId) below), the debtor's public link can never clear
  // its own objection (see POST /api/debt-link/[token]/object).
  if (body.resolve_objection) {
    const { data: existing } = await supabaseAdmin.from("debts").select("id,objection_created_at,objection_resolved_at").eq("id", id).eq("user_id", userId).single();
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (!existing.objection_created_at || existing.objection_resolved_at) {
      return NextResponse.json({ error: "مفيش اعتراض قائم لحله" }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin.from("debts").update({ objection_resolved_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logDebtEvent(id, "objection_resolved", "تم حل الاعتراض", "creditor");
    return NextResponse.json({ debt: data });
  }

  const { data: before } = await supabaseAdmin.from("debts").select("due_date,is_advanced").eq("id", id).eq("user_id", userId).single();

  const allowed = ["title", "reason", "currency", "due_date", "debt_date", "status", "person_id", "original_amount", "remaining_amount"];
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

  // audit-log a term extension on the public live link — only meaningful
  // for advanced debts (simple debts have no link/log for anyone to see).
  if (before?.is_advanced && "due_date" in update && update.due_date && update.due_date !== before.due_date) {
    await logDebtEvent(id, "due_date_extended", `تم تمديد أجل الدين${before.due_date ? ` من ${before.due_date}` : ""} إلى ${update.due_date}`, "creditor");
  }

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
