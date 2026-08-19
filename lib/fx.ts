import { supabaseAdmin } from "./supabaseAdmin";

// Free, no-API-key exchange rate service.
const FX_SOURCE = "https://open.er-api.com/v6/latest/EGP";
const CACHE_MINUTES = 30;

export type FxRates = Record<string, number>; // 1 EGP = rates[CUR] units of CUR

export async function getFxRates(): Promise<{ rates: FxRates; fetchedAt: string; stale: boolean }> {
  const { data: cached } = await supabaseAdmin
    .from("fx_rates")
    .select("*")
    .eq("base_currency", "EGP")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const isFresh =
    cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_MINUTES * 60 * 1000;

  if (isFresh) {
    return { rates: cached!.rates as FxRates, fetchedAt: cached!.fetched_at, stale: false };
  }

  try {
    const res = await fetch(FX_SOURCE, { cache: "no-store" });
    const json = await res.json();
    if (json.result !== "success") throw new Error("fx fetch failed");
    const rates: FxRates = json.rates;
    await supabaseAdmin.from("fx_rates").insert({ base_currency: "EGP", rates });
    return { rates, fetchedAt: new Date().toISOString(), stale: false };
  } catch (e) {
    if (cached) return { rates: cached.rates as FxRates, fetchedAt: cached.fetched_at, stale: true };
    // last-resort fallback so the app never hard-fails
    return {
      rates: { EGP: 1, USD: 0.021, SAR: 0.078 },
      fetchedAt: new Date().toISOString(),
      stale: true,
    };
  }
}

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
