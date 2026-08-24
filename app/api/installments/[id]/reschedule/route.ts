import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

// "هتدفع قسطين ولا نعيد الجدولة؟" — the "أعد الجدولة" branch. Pushes every
// still-unpaid installment's due date forward by `months` (default 1),
// keeping the spacing between them — so a plan that fell behind gets a
// fresh, achievable due date for its next installment instead of staying
// permanently flagged red. The "ادفع القسطين" branch needs no endpoint of
// its own — the app just calls the mark-paid endpoint twice.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const months = Math.max(1, Math.floor(Number(body.months) || 1));

  const { data: plan } = await supabaseAdmin.from("installment_plans").select("id").eq("id", id).eq("user_id", userId).single();
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: pending, error } = await supabaseAdmin
    .from("installment_payments")
    .select("id,due_date")
    .eq("plan_id", id)
    .eq("status", "pending");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  for (const p of pending || []) {
    const d = new Date(p.due_date + "T00:00:00");
    const newDue = new Date(d.getFullYear(), d.getMonth() + months, d.getDate());
    await supabaseAdmin
      .from("installment_payments")
      .update({ due_date: newDue.toISOString().slice(0, 10), reminded_2days_at: null, reminded_due_at: null })
      .eq("id", p.id);
  }

  return NextResponse.json({ ok: true, shifted: (pending || []).length });
}
