import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const direction = searchParams.get("direction");
  const person_id = searchParams.get("person_id");

  let query = supabaseAdmin
    .from("debts")
    .select("*, people(name, phone), debt_payments(id, amount, paid_at, receipt_url, note)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (direction) query = query.eq("direction", direction);
  if (person_id) query = query.eq("person_id", person_id);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ debts: data });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const { person_id, direction, title, reason, amount, currency, due_date, debt_date } = body;
  if (!person_id || !direction || !title || !amount) {
    return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from("debts")
    .insert({
      user_id: userId,
      person_id,
      direction,
      title,
      reason,
      original_amount: amount,
      remaining_amount: amount,
      currency: currency || "EGP",
      due_date: due_date || null,
      debt_date: debt_date || new Date().toISOString().slice(0, 10),
      status: "open",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ debt: data });
}
