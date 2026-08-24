import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// PUBLIC route — no session required. This is the read side of a debt's
// live link: anyone holding a valid, non-revoked token (debtor,
// creditor_view, or one specific witness) can view the debt's current
// state. No mutating debt/schedule action lives here — only the witness
// acknowledge and debtor objection sub-routes can change anything, and even
// those never touch amounts/dates (see lib/debtLinks.ts's top comment).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: link } = await supabaseAdmin
    .from("debt_links")
    .select("*, debt_witnesses(id,name,slot_index)")
    .eq("token", token)
    .single();
  if (!link || link.revoked_at) return NextResponse.json({ error: "الرابط غير صالح أو تم إلغاؤه" }, { status: 404 });

  const { data: debt } = await supabaseAdmin
    .from("debts")
    .select("*, people(name), app_users(name)")
    .eq("id", link.debt_id)
    .single();
  if (!debt) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (!link.viewed_at) {
    await supabaseAdmin.from("debt_links").update({ viewed_at: new Date().toISOString() }).eq("id", link.id);
  }

  const [{ data: allWitnessLinks }, { data: events }] = await Promise.all([
    supabaseAdmin.from("debt_links").select("witness_id,acknowledged_at").eq("debt_id", debt.id).eq("role", "witness"),
    supabaseAdmin.from("debt_events").select("event_type,description,created_at").eq("debt_id", debt.id).order("created_at", { ascending: true }),
  ]);
  const { data: witnesses } = await supabaseAdmin.from("debt_witnesses").select("id,name,slot_index").eq("debt_id", debt.id).order("slot_index");

  const ackByWitness = new Map((allWitnessLinks || []).map((l: any) => [l.witness_id, !!l.acknowledged_at]));

  const creditorName = debt.direction === "owed_to_me" ? debt.app_users?.name || "الدائن" : debt.people?.name || "الدائن";
  const debtorName = debt.direction === "owed_to_me" ? debt.people?.name || "المدين" : debt.app_users?.name || "المدين";

  return NextResponse.json({
    role: link.role,
    witnessId: link.witness_id,
    acknowledgedAt: link.acknowledged_at,
    debt: {
      title: debt.title,
      reason: debt.reason,
      original_amount: debt.original_amount,
      remaining_amount: debt.remaining_amount,
      currency: debt.currency,
      value_type: debt.value_type,
      metal_karat: debt.metal_karat,
      status: debt.status,
      debt_date: debt.debt_date,
      due_date: debt.due_date,
      objection_reason: debt.objection_reason,
      objection_created_at: debt.objection_created_at,
      objection_resolved_at: debt.objection_resolved_at,
    },
    creditorName,
    debtorName,
    witnesses: (witnesses || []).map((w: any) => ({ name: w.name, slot_index: w.slot_index, acknowledged: !!ackByWitness.get(w.id) })),
    events: events || [],
  });
}
