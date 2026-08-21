import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminAuth } from "@/lib/adminGuard";
import { PAGE_KEYS } from "@/lib/license";

// Covers every admin action on an EXISTING customer's license:
//   - convert trial -> permanent (or edit a permanent one), with a new
//     duration in days (or null for "مدى الحياة" / lifetime) and page set
//   - renew/extend (same shape — just a fresh days count from now)
//   - "delete" — per spec this does NOT hard-delete on the spot; it force-
//     expires the account immediately (license_expires_at = now), which
//     drops them into the exact same "انتهت المدة، بياناتك محفوظة 30 يوم"
//     state a natural expiry produces. The purge cron (see
//     /api/cron/purge-expired-customers) permanently removes the row (and
//     everything under it, via ON DELETE CASCADE) 30 days after that.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminAuth();
  if (guard) return guard;
  const { id } = await params;
  const body = await req.json();

  if (body.action === "delete") {
    const { data, error } = await supabaseAdmin
      .from("app_users")
      .update({ license_expires_at: new Date().toISOString() })
      .eq("id", id)
      .eq("is_admin", false) // never allow force-expiring the admin account
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ user: data });
  }

  const update: Record<string, any> = {};
  if (typeof body.email === "string") {
    const trimmedEmail = body.email.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return NextResponse.json({ error: "الإيميل مش صحيح" }, { status: 400 });
    }
    update.email = trimmedEmail || null;
  }
  if (body.type && ["trial", "permanent"].includes(body.type)) update.license_type = body.type;
  if (Array.isArray(body.allowed_pages)) {
    update.license_allowed_pages = body.allowed_pages.filter((p: string) => (PAGE_KEYS as readonly string[]).includes(p));
  }
  // days: a positive number extends from NOW; 0/null explicitly clears the
  // expiry (lifetime license) when the admin picks "مدى الحياة".
  if ("days" in body) {
    update.license_expires_at = body.days ? new Date(Date.now() + body.days * 86_400_000).toISOString() : null;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "مفيش تعديل مرسل" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("app_users")
    .update(update)
    .eq("id", id)
    .eq("is_admin", false)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ user: data });
}
