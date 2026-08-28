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
  if (typeof body.selected !== "boolean" && typeof body.is_final !== "boolean") {
    return NextResponse.json({ error: "قيمة غير صالحة" }, { status: 400 });
  }

  // Round 47 — "is_final": الاسم النهائي المستقر (مختلف عن selected اللي
  // معناها بس "مرشّح لتصويت العيلة"). مسموح باسم نهائي واحد لكل نوع (ولد/
  // بنت) في نفس الوقت — لو الأم حطت is_final=true على اسم جديد، لازم نشيلها
  // الأول عن أي اسم تاني بنفس النوع (وإلا هيبقى فيه أكتر من "الاسم
  // النهائي" لنفس النوع، وده يبطّل معنى الكلمة "نهائي").
  if (body.is_final === true) {
    const { data: target } = await supabaseAdmin.from("laha_baby_names").select("gender").eq("id", id).eq("user_id", userId).single();
    if (!target) return NextResponse.json({ error: "الاسم غير موجود" }, { status: 404 });
    await supabaseAdmin.from("laha_baby_names").update({ is_final: false }).eq("user_id", userId).eq("gender", target.gender).eq("is_final", true);
  }

  const update: Record<string, boolean> = {};
  if (typeof body.selected === "boolean") update.selected = body.selected;
  if (typeof body.is_final === "boolean") update.is_final = body.is_final;
  const { error } = await supabaseAdmin.from("laha_baby_names").update(update).eq("id", id).eq("user_id", userId);
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
