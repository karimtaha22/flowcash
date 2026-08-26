import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { todayISO } from "@/lib/laha/dates";

// عدّاد الركلات: الحساب الفعلي (بدء الجلسة، وقت كل ركلة) بيحصل عند
// العميل (client-side timer، زي البروتوتايب المرجعي بالظبط — دي حسبة وقت
// حية مالهاش لازمة تتخزن جزء-جزء)، وهنا بس بنسجل نتيجة الجلسة النهائية
// (كام دقيقة لحد ما وصلت ١٠ ركلات) بعد ما تخلص.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await supabaseAdmin
    .from("laha_kicks_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  return NextResponse.json({ sessions: data || [] });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const minutesToTen = Number(body.minutes_to_ten);
  if (!Number.isFinite(minutesToTen) || minutesToTen <= 0 || minutesToTen > 600) {
    return NextResponse.json({ error: "قيمة غير صالحة" }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from("laha_kicks_sessions")
    .insert({ user_id: userId, session_date: todayISO(), minutes_to_ten: minutesToTen })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data });
}
