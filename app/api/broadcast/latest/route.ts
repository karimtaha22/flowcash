import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: user } = await supabaseAdmin.from("app_users").select("last_seen_broadcast_at").eq("id", userId).single();
  const { data: latest } = await supabaseAdmin.from("broadcasts").select("id,message,created_at").order("created_at", { ascending: false }).limit(1).single();

  if (!latest) return NextResponse.json({ broadcast: null });
  const seen = user?.last_seen_broadcast_at && new Date(user.last_seen_broadcast_at) >= new Date(latest.created_at);
  return NextResponse.json({ broadcast: seen ? null : latest });
}
