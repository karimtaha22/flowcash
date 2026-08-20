import { supabaseAdmin } from "./supabaseAdmin";
import { createTransaction } from "./transactions";
import { periodKeyFor } from "./recurringPeriod";

export { periodKeyFor, isConfirmedForCurrentPeriod } from "./recurringPeriod";

// "تم الدفع" / "دفعت" / "نزل" — used by BOTH the web app (صفحة التخطيط) and
// the Telegram bot. deduct=false records the period as confirmed WITHOUT
// touching any account balance (the user said it happened but doesn't want
// it counted in their tracked expenses); deduct=true creates the real
// transaction, optionally against a DIFFERENT account than the one the item
// was originally linked to (the user picks at confirm-time).
export async function confirmRecurringItem(
  userId: string,
  itemId: string,
  opts: { deduct: boolean; account_id?: string | null; source?: "app" | "bot" }
) {
  const { data: item } = await supabaseAdmin.from("recurring_items").select("*").eq("id", itemId).eq("user_id", userId).single();
  if (!item) throw new Error("العنصر ده مش موجود");

  const now = new Date();
  let tx = null;

  if (opts.deduct) {
    const accountId = opts.account_id || item.account_id;
    if (!accountId) throw new Error("لازم تختار حساب للخصم");
    tx = await createTransaction({
      user_id: userId,
      type: item.kind === "income" ? "income" : "expense",
      account_id: accountId,
      amount: item.amount,
      currency: item.currency,
      category_id: item.category_id,
      description: item.name,
      source: opts.source || "app",
    });
  }

  const update: Record<string, any> = { last_confirmed_date: now.toISOString().slice(0, 10) };
  if ((item.frequency || "monthly") === "monthly") update.last_confirmed_month = periodKeyFor(item, now);
  await supabaseAdmin.from("recurring_items").update(update).eq("id", itemId);

  return { item, transaction: tx };
}
