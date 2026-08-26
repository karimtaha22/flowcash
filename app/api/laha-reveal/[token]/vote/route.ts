import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// PUBLIC — تصويت الضيف. dedup بأفضل جهد بس عن طريق guest_key (رقم عشوائي
// بيتولّد ويتخزّن عند الضيف نفسه — راجع تعليق newGuestKey في lib/laha/pin.ts):
// مش حماية حقيقية ضد التلاعب (زي أي نظام تصويت من غير تسجيل دخول)، لكنها
// بتمنع نفس المتصفح إنه يصوّت أكتر من مرة بالغلط، وبتسمح له يغيّر صوته.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const guestKey = typeof body.guest_key === "string" ? body.guest_key.trim() : "";
  const vote = body.vote === "boy" || body.vote === "girl" ? body.vote : null;
  if (!guestKey || !vote) return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });

  const { data: party } = await supabaseAdmin.from("laha_gender_reveal_parties").select("id").eq("share_token", token).maybeSingle();
  if (!party) return NextResponse.json({ error: "الرابط غير صالح" }, { status: 404 });

  const { error } = await supabaseAdmin
    .from("laha_gender_reveal_votes")
    .upsert({ party_id: party.id, guest_key: guestKey, vote }, { onConflict: "party_id,guest_key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
