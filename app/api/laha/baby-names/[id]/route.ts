import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// "selected=true" هي اللي بتحدد الاسم المختار — بيتستخدم بعدين في زرار
// "ابعت نقطة [الاسم]" بحفلة الكشف عن نوع الجنين. مفيش قيد يمنع أكتر من
// اسم "مختار" في نفس الوقت عمدًا (ممكن الأم تختار اسم بنت واسم ولد لحد ما
// تعرف النوع) — الواجهة هي اللي بتعرض "آخر اسم مختار" بتاريخ الإنشاء.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (typeof body.selected !== "boolean") return NextResponse.json({ error: "قيمة غير صالحة" }, { status: 400 });
  const { error } = await supabaseAdmin.from("laha_baby_names").update({ selected: body.selected }).eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { error } = await supabaseAdmin.from("laha_baby_names").delete().eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
