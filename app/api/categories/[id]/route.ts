import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const allowed = ["name", "icon", "kind", "keywords"];
  const update: Record<string, any> = {};
  for (const k of allowed) if (k in body) update[k] = body[k];
  const { data, error } = await supabaseAdmin
    .from("categories")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ category: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  // don't orphan transactions silently — just detach the category, keep the transaction
  await supabaseAdmin.from("transactions").update({ category_id: null }).eq("category_id", id).eq("user_id", userId);
  await supabaseAdmin.from("recurring_items").update({ category_id: null }).eq("category_id", id).eq("user_id", userId);
  await supabaseAdmin.from("budgets").delete().eq("category_id", id).eq("user_id", userId);
  const { error } = await supabaseAdmin.from("categories").delete().eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
