import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { runRecurringRemindersForUser } from "@/lib/reminders";

// Runs daily via Vercel Cron (see vercel.json) — a harmless fallback that
// checks every user once a day regardless of their preferred hour. See
// overdue-debts/route.ts for why /api/cron/tick is the one that actually
// honors each user's chosen hour (set in /admin).
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { data: users, error } = await supabaseAdmin
    .from("app_users")
    .select("id,telegram_bot_token,telegram_chat_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  for (const u of users || []) {
    const r = await runRecurringRemindersForUser(u);
    sent += r.sent || 0;
  }

  return NextResponse.json({ ok: true, users: (users || []).length, sent });
}
