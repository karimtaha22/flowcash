import { cookies } from "next/headers";
import { signValue, verifySignedValue, SESSION_COOKIE_NAME } from "./sessionCrypto";

// SECURITY: this used to fall back to TELEGRAM_WEBHOOK_SECRET (a DIFFERENT
// secret, used to authorize inbound Telegram webhook calls — it appears in
// URLs and is far more exposed than a session-signing key should be) and,
// failing that, a hardcoded public string ("flowcash_dev_secret"). Either
// one leaking — or simply never having set a real SESSION_SECRET in
// Vercel — let anyone forge a valid session cookie for ANY user id, since
// forging just needs the secret + the target's uuid (visible in admin API
// responses). Production now requires its own dedicated SESSION_SECRET; see
// lib/sessionCrypto.ts for the actual check (shared with middleware.ts,
// which can't use next/headers).

export async function createSession(userId: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, signValue(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
}

export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return null;
  return verifySignedValue(raw);
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}
