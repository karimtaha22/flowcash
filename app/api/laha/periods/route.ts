import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isValidISO, todayISO } from "@/lib/laha/dates";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await supabaseAdmin.from("laha_periods").select("*").eq("user_id", userId).order("start_date", { ascending: false });
  return NextResponse.json({ periods: data || [] });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const startDate = body.start_date;
  const endDate = body.end_date || null;

  if (!isValidISO(startDate)) return NextResponse.json({ error: "تاريخ بداية الدورة غير صالح" }, { status: 400 });
  if (startDate > todayISO()) return NextResponse.json({ error: "تاريخ بداية الدورة مينفعش يكون في المستقبل" }, { status: 400 });
  // Round 38 review note: البروتوتايب المرجعي كان بيسمح بتسجيل تاريخ نهاية
  // قبل تاريخ البداية بصمت (نطاق مقلوب مالوش أي معنى) — هنا مرفوض من الـ
  // API، ومحمي كمان بـ check constraint في الداتابيز نفسها.
  if (endDate && (!isValidISO(endDate) || endDate < startDate)) {
    return NextResponse.json({ error: "تاريخ نهاية الدورة لازم يكون بعد أو يساوي تاريخ البداية" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("laha_periods")
    .insert({ user_id: userId, start_date: startDate, end_date: endDate, estimated: false })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ period: data });
}
