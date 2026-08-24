import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { runCharityReminderForUser } from "@/lib/reminders";

// Runs daily via Vercel Cron (see vercel.json) as a harmless fallback —
// the shared runCharityReminderForUser() only actually sends if it's been
// 3+ hours since the last one and today isn't muted, so this single daily
// hit just fires once (same as before). The real ~every-3-hours cadence
// happens via /api/cron/tick, pinged hourly by a free external scheduler.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { data: users, error } = await supabaseAdmin
    .from("app_users")
    .select("id,base_currency,telegram_chat_id,charity_amount,charity_frequency,charity_last_reminded_at,charity_muted_date")
    .eq("charity_reminder_enabled", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let notified = 0;
  for (const u of users || []) {
    const r = await runCharityReminderForUser(u);
    if (r.notified) notified++;
  }

  return NextResponse.json({ ok: true, checked: (users || []).length, notified });
}
