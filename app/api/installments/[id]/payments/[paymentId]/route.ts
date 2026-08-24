import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

// "تم دفع القسط" — from the app or from the ✅ button under the Telegram
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
