// Round 38 — منطق حساب مراحل ودورة الطمث. مبني على مراجعة كود البروتوتايب
// المرجعي (index 1.html) لكن بمعالجة الأخطاء اللي طلعت من المراجعة:
// avg_cycle_length دلوقتي محكوم بـ check constraint في الداتابيز (بين ١٥
// و٦٠) فمينفعش يبقى صفر/سالب ويطلع NaN زي ما كان بيحصل في البروتوتايب.
import { addDays, diffDays, todayISO, arabicDaysCount } from "./dates";

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

// Round 47 — "التقويم والحسبة بايظة... المفروض عنده تاريخ البداية ومدة
// الدورة يسجل في التقويم أيام الخصوبة والتبويض والدورة وأيام آمنة [لمدى
// الشهر كامل]". فحص الكود طلع فيه بجّتين حقيقيتين كانوا بيبوّظوا أي شهر
// غير الشهر الأول بعد آخر دورة متسجلة:
//
// ١) ovulationDate/fertileStart/fertileEnd/nextPeriodDate كانوا بيتحسبوا
//    كتواريخ مطلقة من `lastStart` مباشرة (أول دورة اتسجلت) من غير ما
//    يتحركوا مع كل دورة متكررة — يعني نافذة التبويض/الخصوبة كانت بتظهر
//    صح بس في الدورة الأولى بعد آخر تسجيل، وأي شهر بعد كده (لسه جوه نفس
//    التقويم) كانت النافذة فاضلة "واقفة" في الماضي ومتظهرش خالص. الحل:
//    نحسب `currentCycleStart` (بداية الدورة المحدّدة اللي `onISO` نفسه
//    واقع جواها، مش أول دورة مسجّلة) ونبني كل التواريخ دي منه.
// ٢) "يوم الدورة" (`isPeriodDay`) كان بيعتمد بالكامل على تسجيل فعلي
//    (`periods` row) — فمفيش أي توقّع لأيام الدورة القادمة (أو الماضية
//    الغير مسجّلة) خالص، رغم إن المستخدمة سجّلت تاريخ البداية ومدة الدورة
//    في الإعدادات بالظبط عشان كده. وكمان دورة نشطة (`end_date` لسه
//    فاضي) كانت بتتحسب "دورة" لأي تاريخ في المستقبل من غير أي حد — حتى
//    بعد شهور. الحل: نستخدم `avgPeriodLength` (مسجلة في الإعدادات) نتوقع
//    بيها أيام الدورة لأي دورة متكررة من غير تسجيل فعلي، ونحدّد الدورة
//    النشطة الغير مقفولة بمدتها المتوقعة بدل ما تفضل "دورة" للأبد.
export function cycleInfo(periods: PeriodLike[], avgCycleLength: number, onISO = todayISO(), avgPeriodLength = 6): CycleInfo | null {
  const lastStart = latestPeriodStart(periods, onISO);
  if (!lastStart) return null;
  const cycleLen = Math.max(15, Math.min(60, Math.round(avgCycleLength) || 28));
  const periodLen = Math.max(1, Math.min(15, Math.round(avgPeriodLength) || 6));
  const daysSince = diffDays(lastStart, onISO);
  const dayInCycle = (((daysSince % cycleLen) + cycleLen) % cycleLen) + 1;
  // بداية الدورة المحدّدة اللي onISO واقع جواها فعليًا (مش أول دورة
  // اتسجلت) — كل التواريخ التانية (تبويض/خصوبة/الدورة الجاية) بتتبني منها
  // عشان تتكرر صح مع كل دورة، مش تفضل ثابتة عند أول دورة بس.
  const currentCycleStart = addDays(onISO, -(dayInCycle - 1));
  const ovDay = Math.max(1, cycleLen - 14);
  const ovulationDate = addDays(currentCycleStart, ovDay - 1);
  const fertileStart = addDays(ovulationDate, -5);
  const fertileEnd = addDays(ovulationDate, 1);
  const nextPeriodDate = addDays(currentCycleStart, cycleLen);

  // تسجيل فعلي بيغطي التاريخ ده — دورة مقفولة (عندها end_date) بتتحسب زي
  // ما هي بالظبط، لكن دورة "مستمرة" (لسه من غير end_date) بتتحدد بمدتها
  // المتوقعة (avgPeriodLength) بدل ما تفضل "دورة" لأي تاريخ مستقبلي للأبد.
  const recordedPeriod = periods.find((p) => {
    if (p.start_date > onISO) return false;
    if (p.end_date) return p.end_date >= onISO;
    return diffDays(p.start_date, onISO) < periodLen;
  });
  // توقّع أيام الدورة للدورات المتكررة الغير مسجّلة فعليًا (المستقبل، أو
  // الماضي اللي متسجلش) — بناءً على مكان اليوم جوه الدورة (dayInCycle)
  // ومدة الدورة المتوقعة، بالظبط زي ما وصفت المستخدمة (تاريخ البداية +
  // مدة الدورة).
  const isPeriodDay = !!recordedPeriod || dayInCycle <= periodLen;

  let phase: CyclePhase;
  if (isPeriodDay) phase = "menstrual";
  else if (onISO >= fertileStart && onISO <= fertileEnd) phase = "ovulation";
  else if (dayInCycle < ovDay) phase = "follicular";
  else phase = "luteal";

  return { dayInCycle, phase, nextPeriodDate, ovulationDate, fertileStart, fertileEnd, isPeriodDay };
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

// ────────────────────────── Round 40 ─────────────────────────────────────
// الميزات المؤجلة من الملف المرجعي الكبير اللي بعته المستخدم في راوند ٣٩
// (Partner Sync, Productivity Map, Vacation Planner, Doctor Report,
// Water Retention, Backtrack Gap Filler) — راجع claude/laha-feature.md's
// قسم "Round 40" للتفصيل الكامل. كل الدوال هنا خالصة (pure) وسهلة الاختبار،
// بدون أي استدعاء شبكة أو قاعدة بيانات.

// ─── ٢. خريطة الطاقة والإنتاجية حسب المرحلة الهرمونية ─────────────────────
// Round 44 — شيل حقل emoji الزخرفي (طلب صريح بشيل أي إيموشن من التطبيق).
export interface ProductivityGuide {
  title: string;
  work: string;
  social: string;
  fitness: string;
}
export const PRODUCTIVITY_MAP: Record<CyclePhase, ProductivityGuide> = {
  menstrual: {
    title: "مرحلة الراحة",
    work: "ركزي على المهام الهادئة والمراجعة بدل الأفكار الجديدة — طاقتك الجسدية أقل دلوقتي وده طبيعي جدًا.",
    social: "مفيش مشكلة تقللي التفاعل الاجتماعي شوية والوقت لنفسك.",
    fitness: "حركة خفيفة بس (مشي، تمدد) — الأفضل تسيبي التمارين القوية للأيام الجاية.",
  },
  follicular: {
    title: "مرحلة الطاقة المتصاعدة",
    work: "أفضل وقت للأفكار الجديدة والتخطيط والمشاريع اللي محتاجة تركيز — طاقتك بتزيد يوم بعد يوم.",
    social: "وقت كويس للقاءات ومناسبات جديدة، مزاجك عادة بيكون متفتح.",
    fitness: "قدرتك على المجهود بتزيد — وقت مناسب لتمارين أقوى شوية.",
  },
  ovulation: {
    title: "أعلى نقطة طاقة في الدورة",
    work: "أفضل وقت للعروض التقديمية والمحادثات المهمة — ثقتك وطاقتك في أعلى مستوى.",
    social: "وقت التواصل الاجتماعي والفعاليات — عادة بتحسي بانفتاح أكتر مع الناس.",
    fitness: "أعلى قدرة على المجهود البدني — استغلي الطاقة دي لو حابة.",
  },
  luteal: {
    title: "مرحلة التركيز والإنهاء",
    work: "وقت كويس لإنهاء المهام العالقة والتنظيم بدل بدء حاجات جديدة — ركزي على التفاصيل.",
    social: "مفيش غلط لو حسيتي إنك عايزة تقللي المناسبات الاجتماعية شوية قرب الدورة.",
    fitness: "تمارين هادئة (يوجا، مشي) أفضل من المجهود العالي كل ما نقتربي من الدورة.",
  },
};

// ─── ٥. تقرير الطبيب — تجميع البيانات (حساب صرف، من غير I/O) ──────────────
export function averageCycleLength(periods: PeriodLike[]): number | null {
  const starts = [...periods].map((p) => p.start_date).sort();
  if (starts.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    const g = diffDays(starts[i - 1], starts[i]);
    if (g > 0) gaps.push(g);
  }
  if (!gaps.length) return null;
  return Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
}

export interface SymptomTally {
  tag: string;
  count: number;
}
export function symptomTally(dailyLogs: { pain_tags: string[] | null }[], topN = 5): SymptomTally[] {
  const counts = new Map<string, number>();
  for (const log of dailyLogs) {
    for (const tag of log.pain_tags || []) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

// ─── ٩. التقدير الرجعي (Backtrack & Gap Filler) ────────────────────────────
// بتدور على فجوات كبيرة (أكبر من ١.٥ ضعف متوسط طول الدورة) بين دورتين
// متتاليتين مسجلتين، وتقترح دورات تقديرية موزّعة بالتساوي جوه الفجوة —
// المستخدمة تقدر تطبقها أو تسيبها، مش بتتضاف تلقائيًا أبدًا.
export interface GapFillerProposal {
  afterStart: string;
  beforeStart: string;
  gapDays: number;
  proposedDates: string[];
}
export function detectGapFillers(periods: PeriodLike[], avgCycleLength: number): GapFillerProposal[] {
  const cycleLen = Math.max(15, Math.min(60, Math.round(avgCycleLength) || 28));
  const starts = [...periods].map((p) => p.start_date).sort();
  const results: GapFillerProposal[] = [];
  for (let i = 1; i < starts.length; i++) {
    const gapDays = diffDays(starts[i - 1], starts[i]);
    if (gapDays <= cycleLen * 1.5) continue;
    const missingCycles = Math.round(gapDays / cycleLen) - 1;
    if (missingCycles < 1) continue;
    const spacing = gapDays / (missingCycles + 1);
    const proposedDates: string[] = [];
    for (let k = 1; k <= missingCycles; k++) {
      proposedDates.push(addDays(starts[i - 1], Math.round(spacing * k)));
    }
    results.push({ afterStart: starts[i - 1], beforeStart: starts[i], gapDays, proposedDates });
  }
  return results;
}

// ─── ١٢. ميزان احتباس السوائل الهرموني ─────────────────────────────────────
export interface WaterRetentionInsight {
  type: "reassure" | "flag" | "neutral";
  text: string;
}
export interface WeightLike {
  log_date: string;
  weight_kg: number;
}
export function waterRetentionInsight(weights: WeightLike[], phase: CyclePhase | null): WaterRetentionInsight | null {
  const sorted = [...weights].sort((a, b) => (a.log_date < b.log_date ? -1 : 1));
  if (sorted.length < 2) return null;
  const prev = sorted[sorted.length - 2];
  const last = sorted[sorted.length - 1];
  const diff = last.weight_kg - prev.weight_kg;
  if (diff <= 0) {
    return { type: "neutral", text: "وزنك مستقر أو نازل شوية — مفيش احتباس سوائل ملحوظ دلوقتي." };
  }
  if (phase === "luteal") {
    if (diff <= 2.5) {
      return {
        type: "reassure",
        text: `زيادة ${diff.toFixed(1)} كجم قبل الدورة غالبًا احتباس سوائل طبيعي مرتبط بالهرمونات، مش دهون — بتنزل عادةً مع بداية الدورة.`,
      };
    }
    return {
      type: "flag",
      text: `زيادة ${diff.toFixed(1)} كجم أكبر من المتوقع من احتباس السوائل بس — لو استمرت أو صاحبها انتفاخ شديد أو صداع قوي، الأفضل تستشيري دكتورة.`,
    };
  }
  return { type: "neutral", text: `زيادة بسيطة (${diff.toFixed(1)} كجم) خارج فترة ما قبل الدورة — على الأغلب مش مرتبطة بالهرمونات.` };
}

// ─── ٤. محاكي توافق السفر والمناسبات ───────────────────────────────────────
export type DayCategory = "period" | "ovulation" | "fertile" | "safe";

export function dayCategory(periods: PeriodLike[], avgCycleLength: number, dateISO: string, avgPeriodLength = 6): DayCategory {
  const info = cycleInfo(periods, avgCycleLength, dateISO, avgPeriodLength);
  if (!info) return "safe";
  if (info.isPeriodDay) return "period";
  if (info.ovulationDate === dateISO) return "ovulation";
  if (info.fertileStart && info.fertileEnd && dateISO >= info.fertileStart && dateISO <= info.fertileEnd) return "fertile";
  return "safe";
}

const CATEGORY_NOTE: Record<DayCategory, string> = {
  period: "لسه في فترة الدورة.",
  ovulation: "يوم التبويض — أعلى فرصة حمل في الشهر كله.",
  fertile: "خلي بالك، الفترة دي فرصة الحمل فيها عالية جدًا.",
  safe: "يوم آمن ومناسب لأي نشاط عادي.",
};

// Round 48 — "أي يوم أقف عليه، اديني مختصر عنه... بس بالصيغ الطبية": ترتيب
// عربي لأيام الدورة (حد أقصى ١٥ يوم — نفس الحد الأقصى المفروض على
// avgPeriodLength جوه cycleInfo أعلاه) عشان جملة زي "اليوم الثالث من
// الدورة الشهرية" تتبني صح.
const ORDINAL_DAY: string[] = [
  "", "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع",
  "الثامن", "التاسع", "العاشر", "الحادي عشر", "الثاني عشر", "الثالث عشر",
  "الرابع عشر", "الخامس عشر",
];

// ملخص طبي مختصر ليوم واحد في التقويم — بيُستخدم لما المستخدمة تدوس على
// يوم في تقويم الدورة عشان تعرف حالته على طول من غير ما تحسب بنفسها.
export function dayMedicalSummary(periods: PeriodLike[], avgCycleLength: number, dateISO: string, avgPeriodLength = 6): string | null {
  const info = cycleInfo(periods, avgCycleLength, dateISO, avgPeriodLength);
  if (!info) return null;
  if (info.isPeriodDay) {
    const label = ORDINAL_DAY[info.dayInCycle] || `رقم ${info.dayInCycle}`;
    return `اليوم ${label} من الدورة الشهرية (الطمث).`;
  }
  if (info.ovulationDate === dateISO) return "يوم التبويض — أعلى معدل خصوبة في الدورة كلها.";
  if (info.fertileStart && info.fertileEnd && dateISO >= info.fertileStart && dateISO <= info.fertileEnd) {
    return "ضمن نافذة الخصوبة المحيطة بالتبويض — احتمال الحمل فيها مرتفع.";
  }
  return "يوم آمن نسبيًا — خارج نافذة التبويض المتوقعة وأيام الدورة.";
}

export interface TravelSegment {
  category: DayCategory;
  fromDayIndex: number; // ١-based جوه الرحلة
  toDayIndex: number;
  fromISO: string;
  toISO: string;
  label: string; // "أول ٣ أيام" / "من اليوم ٤ إلى اليوم ٦" / إلخ
  note: string;
  extraNote?: string;
}
export interface TravelPlan {
  segments: TravelSegment[];
  totalDays: number;
  safeDays: number;
  verdict: "safe" | "caution";
  verdictText: string;
}

function relativeDayLabel(fromIdx: number, toIdx: number, totalDays: number): string {
  const single = fromIdx === toIdx;
  if (fromIdx === 1 && toIdx === totalDays) return single ? "اليوم الوحيد في الرحلة" : "الرحلة كلها";
  if (fromIdx === 1) return single ? "أول يوم" : `أول ${arabicDaysCount(toIdx)}`;
  if (toIdx === totalDays) return single ? "آخر يوم" : `آخر ${arabicDaysCount(totalDays - fromIdx + 1)}`;
  return single ? `اليوم ${fromIdx}` : `من اليوم ${fromIdx} إلى اليوم ${toIdx}`;
}

export function describeTravelRange(periods: PeriodLike[], avgCycleLength: number, startISO: string, endISO: string, avgPeriodLength = 6): TravelPlan | null {
  if (!startISO || !endISO || endISO < startISO) return null;
  const totalDays = diffDays(startISO, endISO) + 1;
  if (totalDays > 60) return null; // حماية من مدى ضخم غلط بالغلط

  const categories: DayCategory[] = [];
  for (let i = 0; i < totalDays; i++) categories.push(dayCategory(periods, avgCycleLength, addDays(startISO, i), avgPeriodLength));

  const segments: TravelSegment[] = [];
  let i = 0;
  while (i < categories.length) {
    let j = i;
    while (j + 1 < categories.length && categories[j + 1] === categories[i]) j++;
    const fromIdx = i + 1;
    const toIdx = j + 1;
    const category = categories[i];
    const prevCategory = i > 0 ? categories[i - 1] : null;
    const seg: TravelSegment = {
      category,
      fromDayIndex: fromIdx,
      toDayIndex: toIdx,
      fromISO: addDays(startISO, i),
      toISO: addDays(startISO, j),
      label: relativeDayLabel(fromIdx, toIdx, totalDays),
      note: CATEGORY_NOTE[category],
    };
    if (prevCategory === "period" && category !== "period") {
 seg.extraNote ="من هنا تقدري تستعدي نشاطك العادي";
    }
    segments.push(seg);
    i = j + 1;
  }

  const safeDays = categories.filter((c) => c === "safe").length;
  const verdict: "safe" | "caution" = safeDays / totalDays > 0.5 ? "safe" : "caution";
  const verdictText =
    verdict === "safe"
 ?"إجمالاً الفترة آمنة وتسمح بنشاط عالٍ."
 :"فيه أيام في الرحلة تحتاج انتباه أكتر (دورة أو فرصة حمل عالية) — خططي براحتك وخدي بالك.";

  return { segments, totalDays, safeDays, verdict, verdictText };
}
