import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

function addMonths(dateIso: string, n: number) {
  const d = new Date(dateIso + "T00:00:00");
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate()).toISOString().slice(0, 10);
}

// Add one more participant to an already-running organizing gam3eya —
// e.g. someone dropped out and got replaced. Appends them at the END of the
// payout order (existing turns are never silently reshuffled — use the
// swap endpoint for that) and extends months_count/participants_count by one,
// generating that participant's own full row of monthly payments plus one
// new trailing month for everyone else already in the circle.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const { name, phone, account_number, address, id_photo_front } = body;
  if (!name) return NextResponse.json({ error: "اسم الفرد لازم يتملى" }, { status: 400 });

  const { data: g } = await supabaseAdmin.from("gam3eyas").select("*").eq("id", id).eq("user_id", userId).eq("type", "organizing").single();
  if (!g) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: existing } = await supabaseAdmin.from("gam3eya_participants").select("id,payout_order").eq("gam3eya_id", id);
  const nextOrder = (existing || []).reduce((max, p) => Math.max(max, p.payout_order), 0) + 1;
  const newMonthsCount = g.months_count + 1;

  const { data: participant, error } = await supabaseAdmin
    .from("gam3eya_participants")
    .insert({ gam3eya_id: id, name, phone: phone || null, account_number: account_number || null, address: address || null, id_photo_front: id_photo_front || null, payout_order: nextOrder })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // this new participant owes a payment for every month up to (and
  // including) the new trailing month
  const newParticipantRows = Array.from({ length: newMonthsCount }, (_, i) => ({
    gam3eya_id: id,
    participant_id: participant.id,
    month_index: i + 1,
    due_date: addMonths(g.start_date, i),
    amount: g.monthly_amount,
    status: "pending",
  }));
  // every existing participant also now owes one more month (the new trailing one)
  const trailingRows = (existing || []).map((p) => ({
    gam3eya_id: id,
    participant_id: p.id,
    month_index: newMonthsCount,
    due_date: addMonths(g.start_date, newMonthsCount - 1),
    amount: g.monthly_amount,
    status: "pending",
  }));

  const { error: payErr } = await supabaseAdmin.from("gam3eya_payments").insert([...newParticipantRows, ...trailingRows]);
  if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 });

  await supabaseAdmin
    .from("gam3eyas")
    .update({ participants_count: newMonthsCount, months_count: newMonthsCount, updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ ok: true, participant });
}
