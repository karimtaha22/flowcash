import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

// Only the categories the user has switched on (is_active) — this is what
// shows up everywhere in the app (add page, budgets, recurring items...).
// The full pick-list (active + inactive master catalog) lives behind
// /api/categories/catalog, used only by the Settings ← التصنيفات manager.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await supabaseAdmin.from("categories").select("*").eq("user_id", userId).eq("is_active", true).order("name");
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
 icon: icon ||"",
      kind: kind === "income" ? "income" : "expense",
      keywords: Array.isArray(keywords) ? keywords : [],
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ category: data });
}
