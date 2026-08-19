import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";
import { rpInfoFromRequest } from "@/lib/webauthn";

// Called from /settings while already logged in (via PIN) to register this device's
// fingerprint/face sensor as an additional, faster login method.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: user } = await supabaseAdmin.from("app_users").select("id,name,webauthn_credential").eq("id", userId).single();
  if (!user) return NextResponse.json({ error: "مستخدم غير موجود" }, { status: 404 });

  const { rpID, rpName } = rpInfoFromRequest(req);
  const existing = user.webauthn_credential as { id: string } | null;

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.name,
    userDisplayName: user.name,
    attestationType: "none",
    excludeCredentials: existing ? [{ id: existing.id }] : [],
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
      authenticatorAttachment: "platform",
    },
  });

  const store = await cookies();
  store.set("webauthn_challenge", options.challenge, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 300 });

  return NextResponse.json({ options });
}
