import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyPin } from "@/lib/laha/pin";
import { makeUnlockToken, UNLOCK_COOKIE_PREFIX } from "@/lib/laha/unlockToken";

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  if (!pin) return NextResponse.json({ error: "اكتبي الرقم السري" }, { status: 400 });

  const { data: party } = await supabaseAdmin.from("laha_gender_reveal_parties").select("*").eq("user_id", userId).maybeSingle();
  if (!party || !party.pin_hash || !party.pin_salt) {
    return NextResponse.json({ error: "لسه محدش سجّل نوع الجنين والرقم السري" }, { status: 404 });
  }
  if (!verifyPin(pin, party.pin_hash, party.pin_salt)) {
    return NextResponse.json({ error: "الرقم السري غلط" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(`${UNLOCK_COOKIE_PREFIX}${party.id}`, makeUnlockToken(party.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 60,
  });
  return res;
}
