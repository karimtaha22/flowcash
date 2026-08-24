import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

const LINK_CODE_TTL_MINUTES = 10;

// "اربط حسابك بتليجرام" in الإعدادات — mints a one-time, short-lived code
// and hands back a ready t.me deep link. The customer taps it, Telegram
// opens the shared bot and auto-sends "/start <code>", and the webhook
// (app/api/telegram/webhook) consumes the code to save this chat as theirs.
// No bot creation, no token to copy/paste — one tap.
export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const botUsername = (process.env.TELEGRAM_BOT_USERNAME || "").trim().replace(/^@/, "");
  if (!botUsername) {
    return NextResponse.json({ error: "بوت تليجرام لسه مش متسجل من الأدمن (TELEGRAM_BOT_USERNAME)." }, { status: 500 });
  }

  const code = crypto.randomBytes(9).toString("base64url"); // ~12 chars, URL-safe
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60_000).toISOString();

  const { error } = await supabaseAdmin.from("telegram_link_codes").insert({ code, user_id: userId, expires_at: expiresAt });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ link: `https://t.me/${botUsername}?start=${code}`, expiresInMinutes: LINK_CODE_TTL_MINUTES });
}
