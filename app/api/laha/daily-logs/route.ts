import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isValidISO } from "@/lib/laha/dates";

// "MicroLogs" في البروتوتايب المرجعي — تسجيل سريع يومي (مزاج/ألم/تدفق/
// ملاحظة)، صف واحد لكل (مستخدم، يوم) بيتحدّث بدل ما يتكرر.
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const from = req.nextUrl.searchParams.get("from");
  let q = supabaseAdmin.from("laha_daily_logs").select("*").eq("user_id", userId).order("log_date", { ascending: false });
  if (from && isValidISO(from)) q = q.gte("log_date", from);
  const { data } = await q;
  return NextResponse.json({ logs: data || [] });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const logDate = body.log_date;
  if (!isValidISO(logDate)) return NextResponse.json({ error: "تاريخ غير صالح" }, { status: 400 });

  const payload = {
    user_id: userId,
    log_date: logDate,
    mood: typeof body.mood === "string" ? body.mood.slice(0, 40) : null,
    pain_tags: Array.isArray(body.pain_tags) ? body.pain_tags.map(String).slice(0, 10) : [],
    flow: typeof body.flow === "string" ? body.flow.slice(0, 20) : null,
    note: typeof body.note === "string" ? body.note.slice(0, 500) : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin.from("laha_daily_logs").upsert(payload, { onConflict: "user_id,log_date" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
