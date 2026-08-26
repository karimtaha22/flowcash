import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { newShareToken } from "@/lib/laha/pin";
import { checkUnlockToken, UNLOCK_COOKIE_PREFIX } from "@/lib/laha/unlockToken";

// SECURITY: هنا (ولا في أي راوت تاني في التطبيق) بيترجع pin_hash أو
// pin_salt للعميل — والـ gender ميترجعش إلا لو popped=true بالفعل. الهدف:
// حتى لو الأم فتحت أدوات المطوّر وشافت رد الـ API، مفيش أي طريقة تعرف بيها
// النوع أو الـ PIN قبل ما "تفتح" غرفة الأم بنفسها بالرقم اللي الدكتور
// أعطاها إياه، أو قبل ما "تكشف" هي بنفسها بالضغط على البالون.
function publicPartyShape(party: any, unlocked: boolean) {
  return {
    id: party.id,
    status: party.status,
    popped: party.popped,
    gender: party.popped ? party.gender : null,
    media_data_url: party.popped ? party.media_data_url : null,
    instapay_link: party.instapay_link,
    share_token: party.share_token,
    unlocked,
  };
}

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: party } = await supabaseAdmin.from("laha_gender_reveal_parties").select("*").eq("user_id", userId).maybeSingle();
  if (!party) return NextResponse.json({ party: null });

  const unlockCookie = req.cookies.get(`${UNLOCK_COOKIE_PREFIX}${party.id}`)?.value;
  const unlocked = checkUnlockToken(unlockCookie, party.id);

  const [{ count: boyVotes }, { count: girlVotes }] = await Promise.all([
    supabaseAdmin.from("laha_gender_reveal_votes").select("id", { count: "exact", head: true }).eq("party_id", party.id).eq("vote", "boy"),
    supabaseAdmin.from("laha_gender_reveal_votes").select("id", { count: "exact", head: true }).eq("party_id", party.id).eq("vote", "girl"),
  ]);
  const { count: guestbookCount } = await supabaseAdmin
    .from("laha_gender_reveal_guestbook")
    .select("id", { count: "exact", head: true })
    .eq("party_id", party.id);

  return NextResponse.json({
    party: publicPartyShape(party, unlocked),
    votes: { boy: boyVotes || 0, girl: girlVotes || 0 },
    guestbook_count: guestbookCount || 0,
  });
}

// إنشاء الحفلة (مرة واحدة لكل مستخدم — unique user_id). بترجع share_token
// عشان الواجهة تبني رابط الدعوة، لكن status بتفضل 'awaiting_setup' لحد ما
// الدكتور/الصديقة تعمل /setup.
export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: existing } = await supabaseAdmin.from("laha_gender_reveal_parties").select("*").eq("user_id", userId).maybeSingle();
  if (existing) return NextResponse.json({ party: publicPartyShape(existing, false) });

  const { data, error } = await supabaseAdmin
    .from("laha_gender_reveal_parties")
    .insert({ user_id: userId, share_token: newShareToken() })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ party: publicPartyShape(data, false) });
}
