import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { userId, pin } = await req.json();
  if (!userId || !pin) return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });

  const { data: user, error } = await supabaseAdmin
    .from("app_users")
    .select("id,pin_hash,name")
    .eq("id", userId)
    .single();

  if (error || !user) return NextResponse.json({ error: "مستخدم غير موجود" }, { status: 404 });

  const ok = await bcrypt.compare(pin, user.pin_hash);
  if (!ok) return NextResponse.json({ error: "الرقم السري غلط" }, { status: 401 });

  await createSession(user.id);
  return NextResponse.json({ ok: true, name: user.name });
}
