import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { extractMeterReading } from "@/lib/gemini";

// Round 32 — "استخراج القراءة بالذكاء الاصطناعي" من صورة العداد اللي
// المستخدم رفعها/صوّرها. النتيجة اقتراح بس — الواجهة بتملى بيها خانة
// القراءة، والمستخدم يقدر يعدلها قبل الحفظ.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const image = String(body.image || "");
  if (!image) return NextResponse.json({ error: "الصورة مطلوبة" }, { status: 400 });

  const result = await extractMeterReading(image, body.meter_type || null);
  if (!result.ok) return NextResponse.json({ error: result.error || "تعذر قراءة العداد من الصورة" }, { status: 502 });
  return NextResponse.json({ reading_value: result.reading_value });
}
