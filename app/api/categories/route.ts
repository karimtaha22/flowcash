import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await supabaseAdmin.from("categories").select("*").eq("user_id", userId).order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categories: data });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const { name, icon, kind, keywords } = body;
  if (!name) return NextResponse.json({ error: "اسم التصنيف مطلوب" }, { status: 400 });
  const { data, error } = await supabaseAdmin
    .from("categories")
    .insert({
      user_id: userId,
      name,
      icon: icon || "💰",
      kind: kind === "income" ? "income" : "expense",
      keywords: Array.isArray(keywords) ? keywords : [],
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ category: data });
}
