// Shared, dependency-free mobile-number check — used both client-side (gam3eya
// participant forms, so the user sees "رقم موبايل غير صالح" immediately) and
// server-side (API routes, so a bad number can't slip in via a direct request
// even if the client check is bypassed). Accepts an empty string as valid
// (phone is an optional field almost everywhere it's used) — pass the raw
// input and only treat a genuinely non-empty-but-malformed value as invalid.
export function isValidPhone(value: string): boolean {
  const s = (value || "").trim();
  if (!s) return true;
  const digits = s.replace(/[\s-]/g, "");
  if (/^01[0125]\d{8}$/.test(digits)) return true; // رقم مصري (01 + 0/1/2/5 + 8 أرقام)
  if (/^\+?\d{8,15}$/.test(digits)) return true; // احتياطي دولي عام (لعملاء SAR/USD)
  return false;
}
