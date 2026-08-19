import crypto from "crypto";
import { cookies } from "next/headers";

const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "flowcash_dev_secret";
const COOKIE_NAME = "flowcash_session";

function sign(value: string) {
  const h = crypto.createHmac("sha256", SECRET).update(value).digest("hex");
  return `${value}.${h}`;
}

function verify(signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx === -1) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = crypto.createHmac("sha256", SECRET).update(value).digest("hex");
  if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return value;
  return null;
}

export async function createSession(userId: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, sign(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
}

export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  return verify(raw);
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
