import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("id,name,base_currency,dark_mode,travel_mode,auto_logout_minutes,charity_amount,charity_frequency,charity_reminder_enabled,telegram_chat_id")
    .eq("id", userId)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ user: data });
}

export async function PATCH(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const allowed = ["base_currency", "dark_mode", "travel_mode", "auto_logout_minutes", "charity_amount", "charity_frequency", "charity_reminder_enabled"];
  const update: Record<string, any> = {};
  for (const k of allowed) if (k in body) update[k] = body[k];
  update.updated_at = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from("app_users").update(update).eq("id", userId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ user: data });
}
