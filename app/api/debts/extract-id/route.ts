import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { extractIdFields, verifyIdMatchesName } from "@/lib/gemini";

// Thin authenticated wrapper exposing lib/gemini.ts's server-only
// extractIdFields/verifyIdMatchesName to the client-side "تسجيل متقدم" form
// (AdvancedDebtForm in app/(protected)/people/page.tsx) — "استخرج البيانات
// من الصورة" for the other party's ID, and "تحقق إن الاسم مطابق للبطاقة"
// for a witness's ID. Both are suggestions the user reviews/accepts, never
// auto-applied without confirmation.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { mode, id_photo_front, claimed_name } = body;
  if (!id_photo_front) return NextResponse.json({ error: "لازم صورة البطاقة" }, { status: 400 });

  if (mode === "match_name") {
    if (!claimed_name?.trim()) return NextResponse.json({ error: "لازم اسم للمطابقة" }, { status: 400 });
    const result = await verifyIdMatchesName(id_photo_front, claimed_name);
    return NextResponse.json({ result });
  }

  const result = await extractIdFields(id_photo_front);
  return NextResponse.json({ result });
}
