// Round 38 — تجزئة الرقم السري لحفلة الكشف عن نوع الجنين. البروتوتايب
// المرجعي كان بيقارن الـ PIN كنص عادي مخزّن كما هو (`pinInput === gr.pin`)
// — أي حد يفتح localStorage/الشبكة يقدر يشوفه. هنا الـ PIN بيتعمله hash
// (scrypt + salt عشوائي لكل حفلة) من لحظة ما الدكتور/الصديقة يدخله، ومفيش
// أي endpoint في التطبيق بيرجّع pin_hash أو pin_salt للعميل أصلاً — التحقق
// بيحصل سيرفر-سايد بس (راجع app/api/laha/gender-reveal/unlock).
import crypto from "crypto";

export function hashPin(pin: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pin, salt, 32).toString("hex");
  return { hash, salt };
}

export function verifyPin(pin: string, hash: string, salt: string): boolean {
  try {
    const test = crypto.scryptSync(pin, salt, 32).toString("hex");
    const a = Buffer.from(test, "hex");
    const b = Buffer.from(hash, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function newShareToken(): string {
  return crypto.randomBytes(20).toString("hex");
}

export function newGuestKey(): string {
  return crypto.randomBytes(12).toString("hex");
}
