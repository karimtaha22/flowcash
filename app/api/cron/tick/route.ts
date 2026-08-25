import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  runOverdueDebtsForUser,
  runRecurringRemindersForUser,
  runCharityReminderForUser,
  runZakatReminderForUser,
  runInstallmentRemindersForUser,
  runGam3eyaRemindersForUser,
  runGeneralRemindersForUser,
  runMedicationRemindersForUser,
  runAppointmentRemindersForUser,
  runUtilityInsightForUser,
} from "@/lib/reminders";

// Unified reminder endpoint meant to be pinged HOURLY by a free external
// scheduler (e.g. cron-job.org) — Vercel's own Cron Jobs are capped at
// once/day on the Hobby plan, so they can't drive per-user reminder hours or
// the charity reminder's ~every-3-hours cadence on their own (see
// vercel.json's daily crons, kept as a once-a-day fallback in case the
// external ping ever stops). Protected by the same CRON_SECRET as the other
// /api/cron/* routes — reuse it when setting up the external scheduler.
//
// Each user picks their preferred hour for the debt/recurring reminders in
// /admin (stored as Cairo local time, 0-23); this route only fires those
// checks for a user when the CURRENT Cairo hour matches. Egypt has used a
// fixed UTC+2 offset (no DST) since 2016.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const cairoHour = (new Date().getUTCHours() + 2) % 24;

  const { data: users, error } = await supabaseAdmin
    .from("app_users")
    .select(
      "id,base_currency,telegram_chat_id,telegram_notifications_muted,charity_amount,charity_frequency,charity_reminder_enabled,charity_last_reminded_at,charity_muted_date,debt_reminder_hour,recurring_reminder_hour,hijri_correction_days,zakat_next_due_at,zakat_reminder_enabled,zakat_last_reminded_at,ig_reminders_enabled,ig_reminder_mode,ig_reminder_interval_hours,ig_reminder_hour,ig_last_reminded_at,utility_insight_last_sent_at"
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: any[] = [];
  for (const u of users || []) {
    if (!process.env.TELEGRAM_BOT_TOKEN || !u.telegram_chat_id) continue;
    const entry: any = { user_id: u.id };

    if (cairoHour === (u.debt_reminder_hour ?? 8)) {
      entry.debts = await runOverdueDebtsForUser(u);
    }
    if (cairoHour === (u.recurring_reminder_hour ?? 8)) {
      entry.recurring = await runRecurringRemindersForUser(u);
    }
    if (u.charity_reminder_enabled) {
      entry.charity = await runCharityReminderForUser(u);
    }
    if (u.zakat_reminder_enabled) {
      entry.zakat = await runZakatReminderForUser(u);
    }
    // installments/gam3eyat: من round 21، كل مستخدم بيختار من الإعدادات إما
    // "كل قد إيه" (ig_reminder_interval_hours، افتراضي كل 6 ساعات) أو معاد
    // يومي ثابت (ig_reminder_hour، زي الديون والمتكرر)، أو يقفلها تمامًا
    // (ig_reminders_enabled=false). الجدولة هنا بتتحكم بس في "هل نفحص
    // دلوقتي؟" — الفحص نفسه لسه بيبعت رسالة مرة واحدة بس لكل قسط/دفعة
    // (مضمون عن طريق reminded_2days_at/reminded_due_at في lib/reminders.ts).
    if (u.ig_reminders_enabled !== false) {
      const mode = u.ig_reminder_mode || "interval";
      let shouldCheck = false;
      if (mode === "daily") {
        shouldCheck = cairoHour === (u.ig_reminder_hour ?? 8);
      } else {
        const lastMs = u.ig_last_reminded_at ? new Date(u.ig_last_reminded_at).getTime() : 0;
        const hoursSince = (Date.now() - lastMs) / 3_600_000;
        shouldCheck = hoursSince >= (u.ig_reminder_interval_hours ?? 6);
      }
      if (shouldCheck) {
        entry.installments = await runInstallmentRemindersForUser(u);
        entry.gam3eyat = await runGam3eyaRemindersForUser(u);
        if (mode !== "daily") {
          await supabaseAdmin.from("app_users").update({ ig_last_reminded_at: new Date().toISOString() }).eq("id", u.id);
        }
      }
    }
    // التذكيرات (round 27) — general/medications/appointments are each
    // internally guarded by their own reminded_at-style timestamp, so it's
    // safe (and correct — they're each due at their own specific time, not
    // a per-user daily hour) to check them every single tick.
    entry.generalReminders = await runGeneralRemindersForUser(u);
    entry.medications = await runMedicationRemindersForUser(u);
    entry.appointments = await runAppointmentRemindersForUser(u);
    entry.utilityInsight = await runUtilityInsightForUser(u);

    if (Object.keys(entry).length > 1) results.push(entry);
  }

  return NextResponse.json({ ok: true, cairo_hour: cairoHour, users_checked: (users || []).length, results });
}
