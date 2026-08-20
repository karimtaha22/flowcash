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
}

export function periodKeyFor(item: { frequency?: string | null }, now: Date = new Date()): string {
  const freq = item.frequency || "monthly";
  if (freq === "daily") return now.toISOString().slice(0, 10);
  if (freq === "weekly") return `${getISOWeekYear(now)}-W${getISOWeek(now)}`;
  return now.toISOString().slice(0, 7);
}

export function isConfirmedForCurrentPeriod(item: RecurringPeriodItem, now: Date = new Date()): boolean {
  const freq = item.frequency || "monthly";
  const key = periodKeyFor(item, now);
  if (freq === "monthly") return item.last_confirmed_month === key;
  if (!item.last_confirmed_date) return false;
  return periodKeyFor(item, new Date(item.last_confirmed_date + "T00:00:00")) === key;
}
