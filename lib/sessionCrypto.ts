import crypto from "crypto";

// Pure HMAC sign/verify — no next/headers import, so this is usable from
// BOTH route handlers (via lib/session.ts, which wraps it with the cookies()
// API) and middleware.ts (which reads cookies off NextRequest directly;
// next/headers' cookies() isn't available there).
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET || (process.env.NODE_ENV !== "production" ? "flowcash_dev_secret_LOCAL_ONLY" : "");
  if (!secret) {
    throw new Error("SESSION_SECRET env var is required in production — set a long random value in Vercel project settings.");
  }
  return secret;
}

export function signValue(value: string): string {
  const h = crypto.createHmac("sha256", getSessionSecret()).update(value).digest("hex");
  return `${value}.${h}`;
}

export function verifySignedValue(signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx === -1) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = crypto.createHmac("sha256", getSessionSecret()).update(value).digest("hex");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (crypto.timingSafeEqual(sigBuf, expectedBuf)) return value;
  return null;
}

export const SESSION_COOKIE_NAME = "flowcash_session";
