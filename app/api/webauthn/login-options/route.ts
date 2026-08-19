import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { rpInfoFromRequest } from "@/lib/webauthn";

// Called from the login screen, before the user is authenticated — they've only picked
// their profile so far (same as tapping a name before typing a PIN).
export async function POST(req: NextRequest) {
  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });

  const { data: user } = await supabaseAdmin.from("app_users").select("webauthn_credential").eq("id", userId).single();
  const cred = user?.webauthn_credential as { id: string; transports?: string[] } | null;
  if (!cred) return NextResponse.json({ error: "مفيش بصمة مسجلة للمستخدم ده" }, { status: 404 });

  const { rpID } = rpInfoFromRequest(req);
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: [{ id: cred.id, transports: cred.transports as any }],
    userVerification: "required",
  });

  const store = await cookies();
  store.set("webauthn_challenge", options.challenge, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 300 });
  store.set("webauthn_login_user", userId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 300 });

  return NextResponse.json({ options });
}
