import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await supabaseAdmin.from("general_reminders").select("*").eq("user_id", userId).order("remind_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reminders: data });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const title = String(body.title || "").trim();
  if (!title) return NextResponse.json({ error: "عنوان التذكير مطلوب" }, { status: 400 });
  const repeat = ["daily", "weekly", "monthly"].includes(body.repeat_frequency) ? body.repeat_frequency : "none";

  const { data, error } = await supabaseAdmin
    .from("general_reminders")
    .insert({
      user_id: userId,
      title,
      remind_at: body.remind_at || null,
      status: body.active === false ? "cancelled" : "active",
      source: body.source === "telegram" ? "telegram" : "app",
      note: body.note || null,
      repeat_frequency: repeat,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reminder: data });
}
