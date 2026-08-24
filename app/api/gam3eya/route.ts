import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("gam3eyas")
    .select("*, gam3eya_participants(*), gam3eya_payments(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = (data || []).map((g: any) => ({
    ...g,
    gam3eya_participants: (g.gam3eya_participants || []).sort((a: any, b: any) => a.payout_order - b.payout_order),
    gam3eya_payments: (g.gam3eya_payments || []).sort((a: any, b: any) => a.month_index - b.month_index),
  }));
  return NextResponse.json({ gam3eyas: list });
}

function addMonths(dateIso: string, n: number) {
  const d = new Date(dateIso + "T00:00:00");
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate()).toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const { type, name, monthly_amount, currency, start_date } = body;

  if (!type || !["subscribed", "organizing"].includes(type)) {
    return NextResponse.json({ error: "نوع الجمعية غير صحيح" }, { status: 400 });
  }
  const amount = Number(monthly_amount);
  if (!(amount > 0) || !start_date) {
    return NextResponse.json({ error: "المبلغ الشهري وتاريخ البداية لازم يتملوا" }, { status: 400 });
  }

  if (type === "subscribed") {
    const monthsCount = Math.floor(Number(body.months_count));
    const participantsCount = Math.floor(Number(body.participants_count)) || monthsCount;
    const myPayoutMonth = Math.floor(Number(body.my_payout_month));
    if (!(monthsCount > 0) || !(myPayoutMonth >= 1 && myPayoutMonth <= monthsCount)) {
      return NextResponse.json({ error: "عدد الشهور ومعاد القبض لازم يتملوا صح" }, { status: 400 });
    }

    const { data: g, error } = await supabaseAdmin
      .from("gam3eyas")
      .insert({
        user_id: userId,
        type: "subscribed",
        name: name || null,
        monthly_amount: amount,
        currency: currency || "EGP",
        participants_count: participantsCount,
        months_count: monthsCount,
        start_date,
        my_payout_month: myPayoutMonth,
        status: "active",
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = Array.from({ length: monthsCount }, (_, i) => ({
      gam3eya_id: g.id,
      participant_id: null,
      month_index: i + 1,
      due_date: addMonths(start_date, i),
      amount,
      status: "pending" as const,
    }));
    const { error: payErr } = await supabaseAdmin.from("gam3eya_payments").insert(rows);
    if (payErr) {
      await supabaseAdmin.from("gam3eyas").delete().eq("id", g.id);
      return NextResponse.json({ error: payErr.message }, { status: 500 });
    }
    return NextResponse.json({ gam3eya: g });
  }

  // type === "organizing"
  const participants: { name: string; phone?: string; account_number?: string }[] = body.participants || [];
  if (!participants.length || participants.some((p) => !p.name)) {
    return NextResponse.json({ error: "لازم تضيف الأفراد كلهم بالاسم على الأقل" }, { status: 400 });
  }
  const monthsCount = participants.length;

  const { data: g, error } = await supabaseAdmin
    .from("gam3eyas")
    .insert({
      user_id: userId,
      type: "organizing",
      name: name || null,
      monthly_amount: amount,
      currency: currency || "EGP",
      participants_count: monthsCount,
      months_count: monthsCount,
      start_date,
      my_payout_month: null,
      status: "active",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const participantRows = participants.map((p, i) => ({
    gam3eya_id: g.id,
    name: p.name,
    phone: p.phone || null,
    account_number: p.account_number || null,
    payout_order: i + 1,
  }));
  const { data: insertedParticipants, error: partErr } = await supabaseAdmin.from("gam3eya_participants").insert(participantRows).select();
  if (partErr) {
    await supabaseAdmin.from("gam3eyas").delete().eq("id", g.id);
    return NextResponse.json({ error: partErr.message }, { status: 500 });
  }

  // every participant pays every month (standard gam3eya rotation) —
  // participants_count × months_count rows total.
  const paymentRows: any[] = [];
  for (const participant of insertedParticipants) {
    for (let m = 1; m <= monthsCount; m++) {
      paymentRows.push({
        gam3eya_id: g.id,
        participant_id: participant.id,
        month_index: m,
        due_date: addMonths(start_date, m - 1),
        amount,
        status: "pending",
      });
    }
  }
  const { error: payErr } = await supabaseAdmin.from("gam3eya_payments").insert(paymentRows);
  if (payErr) {
    await supabaseAdmin.from("gam3eyas").delete().eq("id", g.id); // cascades participants
    return NextResponse.json({ error: payErr.message }, { status: 500 });
  }

  return NextResponse.json({ gam3eya: g, participants: insertedParticipants });
}
