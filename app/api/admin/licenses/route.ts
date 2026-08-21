import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminAuth } from "@/lib/adminGuard";
import { generateLicenseCode, PAGE_KEYS } from "@/lib/license";

// Generates a NEW customer as an unredeemed license — "trial" (asks for how
// many days + which pages are open) or "permanent" (duration in days, or
// null for a lifetime license) directly from /admin, per the "توليد كود"
// flow. The customer doesn't exist as a usable account yet: pin_hash stays
// null until they redeem the code via /activate.
export async function POST(req: NextRequest) {
  const guard = await requireAdminAuth();
  if (guard) return guard;

  const body = await req.json();
  const { name, type, days, allowed_pages } = body;
  if (!name || !type || !["trial", "permanent"].includes(type)) {
    return NextResponse.json({ error: "الاسم ونوع الترخيص مطلوبين" }, { status: 400 });
  }
  if (type === "trial" && (!days || days <= 0)) {
    return NextResponse.json({ error: "عدد أيام التجربة مطلوب" }, { status: 400 });
  }

  const pages = Array.isArray(allowed_pages) ? allowed_pages.filter((p: string) => (PAGE_KEYS as readonly string[]).includes(p)) : [];

  // retry on the (very unlikely) chance of a code collision
  let code = generateLicenseCode();
  for (let i = 0; i < 5; i++) {
    const { count } = await supabaseAdmin.from("app_users").select("id", { count: "exact", head: true }).eq("license_code", code);
    if (!count) break;
    code = generateLicenseCode();
  }

  const now = new Date();
  const expiresAt = days ? new Date(now.getTime() + days * 86_400_000).toISOString() : null;

  const { data: user, error } = await supabaseAdmin
    .from("app_users")
    .insert({
      name,
      license_code: code,
      license_type: type,
      license_started_at: now.toISOString(),
      license_expires_at: expiresAt,
      license_allowed_pages: pages,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ user, code });
}
