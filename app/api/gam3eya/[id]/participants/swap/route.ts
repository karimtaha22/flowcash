import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

// "إمكانية تبديل الأدوار" — swaps two participants' turn in line (payout_order).
// Deliberately does NOT touch already-recorded gam3eya_payments rows — those
// stay tied to the participant who actually paid/collected each month so
// far; only future turn order changes.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { participant_a, participant_b } = await req.json();
  if (!participant_a || !participant_b) return NextResponse.json({ error: "اختار شخصين للتبديل" }, { status: 400 });

  const { data: g } = await supabaseAdmin.from("gam3eyas").select("id").eq("id", id).eq("user_id", userId).eq("type", "organizing").single();
  if (!g) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: parts } = await supabaseAdmin
    .from("gam3eya_participants")
    .select("id,payout_order")
    .eq("gam3eya_id", id)
    .in("id", [participant_a, participant_b]);
  if (!parts || parts.length !== 2) return NextResponse.json({ error: "الشخصين مش موجودين في الجمعية دي" }, { status: 404 });

  const [a, b] = parts;
  await supabaseAdmin.from("gam3eya_participants").update({ payout_order: b.payout_order }).eq("id", a.id);
  await supabaseAdmin.from("gam3eya_participants").update({ payout_order: a.payout_order }).eq("id", b.id);

  return NextResponse.json({ ok: true });
}
