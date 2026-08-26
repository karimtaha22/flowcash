// Round 38 — تاريخ خالي من مشكلة التوقيت اللي كانت في البروتوتايب المرجعي
// اللي المستخدم رفعه (index 1.html، تطبيق "وردة"): كان بيعمل
// `new Date(iso); setHours(0,0,0,0); toISOString().slice(0,10)` — ده بيحسب
// منتصف الليل بالتوقيت المحلي بس بيحوّله لـ UTC قبل ما يقطع التاريخ، فبيرجع
// يوم قبل اليوم الفعلي في أي توقيت +UTC (زي مصر UTC+3 وباقي الدول العربية
// المستهدفة). تأكدنا فعليًا إن حتى `addDays(iso, 0)` كانت بترجع تاريخ غلط.
// هنا كل الحسابات نص خالص (سنة-شهر-يوم) عن طريق Date.UTC فقط للحساب — مفيش
// أي استدعاء لـ toISOString() أو أي دالة بتعتمد على توقيت الجهاز المحلي.

export interface YMD {
  y: number;
  m: number;
  d: number;
}

export function parseISO(iso: string): YMD {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

export function toISO({ y, m, d }: YMD): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function addDays(iso: string, n: number): string {
  const { y, m, d } = parseISO(iso);
  const t = Date.UTC(y, m - 1, d) + n * 86400000;
  const dt = new Date(t);
  return toISO({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
}

export function diffDays(a: string, b: string): number {
  const { y: y1, m: m1, d: d1 } = parseISO(a);
  const { y: y2, m: m2, d: d2 } = parseISO(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

// "اليوم" بتوقيت مصر (UTC+3 طول السنة، من غير توقيت صيفي من 2016) — مش
// توقيت السيرفر الخام (Vercel = UTC) ومش توقيت جهاز المستخدم، عشان "اليوم"
// يفضل ثابت ومتسق لكل مستخدمي التطبيق (كلهم في مصر/المنطقة العربية).
export function todayISO(): string {
  const now = new Date(Date.now() + 3 * 3600000);
  return toISO({ y: now.getUTCFullYear(), m: now.getUTCMonth() + 1, d: now.getUTCDate() });
}

export function isValidISO(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const { y, m, d } = parseISO(iso);
  if (!y || !m || !d) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Round 39 — شبكة تقويم شهري تفاعلي (`CycleCalendar`). زي كل تواريخ الملف
// ده: حساب خالص عن طريق `Date.UTC()` بس، من غير أي `toISOString()` أو
// اعتماد على توقيت الجهاز — آمن من نفس باج التوقيت الموصوف فوق.
export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function firstWeekdayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
}

export const ARABIC_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];
export const ARABIC_WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export function fmtArabicDate(iso: string): string {
  if (!isValidISO(iso)) return "-";
  const { y, m, d } = parseISO(iso);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${ARABIC_WEEKDAYS[dow]} ${d} ${ARABIC_MONTHS[m - 1]} ${y}`;
}

// جمع عربي بسيط لعدد الأيام المتبقية ("يوم واحد" / "يومين" / "٣ أيام" /
// "١٥ يوم") — للنصوص التوضيحية زي "متبقي على الدورة القادمة".
export function arabicDaysCount(n: number): string {
  const abs = Math.abs(n);
  if (abs === 0) return "اليوم";
  if (abs === 1) return "يوم واحد";
  if (abs === 2) return "يومين";
  if (abs >= 3 && abs <= 10) return `${abs} أيام`;
  return `${abs} يوم`;
}
