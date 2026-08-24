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

// كل قسط بيتحسب من المبلغ الإجمالي مقسوم على عدد الشهور — القسط الأخير بياخد
// أي كسور جنيه متبقية عشان مجموع كل الأقساط يساوي المبلغ الإجمالي بالظبط.
function buildSchedule(totalAmount: number, monthsCount: number, startDateIso: string) {
  const base = Math.round((totalAmount / monthsCount) * 100) / 100;
  const start = new Date(startDateIso + "T00:00:00");
  const rows: { month_index: number; due_date: string; amount: number }[] = [];
  let sumSoFar = 0;
  for (let i = 1; i <= monthsCount; i++) {
    const due = new Date(start.getFullYear(), start.getMonth() + (i - 1), start.getDate());
    const isLast = i === monthsCount;
    const amount = isLast ? Math.round((totalAmount - sumSoFar) * 100) / 100 : base;
    sumSoFar += amount;
    rows.push({ month_index: i, due_date: due.toISOString().slice(0, 10), amount });
  }
  return rows;
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { item_name, company_name, original_price, total_amount, months_count, start_date, currency } = body;

  if (!item_name || !total_amount || !months_count || !start_date) {
    return NextResponse.json({ error: "بيانات ناقصة (اسم السلعة، المبلغ الإجمالي، عدد الشهور، تاريخ القسط)" }, { status: 400 });
  }
  const total = Number(total_amount);
  const months = Math.floor(Number(months_count));
  if (!(total > 0) || !(months > 0)) {
    return NextResponse.json({ error: "المبلغ الإجمالي وعدد الشهور لازم يكونوا أرقام أكبر من صفر" }, { status: 400 });
  }

  const monthlyAmount = Math.round((total / months) * 100) / 100;

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

  const schedule = buildSchedule(total, months, start_date).map((r) => ({ ...r, plan_id: plan.id }));
  const { error: payErr } = await supabaseAdmin.from("installment_payments").insert(schedule);
  if (payErr) {
    // roll back the plan so we don't leave an orphaned schedule-less plan behind
    await supabaseAdmin.from("installment_plans").delete().eq("id", plan.id);
    return NextResponse.json({ error: payErr.message }, { status: 500 });
  }

  return NextResponse.json({ plan });
}
