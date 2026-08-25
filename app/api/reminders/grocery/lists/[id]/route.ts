import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await supabaseAdmin.from("grocery_list_entries").delete().eq("list_id", id);
  const { error } = await supabaseAdmin.from("grocery_lists").delete().eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Round 33 — "انتهى التسوق": بيقفل القائمة (status: "done") فتظهر بخط
// بالعرض في الواجهة إنها خلصت. status="done" كان موجود أصلاً في قيد قاعدة
// البيانات من أول الميزة بس محدش كان بيحطه فعليًا — دلوقتي "وضع التسوق" هو
// اللي بيستخدمه.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  if (body.status !== "done" && body.status !== "saved") return NextResponse.json({ error: "status غير صالح" }, { status: 400 });

  const { error } = await supabaseAdmin.from("grocery_lists").update({ status: body.status, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
