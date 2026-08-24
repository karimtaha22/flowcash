import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminAuth } from "@/lib/adminGuard";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminAuth();
  if (guard) return guard;

  const { id } = await params;
  const body = await req.json();
  // telegram_bot_token / telegram_chat_id are deliberately NOT admin-editable
  // any more — every customer now shares one bot and links themselves via
  // الإعدادات → اربط حسابك بتليجرام (see app/api/telegram/link). Admin
  // setting an arbitrary chat_id here would let it be pointed at the wrong
  // Telegram chat, silently misrouting someone's financial reminders.
  const allowed = [
    "google_sheet_id",
    "google_service_account_email",
    "base_currency",
    "dark_mode",
    "travel_mode",
    "debt_reminder_hour",
    "recurring_reminder_hour",
  ];
  const update: Record<string, any> = {};
  for (const k of allowed) if (k in body) update[k] = body[k];
  // name/pin are handled separately from the generic allowlist above: both
  // are sent as empty strings from the admin UI's "leave blank to keep
  // unchanged" fields, so an empty value here means "don't touch it", not
  // "clear it".
  if (typeof body.name === "string" && body.name.trim().length > 0) {
    update.name = body.name.trim();
  }
  // PIN change — a separate field on purpose (never sent/stored as plain
  // text): only touches pin_hash when the admin actually typed a new one.
  if (typeof body.pin === "string" && body.pin.length > 0) {
    if (body.pin.length < 4) {
      return NextResponse.json({ error: "الـ PIN لازم يكون ٤ أرقام على الأقل" }, { status: 400 });
    }
    update.pin_hash = await bcrypt.hash(body.pin, 10);
  }
  update.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("app_users")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ user: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminAuth();
  if (guard) return guard;

  const { id } = await params;
  const { error } = await supabaseAdmin.from("app_users").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
