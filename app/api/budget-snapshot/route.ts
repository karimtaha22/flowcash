import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";
import { toEGP, fromEGP } from "@/lib/fx";
import { getFxRates } from "@/lib/fxRates";

// بيرجع لقطة من التزامات المستخدم الحقيقية المسجلة في البرنامج، كلها محوّلة
// لعملته الأساسية — مصاريف ثابتة متكررة، أقساط شغالة، جمعيات مشترك فيها،
// ديون متبقية، ودخل تقديري من حركات الدخل الفعلية. المحاكاة (SimulatorModal)
// بتستخدمها عشان تقول للمستخدم "أنت بتدفع كذا شهريًا، ودخلك تقريبًا كذا،
// فلو ضفت الجمعية/القسط ده هيبقى الموقف كذا" بدل ما يدخل الأرقام كلها بإيده.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: user } = await supabaseAdmin.from("app_users").select("base_currency").eq("id", userId).single();
  const baseCurrency = user?.base_currency || "EGP";
  const { rates } = await getFxRates();

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: recurring }, { data: plans }, { data: gam3eyat }, { data: debts }, { data: incomeTx }] = await Promise.all([
    supabaseAdmin.from("recurring_items").select("kind,amount,currency,frequency,interval_count").eq("user_id", userId).eq("is_active", true),
    supabaseAdmin.from("installment_plans").select("monthly_amount,currency").eq("user_id", userId).eq("status", "active"),
    supabaseAdmin.from("gam3eyas").select("monthly_amount,currency").eq("user_id", userId).eq("status", "active").eq("type", "subscribed"),
    supabaseAdmin.from("debts").select("remaining_amount,currency").eq("user_id", userId).eq("status", "open").eq("direction", "i_owe"),
    supabaseAdmin.from("transactions").select("amount,currency").eq("user_id", userId).eq("type", "income").gte("occurred_at", ninetyDaysAgo),
  ]);

  // بيرجع "كام في الشهر" حتى لو التكرار مش شهري (يومي/أسبوعي بفاصل N) — بيتم
  // توزيع المبلغ على أساس متوسط الشهر (~30.44 يوم / ~4.345 أسبوع).
  const monthlyEquivalent = (amount: number, frequency: string, intervalCount: number) => {
    const n = Math.max(1, intervalCount || 1);
    if (frequency === "daily") return (amount * 30.44) / n;
    if (frequency === "weekly") return (amount * 4.345) / n;
    return amount / n; // monthly
  };

  let monthlyFixedExpensesEGP = 0;
  let monthlyRecurringIncomeEGP = 0;
  for (const r of recurring || []) {
    const monthlyEGP = toEGP(monthlyEquivalent(Number(r.amount), r.frequency, r.interval_count), r.currency, rates);
    if (r.kind === "income") monthlyRecurringIncomeEGP += monthlyEGP;
    else monthlyFixedExpensesEGP += monthlyEGP;
  }

  const activeInstallmentsEGP = (plans || []).reduce((s, p) => s + toEGP(Number(p.monthly_amount), p.currency, rates), 0);
  const activeGam3eyaEGP = (gam3eyat || []).reduce((s, g) => s + toEGP(Number(g.monthly_amount), g.currency, rates), 0);
  const outstandingDebtsEGP = (debts || []).reduce((s, d) => s + toEGP(Number(d.remaining_amount), d.currency, rates), 0);
  const estimatedMonthlyIncomeEGP = (incomeTx || []).reduce((s, t) => s + toEGP(Math.abs(Number(t.amount)), t.currency, rates), 0) / 3;

  const conv = (egp: number) => Math.round(fromEGP(egp, baseCurrency, rates));

  return NextResponse.json({
    baseCurrency,
    monthlyFixedExpenses: conv(monthlyFixedExpensesEGP),
    monthlyRecurringIncome: conv(monthlyRecurringIncomeEGP),
    estimatedMonthlyIncome: conv(estimatedMonthlyIncomeEGP),
    activeInstallmentsMonthly: conv(activeInstallmentsEGP),
    activeGam3eyaMonthly: conv(activeGam3eyaEGP),
    outstandingDebts: conv(outstandingDebtsEGP),
  });
}
