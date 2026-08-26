import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// PUBLIC route — تصويت فرد من العيلة على اسم مقترح. `voter_key` بيتولّد
// ويتخزّن جوه جهاز الضيف نفسه (localStorage، زي `guest_key` في تصويت
// الكشف عن نوع الجنين) — مش هوية حقيقية، بس أفضل جهد لمنع نفس الجهاز
// يصوّت أكتر من مرة على نفس الاسم. الـ toggle بيدّي حرية تصويت/إلغاء بحرية.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const nameId = typeof body.name_id === "string" ? body.name_id : null;
  const voterKey = typeof body.voter_key === "string" ? body.voter_key.slice(0, 64) : null;
  const vote = !!body.vote;
  if (!nameId || !voterKey) return NextResponse.json({ error: "بيانات غير كاملة" }, { status: 400 });

  const { data: settings } = await supabaseAdmin.from("laha_settings").select("user_id").eq("name_poll_token", token).maybeSingle();
  if (!settings) return NextResponse.json({ error: "الرابط غير صالح" }, { status: 404 });

  // تأكيد إن الاسم ده فعلاً ملك صاحبة اللينك ومختار (shortlisted) — منع
  // أي محاولة تصويت على id اسم من حساب تاني.
  const { data: nameRow } = await supabaseAdmin.from("laha_baby_names").select("id").eq("id", nameId).eq("user_id", settings.user_id).eq("selected", true).maybeSingle();
  if (!nameRow) return NextResponse.json({ error: "الاسم ده مش متاح للتصويت" }, { status: 404 });

  if (vote) {
    const { error } = await supabaseAdmin.from("laha_name_poll_votes").upsert({ name_id: nameId, voter_key: voterKey }, { onConflict: "name_id,voter_key" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabaseAdmin.from("laha_name_poll_votes").delete().eq("name_id", nameId).eq("voter_key", voterKey);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
