import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createSession } from "@/lib/session";
import { DEFAULT_CATEGORIES } from "@/lib/categories";
import { clientIp, isLoginRateLimited, recordLoginAttempt } from "@/lib/rateLimit";

// PUBLIC route — a brand-new customer has no session yet. They only need
// the code the admin gave them (out of band — WhatsApp, a call, whatever)
// plus a PIN of their own choosing. Same brute-force concern as /api/auth/login
// (a code is just a bigger "PIN"), so it shares the same IP rate limiter.
export async function POST(req: NextRequest) {
  const { code, pin } = await req.json();
  if (!code || !pin || String(pin).length < 4) {
    return NextResponse.json({ error: "الكود والـ PIN (٤ أرقام على الأقل) مطلوبين" }, { status: 400 });
  }

  const ip = clientIp(req);
  if (await isLoginRateLimited(ip)) {
    return NextResponse.json({ error: "محاولات كتير غلط. حاول تاني بعد شوية." }, { status: 429 });
  }

  const normalizedCode = String(code).trim().toUpperCase();
  const { data: user, error } = await supabaseAdmin
    .from("app_users")
    .select("id,name,license_redeemed_at,license_expires_at")
    .eq("license_code", normalizedCode)
    .single();

  if (error || !user) {
    await recordLoginAttempt(ip, null, false);
    return NextResponse.json({ error: "الكود غلط أو مش موجود" }, { status: 404 });
  }
  if (user.license_redeemed_at) {
    return NextResponse.json({ error: "الكود ده مستخدم بالفعل" }, { status: 400 });
  }
  if (user.license_expires_at && new Date(user.license_expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "الكود ده انتهت صلاحيته، تواصل مع فريق الدعم" }, { status: 400 });
  }

  await recordLoginAttempt(ip, user.id, true);
  const pin_hash = await bcrypt.hash(String(pin), 10);
  const { error: updateError } = await supabaseAdmin
    .from("app_users")
    .update({ pin_hash, license_redeemed_at: new Date().toISOString() })
    .eq("id", user.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // seed default categories for the newly-activated customer, same as the
  // admin-created-user flow does.
  await supabaseAdmin.from("categories").insert(DEFAULT_CATEGORIES.map((c) => ({ user_id: user.id, ...c })));

  await createSession(user.id);
  return NextResponse.json({ ok: true, name: user.name });
}
