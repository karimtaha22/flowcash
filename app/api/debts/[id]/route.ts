import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";
import { logDebtEvent, notifyIfLinkedAccount } from "@/lib/debtLinks";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  // "تم حل الاعتراض" — creditor-only (this whole route is already scoped to
  // .eq("user_id", userId) below), the debtor's public link can never clear
  // its own objection (see POST /api/debt-link/[token]/object).
  if (body.resolve_objection) {
    const { data: existing } = await supabaseAdmin.from("debts").select("id,objection_created_at,objection_resolved_at").eq("id", id).eq("user_id", userId).single();
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (!existing.objection_created_at || existing.objection_resolved_at) {
      return NextResponse.json({ error: "مفيش اعتراض قائم لحله" }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin.from("debts").update({ objection_resolved_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logDebtEvent(id, "objection_resolved", "تم حل الاعتراض", "creditor");
    return NextResponse.json({ debt: data });
  }

  // Round 48 — "في الإعدادات تعمل مفتاح اسمه الأرشيف... ومفتاح رجوع الدين
  // يرجعه": أرشفة/استرجاع يدوي — منفصل عن الأرشفة التلقائية اللي بتحصل
  // وقت تسوية الدين بالكامل (راجع POST /api/debts/[id]/payments). ده بيدي
  // إمكانية أرشفة أي دين مقفول (مسدد أو معدوم) حتى لو الأرشفة التلقائية
  // مكانتش انطبقت (زي دين متعمل عليه written_off يدوي)، واسترجاعه تاني.
  if (body.archive === true || body.restore === true) {
    const { data, error } = await supabaseAdmin
      .from("debts")
      .update({ archived_at: body.archive === true ? new Date().toISOString() : null })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ debt: data });
  }

  const { data: before } = await supabaseAdmin.from("debts").select("due_date,is_advanced").eq("id", id).eq("user_id", userId).single();

  const allowed = ["title", "reason", "currency", "due_date", "debt_date", "status", "person_id", "original_amount", "remaining_amount"];
  const update: Record<string, any> = {};
  for (const k of allowed) if (k in body) update[k] = body[k];
  if ("original_amount" in update) update.original_amount = Number(update.original_amount) || 0;
  if ("remaining_amount" in update) update.remaining_amount = Number(update.remaining_amount) || 0;
  update.updated_at = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("debts")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // audit-log a term extension on the public live link — only meaningful
  // for advanced debts (simple debts have no link/log for anyone to see).
  if (before?.is_advanced && "due_date" in update && update.due_date && update.due_date !== before.due_date) {
    await logDebtEvent(id, "due_date_extended", `تم تمديد أجل الدين${before.due_date ? ` من ${before.due_date}` : ""} إلى ${update.due_date}`, "creditor");
  }

  return NextResponse.json({ debt: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data: debt } = await supabaseAdmin
    .from("debts")
    .select("id,title,is_advanced,person_id,people(phone)")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (!debt) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Round 25 — "يروح لكل الأطراف إن الدائن مسح الدين": best-effort notify
  // everyone this advanced debt was shared with, BEFORE the cascade-delete
  // removes debt_witnesses. Only reaches parties who already have a linked
  // FlowCash/Telegram account (same phone-match mechanism as everywhere
  // else in this feature) — there's no channel to reach someone who never
  // opened the app at all.
  if (debt.is_advanced) {
    const otherPartyPhone = (debt as any).people?.phone;
    const { data: witnesses } = await supabaseAdmin.from("debt_witnesses").select("phone").eq("debt_id", id);
 const msg =`تم إلغاء وحذف الدين"${debt.title}"من صاحبه`;
    await notifyIfLinkedAccount(otherPartyPhone, msg);
    for (const w of witnesses || []) await notifyIfLinkedAccount(w.phone, msg);
  }

  await supabaseAdmin.from("debt_payments").delete().eq("debt_id", id);
  await supabaseAdmin.from("transactions").update({ debt_id: null }).eq("debt_id", id);
  const { error } = await supabaseAdmin.from("debts").delete().eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
