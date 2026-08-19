import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";
import { rpInfoFromRequest } from "@/lib/webauthn";

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const store = await cookies();
  const expectedChallenge = store.get("webauthn_challenge")?.value;
  if (!expectedChallenge) return NextResponse.json({ error: "انتهت صلاحية الطلب، حاول تاني" }, { status: 400 });

  const body = await req.json();
  const { rpID, origin } = rpInfoFromRequest(req);

  try {
    const verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: "فشل التحقق من البصمة" }, { status: 400 });
    }

    const { credential } = verification.registrationInfo;
    await supabaseAdmin
      .from("app_users")
      .update({
        webauthn_credential: {
          id: credential.id,
          publicKey: Buffer.from(credential.publicKey).toString("base64url"),
          counter: credential.counter,
          transports: credential.transports || [],
        },
      })
      .eq("id", userId);

    store.delete("webauthn_challenge");
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "فشل التحقق من البصمة" }, { status: 400 });
  }
}
