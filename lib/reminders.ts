import { supabaseAdmin } from "./supabaseAdmin";
import { sendText, tgCall } from "./telegram";
import { formatHijriFromDate } from "./hijri";
import { isConfirmedForCurrentPeriod } from "./recurringPeriod";
import { getISOWeek, getISOWeekYear } from "date-fns";

// Shared, per-user reminder logic used by BOTH the daily vercel.json crons
// (a harmless once-a-day-at-a-fixed-hour fallback — Vercel Hobby can't run
// cron more than once/day) and /api/cron/tick (an hourly ping from a free
// external scheduler like cron-job.org, which lets each user pick their own
// hour, and lets charity reminders repeat every ~3 hours instead of daily).

interface ReminderUser {
  id: string;
  name?: string | null;
  base_currency?: string | null;
  telegram_chat_id: string | null;
  telegram_notifications_muted?: boolean | null;
}

// كتم عام من زرار "🔕 كتم/تفعيل تنبيهات البوت" — بيوقف كل رسالة استباقية
// (بتبعتها الكرون) لحد ما المستخدم يشغّلها تاني، بدون ما يأثر على أي حاجة
// جوه التطبيق نفسه (جرس التنبيهات لسه بيشتغل عادي لأنه مش مربوط بالبوت).
const isMuted = (user: ReminderUser) => !!user.telegram_notifications_muted;

