import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createSession } from "@/lib/session";
import { rpInfoFromRequest } from "@/lib/webauthn";

export async function POST(req: NextRequest) {
  const store = await cookies();
  const expectedChallenge = store.get("webauthn_challenge")?.value;
  const userId = store.get("webauthn_login_user")?.value;
  if (!expectedChallenge || !userId) return NextResponse.json({ error: "انتهت صلاحية الطلب، حاول تاني" }, { status: 400 });

  const body = await req.json();
  const { rpID, origin } = rpInfoFromRequest(req);

  const { data: user } = await supabaseAdmin.from("app_users").select("id,name,webauthn_credential").eq("id", userId).single();
  const cred = user?.webauthn_credential as { id: string; publicKey: string; counter: number; transports?: string[] } | null;
  if (!user || !cred) return NextResponse.json({ error: "مفيش بصمة مسجلة" }, { status: 404 });

  try {
    const verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.id,
        publicKey: new Uint8Array(Buffer.from(cred.publicKey, "base64url")),
        counter: cred.counter,
        transports: cred.transports as any,
      },
    });

    if (!verification.verified) {
      return NextResponse.json({ error: "فشل التحقق من البصمة" }, { status: 401 });
    }

    await supabaseAdmin
      .from("app_users")
      .update({ webauthn_credential: { ...cred, counter: verification.authenticationInfo.newCounter } })
      .eq("id", userId);

    store.delete("webauthn_challenge");
    store.delete("webauthn_login_user");
    await createSession(userId);
    return NextResponse.json({ ok: true, name: user.name });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "فشل التحقق من البصمة" }, { status: 400 });
  }
}
