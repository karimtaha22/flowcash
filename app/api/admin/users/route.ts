import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { DEFAULT_CATEGORIES } from "@/lib/categories";
import { requireAdminAuthOrBootstrap } from "@/lib/adminGuard";

export async function GET() {
  const guard = await requireAdminAuthOrBootstrap();
  if (guard) return guard;

  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select(
      "id,name,base_currency,telegram_bot_username,telegram_chat_id,google_sheet_id,is_family,parent_user_id,created_at,debt_reminder_hour,recurring_reminder_hour,is_admin,license_code,license_type,license_started_at,license_expires_at,license_allowed_pages,license_redeemed_at"
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
  const pin_hash = await bcrypt.hash(pin, 10);
  const { data: user, error } = await supabaseAdmin
    .from("app_users")
    .insert({
      name,
      pin_hash,
      base_currency: base_currency || "EGP",
      is_family: !!is_family,
      parent_user_id: parent_user_id || null,
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
