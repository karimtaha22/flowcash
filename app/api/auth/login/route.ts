import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createSession } from "@/lib/session";
import { clientIp, isLoginRateLimited, recordLoginAttempt } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const { userId, pin } = await req.json();
  if (!userId || !pin) return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });

  const ip = clientIp(req);
  // a short numeric PIN has very few possible values — without this, a
  // single attacker could try all of them in parallel within seconds via
  // Vercel's serverless concurrency. 10 failed attempts / 15 min / IP.
  if (await isLoginRateLimited(ip)) {
    return NextResponse.json({ error: "محاولات كتير غلط. حاول تاني بعد شوية." }, { status: 429 });
  }

  const { data: user, error } = await supabaseAdmin
    .from("app_users")
    .select("id,pin_hash,name")
    .eq("id", userId)
    .single();

  if (error || !user) {
    await recordLoginAttempt(ip, null, false);
    return NextResponse.json({ error: "مستخدم غير موجود" }, { status: 404 });
  }

  const ok = await bcrypt.compare(pin, user.pin_hash);
  await recordLoginAttempt(ip, user.id, ok);
  if (!ok) return NextResponse.json({ error: "الرقم السري غلط" }, { status: 401 });

  await createSession(user.id);
  return NextResponse.json({ ok: true, name: user.name });
}
