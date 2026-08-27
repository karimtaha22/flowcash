import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isValidISO } from "@/lib/laha/dates";
import { APPT_TEXT_FIELDS, APPT_LONG_TEXT_FIELDS, APPT_DATE_FIELDS, APPT_DOCTOR_FIELDS, syncApptWeight } from "@/lib/laha/appointmentFields";

// Round 45 — تعديل كارت متابعة موجود: بيقبل أي مجموعة جزئية من الحقول
// (زي PATCH بتاع app/api/reminders/appointments/[id]/route.ts). لو appt_date
// اتغيّر، بنصفّر مفتاحي التذكير (reminded_at/reminded_same_day_at) عشان
// البوت يفكّرها تاني على الميعاد الجديد — ولو الوزن اتسجل/اتغيّر/اتمسح،
// بنزامنه مع يوميات الوزن (لها > الوزن) عبر syncApptWeight.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const { data: existing } = await supabaseAdmin
    .from("laha_appointments")
    .select("appt_date,maternal_weight_kg")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "الكارت مش موجود" }, { status: 404 });

  const update: Record<string, any> = {};
  if ("title" in body) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return NextResponse.json({ error: "عنوان الموعد مطلوب" }, { status: 400 });
    update.title = title.slice(0, 120);
  }
  if ("appt_date" in body) {
    if (!isValidISO(body.appt_date)) return NextResponse.json({ error: "تاريخ الموعد غير صالح" }, { status: 400 });
    update.appt_date = body.appt_date;
    update.reminded_at = null;
    update.reminded_same_day_at = null;
  }
  if ("appt_time" in body) update.appt_time = typeof body.appt_time === "string" && body.appt_time ? body.appt_time.slice(0, 10) : null;
  if ("notes" in body) update.notes = typeof body.notes === "string" && body.notes ? body.notes.slice(0, 1000) : null;
  if ("image" in body) update.image = typeof body.image === "string" && body.image.startsWith("data:image") ? body.image : null;
  if ("sonar_image" in body) update.sonar_image = typeof body.sonar_image === "string" && body.sonar_image.startsWith("data:image") ? body.sonar_image : null;
  if ("prescription_image" in body) update.prescription_image = typeof body.prescription_image === "string" && body.prescription_image.startsWith("data:image") ? body.prescription_image : null;

  for (const f of APPT_DOCTOR_FIELDS) if (f in body) update[f] = typeof body[f] === "string" && body[f].trim() ? body[f].trim().slice(0, 200) : null;
  for (const f of APPT_TEXT_FIELDS) if (f !== "appt_time" && f in body) update[f] = typeof body[f] === "string" && body[f].trim() ? body[f].trim().slice(0, 200) : null;
  for (const f of APPT_LONG_TEXT_FIELDS) if (f in body) update[f] = typeof body[f] === "string" && body[f].trim() ? body[f].trim().slice(0, 3000) : null;
  for (const f of APPT_DATE_FIELDS) if (f in body) update[f] = typeof body[f] === "string" && isValidISO(body[f]) ? body[f] : null;

  let weightProvided = false;
  let weightKg: number | null = null;
  if ("maternal_weight_kg" in body) {
    weightProvided = true;
    if (body.maternal_weight_kg === null || body.maternal_weight_kg === "") {
      update.maternal_weight_kg = null;
    } else {
      const w = Number(body.maternal_weight_kg);
      if (Number.isFinite(w) && w > 0 && w < 400) { update.maternal_weight_kg = w; weightKg = w; }
      else update.maternal_weight_kg = null;
    }
  }

  const { data, error } = await supabaseAdmin.from("laha_appointments").update(update).eq("id", id).eq("user_id", userId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const dateChanged = "appt_date" in body && update.appt_date !== existing.appt_date;
  const finalApptDate = update.appt_date || existing.appt_date;
  if (weightProvided || (dateChanged && existing.maternal_weight_kg != null)) {
    await syncApptWeight(
      userId,
      finalApptDate,
      weightProvided ? weightKg : existing.maternal_weight_kg,
      dateChanged ? existing.appt_date : null
    );
  }

  return NextResponse.json({ appointment: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data: existing } = await supabaseAdmin
    .from("laha_appointments")
    .select("appt_date,maternal_weight_kg")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  const { error } = await supabaseAdmin.from("laha_appointments").delete().eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Round 45 — لو الكارت المحذوف كان فيه وزن متسجل، امسحي المدخل المتزامن
  // من يوميات الوزن كمان عشان ميفضلش وزن يتيم من كارت اتشال.
  if (existing?.maternal_weight_kg != null) {
    await supabaseAdmin.from("laha_weights").delete().eq("user_id", userId).eq("log_date", existing.appt_date);
  }
  return NextResponse.json({ ok: true });
}
