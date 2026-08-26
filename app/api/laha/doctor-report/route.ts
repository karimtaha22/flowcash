import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { averageCycleLength, symptomTally } from "@/lib/laha/cycle";

// Round 40 — "مولّد تقرير الطبيب" (One-Click Doctor Report): بيجمّع بيانات
// جاهزة للطباعة/العرض على الدكتورة — متوسط طول الدورة، آخر ٦ دورات، أكتر
// الأعراض تكرارًا (من laha_daily_logs's pain_tags)، وجدول آخر ٢٠ تسجيل
// يومي. الصفحة اللي بتستهلك الراوت ده (app/(protected)/laha/doctor-report)
// هي اللي بتعمل window.print() — الراوت هنا بيرجّع بيانات خام بس.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ data: periods }, { data: logs }] = await Promise.all([
    supabaseAdmin.from("laha_periods").select("start_date,end_date").eq("user_id", userId).order("start_date", { ascending: false }),
    supabaseAdmin.from("laha_daily_logs").select("log_date,mood,pain_tags,flow,note").eq("user_id", userId).order("log_date", { ascending: false }).limit(20),
  ]);

  return NextResponse.json({
    avgCycleLength: averageCycleLength(periods || []),
    lastPeriods: (periods || []).slice(0, 6),
    topSymptoms: symptomTally(logs || [], 5),
    dailyLogs: logs || [],
  });
}
