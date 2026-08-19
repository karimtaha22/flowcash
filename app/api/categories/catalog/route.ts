import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";
import { MASTER_CATALOG } from "@/lib/categories";

// Powers the Settings ← التصنيفات manager: the FULL pick-list (active +
// inactive), seeding any master-catalog categories the user doesn't have yet
// (as inactive) so they show up in the "متاحة" column to switch on.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("categories")
    .select("id,name,kind")
    .eq("user_id", userId);
  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });

  const have = new Set((existing || []).map((c) => `${c.kind}::${c.name}`));
  const missing = MASTER_CATALOG.filter((m) => !have.has(`${m.kind}::${m.name}`));
  if (missing.length) {
    await supabaseAdmin.from("categories").insert(
      missing.map((m) => ({ user_id: userId, name: m.name, icon: m.icon, kind: m.kind, is_active: false }))
    );
  }

  const { data, error } = await supabaseAdmin
    .from("categories")
    .select("*")
    .eq("user_id", userId)
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categories: data });
}

// Bulk-saves everything the manager screen changed in one go: which
// categories got switched active/inactive, plus any brand-new custom ones
// the user typed in — matching the "إضافة تصنيف ... حفظ" flow.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const activate: string[] = Array.isArray(body.activate) ? body.activate : [];
  const deactivate: string[] = Array.isArray(body.deactivate) ? body.deactivate : [];
  const newCategories: { name: string; icon?: string; kind: "expense" | "income" }[] = Array.isArray(body.newCategories) ? body.newCategories : [];

  if (activate.length) {
    await supabaseAdmin.from("categories").update({ is_active: true }).in("id", activate).eq("user_id", userId);
  }
  if (deactivate.length) {
    await supabaseAdmin.from("categories").update({ is_active: false }).in("id", deactivate).eq("user_id", userId);
  }
  const validNew = newCategories.filter((c) => c.name && c.name.trim() && (c.kind === "expense" || c.kind === "income"));
  if (validNew.length) {
    await supabaseAdmin.from("categories").insert(
      validNew.map((c) => ({ user_id: userId, name: c.name.trim(), icon: c.icon || "💰", kind: c.kind, is_active: true }))
    );
  }

  const { data, error } = await supabaseAdmin.from("categories").select("*").eq("user_id", userId).order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categories: data });
}
