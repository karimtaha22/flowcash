import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";
import { startOfMonth } from "date-fns";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const monthKey = new Date().toISOString().slice(0, 7);
  const monthStart = startOfMonth(new Date()).toISOString();

  const [{ data: recurring }, { data: budgets }, { count: overdueCountRaw }, { data: txs }] = await Promise.all([
    supabaseAdmin.from("recurring_items").select("id,last_confirmed_month,is_active").eq("user_id", userId).eq("is_active", true),
    supabaseAdmin.from("budgets").select("id,category_id,monthly_limit,alert_threshold_pct").eq("user_id", userId),
    supabaseAdmin.from("debts").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "overdue"),
    supabaseAdmin.from("transactions").select("category_id,amount").eq("user_id", userId).eq("type", "expense").gte("occurred_at", monthStart),
  ]);

  const dueRecurring = (recurring || []).filter((r) => r.last_confirmed_month !== monthKey).length;

  const spentByCategory: Record<string, number> = {};
  for (const t of txs || []) {
    if (!t.category_id) continue;
    spentByCategory[t.category_id] = (spentByCategory[t.category_id] || 0) + Math.abs(Number(t.amount));
  }
  const overBudget = (budgets || []).filter((b) => {
    const pct = b.monthly_limit > 0 ? ((spentByCategory[b.category_id] || 0) / Number(b.monthly_limit)) * 100 : 0;
    return pct >= (b.alert_threshold_pct || 80);
  }).length;

  const overdueCount = overdueCountRaw ?? 0;

  return NextResponse.json({ count: dueRecurring + overBudget + overdueCount, dueRecurring, overBudget, overdueCount });
}
