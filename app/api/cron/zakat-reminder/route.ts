import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { runZakatReminderForUser } from "@/lib/reminders";

// Runs daily via Vercel Cron (see vercel.json) — a harmless fallback in case
// the external hourly ping to /api/cron/tick isn't set up; runZakatReminderForUser
// already guards against re-notifying more than once a day.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { data: users, error } = await supabaseAdmin
    .from("app_users")
    .select("id,telegram_chat_id,hijri_correction_days,zakat_next_due_at,zakat_reminder_enabled,zakat_last_reminded_at")
    .eq("zakat_reminder_enabled", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let notified = 0;
  for (const u of users || []) {
    const r = await runZakatReminderForUser(u);
    if (r.notified) notified++;
  }

  return NextResponse.json({ ok: true, checked: (users || []).length, notified });
}
