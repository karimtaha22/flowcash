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

  // Round 24 — "لو عندهم البرنامج يجيله اشعار طلب شهادة على دين": a debt
  // someone ELSE registered (any user_id, not mine) can name ME as a
  // witness/debtor/creditor by phone number. This is the one alerts-count
  // check that deliberately searches OTHER users' rows — every other check
  // in this file stays scoped to `.eq("user_id", userId)` as usual.
  const { data: meRow } = await supabaseAdmin.from("app_users").select("phone").eq("id", userId).single();
  const myPhone = (meRow?.phone || "").trim();
  const debtRequestItems: { label: string; href: string }[] = [];
  if (myPhone) {
    // Round 25 — witnesses no longer have a phone on file until they open
    // their own link and fill it in themselves (see /debt/[token] +
    // /api/debt-link/[token]/acknowledge), at which point they immediately
    // acknowledge in the same step — so there's no more "pre-fill invite"
    // moment to detect by phone for witnesses the way there is for the
    // debtor/creditor_view link below (whose phone the creditor still
    // enters up front). The witness-phone bell check was removed here for
    // that reason; witnesses are reached by the creditor sharing their link
    // directly, not by an in-app match.

    const { data: otherLinks } = await supabaseAdmin
      .from("debt_links")
      .select("token, role, debts!inner(title, person_id)")
      .in("role", ["debtor", "creditor_view"])
      .is("viewed_at", null)
      .is("revoked_at", null);
    const personIds = [...new Set((otherLinks || []).map((l: any) => l.debts?.person_id).filter(Boolean))];
    if (personIds.length) {
      const { data: people } = await supabaseAdmin.from("people").select("id,phone").in("id", personIds);
      const phoneByPerson = new Map((people || []).map((p: any) => [p.id, p.phone]));
      for (const l of (otherLinks || []) as any[]) {
        if (phoneByPerson.get(l.debts?.person_id) === myPhone) {
          const label = l.role === "debtor" ? `دين مُسجّل عليك: "${l.debts?.title || ""}" — راجعه` : `دين ليك عند حد سجّله في FlowCash: "${l.debts?.title || ""}" — راجعه`;
          debtRequestItems.push({ label, href: `/debt/${l.token}` });
        }
      }
    }
  }

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
  for (const it of debtRequestItems) items.push(it);

  const { data: myUnresolvedObjections } = await supabaseAdmin
    .from("debts")
    .select("id,title")
    .eq("user_id", userId)
    .not("objection_created_at", "is", null)
    .is("objection_resolved_at", null);
  for (const d of myUnresolvedObjections || []) {
    items.push({ label: `اعتراض على دين "${d.title}" محتاج مراجعتك`, href: `/people?debt=${d.id}` });
  }

  const dueRecurring = dueRecurringList.length;
  const overBudget = overBudgetList.length;
  const overdueCount = overdueDebtsCountRaw ?? (overdueDebts || []).length;
  const overdueInstallmentsCount = (overdueInstallments || []).length;
  const overdueGam3eyaCount = (overdueGam3eya || []).length;
  const debtRequestsCount = debtRequestItems.length;
  const unresolvedObjectionsCount = (myUnresolvedObjections || []).length;

  return NextResponse.json({
    count: dueRecurring + overBudget + overdueCount + overdueInstallmentsCount + overdueGam3eyaCount + debtRequestsCount + unresolvedObjectionsCount,
    dueRecurring,
    overBudget,
    overdueCount,
    overdueInstallmentsCount,
    overdueGam3eyaCount,
    debtRequestsCount,
    unresolvedObjectionsCount,
    items,
  });
}
