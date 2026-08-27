import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

//"تم دفع القسط"— from the app or from the button under the Telegram
// reminder (see lib/telegramBot.ts's installment_paid callback). Marks one
// specific month's row paid; if that was the last unpaid row, the whole plan
// flips to completed.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, paymentId } = await params;

  const { data: plan } = await supabaseAdmin.from("installment_plans").select("id").eq("id", id).eq("user_id", userId).single();
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: payment, error } = await supabaseAdmin
    .from("installment_payments")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", paymentId)
    .eq("plan_id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { count } = await supabaseAdmin
    .from("installment_payments")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", id)
    .eq("status", "pending");
  if ((count || 0) === 0) {
    await supabaseAdmin.from("installment_plans").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", id);
  }

  return NextResponse.json({ ok: true, payment, planCompleted: (count || 0) === 0 });
}

// تعديل قسط بعد ما اتسجل (المبلغ، تاريخ الاستحقاق، أو التراجع عن "دفعت" لو
// اتسجلت غلط) — من نفس صف القسط في تبويب الأقساط. أي تعديل في المبلغ بيعيد
// حساب total_amount في الخطة عشان يفضل متسق مع مجموع الأقساط الفعلي، وأي
// تراجع عن الدفع بيرجع الخطة "شغالة" تاني لو كانت خلصت.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, paymentId } = await params;

  const { data: plan } = await supabaseAdmin.from("installment_plans").select("id").eq("id", id).eq("user_id", userId).single();
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const update: Record<string, any> = {};

  if (body.amount !== undefined) {
    const amt = Number(body.amount);
    if (!(amt > 0)) return NextResponse.json({ error: "المبلغ لازم يكون أكبر من صفر" }, { status: 400 });
    update.amount = Math.round(amt * 100) / 100;
  }
  if (body.due_date !== undefined && body.due_date) update.due_date = body.due_date;
  if (body.status !== undefined) {
    if (!["pending", "paid"].includes(body.status)) return NextResponse.json({ error: "حالة غير صحيحة" }, { status: 400 });
    update.status = body.status;
    update.paid_at = body.status === "paid" ? new Date().toISOString() : null;
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: "مفيش حاجة اتغيرت" }, { status: 400 });

  const { data: payment, error } = await supabaseAdmin
    .from("installment_payments")
    .update(update)
    .eq("id", paymentId)
    .eq("plan_id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: allPayments } = await supabaseAdmin.from("installment_payments").select("amount,status").eq("plan_id", id);
  const total = (allPayments || []).reduce((s, p) => s + Number(p.amount), 0);
  const pendingCount = (allPayments || []).filter((p) => p.status === "pending").length;
  await supabaseAdmin
    .from("installment_plans")
    .update({ total_amount: total, status: pendingCount === 0 ? "completed" : "active", updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json({ ok: true, payment });
}
