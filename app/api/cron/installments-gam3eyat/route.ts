import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { runInstallmentRemindersForUser, runGam3eyaRemindersForUser } from "@/lib/reminders";

// Runs daily via Vercel Cron (see vercel.json) — a harmless once-a-day
// fallback in case the external hourly ping to /api/cron/tick ever stops
// (same role as the other app/api/cron/* routes). /api/cron/tick already
// covers this hourly and is the primary path in normal operation.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { data: users, error } = await supabaseAdmin.from("app_users").select("id,telegram_chat_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let installmentsSent = 0;
  let gam3eyatSent = 0;
  for (const u of users || []) {
    installmentsSent += (await runInstallmentRemindersForUser(u)).sent;
    gam3eyatSent += (await runGam3eyaRemindersForUser(u)).sent;
  }

  return NextResponse.json({ ok: true, installmentsSent, gam3eyatSent });
}
