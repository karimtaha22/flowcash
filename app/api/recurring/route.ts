import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await supabaseAdmin
    .from("recurring_items")
    .select("*, accounts(name,currency), categories(name,icon)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const { kind, name, amount, currency, account_id, category_id, day_of_month, frequency, day_of_week, interval_count } = body;
  if (!kind || !name || !amount || !account_id) {
    return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
  }
  const freq = ["daily", "weekly", "monthly"].includes(frequency) ? frequency : "monthly";
  const interval = Number.isInteger(interval_count) && interval_count >= 1 ? interval_count : parseInt(interval_count) || 1;
  const { data, error } = await supabaseAdmin
    .from("recurring_items")
    .insert({
      user_id: userId,
      kind,
      name,
      amount,
      currency: currency || "EGP",
      account_id,
      category_id: category_id || null,
      day_of_month: day_of_month || 1,
      frequency: freq,
      day_of_week: freq === "weekly" ? (Number.isInteger(day_of_week) ? day_of_week : 0) : null,
      interval_count: Math.max(1, interval),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
