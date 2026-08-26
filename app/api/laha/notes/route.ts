import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await supabaseAdmin.from("laha_notes").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  return NextResponse.json({ notes: data || [] });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const bodyText = typeof body.body === "string" ? body.body.trim() : "";
  if (!bodyText) return NextResponse.json({ error: "الملاحظة فاضية" }, { status: 400 });
  const { data, error } = await supabaseAdmin
    .from("laha_notes")
    .insert({ user_id: userId, body: bodyText.slice(0, 2000) })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data });
}
