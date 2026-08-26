import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { DOCTOR_QUESTIONS_BANK } from "@/lib/laha/doctorQuestionsBank";

const BUCKETS = ["early", "mid", "late"] as const;

// أول مرة تُطلب فيها أسئلة "week_bucket" معين ولسه معملش زرع (seed)، بنزرع
// أسئلة البنك الجاهزة تلقائيًا — نفس فكرة DoctorVisitPrep في البروتوتايب
// المرجعي (زرع لمرة واحدة، وبعدين قابلة للتعديل/الإضافة من المستخدمة).
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const bucketParam = req.nextUrl.searchParams.get("bucket");
  const bucket = BUCKETS.includes(bucketParam as any) ? (bucketParam as (typeof BUCKETS)[number]) : null;
  if (!bucket) return NextResponse.json({ error: "bucket غير صالح" }, { status: 400 });

  const { data: existing } = await supabaseAdmin.from("laha_doctor_questions").select("*").eq("user_id", userId).eq("week_bucket", bucket);
  if (!existing || existing.length === 0) {
    const seedRows = DOCTOR_QUESTIONS_BANK[bucket].map((q) => ({
      user_id: userId,
      week_bucket: bucket,
      question: q,
      is_important: false,
      is_asked: false,
      is_custom: false,
    }));
    const { data: seeded } = await supabaseAdmin.from("laha_doctor_questions").insert(seedRows).select();
    return NextResponse.json({ questions: seeded || [] });
  }
  return NextResponse.json({ questions: existing });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const bucket = BUCKETS.includes(body.week_bucket) ? body.week_bucket : null;
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!bucket) return NextResponse.json({ error: "bucket غير صالح" }, { status: 400 });
  if (!question) return NextResponse.json({ error: "السؤال فاضي" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("laha_doctor_questions")
    .insert({ user_id: userId, week_bucket: bucket, question: question.slice(0, 300), is_custom: true })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ question: data });
}
