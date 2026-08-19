import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await supabaseAdmin
    .from("people")
    .select("*, debts(id, direction, remaining_amount, status, currency)")
    .eq("user_id", userId)
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ people: data });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { name, phone, notes, phones, payment_accounts } = await req.json();
  if (!name) return NextResponse.json({ error: "الاسم مطلوب" }, { status: 400 });
  // phones[] is the source of truth going forward; `phone` (single, legacy)
  // is still accepted and folded into phones[0] so old callers keep working.
  const phoneList: string[] = Array.isArray(phones) ? phones.filter(Boolean) : phone ? [phone] : [];
  const accountList = Array.isArray(payment_accounts) ? payment_accounts.filter((a) => a && a.account_number) : [];
  const { data, error } = await supabaseAdmin
    .from("people")
    .insert({
      user_id: userId,
      name,
      phone: phoneList[0] || null,
      phones: phoneList,
      payment_accounts: accountList,
      notes,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ person: data });
}
