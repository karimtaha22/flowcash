import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkUnlockToken, UNLOCK_COOKIE_PREFIX } from "@/lib/laha/unlockToken";

// شاشة الأم لتصفح الكروت: اسم الضيف + بريف من الرسالة + هل بعت نقطة، وعند
// فتح الكارت نفسه الرسالة كاملة + إيصال التحويل (لو موجود) + هل توقعه كان
// صح ولا لأ (بمقارنة guess_vote بـ party.gender، وده بيبان بس لو popped).
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: party } = await supabaseAdmin.from("laha_gender_reveal_parties").select("*").eq("user_id", userId).maybeSingle();
  if (!party) return NextResponse.json({ error: "not found" }, { status: 404 });
  const unlockCookie = req.cookies.get(`${UNLOCK_COOKIE_PREFIX}${party.id}`)?.value;
  if (!checkUnlockToken(unlockCookie, party.id)) return NextResponse.json({ error: "لازم تفتحي غرفة الأم بالرقم السري الأول" }, { status: 403 });

  const { data } = await supabaseAdmin
    .from("laha_gender_reveal_guestbook")
    .select("*")
    .eq("party_id", party.id)
    .order("created_at", { ascending: false });

  const entries = (data || []).map((g: any) => ({
    ...g,
    guess_correct: party.popped && g.guess_vote ? g.guess_vote === party.gender : null,
  }));
  return NextResponse.json({ entries });
}
