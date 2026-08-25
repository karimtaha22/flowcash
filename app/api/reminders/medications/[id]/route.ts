import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";
import { computeNextDoseAt } from "@/lib/medicationSchedule";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const { data: current, error: curErr } = await supabaseAdmin.from("medications").select("*").eq("id", id).eq("user_id", userId).single();
  if (curErr || !current) return NextResponse.json({ error: "الدواء غير موجود" }, { status: 404 });

  const update: Record<string, any> = {};
  if ("name" in body) update.name = String(body.name).trim();
  if ("form" in body) update.form = body.form || null;
  if ("pack_size" in body) update.pack_size = body.pack_size ? Number(body.pack_size) : null;
  // "تعبئة العلبة تاني" — resetting remaining_doses above the low-stock
  // threshold clears the alert guard so a future re-drop below it can alert again.
  if ("remaining_doses" in body) {
    update.remaining_doses = body.remaining_doses != null ? Number(body.remaining_doses) : null;
    const threshold = "low_stock_threshold" in body ? Number(body.low_stock_threshold) : current.low_stock_threshold;
    if (update.remaining_doses != null && update.remaining_doses > (threshold ?? 5)) update.low_stock_alerted_at = null;
  }
  if ("reminder_enabled" in body) update.reminder_enabled = !!body.reminder_enabled;
  if ("remind_before_minutes" in body) update.remind_before_minutes = Number(body.remind_before_minutes) || 0;
  if ("low_stock_threshold" in body) update.low_stock_threshold = Number(body.low_stock_threshold) || 2;
  if ("status" in body && ["active", "completed", "cancelled"].includes(body.status)) update.status = body.status;
  if ("note" in body) update.note = body.note || null;
  if ("course_duration_days" in body) update.course_duration_days = body.course_duration_days ? Number(body.course_duration_days) : null;
  if ("group_id" in body) update.group_id = body.group_id || null;

  const SCHEDULE_TYPES = ["meal", "interval", "daily", "weekly", "monthly"];
  const scheduleChanged = "schedule_type" in body || "meal_timing" in body || "interval_hours" in body || "first_dose_at" in body;
  if (scheduleChanged) {
    const scheduleType = "schedule_type" in body ? (SCHEDULE_TYPES.includes(body.schedule_type) ? body.schedule_type : null) : current.schedule_type;
    const mealTiming = "meal_timing" in body ? body.meal_timing || null : current.meal_timing;
    const intervalHours = "interval_hours" in body ? Number(body.interval_hours) || null : current.interval_hours;
    const firstDoseAt = "first_dose_at" in body ? body.first_dose_at || null : current.first_dose_at;
    update.schedule_type = scheduleType;
    update.meal_timing = scheduleType === "meal" ? mealTiming : null;
    update.interval_hours = scheduleType === "interval" ? intervalHours : null;
    update.first_dose_at = firstDoseAt;
    update.next_dose_at = scheduleType ? computeNextDoseAt(scheduleType, mealTiming, intervalHours, new Date(), firstDoseAt).toISOString() : null;
    update.last_dose_reminded_at = null;
  }

  const { data, error } = await supabaseAdmin.from("medications").update(update).eq("id", id).eq("user_id", userId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ medication: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await supabaseAdmin.from("medical_appointments").update({ medication_id: null }).eq("medication_id", id).eq("user_id", userId);
  const { error } = await supabaseAdmin.from("medications").delete().eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
