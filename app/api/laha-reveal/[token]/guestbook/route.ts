import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// PUBLIC — تسجيل رسالة تهنئة (+ توقع نوع اختياري + صورة إيصال تحويل
// اختيارية لو الضيف بعت "نقطة"). زي الصور التانية في التطبيق، متوقّعة
// data URL مضغوطة client-side بـ lib/image.ts's shrinkImage.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const guestName = typeof body.guest_name === "string" && body.guest_name.trim() ? body.guest_name.trim().slice(0, 60) : "ضيف";
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 1000) : "";
  const guessVote = body.guess_vote === "boy" || body.guess_vote === "girl" ? body.guess_vote : null;
  const sentGift = !!body.sent_gift;
  const paymentScreenshot =
    typeof body.payment_screenshot === "string" && body.payment_screenshot.startsWith("data:image") ? body.payment_screenshot : null;

  if (!message) return NextResponse.json({ error: "اكتب رسالة تهنئة" }, { status: 400 });

  const { data: party } = await supabaseAdmin.from("laha_gender_reveal_parties").select("id").eq("share_token", token).maybeSingle();
  if (!party) return NextResponse.json({ error: "الرابط غير صالح" }, { status: 404 });

  const { error } = await supabaseAdmin.from("laha_gender_reveal_guestbook").insert({
    party_id: party.id,
    guest_name: guestName,
    message,
    guess_vote: guessVote,
    sent_gift: sentGift,
    payment_screenshot: paymentScreenshot,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
