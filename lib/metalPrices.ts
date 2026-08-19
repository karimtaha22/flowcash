import { supabaseAdmin } from "./supabaseAdmin";

// Free, keyless, unlimited-rate spot-price API — confirmed working, no
// account needed. Price is USD per troy ounce of 24-karat pure metal.
const SOURCE_URL = (symbol: "XAU" | "XAG") => `https://api.gold-api.com/price/${symbol}`;
const OZ_TO_GRAM = 31.1034768;
// gold moves slowly enough intraday that a cache this long keeps every user's
// page load fast without hammering the free API; a stale row is still used
// as a fallback if the live fetch fails for any reason.
const CACHE_MINUTES = 180;

type Metal = "XAU" | "XAG";

async function fetchLive(metal: Metal): Promise<number | null> {
  try {
    const res = await fetch(SOURCE_URL(metal), { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.price === "number" ? data.price : null;
  } catch {
    return null;
  }
}

async function getCached(metal: Metal) {
  const { data } = await supabaseAdmin
    .from("metal_rates")
    .select("price_usd_per_oz, fetched_at")
    .eq("metal", metal)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function getRate(metal: Metal): Promise<{ price: number; fetchedAt: string; stale: boolean }> {
  const cached = await getCached(metal);
  const ageMinutes = cached ? (Date.now() - new Date(cached.fetched_at).getTime()) / 60000 : Infinity;
  if (cached && ageMinutes < CACHE_MINUTES) {
    return { price: Number(cached.price_usd_per_oz), fetchedAt: cached.fetched_at, stale: false };
  }
  const live = await fetchLive(metal);
  if (live) {
    const { data: inserted } = await supabaseAdmin
      .from("metal_rates")
      .insert({ metal, price_usd_per_oz: live })
      .select("price_usd_per_oz, fetched_at")
      .single();
    return { price: live, fetchedAt: inserted?.fetched_at || new Date().toISOString(), stale: false };
  }
  if (cached) return { price: Number(cached.price_usd_per_oz), fetchedAt: cached.fetched_at, stale: true };
  throw new Error("مقدرناش نجيب سعر المعدن دلوقتي، حاول تاني بعد شوية");
}

export async function getMetalRates() {
  const [gold, silver] = await Promise.all([getRate("XAU"), getRate("XAG")]);
  return {
    gold: {
      usd_per_oz: gold.price,
      // 21-karat is the common Egyptian-market reference (the user's own
      // reference screenshot used it), so that's what the UI shows by default.
      usd_per_gram_24k: gold.price / OZ_TO_GRAM,
      usd_per_gram_21k: (gold.price / OZ_TO_GRAM) * (21 / 24),
      fetched_at: gold.fetchedAt,
      stale: gold.stale,
    },
    silver: {
      usd_per_oz: silver.price,
      usd_per_gram: silver.price / OZ_TO_GRAM,
      fetched_at: silver.fetchedAt,
      stale: silver.stale,
    },
  };
}
