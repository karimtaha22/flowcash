// CLIENT-SAFE pure math only — no Supabase import here on purpose. See
// lib/fxRates.ts for the server-only getFxRates() (was previously combined
// in this same file, which crashed any client component that imported
// toEGP/fromEGP from it — see the comment there for the full story).
export type FxRates = Record<string, number>; // 1 EGP = rates[CUR] units of CUR

// Convert an amount FROM `currency` TO EGP using 1-EGP-based rates.
export function toEGP(amount: number, currency: string, rates: FxRates): number {
  if (currency === "EGP") return amount;
  const rate = rates[currency];
  if (!rate) return amount;
  return amount / rate;
}

export function fromEGP(amountEGP: number, currency: string, rates: FxRates): number {
  if (currency === "EGP") return amountEGP;
  const rate = rates[currency];
  if (!rate) return amountEGP;
  return amountEGP * rate;
}
