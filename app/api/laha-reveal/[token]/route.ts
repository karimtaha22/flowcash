import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// PUBLIC — رابط حفلة "تيم بينك ولا تيم بلو؟" (حفلة الكشف عن نوع الجنين):
// مفيش جلسة مطلوبة، أي حد معاه التوكن يشوف حالة التصويت اللايف والنوع (لو
// اتكشف بالفعل). زي app/api/debt-link/[token] بالظبط في الفلسفة — قراءة
// عامة بتوكن، من غير أي بيانات حساسة (الـ PIN مش موجود في الجدول ده أصلاً
// غير كـ hash، ومش بيترجع هنا برضو).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: party } = await supabaseAdmin.from("laha_gender_reveal_parties").select("*").eq("share_token", token).maybeSingle();
  if (!party) return NextResponse.json({ error: "الرابط غير صالح" }, { status: 404 });

  const [{ count: boyVotes }, { count: girlVotes }, { data: selectedName }] = await Promise.all([
    supabaseAdmin.from("laha_gender_reveal_votes").select("id", { count: "exact", head: true }).eq("party_id", party.id).eq("vote", "boy"),
    supabaseAdmin.from("laha_gender_reveal_votes").select("id", { count: "exact", head: true }).eq("party_id", party.id).eq("vote", "girl"),
    supabaseAdmin
      .from("laha_baby_names")
      .select("name,gender")
      .eq("user_id", party.user_id)
      .eq("selected", true)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  // اسم النقطة الديناميكي: لو النوع اتكشف وفيه اسم مختار بنفس النوع،
  // استخدميه — غير كده "البيبي" العامة.
  let giftName: string | null = null;
  if (party.popped && party.gender && selectedName?.length) {
    const match = selectedName.find((n: any) => n.gender === party.gender);
    giftName = match?.name || null;
  }

  return NextResponse.json({
    popped: party.popped,
    gender: party.popped ? party.gender : null,
    media_data_url: party.popped ? party.media_data_url : null,
    votes: { boy: boyVotes || 0, girl: girlVotes || 0 },
    instapay_link: party.instapay_link || null,
    gift_label: giftName ? `ابعت نقطة ${giftName}` : "ابعت نقطة البيبي",
  });
}
