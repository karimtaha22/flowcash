import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isValidISO, todayISO, addDays } from "@/lib/laha/dates";

// Round 40 — "التقدير الرجعي" (Backtrack & Gap Filler): المستخدمة بتوافق
// على تقديرات دورات مقترحة (محسوبة جوه lib/laha/cycle.ts's detectGapFillers
// — مفيش أي إضافة تلقائية بدون موافقة صريحة) وبتتسجل هنا كـ `estimated:
// true` عشان تفضل واضحة إنها تقدير مش تسجيل فعلي. كل تاريخ بيتحقق منه لوحده
// (صيغة صحيحة + مش في المستقبل) قبل ما يتسجل، وأي تاريخ متسجل بالفعل
// (start_date موجود مسبقًا) بيتجاهل بصمت بدل ما يتكرر.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const dates: string[] = Array.isArray(body.dates) ? body.dates.filter((d: any) => typeof d === "string") : [];
  if (!dates.length) return NextResponse.json({ error: "مفيش تواريخ للإضافة" }, { status: 400 });

  const today = todayISO();
  const valid = [...new Set(dates)].filter((d) => isValidISO(d) && d <= today).slice(0, 20);
  if (!valid.length) return NextResponse.json({ error: "التواريخ غير صالحة" }, { status: 400 });

  // ملاحظة مهمة: بنحط end_date صريح (مش null) للدورات التقديرية دي — لو
  // سبناها null هتظهر كـ"دورة نشطة حاليًا" في منطق الواجهة
  // (`periods.find(p => !p.end_date)`), وده غلط لدورة في الماضي البعيد.
  const periodLength = Math.max(1, Math.min(15, Math.round(Number(body.period_length)) || 5));
  const { data: existing } = await supabaseAdmin.from("laha_periods").select("start_date").eq("user_id", userId).in("start_date", valid);
  const existingSet = new Set((existing || []).map((r: any) => r.start_date));
  const toInsert = valid
    .filter((d) => !existingSet.has(d))
    .map((d) => ({ user_id: userId, start_date: d, end_date: addDays(d, periodLength - 1), estimated: true }));

  if (!toInsert.length) return NextResponse.json({ ok: true, inserted: 0 });

  const { error } = await supabaseAdmin.from("laha_periods").insert(toInsert);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, inserted: toInsert.length });
}
