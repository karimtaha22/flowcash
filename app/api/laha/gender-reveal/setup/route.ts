import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashPin } from "@/lib/laha/pin";

// دي الشاشة اللي المفروض صاحبة البرنامج تدّي الموبيل فيها للدكتورة أو
// الصديقة المقربة، من غير ما تشوف هي نفسها اللي بيتكتب. مسموح تُستخدم مرة
// واحدة بس (لما status='awaiting_setup') — بعد كده الراوت بيرفض أي محاولة
// setup تانية عشان محدش (ولا حتى صاحبة البرنامج نفسها) يقدر يغيّر النوع أو
// الرقم السري بعد ما اتسجلوا.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  const gender = body.gender === "boy" || body.gender === "girl" ? body.gender : null;
  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  const media = typeof body.media_data_url === "string" && /^data:(image|video)\//.test(body.media_data_url) ? body.media_data_url : null;

  if (!gender) return NextResponse.json({ error: "لازم تحددي نوع الجنين" }, { status: 400 });
  if (pin.length < 4 || pin.length > 12 || !/^[0-9]+$/.test(pin)) {
    return NextResponse.json({ error: "الرقم السري لازم يكون أرقام بس، من ٤ لحد ١٢ رقم" }, { status: 400 });
  }

  const { data: party } = await supabaseAdmin.from("laha_gender_reveal_parties").select("*").eq("user_id", userId).maybeSingle();
  if (!party) return NextResponse.json({ error: "لازم تتعمل الحفلة الأول" }, { status: 404 });
  if (party.status !== "awaiting_setup") {
    return NextResponse.json({ error: "الإعداد اتعمل بالفعل ومينفعش يتغيّر" }, { status: 409 });
  }

  const { hash, salt } = hashPin(pin);
  const { error } = await supabaseAdmin
    .from("laha_gender_reveal_parties")
    .update({ gender, pin_hash: hash, pin_salt: salt, media_data_url: media, status: "ready", updated_at: new Date().toISOString() })
    .eq("id", party.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ملحوظة أمان: مفيش أي رد بيرجّع الـ PIN أو الـ gender هنا — الرد بس
  // تأكيد نجاح، عشان حتى لو حد وقف على الشاشة دي وشافها بعد الإرسال ملقاش
  // أي أثر للقيمة اللي اتكتبت.
  return NextResponse.json({ ok: true });
}
