import { supabaseAdmin } from "./supabaseAdmin";
import { sendText, tgCall } from "./telegram";
import { formatHijriFromDate } from "./hijri";

// Shared, per-user reminder logic used by BOTH the daily vercel.json crons
// (a harmless once-a-day-at-a-fixed-hour fallback — Vercel Hobby can't run
// cron more than once/day) and /api/cron/tick (an hourly ping from a free
// external scheduler like cron-job.org, which lets each user pick their own
// hour, and lets charity reminders repeat every ~3 hours instead of daily).

interface ReminderUser {
  id: string;
  name?: string | null;
  base_currency?: string | null;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
}

// ---------------- overdue debts ----------------
// Fires once per debt (guarded by reminded_at, not by day/hour) — the hour
// preference only controls WHEN during the day this check runs for the user.
export async function runOverdueDebtsForUser(user: ReminderUser) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffIso = cutoff.toISOString();

  const { data: debts, error } = await supabaseAdmin
    .from("debts")
    .select("*, people(name)")
    .eq("user_id", user.id)
    .eq("status", "open")
    .is("reminded_at", null);
  if (error || !debts) return { checked: 0, notified: 0 };

  let notified = 0;
  for (const d of debts) {
    const basis = d.due_date ? new Date(d.due_date) : new Date(d.created_at);
    if (basis.toISOString() > cutoffIso) continue;

    await supabaseAdmin.from("debts").update({ status: "overdue", reminded_at: new Date().toISOString() }).eq("id", d.id);

    if (user.telegram_bot_token && user.telegram_chat_id) {
      const label = d.direction === "owed_to_me" ? "ليك عند" : "عليك لـ";
      try {
        await sendText(
          user.telegram_bot_token,
          user.telegram_chat_id,
          `⏰ تذكير: دين متأخر أكتر من 30 يوم\n${label} ${d.people?.name || "شخص"} — ${d.title}\nالباقي: ${Number(d.remaining_amount).toLocaleString()} ${d.currency}`
        );
        notified++;
      } catch {
        // best-effort; keep going
      }
    }
  }
  return { checked: debts.length, notified };
}

// ---------------- recurring items ----------------
// Fires once per item per month (guarded by last_confirmed_month /
// last_reminded_month) — same hour-only-controls-timing note as above.
export async function runRecurringRemindersForUser(user: ReminderUser) {
  if (!user.telegram_bot_token || !user.telegram_chat_id) return { sent: 0 };

  const now = new Date();
  const monthKey = now.toISOString().slice(0, 7);
  const dayOfMonth = now.getDate();
  const in1Day = dayOfMonth + 1;
  const in2Days = dayOfMonth + 2;

  const { data: all, error } = await supabaseAdmin
    .from("recurring_items")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true);
  if (error || !all) return { sent: 0 };

  const notDoneThisMonth = all.filter((i) => i.last_confirmed_month !== monthKey && i.last_reminded_month !== monthKey);
  const twoDaysBefore = notDoneThisMonth.filter((i) => i.day_of_month === in2Days);
  const oneDayBefore = notDoneThisMonth.filter((i) => i.day_of_month === in1Day);
  const dueToday = notDoneThisMonth.filter((i) => i.day_of_month <= dayOfMonth && i.day_of_month !== in1Day && i.day_of_month !== in2Days);

  let sent = 0;
  const sendHeadsUp = async (item: any, label: string) => {
    const verb = item.kind === "income" ? `هتستلم مرتبك ${label}` : `عليك دفعة ${label}`;
    try {
      await tgCall(user.telegram_bot_token as string, "sendMessage", {
        chat_id: user.telegram_chat_id,
        text: `📅 تذكير: ${verb}\n${item.name} — ${Number(item.amount).toLocaleString()} ${item.currency}`,
      });
      sent++;
    } catch {
      // best-effort
    }
  };
  for (const item of twoDaysBefore) await sendHeadsUp(item, "بعد يومين");
  for (const item of oneDayBefore) await sendHeadsUp(item, "بكرة");

  for (const item of dueToday) {
    const verb = item.kind === "income" ? "مرتبك نزل؟" : `عليك ${Number(item.amount).toLocaleString()} ${item.currency} الشهر ده`;
    try {
      await tgCall(user.telegram_bot_token as string, "sendMessage", {
        chat_id: user.telegram_chat_id,
        text: `🔔 ${verb}\n${item.name} — ${Number(item.amount).toLocaleString()} ${item.currency}`,
        reply_markup: { inline_keyboard: [[{ text: item.kind === "income" ? "نزل ✅" : "دفعت ✅", callback_data: `recur_paid:${item.id}` }]] },
      });
      sent++;
    } catch {
      // best-effort
    }
    await supabaseAdmin.from("recurring_items").update({ last_reminded_month: monthKey }).eq("id", item.id);
  }

  return { twoDaysBefore: twoDaysBefore.length, oneDayBefore: oneDayBefore.length, dueToday: dueToday.length, sent };
}

