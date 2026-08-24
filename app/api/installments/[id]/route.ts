import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

function addMonths(dateIso: string, n: number) {
  const d = new Date(dateIso + "T00:00:00");
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate()).toISOString().slice(0, 10);
}

// تعديل بيانات الخطة. الحقول العادية (اسم السلعة/الشركة/السعر الأصلي/الحالة)
// بتتحدث زي أي PATCH عادي. لو الطلب فيه `regenerate` (جاية من "تعديل متقدم"
// في حاسبة الأقساط) — بيتم حذف كل الأقساط اللي لسه "pending" بس (الأقساط
// المدفوعة فعلاً متتلمسش خالص) وتوليد جدول جديد من تاني بالمبلغ الشهري
// والعدد الجديدين، مبتدئ من اليوم اللي بعد آخر قسط مدفوع (أو النهاردة لو
// مفيش أقساط مدفوعة أصلاً).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const { data: existing } = await supabaseAdmin.from("installment_plans").select("*").eq("id", id).eq("user_id", userId).single();
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const allowed = ["item_name", "company_name", "original_price", "status"];
  const update: Record<string, any> = {};
  for (const k of allowed) if (k in body) update[k] = body[k];

  if (body.regenerate) {
    const monthlyAmount = Math.round(Number(body.regenerate.monthly_amount) * 100) / 100;
    const monthsCount = Math.floor(Number(body.regenerate.months_count));
    if (!(monthlyAmount > 0) || !(monthsCount > 0)) {
      return NextResponse.json({ error: "مبلغ القسط وعدد الشهور الجديدين لازم يكونوا أرقام أكبر من صفر" }, { status: 400 });
    }

    const { data: paidPayments } = await supabaseAdmin
      .from("installment_payments")
      .select("month_index,due_date,amount")
      .eq("plan_id", id)
      .eq("status", "paid")
      .order("month_index", { ascending: true });
    const paidCount = (paidPayments || []).length;
    const paidSum = (paidPayments || []).reduce((s, p) => s + Number(p.amount), 0);
    const lastPaidDue = paidPayments && paidPayments.length ? paidPayments[paidPayments.length - 1].due_date : null;
    const nextStart = lastPaidDue ? addMonths(lastPaidDue, 1) : new Date().toISOString().slice(0, 10);

    const { error: delErr } = await supabaseAdmin.from("installment_payments").delete().eq("plan_id", id).eq("status", "pending");
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    const newRows = Array.from({ length: monthsCount }, (_, i) => ({
      plan_id: id,
      month_index: paidCount + i + 1,
      due_date: addMonths(nextStart, i),
      amount: monthlyAmount,
      status: "pending" as const,
    }));
    const { error: insErr } = await supabaseAdmin.from("installment_payments").insert(newRows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    update.monthly_amount = monthlyAmount;
    update.months_count = paidCount + monthsCount;
    update.total_amount = Math.round((paidSum + monthlyAmount * monthsCount) * 100) / 100;
    update.status = "active";
  }

  update.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("installment_plans")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plan: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { error } = await supabaseAdmin.from("installment_plans").delete().eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
