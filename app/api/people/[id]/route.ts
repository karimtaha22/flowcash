import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const allowed = ["name", "phone", "notes", "phones", "payment_accounts"];
  const update: Record<string, any> = {};
  for (const k of allowed) if (k in body) update[k] = body[k];
  if (Array.isArray(update.phones)) {
    update.phones = update.phones.filter(Boolean);
    update.phone = update.phones[0] || null; // keep legacy single column in sync
  }
  if (Array.isArray(update.payment_accounts)) {
    update.payment_accounts = update.payment_accounts.filter((a: any) => a && a.account_number);
  }
  const { data, error } = await supabaseAdmin
    .from("people")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ person: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  // a person linked to an existing debt can't be silently deleted — that
  // would orphan the debt's person_id — so block it with a clear message.
  const { count } = await supabaseAdmin
    .from("debts")
    .select("id", { count: "exact", head: true })
    .eq("person_id", id)
    .eq("user_id", userId);
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: "الشخص ده مربوط بديون قائمة — مينفعش يتحذف" }, { status: 400 });
  }
  const { error } = await supabaseAdmin.from("people").delete().eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
