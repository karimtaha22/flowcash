import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { runOverdueDebtsForUser, runRecurringRemindersForUser, runCharityReminderForUser } from "@/lib/reminders";

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
      "id,base_currency,telegram_bot_token,telegram_chat_id,charity_amount,charity_frequency,charity_reminder_enabled,charity_last_reminded_at,charity_muted_date,debt_reminder_hour,recurring_reminder_hour"
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: any[] = [];
  for (const u of users || []) {
    if (!u.telegram_bot_token || !u.telegram_chat_id) continue;
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
    if (Object.keys(entry).length > 1) results.push(entry);
  }

  return NextResponse.json({ ok: true, cairo_hour: cairoHour, users_checked: (users || []).length, results });
}
