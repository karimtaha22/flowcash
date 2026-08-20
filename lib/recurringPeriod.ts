// CLIENT-SAFE pure date math — no Supabase import here on purpose (same
// split as lib/fx.ts vs lib/fxRates.ts). Used by both the server-only
// lib/recurringConfirm.ts and client components (e.g. صفحة التخطيط) that
// need to know whether a recurring item is already confirmed for its
// current period without pulling supabaseAdmin into the browser bundle.
import { getISOWeek, getISOWeekYear } from "date-fns";

export interface RecurringPeriodItem {
  frequency?: string | null;
  last_confirmed_month?: string | null;
  last_confirmed_date?: string | null;
  interval_count?: number | null;
}

export function periodKeyFor(item: { frequency?: string | null }, now: Date = new Date()): string {
  const freq = item.frequency || "monthly";
  if (freq === "daily") return now.toISOString().slice(0, 10);
  if (freq === "weekly") return `${getISOWeekYear(now)}-W${getISOWeek(now)}`;
  return now.toISOString().slice(0, 7);
}

// how many whole periods (days/weeks/months) have to pass between one
// confirmation and the item being due again — defaults to 1 (every
// day/week/month, the original behavior) but supports custom cadences like
// "every 3 months" or "every 20 days".
function intervalCountOf(item: { interval_count?: number | null }): number {
  const n = Math.floor(Number(item.interval_count) || 1);
  return n >= 1 ? n : 1;
}

export function isConfirmedForCurrentPeriod(item: RecurringPeriodItem, now: Date = new Date()): boolean {
  const freq = item.frequency || "monthly";
  const interval = intervalCountOf(item);

  if (interval <= 1) {
    // exact legacy behavior for every-1 items (the vast majority) —
    // calendar period-key comparison, left untouched.
    const key = periodKeyFor(item, now);
    if (freq === "monthly") return item.last_confirmed_month === key;
    if (!item.last_confirmed_date) return false;
    return periodKeyFor(item, new Date(item.last_confirmed_date + "T00:00:00")) === key;
  }

  // custom interval (every N days/weeks/months) — elapsed-time based: once
  // confirmed, the item stays "confirmed" until N full periods have passed
  // since the confirmation date, then it becomes due again.
  if (!item.last_confirmed_date) return false;
  const last = new Date(item.last_confirmed_date + "T00:00:00");
  const nextDue = new Date(last);
  if (freq === "daily") nextDue.setDate(nextDue.getDate() + interval);
  else if (freq === "weekly") nextDue.setDate(nextDue.getDate() + interval * 7);
  else nextDue.setMonth(nextDue.getMonth() + interval);
  return now.getTime() < nextDue.getTime();
}