// One shared bot for every customer now (see the "بوت مركزي" migration
// notes in app/api/telegram/webhook/route.ts) — every send below used to
// take user.telegram_bot_token; now they all use this instead.
const botToken = () => (process.env.TELEGRAM_BOT_TOKEN || "").trim();

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

    if (botToken() && user.telegram_chat_id && !isMuted(user)) {
      const label = d.direction === "owed_to_me" ? "ليك عند" : "عليك لـ";
      try {
        await sendText(
          botToken(),
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
// Each item's cadence now depends on its frequency: monthly (day_of_month,
// with 2-day/1-day advance heads-up — the original behavior), weekly
// (day_of_week, reminded once per ISO week), or daily (reminded once per
// day it hasn't been confirmed). last_reminded_month is reused as a generic
// "already reminded for this period" guard across all three — for
// daily/weekly items it holds a day-key/week-key instead of a month-key,
// which is fine since it's only ever compared for equality against a
// freshly computed key of the same shape.
export async function runRecurringRemindersForUser(user: ReminderUser) {
  if (!botToken() || !user.telegram_chat_id || isMuted(user)) return { sent: 0 };

  const now = new Date();
  const monthKey = now.toISOString().slice(0, 7);
  const todayKey = now.toISOString().slice(0, 10);
  const dayOfMonth = now.getDate();
  const in1Day = dayOfMonth + 1;
  const in2Days = dayOfMonth + 2;
  const todayDow = now.getDay();
  const weekKey = `${getISOWeekYear(now)}-W${getISOWeek(now)}`;

  const { data: all, error } = await supabaseAdmin
    .from("recurring_items")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_active", true);
  if (error || !all) return { sent: 0 };

  let sent = 0;
  const sendHeadsUp = async (item: any, label: string) => {
    const verb = item.kind === "income" ? `هتستلم مرتبك ${label}` : `عليك دفعة ${label}`;
    try {
      await tgCall(botToken(), "sendMessage", {
        chat_id: user.telegram_chat_id,
        text: `📅 تذكير: ${verb}\n${item.name} — ${Number(item.amount).toLocaleString()} ${item.currency}`,
      });
      sent++;
    } catch {
      // best-effort
    }
  };
  const sendDueNow = async (item: any, guardKey: string) => {
    const verb = item.kind === "income" ? "مرتبك نزل؟" : `عليك ${Number(item.amount).toLocaleString()} ${item.currency}`;
    try {
      await tgCall(botToken(), "sendMessage", {
        chat_id: user.telegram_chat_id,
        text: `🔔 ${verb}\n${item.name} — ${Number(item.amount).toLocaleString()} ${item.currency}`,
        reply_markup: { inline_keyboard: [[{ text: item.kind === "income" ? "نزل ✅" : "دفعت ✅", callback_data: `recur_paid:${item.id}` }]] },
      });
      sent++;
    } catch {
      // best-effort
    }
    await supabaseAdmin.from("recurring_items").update({ last_reminded_month: guardKey }).eq("id", item.id);
  };

  // items with a custom cadence (every N days/weeks/months, N>1) don't fit the
  // calendar-period-key logic below — they're handled separately via
  // isConfirmedForCurrentPeriod's elapsed-time math instead.
  const isCustomInterval = (i: any) => (Math.floor(Number(i.interval_count)) || 1) > 1;

  const monthlyItems = all.filter((i) => (i.frequency || "monthly") === "monthly" && !isCustomInterval(i));
  const weeklyItems = all.filter((i) => i.frequency === "weekly" && !isCustomInterval(i));
  const dailyItems = all.filter((i) => i.frequency === "daily" && !isCustomInterval(i));
  const customItems = all.filter(isCustomInterval);

  // ----- monthly (original day_of_month-based cadence, unchanged) -----
  const notDoneThisMonth = monthlyItems.filter((i) => i.last_confirmed_month !== monthKey && i.last_reminded_month !== monthKey);
  const twoDaysBefore = notDoneThisMonth.filter((i) => i.day_of_month === in2Days);
  const oneDayBefore = notDoneThisMonth.filter((i) => i.day_of_month === in1Day);
  const dueTodayMonthly = notDoneThisMonth.filter((i) => i.day_of_month <= dayOfMonth && i.day_of_month !== in1Day && i.day_of_month !== in2Days);
  for (const item of twoDaysBefore) await sendHeadsUp(item, "بعد يومين");
  for (const item of oneDayBefore) await sendHeadsUp(item, "بكرة");
  for (const item of dueTodayMonthly) await sendDueNow(item, monthKey);

  // ----- weekly: remind on the chosen weekday if not confirmed since this ISO week -----
  const dueWeekly = weeklyItems.filter((i) => {
    if (i.day_of_week === null || i.day_of_week === undefined || i.day_of_week !== todayDow) return false;
    if (i.last_reminded_month === weekKey) return false;
    if (i.last_confirmed_date) {
      const c = new Date(i.last_confirmed_date + "T00:00:00");
      if (`${getISOWeekYear(c)}-W${getISOWeek(c)}` === weekKey) return false;
    }
    return true;
  });
  for (const item of dueWeekly) await sendDueNow(item, weekKey);

  // ----- daily: remind every day it hasn't been confirmed yet -----
  const dueDaily = dailyItems.filter((i) => i.last_confirmed_date !== todayKey && i.last_reminded_month !== todayKey);
  for (const item of dueDaily) await sendDueNow(item, todayKey);

  // ----- custom interval (every N days/weeks/months) -----
  const dueCustom = customItems.filter((i) => !isConfirmedForCurrentPeriod(i, now) && i.last_reminded_month !== todayKey);
  for (const item of dueCustom) await sendDueNow(item, todayKey);

  return {
    twoDaysBefore: twoDaysBefore.length,
    oneDayBefore: oneDayBefore.length,
    dueToday: dueTodayMonthly.length + dueWeekly.length + dueDaily.length + dueCustom.length,
    sent,
  };
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
  if (!botToken() || !user.telegram_chat_id) return { notified: false, reason: "no_telegram" };
  if (isMuted(user)) return { notified: false, reason: "muted" };

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
    await tgCall(botToken(), "sendMessage", {
      chat_id: user.telegram_chat_id,
      text,
      reply_markup: { inline_keyboard: [[{ text: "✅ تم إخراج الصدقة", callback_data: "charity_mute" }]] },
    });
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

// ---------------- installment (أقساط) reminders ----------------
// Two heads-up messages per installment: 2 days before due_date, then again
// on due_date itself with a "✅ تم الدفع" inline button (handled in
// lib/telegramBot.ts's installment_paid callback) — mirrors the recurring-item
// reminder pattern. Guarded by reminded_2days_at/reminded_due_at so each
// installment only ever gets each message once, regardless of how many
// times /api/cron/tick fires in a day.
export async function runInstallmentRemindersForUser(user: ReminderUser) {
  if (!botToken() || !user.telegram_chat_id || isMuted(user)) return { sent: 0 };

  const todayIso = new Date().toISOString().slice(0, 10);
  const in2Days = new Date();
  in2Days.setDate(in2Days.getDate() + 2);
  const in2DaysIso = in2Days.toISOString().slice(0, 10);

  const { data: plans } = await supabaseAdmin
    .from("installment_plans")
    .select("id,item_name,company_name,currency,status,installment_payments(id,month_index,due_date,amount,status,reminded_2days_at,reminded_due_at)")
    .eq("user_id", user.id)
    .eq("status", "active");

  let sent = 0;
  for (const plan of plans || []) {
    for (const p of (plan as any).installment_payments || []) {
      if (p.status !== "pending") continue;

      if (p.due_date === in2DaysIso && !p.reminded_2days_at) {
        try {
          await tgCall(botToken(), "sendMessage", {
            chat_id: user.telegram_chat_id,
            text: `📅 تذكير: باقي يومين على قسط "${plan.item_name}"${plan.company_name ? ` (${plan.company_name})` : ""}\nالمبلغ: ${Number(p.amount).toLocaleString()} ${plan.currency}`,
          });
          sent++;
        } catch {
          // best-effort
        }
        await supabaseAdmin.from("installment_payments").update({ reminded_2days_at: new Date().toISOString() }).eq("id", p.id);
      }

      if (p.due_date <= todayIso && !p.reminded_due_at) {
        try {
          await tgCall(botToken(), "sendMessage", {
            chat_id: user.telegram_chat_id,
            text: `🔔 قسط "${plan.item_name}"${plan.company_name ? ` (${plan.company_name})` : ""} مستحق${p.due_date < todayIso ? " ومتأخر" : " النهاردة"}\nالمبلغ: ${Number(p.amount).toLocaleString()} ${plan.currency}`,
            reply_markup: { inline_keyboard: [[{ text: "✅ تم الدفع", callback_data: `installment_paid:${p.id}` }]] },
          });
          sent++;
        } catch {
          // best-effort
        }
        await supabaseAdmin.from("installment_payments").update({ reminded_due_at: new Date().toISOString() }).eq("id", p.id);
      }
    }
  }
  return { sent };
}

// ---------------- gam3eya (جمعيات) reminders ----------------
// Same 2-days-before + due-day pattern as installments, for every pending
// gam3eya_payments row (both "subscribed" — the user's own monthly
// contribution — and "organizing" — each participant's row, sent to the
// organizer since participants aren't FlowCash users themselves).
export async function runGam3eyaRemindersForUser(user: ReminderUser) {
  if (!botToken() || !user.telegram_chat_id || isMuted(user)) return { sent: 0 };

  const todayIso = new Date().toISOString().slice(0, 10);
  const in2Days = new Date();
  in2Days.setDate(in2Days.getDate() + 2);
  const in2DaysIso = in2Days.toISOString().slice(0, 10);

  const { data: gam3eyat } = await supabaseAdmin
    .from("gam3eyas")
    .select(
      "id,type,name,currency,status,gam3eya_payments(id,participant_id,month_index,due_date,amount,status,reminded_2days_at,reminded_due_at,gam3eya_participants(name))"
    )
    .eq("user_id", user.id)
    .eq("status", "active");

  let sent = 0;
  for (const g of gam3eyat || []) {
    const label = (g as any).name || (g.type === "subscribed" ? "الجمعية اللي مشترك فيها" : "الجمعية اللي بتديرها");
    for (const p of (g as any).gam3eya_payments || []) {
      if (p.status !== "pending") continue;
      const who = p.gam3eya_participants?.name ? ` — ${p.gam3eya_participants.name}` : "";

      if (p.due_date === in2DaysIso && !p.reminded_2days_at) {
        try {
          await tgCall(botToken(), "sendMessage", {
            chat_id: user.telegram_chat_id,
            text: `📅 باقي يومين على دفعة في "${label}"${who}\nالمبلغ: ${Number(p.amount).toLocaleString()} ${g.currency}`,
          });
          sent++;
        } catch {
          // best-effort
        }
        await supabaseAdmin.from("gam3eya_payments").update({ reminded_2days_at: new Date().toISOString() }).eq("id", p.id);
      }

      if (p.due_date <= todayIso && !p.reminded_due_at) {
        const when = p.due_date < todayIso ? "دفعة متأخرة" : "دفعة النهاردة";
        try {
          await tgCall(botToken(), "sendMessage", {
            chat_id: user.telegram_chat_id,
            text: `🔔 ${when} في "${label}"${who}\nالمبلغ: ${Number(p.amount).toLocaleString()} ${g.currency}`,
            reply_markup: { inline_keyboard: [[{ text: "✅ تم الدفع", callback_data: `gam3eya_paid:${p.id}` }]] },
          });
          sent++;
        } catch {
          // best-effort
        }
        await supabaseAdmin.from("gam3eya_payments").update({ reminded_due_at: new Date().toISOString() }).eq("id", p.id);
      }
    }
  }
  return { sent };
}

export async function runZakatReminderForUser(user: ZakatUser) {
  if (!botToken() || !user.telegram_chat_id) return { notified: false, reason: "no_telegram" };
  if (isMuted(user)) return { notified: false, reason: "muted" };
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
    await sendText(botToken(), user.telegram_chat_id, text);
    await supabaseAdmin.from("app_users").update({ zakat_last_reminded_at: new Date().toISOString() }).eq("id", user.id);
    return { notified: true, daysUntil };
  } catch {
    return { notified: false, reason: "send_failed" };
  }
}

// ================= التذكيرات (round 27) =================

// ---------------- general reminders ----------------
// Fires once per reminder at its own remind_at (not tied to a per-user hour
// preference like debts/recurring — a general reminder's whole point is a
// specific date+time the user picked). Guarded by reminded_at, cleared
// whenever the reminder is rescheduled or re-activated (see
// PATCH /api/reminders/general/[id]).
// كل قد إيه (Round 29) — "أبدا" (none, the default) fires once then guards
// via reminded_at forever (unchanged behavior); daily/weekly/monthly instead
// ADVANCES remind_at to the next occurrence and clears reminded_at, so the
// same reminder keeps firing on schedule instead of needing to be re-created
// every time. The next occurrence is computed from the reminder's own
// remind_at (not "now") so a fixed time-of-day doesn't drift even if a tick
// runs a bit late.
function nextRepeatAt(remindAt: string, freq: string): string | null {
  const d = new Date(remindAt);
  if (freq === "daily") d.setDate(d.getDate() + 1);
  else if (freq === "weekly") d.setDate(d.getDate() + 7);
  else if (freq === "monthly") d.setMonth(d.getMonth() + 1);
  else return null;
  return d.toISOString();
}

export async function runGeneralRemindersForUser(user: ReminderUser) {
  if (!botToken() || !user.telegram_chat_id || isMuted(user)) return { sent: 0 };
  const nowIso = new Date().toISOString();
  const { data: reminders } = await supabaseAdmin
    .from("general_reminders")
    .select("id,title,remind_at,repeat_frequency")
    .eq("user_id", user.id)
    .eq("status", "active")
    .is("reminded_at", null)
    .not("remind_at", "is", null)
    .lte("remind_at", nowIso);

  let sent = 0;
  for (const r of reminders || []) {
    try {
      await sendText(botToken(), user.telegram_chat_id, `🔔 تذكير: ${r.title}`);
      sent++;
    } catch {
      // best-effort
    }
    const next = r.remind_at ? nextRepeatAt(r.remind_at, r.repeat_frequency || "none") : null;
    if (next) {
      // recurring — roll forward instead of permanently guarding.
      await supabaseAdmin.from("general_reminders").update({ remind_at: next, reminded_at: null }).eq("id", r.id);
    } else {
      await supabaseAdmin.from("general_reminders").update({ reminded_at: nowIso }).eq("id", r.id);
    }
  }
  return { sent };
}

// ---------------- medications: dose-due + low-stock ----------------
// Two independent guarded checks per medication per tick:
//   - dose due: fires remind_before_minutes ahead of next_dose_at, guarded
//     by last_dose_reminded_at === next_dose_at (so it fires exactly once per
//     dose, and automatically re-arms once next_dose_at advances after the
//     dose is logged — see computeNextDoseAt in lib/medicationSchedule.ts).
//   - low stock: fires once when remaining_doses drops to/under
//     low_stock_threshold, guarded by low_stock_alerted_at (cleared when the
//     pack is refilled above the threshold — see PATCH .../medications/[id]).
export async function runMedicationRemindersForUser(user: ReminderUser) {
  if (!botToken() || !user.telegram_chat_id || isMuted(user)) return { sent: 0 };
  const now = new Date();

  const { data: meds } = await supabaseAdmin
    .from("medications")
    .select("id,name,remaining_doses,low_stock_threshold,low_stock_alerted_at,reminder_enabled,remind_before_minutes,next_dose_at,last_dose_reminded_at")
    .eq("user_id", user.id)
    .eq("status", "active");

  let sent = 0;
  for (const m of meds || []) {
    if (m.reminder_enabled && m.next_dose_at && m.last_dose_reminded_at !== m.next_dose_at) {
      const doseAt = new Date(m.next_dose_at);
      const alertAt = new Date(doseAt.getTime() - (m.remind_before_minutes || 0) * 60_000);
      if (now >= alertAt) {
        try {
          await tgCall(botToken(), "sendMessage", {
            chat_id: user.telegram_chat_id,
            text: `💊 موعد جرعة "${m.name}"${m.remind_before_minutes ? ` بعد ${m.remind_before_minutes} دقيقة تقريبًا` : ""}`,
            reply_markup: { inline_keyboard: [[{ text: "✅ اتاخدت", callback_data: `dose_taken:${m.id}` }]] },
          });
          sent++;
        } catch {
          // best-effort
        }
        await supabaseAdmin.from("medications").update({ last_dose_reminded_at: m.next_dose_at }).eq("id", m.id);
      }
    }

    if (m.remaining_doses !== null && m.remaining_doses !== undefined && m.remaining_doses <= (m.low_stock_threshold ?? 5) && !m.low_stock_alerted_at) {
      try {
        await sendText(botToken(), user.telegram_chat_id, `⚠️ الدواء "${m.name}" قرب يخلص — باقي ${m.remaining_doses} بس. وقت تجيب علبة جديدة.`);
        sent++;
      } catch {
        // best-effort
      }
      await supabaseAdmin.from("medications").update({ low_stock_alerted_at: new Date().toISOString() }).eq("id", m.id);
    }
  }
  return { sent };
}

// ---------------- medical appointments ----------------
// One heads-up per appointment, sent once it's within 24h and still
// upcoming — guarded by reminded_at, cleared if the user reschedules it.
export async function runAppointmentRemindersForUser(user: ReminderUser) {
  if (!botToken() || !user.telegram_chat_id || isMuted(user)) return { sent: 0 };
  const now = new Date();
  const in1Day = new Date(now.getTime() + 24 * 3600_000);

  const { data: appts } = await supabaseAdmin
    .from("medical_appointments")
    .select("id,title,kind,appointment_at")
    .eq("user_id", user.id)
    .eq("status", "upcoming")
    .is("reminded_at", null)
    .lte("appointment_at", in1Day.toISOString())
    .gte("appointment_at", now.toISOString());

  let sent = 0;
  for (const a of appts || []) {
    const kindLabel = a.kind === "consultation" ? "استشارة طبية" : "كشف طبي";
    const when = new Date(a.appointment_at).toLocaleString("ar-EG", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
    try {
      await sendText(botToken(), user.telegram_chat_id, `🩺 تذكير: ${kindLabel}${a.title ? ` — ${a.title}` : ""}\nالمعاد: ${when}`);
      sent++;
    } catch {
      // best-effort
    }
    await supabaseAdmin.from("medical_appointments").update({ reminded_at: new Date().toISOString() }).eq("id", a.id);
  }
  return { sent };
}

// ---------------- monthly utility-usage insight ----------------
// "كل شهر تقوله استخدام الشهر ده اعلي في الكهرباء مثلا و اقل في المياه" —
// sends at most once every ~28 days, only during the first 3 days of a
// month, and only when there's enough history (3+ readings of a meter type)
// to compare the latest usage delta against the one before it.
interface UtilityUser extends ReminderUser {
  utility_insight_last_sent_at?: string | null;
}

export async function runUtilityInsightForUser(user: UtilityUser) {
  if (!botToken() || !user.telegram_chat_id || isMuted(user)) return { sent: false, reason: "no_telegram_or_muted" };
  const now = new Date();
  if (now.getDate() > 3) return { sent: false, reason: "not_window" };

  const lastMs = user.utility_insight_last_sent_at ? new Date(user.utility_insight_last_sent_at).getTime() : 0;
  const daysSince = (now.getTime() - lastMs) / 86_400_000;
  if (daysSince < 28) return { sent: false, reason: "too_soon" };

  const { data: readings } = await supabaseAdmin
    .from("utility_meter_readings")
    .select("meter_type,reading_value,reading_date")
    .eq("user_id", user.id)
    .order("reading_date", { ascending: true });
  if (!readings || readings.length < 3) return { sent: false, reason: "not_enough_data" };

  const labels: Record<string, string> = { electricity: "الكهرباء", gas: "الغاز", water: "المياه" };
  const byType: Record<string, typeof readings> = {};
  for (const r of readings) (byType[r.meter_type] ||= []).push(r);

  const lines: string[] = [];
  for (const type of Object.keys(byType)) {
    const list = byType[type];
    if (list.length < 3) continue;
    const last = list[list.length - 1];
    const prev = list[list.length - 2];
    const prevPrev = list[list.length - 3];
    const lastUsage = Number(last.reading_value) - Number(prev.reading_value);
    const prevUsage = Number(prev.reading_value) - Number(prevPrev.reading_value);
    if (prevUsage <= 0) continue;
    const diffPct = Math.round(((lastUsage - prevUsage) / prevUsage) * 100);
    if (Math.abs(diffPct) < 5) continue;
    lines.push(`${labels[type] || type}: استهلاكك ${diffPct > 0 ? "أعلى" : "أقل"} بـ ${Math.abs(diffPct)}% عن الفترة اللي قبلها`);
  }
  if (!lines.length) return { sent: false, reason: "no_signal" };

  try {
    await sendText(botToken(), user.telegram_chat_id, `📊 مقارنة استهلاك العدادات\n\n${lines.join("\n")}`);
    await supabaseAdmin.from("app_users").update({ utility_insight_last_sent_at: now.toISOString() }).eq("id", user.id);
    return { sent: true };
  } catch {
    return { sent: false, reason: "send_failed" };
  }
}
