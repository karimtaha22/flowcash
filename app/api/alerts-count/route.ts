import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";
import { startOfMonth } from "date-fns";

// Beyond the plain count (used for the bell badge), this now also returns
// `items`: short, specific, ready-to-render descriptions of what's actually
// pending ("مرتب — لسه ماتأكدش الشهر ده" instead of just "في 3 حاجات") —
// each with an `href` so tapping one jumps straight to it. Used by
// components/TopBar.tsx's notifications dropdown (every page, not just the
// dashboard) and still by the dashboard's own alert card.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const monthKey = new Date().toISOString().slice(0, 7);
  const monthStart = startOfMonth(new Date()).toISOString();

  const todayIso = new Date().toISOString().slice(0, 10);

  const [{ data: recurring }, { data: budgets }, { data: overdueDebts, count: overdueDebtsCountRaw }, { data: txs }, { data: overdueInstallments }, { data: overdueGam3eya }] =
    await Promise.all([
      supabaseAdmin.from("recurring_items").select("id,name,last_confirmed_month,is_active").eq("user_id", userId).eq("is_active", true),
      supabaseAdmin.from("budgets").select("id,category_id,monthly_limit,alert_threshold_pct,categories(name)").eq("user_id", userId),
      // limit(20) on the actual rows (so the dropdown list stays short) but
      // count: "exact" still reflects the TRUE total, so the badge number
      // never undercounts a user with more than 20 overdue debts.
      supabaseAdmin.from("debts").select("id,title,people(name)", { count: "exact" }).eq("user_id", userId).eq("status", "overdue").limit(20),
      supabaseAdmin.from("transactions").select("category_id,amount").eq("user_id", userId).eq("type", "expense").gte("occurred_at", monthStart),
      supabaseAdmin
        .from("installment_payments")
        .select("id,due_date,installment_plans!inner(user_id,item_name)")
        .eq("installment_plans.user_id", userId)
        .eq("status", "pending")
        .lte("due_date", todayIso),
      supabaseAdmin
        .from("gam3eya_payments")
        .select("id,due_date,gam3eyas!inner(user_id,name),gam3eya_participants(name)")
        .eq("gam3eyas.user_id", userId)
        .eq("status", "pending")
        .lte("due_date", todayIso),
    ]);

  const items: { label: string; href: string }[] = [];

  const dueRecurringList = (recurring || []).filter((r) => r.last_confirmed_month !== monthKey);
  for (const r of dueRecurringList) {
    items.push({ label: `${r.name} — لسه ماتأكدش الشهر ده`, href: "/planning?tab=recurring" });
  }

  const spentByCategory: Record<string, number> = {};
  for (const t of txs || []) {
    if (!t.category_id) continue;
    spentByCategory[t.category_id] = (spentByCategory[t.category_id] || 0) + Math.abs(Number(t.amount));
  }
  const overBudgetList = (budgets || []).filter((b: any) => {
    const pct = b.monthly_limit > 0 ? ((spentByCategory[b.category_id] || 0) / Number(b.monthly_limit)) * 100 : 0;
    return pct >= (b.alert_threshold_pct || 80);
  });
  for (const b of overBudgetList as any[]) {
    const name = b.categories?.name || "ميزانية";
    items.push({ label: `ميزانية ${name} تخطت الحد`, href: "/planning?tab=budgets" });
  }

  for (const d of (overdueDebts || []) as any[]) {
    const person = d.people?.name ? ` (${d.people.name})` : "";
    items.push({ label: `دين "${d.title}"${person} متأخر`, href: `/people?debt=${d.id}` });
  }

  for (const p of (overdueInstallments || []) as any[]) {
    items.push({ label: `قسط "${p.installment_plans?.item_name}" مستحق`, href: "/installments?tab=installments" });
  }
  for (const p of (overdueGam3eya || []) as any[]) {
    const who = p.gam3eya_participants?.name ? ` — ${p.gam3eya_participants.name}` : "";
    items.push({ label: `دفعة "${p.gam3eyas?.name || "جمعية"}"${who} مستحقة`, href: "/installments?tab=gam3eya" });
  }

  const dueRecurring = dueRecurringList.length;
  const overBudget = overBudgetList.length;
  const overdueCount = overdueDebtsCountRaw ?? (overdueDebts || []).length;
  const overdueInstallmentsCount = (overdueInstallments || []).length;
  const overdueGam3eyaCount = (overdueGam3eya || []).length;

  return NextResponse.json({
    count: dueRecurring + overBudget + overdueCount + overdueInstallmentsCount + overdueGam3eyaCount,
    dueRecurring,
    overBudget,
    overdueCount,
    overdueInstallmentsCount,
    overdueGam3eyaCount,
    items,
  });
}
