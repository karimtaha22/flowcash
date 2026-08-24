import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";
import { logDebtEvent } from "@/lib/debtLinks";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { amount, receipt_url, note, account_id } = await req.json();

  const { data: debt } = await supabaseAdmin.from("debts").select("*").eq("id", id).eq("user_id", userId).single();
  if (!debt) return NextResponse.json({ error: "not found" }, { status: 404 });

  const paidAmount = Math.min(Number(amount), Number(debt.remaining_amount));
  await supabaseAdmin.from("debt_payments").insert({ debt_id: id, amount: paidAmount, receipt_url, note, currency: debt.currency });

  const newRemaining = Number(debt.remaining_amount) - paidAmount;
  const newStatus = newRemaining <= 0 ? "paid" : debt.status === "overdue" ? "overdue" : "open";
  await supabaseAdmin
    .from("debts")
    .update({ remaining_amount: Math.max(newRemaining, 0), status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", id);

  // audit-log on the public live link — only for advanced debts (see
  // lib/debtLinks.ts). Only the creditor (this route, always
  // session-authenticated) can ever reach this — no public endpoint records
  // payments.
  if (debt.is_advanced) {
    await logDebtEvent(id, "payment_recorded", `تم استلام دفعة ${paidAmount.toLocaleString()} ${debt.currency}${newRemaining <= 0 ? " — الدين اتقفل بالكامل" : ""}`, "creditor");
  }

  // optional: reflect the payment as an account transaction (money moving)
  if (account_id) {
    const delta = debt.direction === "owed_to_me" ? paidAmount : -paidAmount; // they pay me = income; I pay them = expense
    const { data: acc } = await supabaseAdmin.from("accounts").select("balance").eq("id", account_id).single();
    if (acc) {
      await supabaseAdmin
        .from("accounts")
        .update({ balance: Number(acc.balance) + delta })
        .eq("id", account_id);
    }
    await supabaseAdmin.from("transactions").insert({
      user_id: userId,
      type: debt.direction === "owed_to_me" ? "income" : "expense",
      account_id,
      amount: paidAmount,
      currency: debt.currency,
      description: `سداد دين: ${debt.title}`,
      debt_id: id,
      source: "app",
    });
  }

  return NextResponse.json({ ok: true, remaining: Math.max(newRemaining, 0), status: newStatus });
}