// ---------------- charity reminder ----------------
// Cadence-based (every ~3h) rather than once/day, gated by charity_last_reminded_at
// and skippable for the rest of the day via charity_muted_date ("تم إخراج الصدقة").
interface CharityUser extends ReminderUser {
  charity_amount: number | null;
  charity_frequency: string | null;
  charity_last_reminded_at: string | null;
  charity_muted_date: string | null;
}

export async function runCharityReminderForUser(user: CharityUser) {
  if (!user.telegram_bot_token || !user.telegram_chat_id) return { notified: false, reason: "no_telegram" };

  const todayIso = new Date().toISOString().slice(0, 10);
  if (user.charity_muted_date === todayIso) return { notified: false, reason: "muted" };

  const lastMs = user.charity_last_reminded_at ? new Date(user.charity_last_reminded_at).getTime() : 0;
  const hoursSince = (Date.now() - lastMs) / 3_600_000;
  if (hoursSince < 3) return { notified: false, reason: "too_soon" };

  const amountLine = user.charity_amount
    ? `\n💚 قيمة الصدقة اللي حددتها: ${Number(user.charity_amount).toLocaleString()} ${user.base_currency || "EGP"} (${user.charity_frequency === "monthly" ? "شهريًا" : "يوميًا"})`
    : "";
  const text =
    `🌙 لا تنسَ صدقة اليوم${amountLine}\n\n` +
    `"مَا نَقَصَ مَالُ عَبدٍ مِن صَدَقَةٍ"\n\n` +
    `"وَمَا أَنفَقْتُم مِّن شَيْءٍ فَهُوَ يُخْلِفُهُ وَهُوَ خَيْرُ الرَّازِقِينَ" {سبأ:39}`;

  try {
    await sendText(user.telegram_bot_token, user.telegram_chat_id, text);
    await supabaseAdmin.from("app_users").update({ charity_last_reminded_at: new Date().toISOString() }).eq("id", user.id);
    return { notified: true };
  } catch {
    return { notified: false, reason: "send_failed" };
  }
}

// ---------------- zakat due-date reminder ----------------
// Set by "احفظ الزكاة" in صدقات وزكاة (see /api/zakat) — reminds once as the
// due date (one Hijri year after the last recorded payment) gets close, then
// again if the day itself arrives unconfirmed. Guarded by zakat_last_reminded_at
// so it doesn't repeat every single tick once triggered for a given window.
interface ZakatUser extends ReminderUser {
  hijri_correction_days?: number | null;
  zakat_next_due_at: string | null;
  zakat_reminder_enabled: boolean | null;
  zakat_last_reminded_at: string | null;
}

const ZAKAT_REMINDER_WINDOW_DAYS = 7;
// re-notify at most once every this many hours once inside the reminder window
const ZAKAT_REMINDER_REPEAT_HOURS = 24;

export async function runZakatReminderForUser(user: ZakatUser) {
  if (!user.telegram_bot_token || !user.telegram_chat_id) return { notified: false, reason: "no_telegram" };
  if (!user.zakat_reminder_enabled || !user.zakat_next_due_at) return { notified: false, reason: "not_set" };

  const dueDate = new Date(user.zakat_next_due_at + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntil = Math.round((dueDate.getTime() - today.getTime()) / 86_400_000);

  if (daysUntil > ZAKAT_REMINDER_WINDOW_DAYS) return { notified: false, reason: "too_early" };

  const lastMs = user.zakat_last_reminded_at ? new Date(user.zakat_last_reminded_at).getTime() : 0;
  const hoursSince = (Date.now() - lastMs) / 3_600_000;
  if (hoursSince < ZAKAT_REMINDER_REPEAT_HOURS) return { notified: false, reason: "too_soon" };

  const correctionDays = Number(user.hijri_correction_days) || 0;
  const hijriLabel = formatHijriFromDate(dueDate, correctionDays);
  const whenLine =
    daysUntil > 0 ? `باقي ${daysUntil} يوم على معاد زكاتك (${hijriLabel})` : daysUntil === 0 ? `النهاردة معاد زكاتك (${hijriLabel})` : `فات معاد زكاتك (${hijriLabel}) من ${Math.abs(daysUntil)} يوم — لسه محتاج تخرجها`;

  const text = `🕌 تذكير الزكاة\n${whenLine}\n\nافتح تبويب "صدقات وزكاة" في التطبيق عشان تحسبها وتخرجها، وبعدها احفظ التاريخ عشان يتحسب معاد السنة الجاية.`;

  try {
    await sendText(user.telegram_bot_token, user.telegram_chat_id, text);
    await supabaseAdmin.from("app_users").update({ zakat_last_reminded_at: new Date().toISOString() }).eq("id", user.id);
    return { notified: true, daysUntil };
  } catch {
    return { notified: false, reason: "send_failed" };
  }
}
