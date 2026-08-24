import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("installment_plans")
    .select("*, installment_payments(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // payments always come back due_date-ordered so the UI never has to re-sort
  const plans = (data || []).map((p: any) => ({
    ...p,
    installment_payments: (p.installment_payments || []).sort((a: any, b: any) => a.month_index - b.month_index),
  }));
  return NextResponse.json({ plans });
}

// كل قسط بقيمة ثابتة (المبلغ اللي المستخدم داخله بنفسه لكل شهر) — من غير أي
// تقسيم أو تقريب، فمجموع الأقساط = المبلغ الشهري × عدد الشهور بالظبط.
function buildSchedule(monthlyAmount: number, monthsCount: number, startDateIso: string) {
  const start = new Date(startDateIso + "T00:00:00");
  const rows: { month_index: number; due_date: string; amount: number }[] = [];
  for (let i = 1; i <= monthsCount; i++) {
    const due = new Date(start.getFullYear(), start.getMonth() + (i - 1), start.getDate());
    rows.push({ month_index: i, due_date: due.toISOString().slice(0, 10), amount: monthlyAmount });
  }
  return rows;
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { item_name, company_name, original_price, monthly_amount, months_count, start_date, currency } = body;

  if (!item_name || !monthly_amount || !months_count || !start_date) {
    return NextResponse.json({ error: "بيانات ناقصة (اسم السلعة، مبلغ القسط، عدد الشهور، تاريخ أول قسط)" }, { status: 400 });
  }
  const monthlyAmount = Math.round(Number(monthly_amount) * 100) / 100;
  const months = Math.floor(Number(months_count));
  if (!(monthlyAmount > 0) || !(months > 0)) {
    return NextResponse.json({ error: "مبلغ القسط وعدد الشهور لازم يكونوا أرقام أكبر من صفر" }, { status: 400 });
  }
  const total = Math.round(monthlyAmount * months * 100) / 100;

  const { data: plan, error } = await supabaseAdmin
    .from("installment_plans")
    .insert({
      user_id: userId,
      item_name,
      company_name: company_name || null,
      original_price: original_price ? Number(original_price) : null,
      total_amount: total,
      months_count: months,
      monthly_amount: monthlyAmount,
      currency: currency || "EGP",
      start_date,
      status: "active",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const schedule = buildSchedule(monthlyAmount, months, start_date).map((r) => ({ ...r, plan_id: plan.id }));
  const { error: payErr } = await supabaseAdmin.from("installment_payments").insert(schedule);
  if (payErr) {
    // roll back the plan so we don't leave an orphaned schedule-less plan behind
    await supabaseAdmin.from("installment_plans").delete().eq("id", plan.id);
    return NextResponse.json({ error: payErr.message }, { status: 500 });
  }

  return NextResponse.json({ plan });
}
