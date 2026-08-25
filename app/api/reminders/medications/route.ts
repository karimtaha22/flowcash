import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";
import { computeNextDoseAt } from "@/lib/medicationSchedule";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await supabaseAdmin.from("medications").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ medications: data });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "اسم الدواء مطلوب" }, { status: 400 });

  const scheduleType = body.schedule_type === "interval" ? "interval" : body.schedule_type === "meal" ? "meal" : null;
  const nextDoseAt = scheduleType ? computeNextDoseAt(scheduleType, body.meal_timing, Number(body.interval_hours) || null) : null;

  const { data, error } = await supabaseAdmin
    .from("medications")
    .insert({
      user_id: userId,
      name,
      form: body.form || null,
      pack_size: body.pack_size ? Number(body.pack_size) : null,
      remaining_doses: body.pack_size ? Number(body.pack_size) : null,
      schedule_type: scheduleType,
      meal_timing: scheduleType === "meal" ? body.meal_timing || null : null,
      interval_hours: scheduleType === "interval" ? Number(body.interval_hours) || null : null,
      reminder_enabled: body.reminder_enabled !== false,
      remind_before_minutes: Number(body.remind_before_minutes) || 0,
      low_stock_threshold: body.low_stock_threshold != null ? Number(body.low_stock_threshold) : 5,
      next_dose_at: nextDoseAt ? nextDoseAt.toISOString() : null,
      source: body.source === "telegram" ? "telegram" : "app",
      note: body.note || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ medication: data });
}
