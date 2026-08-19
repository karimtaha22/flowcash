import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { tgCall } from "@/lib/telegram";

// Runs daily via Vercel Cron (see vercel.json). For every active recurring
// item whose day_of_month has arrived and hasn't been confirmed or reminded
// this month yet, sends ONE Telegram message with an inline "دفعت" button.
// Tapping it hits the bot webhook's callback handler (recur_paid:<id>), which
// creates the transaction and stamps the item as confirmed for the month —
// nothing is ever auto-deducted.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const now = new Date();
  const monthKey = now.toISOString().slice(0, 7);
  const dayOfMonth = now.getDate();
  const in1Day = dayOfMonth + 1;
  const in2Days = dayOfMonth + 2;

  const { data: all, error } = await supabaseAdmin
    .from("recurring_items")
    .select("*, app_users!recurring_items_user_id_fkey(telegram_bot_token, telegram_chat_id)")
    .eq("is_active", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // last_confirmed_month / last_reminded_month are nullable, and Postgres NULL != x
  // is never true — so this filtering has to happen in JS rather than via .neq().
  const notDoneThisMonth = (all || []).filter(
    (i) => i.last_confirmed_month !== monthKey && i.last_reminded_month !== monthKey
  );

  // heads-up reminders 2 days and 1 day before the due date (informational only, no
  // button, don't stamp last_reminded_month so they never block the due-day ask below)
  const twoDaysBefore = notDoneThisMonth.filter((i) => i.day_of_month === in2Days);
  const oneDayBefore = notDoneThisMonth.filter((i) => i.day_of_month === in1Day);
  // due day (or later, catching up if a previous run was missed) — the real "did you pay?" ask
  const dueToday = notDoneThisMonth.filter((i) => i.day_of_month <= dayOfMonth && i.day_of_month !== in1Day && i.day_of_month !== in2Days);

  let sent = 0;
  const sendHeadsUp = async (item: any, label: string) => {
    const user = item.app_users as { telegram_bot_token: string | null; telegram_chat_id: string | null } | null;
    if (!user?.telegram_bot_token || !user?.telegram_chat_id) return;
    const verb = item.kind === "income" ? `هتستلم مرتبك ${label}` : `عليك دفعة ${label}`;
    try {
      await tgCall(user.telegram_bot_token, "sendMessage", {
        chat_id: user.telegram_chat_id,
        text: `📅 تذكير: ${verb}\n${item.name} — ${Number(item.amount).toLocaleString()} ${item.currency}`,
      });
      sent++;
    } catch {
      // best-effort; keep going for other users/items
    }
  };
  for (const item of twoDaysBefore) await sendHeadsUp(item, "بعد يومين");
  for (const item of oneDayBefore) await sendHeadsUp(item, "بكرة");

  for (const item of dueToday) {
    const user = (item as any).app_users as { telegram_bot_token: string | null; telegram_chat_id: string | null } | null;
    if (!user?.telegram_bot_token || !user?.telegram_chat_id) continue;

    const verb = item.kind === "income" ? "مرتبك نزل؟" : `عليك ${Number(item.amount).toLocaleString()} ${item.currency} الشهر ده`;
    try {
      await tgCall(user.telegram_bot_token, "sendMessage", {
        chat_id: user.telegram_chat_id,
        text: `🔔 ${verb}\n${item.name} — ${Number(item.amount).toLocaleString()} ${item.currency}`,
        reply_markup: { inline_keyboard: [[{ text: item.kind === "income" ? "نزل ✅" : "دفعت ✅", callback_data: `recur_paid:${item.id}` }]] },
      });
      sent++;
    } catch {
      // best-effort; keep going for other users/items
    }
    await supabaseAdmin.from("recurring_items").update({ last_reminded_month: monthKey }).eq("id", item.id);
  }

  return NextResponse.json({ ok: true, twoDaysBefore: twoDaysBefore.length, oneDayBefore: oneDayBefore.length, dueToday: dueToday.length, sent });
}
