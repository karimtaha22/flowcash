import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

// Deliberately a separate, narrow endpoint (only ever sets telegram_chat_id
// to null for the CALLER's own account) rather than adding telegram_chat_id
// to /api/me's generic PATCH allowlist — that would let a client set it to
// ANY value, including someone else's real chat_id, which would silently
// redirect that other person's Telegram reminders (and their financial
// data) to this account instead. This route can only ever clear the caller's
// own link, never set an arbitrary one.
export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabaseAdmin.from("app_users").update({ telegram_chat_id: null }).eq("id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
