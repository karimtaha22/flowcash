import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";
import { startOfMonth } from "date-fns";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: budgets, error } = await supabaseAdmin
    .from("budgets")
    .select("*, categories(name,icon)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const monthStart = startOfMonth(new Date()).toISOString();
  const { data: txs } = await supabaseAdmin
    .from("transactions")
    .select("category_id, amount, currency, type")
    .eq("user_id", userId)
    .eq("type", "expense")
    .gte("occurred_at", monthStart);

  const spentByCategory: Record<string, number> = {};
  for (const t of txs || []) {
    if (!t.category_id) continue;
    spentByCategory[t.category_id] = (spentByCategory[t.category_id] || 0) + Math.abs(Number(t.amount));
  }

  const withSpend = (budgets || []).map((b) => ({
    ...b,
    spent: spentByCategory[b.category_id] || 0,
    pct: b.monthly_limit > 0 ? Math.round(((spentByCategory[b.category_id] || 0) / Number(b.monthly_limit)) * 100) : 0,
  }));

  return NextResponse.json({ budgets: withSpend });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const { category_id, monthly_limit, currency, alert_threshold_pct } = body;
  if (!category_id || !monthly_limit) return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
  const { data, error } = await supabaseAdmin
    .from("budgets")
    .insert({
      user_id: userId,
      category_id,
      monthly_limit,
      currency: currency || "EGP",
      alert_threshold_pct: alert_threshold_pct || 80,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ budget: data });
}
