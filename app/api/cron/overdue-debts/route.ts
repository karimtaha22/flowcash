import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { runOverdueDebtsForUser } from "@/lib/reminders";

// Runs daily via Vercel Cron (see vercel.json) — a harmless fallback that
// checks every user once a day regardless of their preferred hour. The
// per-user preferred hour (set in /admin) is honored by /api/cron/tick
// instead, which an external hourly scheduler pings (Vercel Hobby caps
// its own cron at once/day, so it can't respect a per-user hour itself).
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { data: users, error } = await supabaseAdmin
    .from("app_users")
    .select("id,telegram_chat_id,telegram_notifications_muted");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let checked = 0;
  let notified = 0;
  for (const u of users || []) {
    const r = await runOverdueDebtsForUser(u);
    checked += r.checked;
    notified += r.notified;
  }

  return NextResponse.json({ ok: true, checked, notified });
}
