import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";
import { addHijriYears, formatHijriFromDate } from "@/lib/hijri";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("zakat_last_paid_at, zakat_next_due_at, zakat_reminder_enabled, hijri_correction_days")
    .eq("id", userId)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ zakat: data });
}

// Saves "متى أخرجت الزكاة" and computes the next due date one full Hijri
// year later (the شرعي حول for Zakat is a Hijri year, not Gregorian) —
// that date then drives the Telegram reminder in lib/reminders.ts.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const asOfDate = body.as_of_date as string | undefined;
  if (!asOfDate || !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    return NextResponse.json({ error: "لازم تختار تاريخ صحيح" }, { status: 400 });
  }

  const { data: user } = await supabaseAdmin.from("app_users").select("hijri_correction_days").eq("id", userId).single();
  const correctionDays = Number(user?.hijri_correction_days) || 0;

  const [y, m, d] = asOfDate.split("-").map(Number);
  const paidDate = new Date(y, m - 1, d);
  const nextDueDate = addHijriYears(paidDate, 1, correctionDays);
  const nextDueIso = `${nextDueDate.getFullYear()}-${String(nextDueDate.getMonth() + 1).padStart(2, "0")}-${String(nextDueDate.getDate()).padStart(2, "0")}`;

  const { data, error } = await supabaseAdmin
    .from("app_users")
    .update({
      zakat_last_paid_at: asOfDate,
      zakat_next_due_at: nextDueIso,
      zakat_reminder_enabled: true,
      zakat_last_reminded_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select("zakat_last_paid_at, zakat_next_due_at, zakat_reminder_enabled")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    zakat: data,
    next_due_hijri: formatHijriFromDate(nextDueDate, correctionDays),
    next_due_gregorian: nextDueIso,
  });
}
