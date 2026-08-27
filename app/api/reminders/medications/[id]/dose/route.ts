import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";
import { computeNextDoseAt } from "@/lib/medicationSchedule";

// "اتاخدت" — logs one dose as taken: decrements remaining_doses, advances
// next_dose_at, and clears last_dose_reminded_at so the NEXT dose can alert
// again (mirrors the Telegram"اتاخدت"callback in lib/telegramBot.ts,
// which does the exact same update for a dose logged from the bot instead).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const { data: med, error: medErr } = await supabaseAdmin.from("medications").select("*").eq("id", id).eq("user_id", userId).single();
  if (medErr || !med) return NextResponse.json({ error: "الدواء غير موجود" }, { status: 404 });

  const newRemaining = med.remaining_doses !== null ? Math.max(0, med.remaining_doses - 1) : null;
  const nowIso = new Date().toISOString();
  const nextDose = med.schedule_type ? computeNextDoseAt(med.schedule_type, med.meal_timing, med.interval_hours, new Date(), med.first_dose_at) : null;

  const { data, error } = await supabaseAdmin
    .from("medications")
    .update({
      remaining_doses: newRemaining,
      last_dose_at: nowIso,
      next_dose_at: nextDose ? nextDose.toISOString() : null,
      last_dose_reminded_at: null,
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ medication: data });
}
