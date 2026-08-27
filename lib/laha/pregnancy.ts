// Round 38 — حساب أسبوع/يوم الحمل وموعد الولادة بقاعدة نيغيلي (Naegele's
// rule)، مبني على البروتوتايب المرجعي (كانت صح فيه) لكن بمعالجة الخطأ اللي
// طلع من المراجعة: تاريخ آخر دورة (LMP) في المستقبل (إدخال غلط بالغلط) كان
// بينتج فرق أيام سالب يتقصّ بصمت بـ Math.max(0,...) من غير ما يتحقق من
// صحة التاريخ نفسه أولاً — هنا بردو بنعمل clamp لكن الـ API اللي بينادي
// الدالة دي المفروض يرفض LMP في المستقبل من الأساس (validation في الراوت).
import { addDays, diffDays, todayISO } from "./dates";

export interface PregnancyInfo {
  week: number;
  day: number; // ٠-٦ جوه الأسبوع
  totalDays: number;
  dueDate: string;
  progressPct: number;
  trimester: 1 | 2 | 3;
}

export function dueDateFromLMP(lmp: string): string {
  return addDays(lmp, 280);
}

export function pregnancyInfo(lmp: string, onISO = todayISO()): PregnancyInfo {
  const totalDays = Math.max(0, diffDays(lmp, onISO));
  const week = Math.floor(totalDays / 7);
  const day = totalDays % 7;
  const dueDate = dueDateFromLMP(lmp);
  const progressPct = Math.min(100, Math.round((totalDays / 280) * 100));
  const trimester: 1 | 2 | 3 = week < 13 ? 1 : week < 27 ? 2 : 3;
  return { week, day, totalDays, dueDate, progressPct, trimester };
}

export function weekBucket(week: number): "early" | "mid" | "late" {
  return week <= 13 ? "early" : week <= 27 ? "mid" : "late";
}

// Round 42 — "حجم البيبي الأسبوع كذا يساوي الشهر كذا": البروتوتايب المرجعي
// (index (2).html) كان بيحسب الشهر التقويمي التقريبي من الأسبوع بمعادلة
// gestationalMonth = ceil((week+1)/4.345) مقصوصة بين ١ و١٠ — نفس الحساب هنا
// حرفيًا عشان نعرض "الشهر X من ١٠" جنب رقم الأسبوع زي الطلب بالظبط.
export function gestationalMonth(week: number): number {
  return Math.min(10, Math.max(1, Math.ceil((week + 1) / 4.345)));
}

// مقارنات حجم الجنين بفاكهة/خضار مألوفة — أسبوع ٤ لحد ٤٠. مأخوذة بتصرف من
// البروتوتايب المرجعي (نفس فكرة تطبيقات الحمل المعروفة).
// Round 45 — المستخدمة اشتكت إن بعض التشبيهات (زي "كراثة" لأسبوع ٣٨) مش
// معاني واضحة أو مألوفة بالعامية المصرية. اتراجعت القايمة كلها واتستبدلت
// أي تشبيهات غريبة/مش متوفرة في السوق المصري بحاجات مألوفة فعليًا (خيار،
// بطاطا، كوسة، خس عادي) بدل الأسماء الأصلية (جيكاما/لفت مكسيكي، خس روماني،
// سلق سويسري، كراثة).
export const FETAL_SIZES: Record<number, string> = {
  4: "بذرة خشخاش", 5: "بذرة سمسم", 6: "حبة عدس", 7: "حبة توت أزرق",
  8: "حبة فاصوليا", 9: "حبة عنب", 10: "حبة زيتون كبيرة", 11: "حبة تين",
  12: "حبة ليمون", 13: "حبة خوخ", 14: "ليمونة كبيرة", 15: "تفاحة",
  16: "أفوكادو", 17: "كمثرى", 18: "فلفل رومي", 19: "طماطم كبيرة",
  20: "موزة", 21: "جزرة كبيرة", 22: "كوسة", 23: "باذنجانة كبيرة",
  24: "كوز ذرة", 25: "قرنبيطة صغيرة", 26: "خسة", 27: "قرعة صغيرة",
  28: "باذنجانة كبيرة", 29: "كرنبة", 30: "قرعة عسلية", 31: "جوزة هند",
  32: "خيارة كبيرة", 33: "أناناسة صغيرة", 34: "شمامة صغيرة",
  35: "شمامة", 36: "خسة كبيرة", 37: "بطاطا كبيرة", 38: "كوسة كبيرة",
  39: "بطيخة صغيرة", 40: "بطيخة كبيرة",
};

export function fetalSizeLabel(week: number): string {
  const w = Math.max(4, Math.min(40, week));
  return FETAL_SIZES[w] || "—";
}

// "5-1-1" لتقدير وقت التوجه للمستشفى: تقارب ≤٥ دقايق + مدة ≥٦٠ ثانية —
// البروتوتايب المرجعي كان بيحسبها من متوسط آخر ٥ انقباضات بس من غير ما
// يتأكد إن النمط ده مستمر لمدة ساعة تقريبًا (شرط "5-1-1" الطبي الحقيقي).
// هنا بنضيف شرط إضافي: الفرق الزمني بين أول وآخر انقباضة من الـ٥ لازم يكون
// ٣٠ دقيقة على الأقل، عشان نقلل من التنبيه المبكر جدًا لو المستخدمة سجّلت
// ٥ انقباضات متقاربة في وقت قصير جدًا.
export interface ContractionLike {
  started_at: string; // ISO timestamp
  duration_sec: number | null;
}

export interface ContractionAnalysis {
  freqAvgMin: number | null;
  avgDurationSec: number | null;
  shouldGoToHospital: boolean;
  urgencyScore: number; // 0-100
}

export function analyzeContractions(all: ContractionLike[]): ContractionAnalysis {
  const sorted = [...all].sort((a, b) => (a.started_at < b.started_at ? 1 : -1)); // الأحدث أولاً
  const last5 = sorted.slice(0, 5);
  if (last5.length < 2) return { freqAvgMin: null, avgDurationSec: null, shouldGoToHospital: false, urgencyScore: 0 };

  const gaps: number[] = [];
  for (let i = 0; i < last5.length - 1; i++) {
    const gapMs = new Date(last5[i].started_at).getTime() - new Date(last5[i + 1].started_at).getTime();
    gaps.push(gapMs / 60000);
  }
  const freqAvgMin = gaps.reduce((a, b) => a + b, 0) / gaps.length;

  const durations = last5.map((c) => c.duration_sec).filter((d): d is number => typeof d === "number" && d > 0);
  const avgDurationSec = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;

  const spanMin = (new Date(last5[0].started_at).getTime() - new Date(last5[last5.length - 1].started_at).getTime()) / 60000;
  const sustained = last5.length >= 5 && spanMin >= 30;

  const shouldGoToHospital = sustained && freqAvgMin <= 5 && (avgDurationSec ?? 0) >= 60;

  const freqScore = freqAvgMin ? Math.max(0, Math.min(100, ((10 - freqAvgMin) / 10) * 100)) : 0;
  const durScore = avgDurationSec ? Math.max(0, Math.min(100, (avgDurationSec / 90) * 100)) : 0;
  const urgencyScore = Math.round(freqScore * 0.6 + durScore * 0.4);

  return { freqAvgMin, avgDurationSec, shouldGoToHospital, urgencyScore };
}
