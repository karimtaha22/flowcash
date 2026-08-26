import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await supabaseAdmin.from("laha_baby_names").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  return NextResponse.json({ names: data || [] });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const gender = body.gender === "boy" || body.gender === "girl" ? body.gender : null;
  if (!name) return NextResponse.json({ error: "الاسم مطلوب" }, { status: 400 });
  if (!gender) return NextResponse.json({ error: "نوع غير صالح" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("laha_baby_names")
    .insert({
      user_id: userId,
      name: name.slice(0, 60),
      meaning: typeof body.meaning === "string" ? body.meaning.slice(0, 300) : null,
      gender,
      source: body.source === "ai" ? "ai" : "manual",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ name: data });
}
