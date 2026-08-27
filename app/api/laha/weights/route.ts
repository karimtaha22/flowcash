import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isValidISO } from "@/lib/laha/dates";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await supabaseAdmin.from("laha_weights").select("*").eq("user_id", userId).order("log_date", { ascending: true });
  return NextResponse.json({ weights: data || [] });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const logDate = body.log_date;
  const weightKg = Number(body.weight_kg);
  const mode = body.mode === "pregnancy" ? "pregnancy" : "cycle";

  if (!isValidISO(logDate)) return NextResponse.json({ error: "تاريخ غير صالح" }, { status: 400 });
  // Round 38 review note: البروتوتايب المرجعي كان بيقبل "0" كوزن (الفحص
  // كان `if(!w) return` — والسترينج "0" truthy في JS فبيعدّي) — هنا برفض
  // أي وزن ≤ 0 صراحة.
  if (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg >= 400) {
    return NextResponse.json({ error: "وزن غير صالح" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("laha_weights")
    .upsert({ user_id: userId, log_date: logDate, weight_kg: weightKg, mode }, { onConflict: "user_id,log_date" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Round 45 — لازمة عشان "كارت المتابعة" (متابعة الطبيب) يقدر يمسح وزن اتسجل
// من كارت زيارة اتمسح أو اتشال منه الوزن (راجع syncApptWeight في
// app/api/laha/appointments — الوزن المتزامن من الكارت بيتحذف بنفس الطريقة
// لو المستخدمة مسحت القيمة أو مسحت الكارت نفسه).
export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const logDate = req.nextUrl.searchParams.get("log_date");
  if (!logDate || !isValidISO(logDate)) return NextResponse.json({ error: "تاريخ غير صالح" }, { status: 400 });
  const { error } = await supabaseAdmin.from("laha_weights").delete().eq("user_id", userId).eq("log_date", logDate);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
