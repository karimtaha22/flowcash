// Round 45 — "كارت المتابعة" (متابعة الطبيب): قائمة الحقول الطبية الـ٢٩
// اللي طلبتها المستخدمة (شكل الكارت الطبي المصري القياسي)، متقسّمة حسب نوع
// التخزين عشان routes الـ POST/PATCH يقدروا يعالجوا كل حقل بنفس المنطق من
// غير تكرار. القيم كلها اختيارية (nullable) لأن الكارت بيتعمل على مرحلتين:
// أول حجز الميعاد بس (تاريخ/وقت)، وبعدين البيانات الطبية التفصيلية.
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// حقول نصية قصيرة (أكواد/قياسات مختصرة زي G/P/A، ضغط الدم، إلخ).
export const APPT_TEXT_FIELDS = [
  "appt_time",
  "gestational_age",
  "gravida",
  "para",
  "abortions",
  "prev_delivery_mode",
  "blood_pressure",
  "hemoglobin_pct",
  "blood_group",
  "blood_sugar",
  "urine_sugar",
  "urine_albumin",
  "oedema",
  "fundal_height",
  "cervical_assessment",
  "fetal_sex",
  "fetal_weight_g",
  "fetal_heart_rate",
  "fetal_position",
  "bpd",
  "hc",
  "ac",
  "fl",
  "afi",
  "placenta",
  "fetal_movement",
  "tetanus_toxoid",
] as const;

// حقول نصية طويلة (فقرات/ملاحظات).
export const APPT_LONG_TEXT_FIELDS = ["investigation", "treatment", "high_risk_factors", "general_note"] as const;

// حقول تاريخ (yyyy-mm-dd).
export const APPT_DATE_FIELDS = ["lmp_date", "edd_date", "next_visit_date"] as const;

// حقول بيانات الدكتور — مش جزء من الـ٢٩ حقل الطبي لكن بتتسجل مع الكارت.
export const APPT_DOCTOR_FIELDS = ["doctor_name", "doctor_phone", "doctor_address"] as const;

// Round 45 — لما الأم تسجل وزنها في كارت المتابعة، الوزن ده لازم يتزامن
// تلقائيًا مع يوميات الوزن (لها > الوزن) بنفس تاريخ الزيارة — أي تعديل أو
// مسح للوزن في الكارت لازم ينعكس هناك بنفس الطريقة. بنستخدم upsert/delete
// بمفتاح (user_id, log_date) زي المتبع أصلًا في app/api/laha/weights/route.ts.
export async function syncApptWeight(
  userId: string,
  apptDate: string,
  weightKg: number | null | undefined,
  prevApptDate?: string | null
) {
  if (prevApptDate && prevApptDate !== apptDate) {
    await supabaseAdmin.from("laha_weights").delete().eq("user_id", userId).eq("log_date", prevApptDate);
  }
  if (typeof weightKg === "number" && Number.isFinite(weightKg) && weightKg > 0 && weightKg < 400) {
    await supabaseAdmin
      .from("laha_weights")
      .upsert({ user_id: userId, log_date: apptDate, weight_kg: weightKg, mode: "pregnancy" }, { onConflict: "user_id,log_date" });
  } else {
    await supabaseAdmin.from("laha_weights").delete().eq("user_id", userId).eq("log_date", apptDate);
  }
}
