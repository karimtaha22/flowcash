// Round 38 — توكن مؤقت (٣٠ دقيقة) لفتح "غرفة الأم" بعد التحقق من الـ PIN
// الصحيح. مبني على نفس آلية توقيع الجلسة الموجودة (lib/sessionCrypto.ts)
// بس بإضافة وقت انتهاء صلاحية — الجلسة العادية (flowcash_session) بتتحقق
// دايمًا كمان قبل أي حاجة هنا، التوكن ده طبقة إضافية فوقها مش بديل عنها.
import { signValue, verifySignedValue } from "@/lib/sessionCrypto";

const TTL_MS = 30 * 60 * 1000;

export function makeUnlockToken(partyId: string): string {
  const expires = Date.now() + TTL_MS;
  return signValue(`${partyId}:${expires}`);
}

export function checkUnlockToken(token: string | undefined | null, partyId: string): boolean {
  if (!token) return false;
  const raw = verifySignedValue(token);
  if (!raw) return false;
  const idx = raw.lastIndexOf(":");
  if (idx === -1) return false;
  const pid = raw.slice(0, idx);
  const expires = Number(raw.slice(idx + 1));
  if (pid !== partyId) return false;
  return Number.isFinite(expires) && Date.now() < expires;
}

export const UNLOCK_COOKIE_PREFIX = "laha_gr_unlock_";
