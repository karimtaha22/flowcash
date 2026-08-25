// Round 35 — "المحفظة الشخصية" (pocket cash). Deliberately a dedicated pair
// of tables (`wallets` balances + `wallet_entries` ledger), NOT a row in
// `accounts`: the whole point of this feature is cash that is explicitly
// EXCLUDED from "إجمالي الحسابات"/"صافي الثروة" everywhere — the dashboard
// (app/api/dashboard/route.ts), the Telegram bot's "📄 كشف سريع" quick
// statement (lib/telegramBot.ts), and the accounts page's own summary boxes
// all sum straight from `accounts`, so keeping the wallet in a separate
// table means it can never leak into any of those totals by omission — there
// is nothing to filter out because it was never in that query to begin with.
// Multiple currencies live side by side as separate rows, one per
// (user_id, currency) — e.g. 500 EGP + 100 USD sitting in the wallet at once.
import { supabaseAdmin } from "./supabaseAdmin";
import { logEvent, type AuditSource } from "./auditLog";

export interface WalletBalance {
  currency: string;
  balance: number;
}

export async function getWalletBalances(userId: string): Promise<WalletBalance[]> {
  const { data } = await supabaseAdmin.from("wallets").select("currency,balance").eq("user_id", userId).order("currency");
  return (data || []).map((w: any) => ({ currency: w.currency, balance: Number(w.balance) }));
}

// delta is signed: positive = money added to the wallet (e.g. after a
// withdrawal), negative = money taken out of it (e.g. a cash purchase).
export async function adjustWallet(userId: string, currency: string, delta: number, reason: string | null, source: AuditSource = "app") {
  const cur = (currency || "EGP").trim() || "EGP";
  const { data: existing } = await supabaseAdmin.from("wallets").select("balance").eq("user_id", userId).eq("currency", cur).maybeSingle();
  const newBalance = Number(existing?.balance || 0) + delta;
  const { error } = await supabaseAdmin
    .from("wallets")
    .upsert({ user_id: userId, currency: cur, balance: newBalance, updated_at: new Date().toISOString() }, { onConflict: "user_id,currency" });
  if (error) throw new Error(error.message);
  await supabaseAdmin.from("wallet_entries").insert({ user_id: userId, currency: cur, amount: delta, reason: reason || null });
  await logEvent({ user_id: userId, source, action: "wallet_adjusted", payload: { currency: cur, delta, newBalance, reason } });
  return newBalance;
}
