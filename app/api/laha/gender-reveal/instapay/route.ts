import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkUnlockToken, UNLOCK_COOKIE_PREFIX } from "@/lib/laha/unlockToken";

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const link = typeof body.instapay_link === "string" ? body.instapay_link.trim().slice(0, 300) : "";

  const { data: party } = await supabaseAdmin.from("laha_gender_reveal_parties").select("*").eq("user_id", userId).maybeSingle();
  if (!party) return NextResponse.json({ error: "not found" }, { status: 404 });
  const unlockCookie = req.cookies.get(`${UNLOCK_COOKIE_PREFIX}${party.id}`)?.value;
  if (!checkUnlockToken(unlockCookie, party.id)) return NextResponse.json({ error: "لازم تفتحي غرفة الأم بالرقم السري الأول" }, { status: 403 });

  const { error } = await supabaseAdmin.from("laha_gender_reveal_parties").update({ instapay_link: link || null }).eq("id", party.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
