import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkUnlockToken, UNLOCK_COOKIE_PREFIX } from "@/lib/laha/unlockToken";

// اللحظة اللي الأم بتدوس فيها على البالون وتكشف النوع — بمجرد ما popped
// يبقى true هنا، كل حد معاه اللينك العام (app/laha-reveal/[token]) هيشوف
// النوع فورًا في أقرب poll (كل ٥ ثواني)، مفيش أي "لقطة" مجمّدة زي
// البروتوتايب المرجعي اللي كان بيولّد لينك جديد كل مرة عشان يعكس الحالة
// الجديدة.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: party } = await supabaseAdmin.from("laha_gender_reveal_parties").select("*").eq("user_id", userId).maybeSingle();
  if (!party) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (party.status !== "ready") return NextResponse.json({ error: "الحفلة مش جاهزة للكشف لسه" }, { status: 409 });

  const unlockCookie = req.cookies.get(`${UNLOCK_COOKIE_PREFIX}${party.id}`)?.value;
  if (!checkUnlockToken(unlockCookie, party.id)) return NextResponse.json({ error: "لازم تفتحي غرفة الأم بالرقم السري الأول" }, { status: 403 });

  const { error } = await supabaseAdmin
    .from("laha_gender_reveal_parties")
    .update({ popped: true, popped_at: new Date().toISOString(), status: "popped" })
    .eq("id", party.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, gender: party.gender });
}
