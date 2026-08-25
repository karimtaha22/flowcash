import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { extractDoctorFields } from "@/lib/gemini";

// Round 32 — "استخراج اسم الدكتور و التخصص و العنوان بالذكاء الاصطناعي" من
// صورة الروشتة اللي المستخدم رفعها/صوّرها لموعد طبي. النتيجة اقتراح بس —
// الواجهة بتملى بيها الحقول الفاضية، مش بتحفظ حاجة مباشرة بدون مراجعة.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const image = String(body.image || "");
  if (!image) return NextResponse.json({ error: "الصورة مطلوبة" }, { status: 400 });

  const result = await extractDoctorFields(image);
  if (!result.ok) return NextResponse.json({ error: result.error || "تعذر استخراج البيانات من الصورة" }, { status: 502 });
  return NextResponse.json({ doctor_name: result.doctor_name, doctor_specialty: result.doctor_specialty, doctor_address: result.doctor_address });
}
