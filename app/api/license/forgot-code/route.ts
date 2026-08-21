import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { clientIp, isLoginRateLimited, recordLoginAttempt } from "@/lib/rateLimit";
import { sendEmail, forgotCodeEmailHtml } from "@/lib/email";

// PUBLIC route — a customer who lost their activation code (before it's
// redeemed) proves they're the right person by matching BOTH their exact
// name AND the email the admin stored for them when issuing the license.
// Reuses the same IP rate limiter as login/redeem so this can't be brute-
// forced into an email-enumeration or code-leak oracle. Deliberately always
// returns the same generic success message regardless of whether a match
// was found, so it can't be used to check which names/emails exist either.
const GENERIC_OK = { ok: true, message: "لو الاسم والإيميل مطابقين لعميل عنده كود لسه ماتفعّلش، هيوصله الكود على إيميله." };

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (await isLoginRateLimited(ip)) {
    return NextResponse.json({ error: "محاولات كتير، جرب تاني بعد شوية" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  if (name.length < 2 || !email) {
    return NextResponse.json({ error: "اكتب اسمك وإيميلك" }, { status: 400 });
  }

  const { data: user, error } = await supabaseAdmin
    .from("app_users")
    .select("id,name,email,license_code,license_redeemed_at,license_expires_at")
    .ilike("name", name)
    .ilike("email", email)
    .maybeSingle();

  // Always record the attempt (for rate limiting) and always return the
  // generic message — no matter what happened — so a stranger probing this
  // endpoint learns nothing about which names/emails are real customers.
  await recordLoginAttempt(ip, user?.id || null, !!user);

  if (error || !user || !user.license_code) return NextResponse.json(GENERIC_OK);
  if (user.license_redeemed_at) return NextResponse.json(GENERIC_OK); // already activated — nothing to recover
  if (user.license_expires_at && new Date(user.license_expires_at).getTime() <= Date.now()) return NextResponse.json(GENERIC_OK);

  await sendEmail(user.email, "كود تفعيل حسابك في FlowCash", forgotCodeEmailHtml(user.name, user.license_code));

  return NextResponse.json(GENERIC_OK);
}
