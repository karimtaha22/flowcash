import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";
import { toEGP } from "@/lib/fx";
import { getFxRates } from "@/lib/fxRates";
import { startOfDay, startOfWeek, startOfMonth } from "date-fns";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { rates } = await getFxRates();

  const [{ data: accounts }, { data: debts }, { data: transactions }] = await Promise.all([
    supabaseAdmin.from("accounts").select("*").eq("user_id", userId).eq("is_archived", false),
    supabaseAdmin.from("debts").select("*").eq("user_id", userId).eq("status", "open"),
    supabaseAdmin
      .from("transactions")
      .select("*, categories(name, icon)")
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(500),
  ]);

  const owned = (accounts || []).reduce((sum, a) => sum + toEGP(Number(a.balance), a.currency, rates), 0);
  const owedToMe = (debts || [])
    .filter((d) => d.direction === "owed_to_me")
    .reduce((sum, d) => sum + toEGP(Number(d.remaining_amount), d.currency, rates), 0);
  const iOwe = (debts || [])
    .filter((d) => d.direction === "i_owe")
    .reduce((sum, d) => sum + toEGP(Number(d.remaining_amount), d.currency, rates), 0);

  const totalOwned = owned + owedToMe;
  const net = totalOwned - iOwe;

  const now = new Date();
  const dayStart = startOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 6 }); // Saturday start (common in Egypt)
  const monthStart = startOfMonth(now);

  const spendables = (transactions || []).filter((t) => t.type === "expense" || t.type === "withdrawal");
  const sumSince = (d: Date) =>
    spendables
      .filter((t) => new Date(t.occurred_at) >= d)
      .reduce((s, t) => s + toEGP(Math.abs(Number(t.amount)), t.currency, rates), 0);

  const spentToday = sumSince(dayStart);
  const spentWeek = sumSince(weekStart);
  const spentMonth = sumSince(monthStart);

  // category breakdown (this month)
  const byCat: Record<string, { name: string; icon: string; total: number }> = {};
  for (const t of spendables.filter((t) => new Date(t.occurred_at) >= monthStart)) {
    const key = t.categories?.name || "غير مصنف";
    if (!byCat[key]) byCat[key] = { name: key, icon: t.categories?.icon || "📦", total: 0 };
    byCat[key].total += toEGP(Math.abs(Number(t.amount)), t.currency, rates);
  }

  // balance history: last 30 days, running total of accounts owned (approx via transactions deltas)
  const history: { date: string; balance: number }[] = [];
  let running = owned;
  const daily: Record<string, number> = {};
  for (const t of transactions || []) {
    const day = new Date(t.occurred_at).toISOString().slice(0, 10);
    let delta = 0;
    const amt = toEGP(Number(t.amount), t.currency, rates);
    if (t.type === "expense" || t.type === "withdrawal") delta = -Math.abs(amt);
    else if (t.type === "income") delta = Math.abs(amt);
    else if (t.type === "balance_update") delta = amt;
    daily[day] = (daily[day] || 0) + delta;
  }
  const days = Object.keys(daily).sort();
  let cursor = owned;
  // walk backwards from current owned total by reversing today's deltas to get historical points
  const sortedDaysDesc = [...days].reverse();
  const points: { date: string; balance: number }[] = [];
  let bal = owned;
  for (const day of sortedDaysDesc) {
    points.push({ date: day, balance: bal });
    bal -= daily[day];
  }
  points.reverse();

  return NextResponse.json({
    netWorth: { totalOwned, iOwe, net, owned, owedToMe },
    spent: { today: spentToday, week: spentWeek, month: spentMonth },
    categoryBreakdown: Object.values(byCat).sort((a, b) => b.total - a.total),
    balanceHistory: points,
    rates,
  });
}
