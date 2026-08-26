// Round 38 — منطق حساب مراحل ودورة الطمث. مبني على مراجعة كود البروتوتايب
// المرجعي (index 1.html) لكن بمعالجة الأخطاء اللي طلعت من المراجعة:
// avg_cycle_length دلوقتي محكوم بـ check constraint في الداتابيز (بين ١٥
// و٦٠) فمينفعش يبقى صفر/سالب ويطلع NaN زي ما كان بيحصل في البروتوتايب.
import { addDays, diffDays, todayISO } from "./dates";

export type CyclePhase = "menstrual" | "follicular" | "ovulation" | "luteal";

export interface PeriodLike {
  start_date: string;
  end_date: string | null;
}

// آخر بداية دورة في الماضي (أو تساوي اليوم)؛ لو كل الدورات المسجلة في
// المستقبل (بيانات غلط)، بترجع أقدم واحدة بدل ما ترجع null بلا داعي.
export function latestPeriodStart(periods: PeriodLike[], onISO = todayISO()): string | null {
  if (!periods.length) return null;
  const sorted = [...periods].sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  const pastOrToday = sorted.find((p) => p.start_date <= onISO);
  return (pastOrToday || sorted[sorted.length - 1]).start_date;
}

export interface CycleInfo {
  dayInCycle: number; // ١ فأكثر
  phase: CyclePhase;
  nextPeriodDate: string | null;
  ovulationDate: string | null;
  fertileStart: string | null;
  fertileEnd: string | null;
  isPeriodDay: boolean;
}

export function cycleInfo(periods: PeriodLike[], avgCycleLength: number, onISO = todayISO()): CycleInfo | null {
  const lastStart = latestPeriodStart(periods, onISO);
  if (!lastStart) return null;
  const cycleLen = Math.max(15, Math.min(60, Math.round(avgCycleLength) || 28));
  const daysSince = diffDays(lastStart, onISO);
  const dayInCycle = (((daysSince % cycleLen) + cycleLen) % cycleLen) + 1;
  const ovDay = Math.max(1, cycleLen - 14);
  const ovulationDate = addDays(lastStart, ovDay - 1);
  const fertileStart = addDays(ovulationDate, -5);
  const fertileEnd = addDays(ovulationDate, 1);
  const nextPeriodDate = addDays(lastStart, cycleLen);

  const activePeriod = periods.find((p) => p.start_date <= onISO && (!p.end_date || p.end_date >= onISO));
  let phase: CyclePhase;
  if (activePeriod) phase = "menstrual";
  else if (onISO >= fertileStart && onISO <= fertileEnd) phase = "ovulation";
  else if (dayInCycle < ovDay) phase = "follicular";
  else phase = "luteal";

  return { dayInCycle, phase, nextPeriodDate, ovulationDate, fertileStart, fertileEnd, isPeriodDay: !!activePeriod };
}

// انتظام الدورة بناءً على آخر ٦ دورات (فرق أطول-أقصر دورة، تقريب بسيط
// زي تطبيقات المتابعة المعروفة — مش انحراف معياري إحصائي حقيقي، نفس
// المنطق الموجود في البروتوتايب المرجعي وتعليقه الصريح بكده).
export function cycleRegularity(periods: PeriodLike[]): "regular" | "slight" | "irregular" | "unknown" {
  const starts = [...periods].map((p) => p.start_date).sort();
  if (starts.length < 3) return "unknown";
  const lengths: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    const len = diffDays(starts[i - 1], starts[i]);
    if (len > 0) lengths.push(len);
  }
  const last6 = lengths.slice(-6);
  if (last6.length < 2) return "unknown";
  const longest = Math.max(...last6);
  const shortest = Math.min(...last6);
  const spread = longest - shortest;
  if (spread <= 7) return "regular";
  if (spread <= 9) return "slight";
  return "irregular";
}

export const PHASE_LABEL: Record<CyclePhase, string> = {
  menstrual: "الدورة",
  follicular: "ما بعد الدورة",
  ovulation: "فترة التبويض",
  luteal: "قبل الدورة",
};
