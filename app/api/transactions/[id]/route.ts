import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";
import { deleteTransactionAndReverse, updateTransaction } from "@/lib/transactions";

const TX_SELECT =
  "*, accounts!transactions_account_id_fkey(name,currency), to_accounts:accounts!transactions_to_account_id_fkey(name,currency), categories(name,icon), debts(id,title,people(name))";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from("transactions")
    .select(TX_SELECT)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "الحركة غير موجودة" }, { status: 404 });
  return NextResponse.json({ transaction: data });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const updates: Record<string, unknown> = {};
  for (const k of ["description", "category_id", "counterparty_name", "receipt_url", "occurred_at"]) {
    if (k in body) updates[k] = body[k];
  }
  if ("amount" in body && body.amount !== "" && body.amount !== null) updates.amount = Number(body.amount);
  try {
    const tx = await updateTransaction(id, userId, updates);
    return NextResponse.json({ transaction: tx });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    await deleteTransactionAndReverse(id, userId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
