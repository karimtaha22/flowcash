import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyPin, newShareToken } from "@/lib/laha/pin";

// Round 43 — "سوتش حذف نوع الجنين... لو شغلت السوتش يظهر تحذير بيقول
// هيتطلب الدكتورة أو الصديق المقرب وضع نوع الجنين وإنشاء رقم سري جديد،
// وإعادة الحفلة من البداية هتولّد روابط جديدة وتمسح التصويت": ده مسار
// استرجاع/مسح متعمّد اتطلب صراحة من المستخدمة نفسها — مختلف عن قرار
// Round 38 الأصلي ("مفيش مسار استرجاع PIN") لأن هنا الطلب صريح ومباشر منها،
// مش تخمين. بيقبل إما الرقم السري الحالي للحفلة (لو لسه متسجل ومتذكراه)،
// أو license_code بتاع حسابها هي نفسه (نفس كود التفعيل — موجود أصلًا في
// app_users، مفيش داعي نضيف كود جديد مخصوص).
//
// اللي بيحصل عند النجاح: الحفلة بترجع لـ "awaiting_setup" (يعني الدكتورة/
// الصديقة لازم تسجّل النوع والـ PIN من الأول)، share_token بيتغيّر (أي
// لينك قديم بيبقى منتهي الصلاحية)، وكل الأصوات المسجلة بتتمسح.
// Round 45 — تصحيح: المستخدمة جرّبت مسح شامل فعليًا ولاقت الجيست بوك (تهاني
// الضيوف) من التجربة القديمة لسه موجود بعد ما بدأت حفلة جديدة — أكدت صراحة
// إن ده غلط والمفروض يتمسح هو كمان ("كله يتمسح حتى الجيست بوك"). دلوقتي
// بيتمسح مع الأصوات. لينك الانستاباي وحده فضل زي ما هو — مش مرتبط بحفلة/
// تجربة معينة، ومحدش اتكلم عنه في البلاغ الجديد.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const authCode = typeof body.auth_code === "string" ? body.auth_code.trim() : "";
  if (!authCode) return NextResponse.json({ error: "اكتبي الرقم السري أو كود تفعيل البرنامج" }, { status: 400 });

  const { data: party } = await supabaseAdmin.from("laha_gender_reveal_parties").select("*").eq("user_id", userId).maybeSingle();
  if (!party) return NextResponse.json({ error: "مفيش حفلة متسجلة أصلًا" }, { status: 404 });
  if (party.status === "awaiting_setup") {
    return NextResponse.json({ error: "مفيش نوع جنين متسجل أصلًا عشان يتمسح" }, { status: 409 });
  }

  const pinOk = !!party.pin_hash && !!party.pin_salt && verifyPin(authCode, party.pin_hash, party.pin_salt);
  let authOk = pinOk;
  if (!authOk) {
    const { data: user } = await supabaseAdmin.from("app_users").select("license_code").eq("id", userId).maybeSingle();
    authOk = !!user?.license_code && user.license_code.toUpperCase() === authCode.toUpperCase();
  }
  if (!authOk) return NextResponse.json({ error: "الرقم السري أو كود التفعيل غلط" }, { status: 401 });

  const { error } = await supabaseAdmin
    .from("laha_gender_reveal_parties")
    .update({
      status: "awaiting_setup",
      gender: null,
      pin_hash: null,
      pin_salt: null,
      media_data_url: null,
      popped: false,
      popped_at: null,
      share_token: newShareToken(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", party.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from("laha_gender_reveal_votes").delete().eq("party_id", party.id);
  await supabaseAdmin.from("laha_gender_reveal_guestbook").delete().eq("party_id", party.id);

  return NextResponse.json({ ok: true });
}
