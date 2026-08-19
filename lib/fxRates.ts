// SERVER-ONLY. This file talks to Supabase directly — never import it from a
// "use client" component. Pure conversion math (toEGP/fromEGP, safe for the
// browser) lives in lib/fx.ts instead. Splitting these was the fix for a real
// production crash: lib/fx.ts used to import supabaseAdmin at module scope,
// so any client component importing toEGP/fromEGP from it (e.g. the "add"
// page) pulled the Supabase client into the browser bundle too — where
// process.env.SUPABASE_KEY is undefined (only NEXT_PUBLIC_-prefixed vars are
// inlined client-side), crashing with "supabaseKey is required" on load.
import { supabaseAdmin } from "./supabaseAdmin";
import type { FxRates } from "./fx";

// Free, no-API-key exchange rate service.
const FX_SOURCE = "https://open.er-api.com/v6/latest/EGP";
const CACHE_MINUTES = 30;

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
