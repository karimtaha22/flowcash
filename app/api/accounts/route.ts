import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";
import { logEvent } from "@/lib/auditLog";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await supabaseAdmin
    .from("accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("is_archived", false)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ accounts: data });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const { name, type, account_number, currency, balance, parent_account_id } = body;
  if (!type) return NextResponse.json({ error: "نوع الحساب مطلوب" }, { status: 400 });
  // name is allowed to be empty — the UI already warns the user before
  // calling this, but the save must still go through per their request, so
  // fall back to a placeholder rather than rejecting.
  const { data, error } = await supabaseAdmin
    .from("accounts")
    .insert({
      user_id: userId,
      name: name && String(name).trim() ? String(name).trim() : "حساب بدون اسم",
      type,
      account_number: account_number || null,
      currency: currency || "EGP",
      balance: balance || 0,
      parent_account_id: parent_account_id || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logEvent({
    user_id: userId,
    source: "app",
    action: "account_created",
    payload: { id: data.id, name: data.name, currency: data.currency, parent_account_id: data.parent_account_id },
  });
  return NextResponse.json({ account: data });
}
