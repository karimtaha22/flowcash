import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

export async function POST(_req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await supabaseAdmin.from("app_users").update({ last_seen_broadcast_at: new Date().toISOString() }).eq("id", userId);
  return NextResponse.json({ ok: true });
}
