// MedicationScheduleEngine equivalent (the user's spec asked for this as a
// Python class against SQLite — adapted here to a small pure function set
// that both the medications API routes and the Telegram "✅ اتاخدت" callback
// share, so dose-time math only lives in one place).
//
// Two schedule modes:
//   - "interval": every N hours from the last dose (كل 6/8/12/24 ساعة).
//   - "meal": relative to a fixed daily clock time per meal — قبل/بعد
//     الإفطار/الغداء/العشاء. There's no real "meal time" data source, so
//     this assumes fixed Cairo-local clock times per the table below.
//     Documented explicitly in the round delivery message as an assumption
//     made without re-asking, since the user's spec didn't specify exact
//     times. Egypt has used a fixed UTC+2 offset (no DST) since 2016 — same
//     assumption lib/reminders.ts's Hijri/cron-hour logic already relies on.
const CAIRO_OFFSET_MIN = 120;

export const MEAL_TIMES: Record<string, { hour: number; minute: number }> = {
  before_breakfast: { hour: 7, minute: 0 },
  after_breakfast: { hour: 8, minute: 30 },
  before_lunch: { hour: 13, minute: 30 },
  after_lunch: { hour: 15, minute: 0 },
  before_dinner: { hour: 19, minute: 30 },
  after_dinner: { hour: 21, minute: 0 },
};

export const MEAL_TIMING_LABELS: Record<string, string> = {
  before_breakfast: "قبل الإفطار",
  after_breakfast: "بعد الإفطار",
  before_lunch: "قبل الغداء",
  after_lunch: "بعد الغداء",
  before_dinner: "قبل العشاء",
  after_dinner: "بعد العشاء",
};

export const MEDICATION_FORM_LABELS: Record<string, string> = {
  injection: "حقنة",
  capsule: "كبسولة",
  tablet: "قرص / برشامة",
  effervescent: "فوار",
  syrup: "شراب",
  drops: "نقط",
};

// Computes the next dose timestamp (UTC ISO-ready Date) from a medication's
// schedule settings, starting from `from` (defaults to now). Used both when
// a medication is first created/edited (schedule_type or timing changed) and
// every time a dose is logged as taken (see the dose-logging endpoint and
// the Telegram "✅ اتاخدت" callback in lib/telegramBot.ts).
export function computeNextDoseAt(
  scheduleType: string | null | undefined,
  mealTiming: string | null | undefined,
  intervalHours: number | null | undefined,
  from: Date = new Date()
): Date {
  if (scheduleType === "interval" && intervalHours && intervalHours > 0) {
    return new Date(from.getTime() + intervalHours * 3600_000);
  }
  if (scheduleType === "meal" && mealTiming && MEAL_TIMES[mealTiming]) {
    const { hour, minute } = MEAL_TIMES[mealTiming];
    const cairoNow = new Date(from.getTime() + CAIRO_OFFSET_MIN * 60_000);
    const targetCairo = new Date(Date.UTC(cairoNow.getUTCFullYear(), cairoNow.getUTCMonth(), cairoNow.getUTCDate(), hour, minute));
    let targetUtc = new Date(targetCairo.getTime() - CAIRO_OFFSET_MIN * 60_000);
    if (targetUtc.getTime() <= from.getTime()) targetUtc = new Date(targetUtc.getTime() + 24 * 3600_000);
    return targetUtc;
  }
  // no valid schedule configured yet — default 24h out so next_dose_at never
  // sits null forever (which would silently disable the reminder cron check).
  return new Date(from.getTime() + 24 * 3600_000);
}
