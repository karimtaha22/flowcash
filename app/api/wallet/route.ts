import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { getWalletBalances, adjustWallet } from "@/lib/wallet";

// Round 35 — "المحفظة الشخصية". GET lists every currency's running balance;
// POST applies a signed delta (positive = add cash, negative = take cash
// out) to one currency, upserting a fresh row the first time that currency
// is touched. Never touches `accounts` — see lib/wallet.ts header comment.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const balances = await getWalletBalances(userId);
  return NextResponse.json({ balances });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const currency = String(body.currency || "EGP").trim() || "EGP";
  const amount = Number(body.amount);
  if (!amount || !Number.isFinite(amount)) return NextResponse.json({ error: "المبلغ لازم يكون رقم غير صفري" }, { status: 400 });
  try {
    const newBalance = await adjustWallet(userId, currency, amount, body.reason || null, "app");
    return NextResponse.json({ balance: newBalance, currency });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "حصل خطأ" }, { status: 500 });
  }
}
