import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isValidISO } from "@/lib/laha/dates";
import { APPT_TEXT_FIELDS, APPT_LONG_TEXT_FIELDS, APPT_DATE_FIELDS, APPT_DOCTOR_FIELDS, syncApptWeight } from "@/lib/laha/appointmentFields";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await supabaseAdmin.from("laha_appointments").select("*").eq("user_id", userId).order("appt_date", { ascending: false });
  return NextResponse.json({ appointments: data || [] });
}

// image/sonar_image/prescription_image (لو موجودين) متوقّعين data URL جاهزة
// اتضغطت client-side بـ lib/image.ts's shrinkImage — نفس الأسلوب المتبع في
// باقي التطبيق (صور الشهود/الروشتات) بدل تخزين سحابي منفصل.
//
// Round 45 — "كارت المتابعة" بقى كارت زيارة طبية كامل (راجع
// lib/laha/appointmentFields.ts للحقول الـ٢٩). الحجز الأول بيبقى بس
// appt_date/appt_time/title، وباقي الحقول الطبية بتتسجل بعدين (PATCH) وقت/بعد
// الزيارة الفعلية — لكن POST هنا بيقبلهم كلهم كمان عشان لو المستخدمة حبت
// تسجلهم من أول مرة.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const apptDate = body.appt_date;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!isValidISO(apptDate)) return NextResponse.json({ error: "تاريخ الموعد غير صالح" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "عنوان الموعد مطلوب" }, { status: 400 });

  const row: Record<string, any> = {
    user_id: userId,
    appt_date: apptDate,
    title: title.slice(0, 120),
    notes: typeof body.notes === "string" ? body.notes.slice(0, 1000) : null,
    image: typeof body.image === "string" && body.image.startsWith("data:image") ? body.image : null,
    sonar_image: typeof body.sonar_image === "string" && body.sonar_image.startsWith("data:image") ? body.sonar_image : null,
    prescription_image: typeof body.prescription_image === "string" && body.prescription_image.startsWith("data:image") ? body.prescription_image : null,
    appt_time: typeof body.appt_time === "string" && body.appt_time ? body.appt_time.slice(0, 10) : null,
  };
  for (const f of APPT_DOCTOR_FIELDS) if (typeof body[f] === "string" && body[f].trim()) row[f] = body[f].trim().slice(0, 200);
  for (const f of APPT_TEXT_FIELDS) if (f !== "appt_time" && typeof body[f] === "string" && body[f].trim()) row[f] = body[f].trim().slice(0, 200);
  for (const f of APPT_LONG_TEXT_FIELDS) if (typeof body[f] === "string" && body[f].trim()) row[f] = body[f].trim().slice(0, 3000);
  for (const f of APPT_DATE_FIELDS) if (typeof body[f] === "string" && isValidISO(body[f])) row[f] = body[f];

  let maternalWeightKg: number | null = null;
  if (body.maternal_weight_kg !== undefined && body.maternal_weight_kg !== null && body.maternal_weight_kg !== "") {
    const w = Number(body.maternal_weight_kg);
    if (Number.isFinite(w) && w > 0 && w < 400) { row.maternal_weight_kg = w; maternalWeightKg = w; }
  }

  const { data, error } = await supabaseAdmin.from("laha_appointments").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (maternalWeightKg) await syncApptWeight(userId, apptDate, maternalWeightKg);
  return NextResponse.json({ appointment: data });
}
