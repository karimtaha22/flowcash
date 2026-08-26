import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isValidISO, todayISO } from "@/lib/laha/dates";

// Round 38 — إعدادات قسم "لها" لكل مستخدم: الوضع (دورة/حمل)، متوسط طول
// الدورة/مدة الطمث، وبيانات الحمل (LMP، اسم الأب). صف واحد لكل مستخدم
// (upsert بمفتاح user_id) بدل جدول سجلات — الإعدادات دي "حالة حالية" مش
// تاريخ متراكم.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabaseAdmin.from("laha_settings").select("*").eq("user_id", userId).maybeSingle();
  if (!data) {
    return NextResponse.json({
      mode: "cycle",
      avg_cycle_length: 28,
      avg_period_length: 5,
      pregnancy_active: false,
      lmp: null,
      father_name: null,
    });
  }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const mode = body.mode === "pregnancy" ? "pregnancy" : "cycle";
  const avgCycleLength = Math.round(Number(body.avg_cycle_length));
  const avgPeriodLength = Math.round(Number(body.avg_period_length));
  const pregnancyActive = !!body.pregnancy_active;
  const lmp = body.lmp || null;
  const fatherName = typeof body.father_name === "string" ? body.father_name.trim().slice(0, 80) : null;

  // Round 38 review note: البروتوتايب المرجعي كان بيسمح بأي رقم (حتى صفر/
  // سالب) لطول الدورة/مدة الطمث وده كان بيطلع NaN في كل حسابات الدورة —
  // هنا بنرفض القيم برا حدود منطقية بدل ما نسيب الـ DB check constraint
  // يرمي خطأ 500 مبهم.
  if (!Number.isFinite(avgCycleLength) || avgCycleLength < 15 || avgCycleLength > 60) {
    return NextResponse.json({ error: "متوسط طول الدورة لازم يكون رقم بين ١٥ و٦٠ يوم" }, { status: 400 });
  }
  if (!Number.isFinite(avgPeriodLength) || avgPeriodLength < 1 || avgPeriodLength > 15 || avgPeriodLength >= avgCycleLength) {
    return NextResponse.json({ error: "مدة الطمث لازم تكون رقم بين ١ و١٥ يوم وأقل من طول الدورة" }, { status: 400 });
  }
  if (lmp) {
    if (!isValidISO(lmp)) return NextResponse.json({ error: "تاريخ آخر دورة غير صالح" }, { status: 400 });
    // Round 38 review note: البروتوتايب المرجعي كان بيقبل LMP في المستقبل
    // من غير أي تحقق ويعمل clamp صامت للنتيجة — هنا برفضها من الأساس.
    if (lmp > todayISO()) return NextResponse.json({ error: "تاريخ آخر دورة مينفعش يكون في المستقبل" }, { status: 400 });
  }

  const payload = {
    user_id: userId,
    mode,
    avg_cycle_length: avgCycleLength,
    avg_period_length: avgPeriodLength,
    pregnancy_active: pregnancyActive,
    lmp,
    father_name: fatherName,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin.from("laha_settings").upsert(payload, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
