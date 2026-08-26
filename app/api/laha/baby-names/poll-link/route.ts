import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { newShareToken } from "@/lib/laha/pin";

// Round 41 — "Family Heart Poll": لينك حقيقي بمفتاح ثابت (`laha_settings.
// name_poll_token`، عمود واحد لكل مستخدمة — مفيش انتهاء صلاحية زي
// partner-link لأن ده تصويت مستمر مش لقطة مؤقتة) بدل تصويت عائلي وهمي
// (عداد محلي بلا مشاركة حقيقية) كان في البروتوتايب المرجعي.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await supabaseAdmin.from("laha_settings").select("name_poll_token").eq("user_id", userId).maybeSingle();
  return NextResponse.json({ token: data?.name_poll_token || null });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const regenerate = !!body.regenerate;

  if (!regenerate) {
    const { data } = await supabaseAdmin.from("laha_settings").select("name_poll_token").eq("user_id", userId).maybeSingle();
    if (data?.name_poll_token) return NextResponse.json({ token: data.name_poll_token });
  }

  const token = newShareToken();
  const { error } = await supabaseAdmin
    .from("laha_settings")
    .upsert({ user_id: userId, name_poll_token: token, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ token });
}
