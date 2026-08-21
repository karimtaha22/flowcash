import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { clientIp, isLoginRateLimited, recordLoginAttempt } from "@/lib/rateLimit";

// Replaces the old "hand back every customer's name" GET /api/auth/users.
// The visitor types their own name and only gets back accounts that match —
// nothing is listed proactively. Reuses the same login_attempts rate limiter
// as PIN attempts (10 fails/15min/IP) so this can't be used to enumerate
// every customer name by brute-forcing short strings either.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (await isLoginRateLimited(ip)) {
    return NextResponse.json({ error: "محاولات كتير، جرب تاني بعد شوية" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (name.length < 2) {
    return NextResponse.json({ error: "اكتب اسمك (حرفين على الأقل)" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("id,name,is_family,webauthn_credential,license_type,license_redeemed_at")
    .ilike("name", `%${name}%`)
    .order("created_at", { ascending: true })
    .limit(5);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // A customer who was issued a license code but never redeemed it yet has
  // no pin_hash — they belong on /activate (code + choose-your-own-PIN), not
  // here entering a "PIN" that doesn't exist. Without this flag, /login sent
  // them straight to a numeric-only PIN box, where they'd try typing their
  // (letters-included) activation code and every letter would silently get
  // stripped — the exact bug reported live.
  const users = (data || []).map((u) => ({
    id: u.id,
    name: u.name,
    is_family: u.is_family,
    has_webauthn: !!u.webauthn_credential,
    needs_activation: !!u.license_type && !u.license_redeemed_at,
  }));
  await recordLoginAttempt(ip, null, users.length > 0);
  return NextResponse.json({ users });
}
