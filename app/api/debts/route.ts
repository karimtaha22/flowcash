import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const direction = searchParams.get("direction");
  const person_id = searchParams.get("person_id");

  let query = supabaseAdmin
    .from("debts")
    .select(
      "*, people(name, phone, address, id_photo_front), debt_payments(id, amount, paid_at, receipt_url, note), debt_witnesses(id, slot_index, name, phone, address, id_photo_front), debt_links(id, token, role, witness_id, viewed_at, acknowledged_at, revoked_at), debt_events(event_type, description, actor_role, actor_name, created_at)"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (direction) query = query.eq("direction", direction);
  if (person_id) query = query.eq("person_id", person_id);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // the app owner's own name — used to label "الدائن"/"المدين" correctly
  // regardless of which side of the debt they're on, same as the public
  // /debt/[token] page does for the other party.
  const { data: me } = await supabaseAdmin.from("app_users").select("name").eq("id", userId).single();
  const myName = me?.name || "أنا";

  // add the shareable URL to each link here (server-side, same base-URL
  // resolution the initial creation used) rather than making the client
  // reconstruct it.
  const { debtLinkUrl } = await import("@/lib/debtLinks");
  const debts = (data || []).map((d: any) => ({
    ...d,
    // Round 25 — an advanced debt's creditor_name_override/debtor_name_override
    // (typed manually at creation, since the linked person/account name can be
    // an alias or English name) always wins when present; simple debts (and any
    // pre-round-25 advanced debt created before this field existed) keep the
    // old derived-from-record behavior.
    creditor_name: d.creditor_name_override || (d.direction === "owed_to_me" ? myName : d.people?.name || "الدائن"),
    debtor_name: d.debtor_name_override || (d.direction === "owed_to_me" ? d.people?.name || "المدين" : myName),
    debt_witnesses: (d.debt_witnesses || []).sort((a: any, b: any) => a.slot_index - b.slot_index),
    debt_links: (d.debt_links || []).map((l: any) => ({ ...l, url: debtLinkUrl(l.token) })),
    debt_events: (d.debt_events || []).sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
  }));
  return NextResponse.json({ debts });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const { person_id, direction, title, reason, amount, currency, due_date, debt_date, value_type, metal_karat, unit_label } = body;
  if (!person_id || !direction || !title || !amount) {
    return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
  }
  // Round 47 — "لما بختار ذهب بيحسب الذهب فلوس، اعمل مربع اختيار نوع
  // الدين": نفس منطق تحويل "العملة" لوحدة قياس (جرام ذهب/فضة/وحدة) المستخدم
  // أصلًا في app/api/debts/advanced/route.ts للتسجيل المتقدم — هنا بقى
  // متاح في الفورم البسيط كمان، عشان دين الذهب/الفضة ميتسجلش وكأنه مبلغ
  // مالي بعملة (اللي كان سبب البلاغ).
  const vType = ["currency", "gold", "silver", "other"].includes(value_type) ? value_type : "currency";
  const { data, error } = await supabaseAdmin
    .from("debts")
    .insert({
      user_id: userId,
      person_id,
      direction,
      title,
      reason,
      original_amount: amount,
      remaining_amount: amount,
      currency: vType === "currency" ? currency || "EGP" : unit_label || (vType === "gold" ? "جرام ذهب" : vType === "silver" ? "جرام فضة" : "وحدة"),
      value_type: vType,
      metal_karat: vType === "gold" ? Number(metal_karat) || null : null,
      due_date: due_date || null,
      debt_date: debt_date || new Date().toISOString().slice(0, 10),
      status: "open",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ debt: data });
}
