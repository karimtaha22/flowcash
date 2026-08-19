import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendText } from "@/lib/telegram";

// Runs daily via Vercel Cron (see vercel.json). Finds debts overdue by 30+ days
// (based on due_date, or created_at when no due_date is set) that are still
// "open" and haven't been reminded yet, flips them to "overdue", and pings
// the owner on Telegram once. Protected by TELEGRAM_WEBHOOK_SECRET so it
// can't be triggered by randoms hitting the URL.
export async function GET(req: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically when
  // a CRON_SECRET env var is set on the project — add one in Vercel's dashboard
  // (Settings → Environment Variables) for this check to pass on scheduled runs.
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffIso = cutoff.toISOString();

  const { data: debts, error } = await supabaseAdmin
    .from("debts")
    .select("*, people(name), app_users!debts_user_id_fkey(telegram_bot_token, telegram_chat_id, name)")
    .eq("status", "open")
    .is("reminded_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let notified = 0;
  for (const d of debts || []) {
    const basis = d.due_date ? new Date(d.due_date) : new Date(d.created_at);
    if (basis.toISOString() > cutoffIso) continue;

    await supabaseAdmin.from("debts").update({ status: "overdue", reminded_at: new Date().toISOString() }).eq("id", d.id);

    const user = (d as any).app_users as { telegram_bot_token: string | null; telegram_chat_id: string | null; name: string } | null;
    if (user?.telegram_bot_token && user?.telegram_chat_id) {
      const label = d.direction === "owed_to_me" ? "ليك عند" : "عليك لـ";
      try {
        await sendText(
          user.telegram_bot_token,
          user.telegram_chat_id,
          `⏰ تذكير: دين متأخر أكتر من 30 يوم\n${label} ${d.people?.name || "شخص"} — ${d.title}\nالباقي: ${Number(d.remaining_amount).toLocaleString()} ${d.currency}`
        );
        notified++;
      } catch {
        // best-effort notification; don't fail the whole cron run
      }
    }
  }

  return NextResponse.json({ ok: true, checked: (debts || []).length, notified });
}
