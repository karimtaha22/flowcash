import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { DEFAULT_CATEGORIES } from "@/lib/categories";
import { requireAdminAuthOrBootstrap, isBootstrap } from "@/lib/adminGuard";

export async function GET() {
  const guard = await requireAdminAuthOrBootstrap();
  if (guard) return guard;

  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select(
      "id,name,base_currency,telegram_bot_username,telegram_chat_id,google_sheet_id,is_family,parent_user_id,created_at,debt_reminder_hour,recurring_reminder_hour,is_admin,email,license_code,license_type,license_started_at,license_expires_at,license_allowed_pages,license_redeemed_at"
    )
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminAuthOrBootstrap();
  if (guard) return guard;

  const body = await req.json();
  const { name, pin, base_currency, is_family, parent_user_id } = body;
  if (!name || !pin || pin.length < 4) {
    return NextResponse.json({ error: "الاسم و PIN (٤ أرقام على الأقل) مطلوبين" }, { status: 400 });
  }
  // If we're inside the genuine bootstrap window (ALLOW_ADMIN_BOOTSTRAP=true
  // AND zero accounts exist yet — see lib/adminGuard.ts), this request only
  // got past requireAdminAuthOrBootstrap() because no admin exists at all.
  // The very first account created in that window IS the admin — otherwise
  // there'd be no way to ever reach /admin again once bootstrap closes, with
  // no admin account and no way to create one. Re-checked right before the
  // insert (not just trusted from the guard above) since this request body
  // could in principle create several accounts in a fast sequence.
  const bootstrapping = await isBootstrap();
  const pin_hash = await bcrypt.hash(pin, 10);
  const { data: user, error } = await supabaseAdmin
    .from("app_users")
    .insert({
      name,
      pin_hash,
      base_currency: base_currency || "EGP",
      is_family: !!is_family,
      parent_user_id: parent_user_id || null,
      is_admin: bootstrapping,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // seed default categories for the new user
  await supabaseAdmin.from("categories").insert(
    DEFAULT_CATEGORIES.map((c) => ({ user_id: user.id, ...c }))
  );

  return NextResponse.json({ user });
}
