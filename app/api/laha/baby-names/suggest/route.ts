import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { suggestBabyNames } from "@/lib/laha/gemini";
import { BABY_NAMES_FALLBACK } from "@/lib/laha/babyNamesFallback";

// طلب المستخدم صراحة: "الجزء بتاع تخمين الاسماء هتستخدم مفتاح جيمناي" —
// المصدر الأساسي هنا AI حقيقي (lib/laha/gemini.ts's suggestBabyNames)، مش
// قائمة ثابتة بتتكرر زي البروتوتايب المرجعي. لو المفتاح مش موجود أو حصل
// خطأ من الـ API، بنرجع من القائمة الاحتياطية الثابتة (BABY_NAMES_FALLBACK)
// بدل ما الميزة توقف تمامًا — لكن بعلم واضح `source` يوضح أنها احتياطية.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const gender = body.gender === "boy" || body.gender === "girl" ? body.gender : null;
  if (!gender) return NextResponse.json({ error: "نوع غير صالح" }, { status: 400 });

  const { data: settings } = await supabaseAdmin.from("laha_settings").select("father_name").eq("user_id", userId).maybeSingle();
  const { data: existingNames } = await supabaseAdmin.from("laha_baby_names").select("name").eq("user_id", userId).eq("gender", gender);
  const exclude = (existingNames || []).map((r: any) => r.name);

  const result = await suggestBabyNames({
    gender,
    fatherName: settings?.father_name || null,
    theme: typeof body.theme === "string" ? body.theme.slice(0, 100) : null,
    exclude,
    count: 5,
  });

  if (result.ok) return NextResponse.json({ names: result.names, source: "ai" });

  // fallback: من القائمة الثابتة، مستبعدين اللي اتقالوا قبل كده
  const pool = BABY_NAMES_FALLBACK[gender as "boy" | "girl"].filter((n) => !exclude.includes(n.name));
  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, 5);
  return NextResponse.json({ names: shuffled.length ? shuffled : BABY_NAMES_FALLBACK[gender as "boy" | "girl"].slice(0, 5), source: "fallback", error: result.error });
}
