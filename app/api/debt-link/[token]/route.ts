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

  // Round 25 — when the viewer IS a witness, hand back their own current
  // self-entered fields (name/phone/address/photo may be empty if they
  // haven't filled them in yet) so the public page can pre-fill/edit its
  // own "بياناتك" form instead of starting blank every visit.
  let myWitness: { name: string; phone: string | null; address: string | null; id_photo_front: string | null } | null = null;
  if (link.role === "witness" && link.witness_id) {
    const { data: mw } = await supabaseAdmin.from("debt_witnesses").select("name,phone,address,id_photo_front").eq("id", link.witness_id).single();
    if (mw) myWitness = mw;
  }

  const ackByWitness = new Map((allWitnessLinks || []).map((l: any) => [l.witness_id, !!l.acknowledged_at]));

  // Round 25 — prefer the manually-typed names (creditor_name_override/
  // debtor_name_override, required on every advanced debt as of this round)
  // over the linked person/account record, since that record's name can be
  // in English or an alias. Falls back to the old derived logic for any
  // advanced debt created before this field existed.
  const creditorName = debt.creditor_name_override || (debt.direction === "owed_to_me" ? debt.app_users?.name || "الدائن" : debt.people?.name || "الدائن");
  const debtorName = debt.debtor_name_override || (debt.direction === "owed_to_me" ? debt.people?.name || "المدين" : debt.app_users?.name || "المدين");

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
    myWitness,
    witnesses: (witnesses || []).map((w: any) => ({ name: w.name, slot_index: w.slot_index, acknowledged: !!ackByWitness.get(w.id) })),
    events: events || [],
  });
}
