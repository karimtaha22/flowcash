// GroceryPriceEngine equivalent — the user's spec asked for this as a Python
// class over a SQLite `grocery_catalog` table; adapted here to Supabase
// Postgres (grocery_items / grocery_item_options), matching the rest of this
// app's stack, with a plain-function API instead of a class (this codebase
// doesn't use classes elsewhere — lib/gemini.ts, lib/reminders.ts, etc. are
// all plain exported functions).
//
// Two lookup paths:
//   1. lookupCatalog — pure local DB match against the user's own previously
//      priced items (no network call, instant).
//   2. fetchAiPrice — for a brand-new item with no catalog match, calls
//      Gemini with the live Google Search grounding tool
//      (tools: [{ google_search: {} }], the modern Gemini 2.0+ REST field
//      name — the user's spec pasted the Python SDK's equivalent
//      `types.Tool(google_search=types.GoogleSearch())`) under a strict
//      anti-hallucination prompt restricted to named major Egyptian
//      retailers. saveAiOptionsToCatalog then persists whatever real prices
//      came back so the next lookup for the same item is instant (path 1).
//
// IMPORTANT — no live GEMINI_API_KEY exists anywhere in this deployment as
// of this feature's delivery (checked both Vercel env and the /admin DB
// override — see the delivery message). fetchAiPrice is written correctly
// against the documented API contract and will work as soon as a real key
// is added via /admin or Vercel, but it could not be empirically tested
// against the live API in this round.
import { supabaseAdmin } from "./supabaseAdmin";
import { resolveGeminiConfig } from "./gemini";

export function normalizeGroceryName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ");
}

export interface GroceryOptionRow {
  id: string;
  item_id: string;
  brand: string | null;
  store_name: string | null;
  price: number;
  currency: string;
  source: "ai" | "manual";
  last_verified_at: string;
}

export interface GroceryMatch {
  raw_text: string;
  item_id: string | null;
  item_name: string | null;
  options: GroceryOptionRow[];
}

// local, instant, no-network catalog lookup — matches a typed line against
// the user's own previously-saved items by normalized-name containment in
// either direction (so "لبن جهينة" matches a saved "لبن" item and vice versa).
export async function lookupCatalog(userId: string, rawText: string): Promise<GroceryMatch> {
  const norm = normalizeGroceryName(rawText);
  const { data: items } = await supabaseAdmin.from("grocery_items").select("id,name,name_normalized").eq("user_id", userId);
  const match = (items || []).find((i) => i.name_normalized === norm || i.name_normalized.includes(norm) || norm.includes(i.name_normalized));
  if (!match) return { raw_text: rawText, item_id: null, item_name: null, options: [] };

  const { data: options } = await supabaseAdmin.from("grocery_item_options").select("*").eq("item_id", match.id).order("price", { ascending: true });
  return { raw_text: rawText, item_id: match.id, item_name: match.name, options: (options as GroceryOptionRow[]) || [] };
}

export interface AiPriceOption {
  brand: string | null;
  store_name: string;
  price: number;
  currency: string;
}
export interface AiPriceResult {
  ok: boolean;
  options: AiPriceOption[];
  error?: string;
}

// Only these — the user's own explicit list ("كارفور، أمازون مصر، سبينيس،
// اللولو") — count as valid sources; reinforced in the prompt text itself.
const ALLOWED_STORES = ["كارفور", "أمازون مصر", "سبينيس", "اللولو"];

// Recognizes a Gemini quota/rate-limit failure so the client can show a
// friendly Arabic message instead of Google's raw English error text (the
// exact real bug report from Round 30: "you exceeded your current quota...").
function isQuotaError(message: string, status?: number) {
  const m = (message || "").toLowerCase();
  return status === 429 || m.includes("quota") || m.includes("rate limit") || m.includes("resource_exhausted");
}
const QUOTA_MESSAGE =
  "الحد المسموح به من طلبات البحث بالذكاء الاصطناعي خلص مؤقتًا (بيتجدد بعد شوية حسب خطة جوجل). تقدر تسجّل السعر يدويًا دلوقتي، أو تجرب تاني بعد شوية.";

export async function fetchAiPrice(itemName: string): Promise<AiPriceResult> {
  const { apiKey, model } = await resolveGeminiConfig();
  if (!apiKey) {
    return {
      ok: false,
      options: [],
      error: "GEMINI_API_KEY مش متسجل — لا في Vercel ولا من إعدادات /admin. تسعير الأصناف الجديدة بالذكاء الاصطناعي متوقف مؤقتًا؛ سجّل السعر يدويًا لحد ما يتضاف مفتاح.",
    };
  }

  const prompt = `ابحث عن السعر الحالي الحقيقي لمنتج "${itemName}" في السوق المصري، حصريًا من المتاجر الكبرى دي: ${ALLOWED_STORES.join("، ")}.

قواعد صارمة (لازم تتبع بالظبط):
- ممنوع تخمين أو تقدير أي سعر تمامًا. لو مش لاقي سعر حقيقي معلن رسميًا من أي من المتاجر المذكورة، رجّع options فاضية.
- لو لاقيت أكتر من ماركة أو خيار لنفس المنتج، رجّعهم كلهم (لحد 5 خيارات كحد أقصى).
- الأسعار بالجنيه المصري (EGP) إلا لو ذُكر غير كده صراحة.

رجّع الرد بصيغة JSON فقط، من غير أي نص أو شرح قبله أو بعده، بالشكل ده بالظبط:
{"options":[{"brand":"اسم الماركة أو null لو مفيش","store_name":"اسم المتجر (واحد من الأربعة المذكورين)","price":123.45,"currency":"EGP"}]}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        // Live Google Search grounding — the REST equivalent of the Python
        // SDK's tools=[types.Tool(google_search=types.GoogleSearch())].
        // Deliberately NOT combined with responseSchema/responseMimeType:
        // structured-output mode and tool use (search grounding) aren't a
        // reliably supported combination on the Gemini API, so instead the
        // prompt above asks for bare JSON text and the parsing below
        // extracts the first {...} block from the reply.
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.1 },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      const rawMessage = data?.error?.message || `Gemini API error (${res.status})`;
      return { ok: false, options: [], error: isQuotaError(rawMessage, res.status) ? QUOTA_MESSAGE : rawMessage };
    }
    const text: string = (data?.candidates?.[0]?.content?.parts || [])
      .map((p: any) => p.text || "")
      .join("\n")
      .trim();
    if (!text) return { ok: false, options: [], error: "مفيش رد واضح من نظام التسعير، حاول تاني." };

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ok: false, options: [], error: "رد النظام مكانش بصيغة JSON صالحة." };

    const parsed = JSON.parse(jsonMatch[0]);
    const options: AiPriceOption[] = Array.isArray(parsed.options)
      ? parsed.options
          .filter((o: any) => o && typeof o.price === "number" && o.price > 0 && o.store_name)
          .slice(0, 5)
          .map((o: any) => ({
            brand: o.brand ? String(o.brand) : null,
            store_name: String(o.store_name),
            price: Number(o.price),
            currency: o.currency ? String(o.currency) : "EGP",
          }))
      : [];
    return { ok: true, options };
  } catch (e: any) {
    return { ok: false, options: [], error: e?.message || "حصل خطأ أثناء البحث عن السعر، حاول تاني." };
  }
}

export interface AiPriceBatchItem {
  item_name: string;
  ok: boolean;
  options: AiPriceOption[];
  error?: string;
}

// Round 30 — batched version of fetchAiPrice: looks up up to a handful of
// items (the client groups rows into batches of 3, see GroceryTab) in ONE
// Gemini call instead of one call per item, since the user hit a real quota
// error and asked directly whether to batch. Same anti-hallucination rules
// and allowed-store list as the single-item version, just asking for
// multiple items' worth of options back in one JSON response.
export async function fetchAiPriceBatch(itemNames: string[]): Promise<{ ok: boolean; items: AiPriceBatchItem[]; error?: string }> {
  const names = itemNames.map((n) => n.trim()).filter(Boolean).slice(0, 5);
  if (!names.length) return { ok: true, items: [] };

  const { apiKey, model } = await resolveGeminiConfig();
  if (!apiKey) {
    return {
      ok: false,
      items: [],
      error: "GEMINI_API_KEY مش متسجل — لا في Vercel ولا من إعدادات /admin. تسعير الأصناف الجديدة بالذكاء الاصطناعي متوقف مؤقتًا؛ سجّل السعر يدويًا لحد ما يتضاف مفتاح.",
    };
  }

  const itemsList = names.map((n, i) => `${i + 1}. ${n}`).join("\n");
  const prompt = `ابحث عن الأسعار الحالية الحقيقية للمنتجات دي في السوق المصري، كل واحد على حدة، حصريًا من المتاجر الكبرى دي: ${ALLOWED_STORES.join("، ")}.

المنتجات:
${itemsList}

قواعد صارمة (لازم تتبع بالظبط):
- ممنوع تخمين أو تقدير أي سعر تمامًا. لو منتج معين مالقتش له سعر حقيقي معلن رسميًا، رجّع له options فاضية (من غير ما تشيله من الرد).
- لو لاقيت أكتر من ماركة أو خيار لنفس المنتج، رجّعهم كلهم (لحد 5 خيارات لكل منتج).
- الأسعار بالجنيه المصري (EGP) إلا لو ذُكر غير كده صراحة.
- لازم ترجع نتيجة لكل منتج من المنتجات المذكورة بالترتيب، حتى لو options بتاعته فاضية.

رجّع الرد بصيغة JSON فقط، من غير أي نص أو شرح قبله أو بعده، بالشكل ده بالظبط:
{"items":[{"item_name":"اسم المنتج زي ما اتكتب بالظبط","options":[{"brand":"اسم الماركة أو null لو مفيش","store_name":"اسم المتجر (واحد من الأربعة المذكورين)","price":123.45,"currency":"EGP"}]}]}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.1 },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      const rawMessage = data?.error?.message || `Gemini API error (${res.status})`;
      return { ok: false, items: [], error: isQuotaError(rawMessage, res.status) ? QUOTA_MESSAGE : rawMessage };
    }
    const text: string = (data?.candidates?.[0]?.content?.parts || [])
      .map((p: any) => p.text || "")
      .join("\n")
      .trim();
    if (!text) return { ok: false, items: [], error: "مفيش رد واضح من نظام التسعير، حاول تاني." };

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ok: false, items: [], error: "رد النظام مكانش بصيغة JSON صالحة." };

    const parsed = JSON.parse(jsonMatch[0]);
    const rawItems: any[] = Array.isArray(parsed.items) ? parsed.items : [];
    const items: AiPriceBatchItem[] = names.map((requestedName) => {
      // match the model's returned item_name loosely back to the requested
      // one (normalized containment) rather than trusting positional order,
      // since the model occasionally reorders or rephrases slightly.
      const norm = normalizeGroceryName(requestedName);
      const found = rawItems.find((it) => {
        const itNorm = normalizeGroceryName(String(it?.item_name || ""));
        return itNorm === norm || itNorm.includes(norm) || norm.includes(itNorm);
      });
      const options: AiPriceOption[] = Array.isArray(found?.options)
        ? found.options
            .filter((o: any) => o && typeof o.price === "number" && o.price > 0 && o.store_name)
            .slice(0, 5)
            .map((o: any) => ({
              brand: o.brand ? String(o.brand) : null,
              store_name: String(o.store_name),
              price: Number(o.price),
              currency: o.currency ? String(o.currency) : "EGP",
            }))
        : [];
      return { item_name: requestedName, ok: true, options };
    });
    return { ok: true, items };
  } catch (e: any) {
    return { ok: false, items: [], error: e?.message || "حصل خطأ أثناء البحث عن الأسعار، حاول تاني." };
  }
}

// Persists AI-sourced options back to the user's own catalog (source: "ai")
// so the next time they type the same item, lookupCatalog finds it instantly
// with no further Gemini call — "حفظ الخيارات والأسعار الجديدة في قاعدة
// البيانات لتغذية الكاش للأصناف القادمة" from the user's spec.
export async function saveAiOptionsToCatalog(userId: string, itemName: string, options: AiPriceOption[]) {
  const name_normalized = normalizeGroceryName(itemName);
  const { data: existing } = await supabaseAdmin
    .from("grocery_items")
    .select("id,name")
    .eq("user_id", userId)
    .eq("name_normalized", name_normalized)
    .maybeSingle();

  let itemId = existing?.id as string | undefined;
  if (!itemId) {
    const { data: inserted, error } = await supabaseAdmin
      .from("grocery_items")
      .insert({ user_id: userId, name: itemName, name_normalized })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    itemId = inserted.id;
  }

  if (options.length) {
    const rows = options.map((o) => ({
      item_id: itemId,
      brand: o.brand,
      store_name: o.store_name,
      price: o.price,
      currency: o.currency,
      source: "ai" as const,
    }));
    await supabaseAdmin.from("grocery_item_options").insert(rows);
  }

  const { data: allOptions } = await supabaseAdmin.from("grocery_item_options").select("*").eq("item_id", itemId).order("price", { ascending: true });
  return { item_id: itemId as string, options: (allOptions as GroceryOptionRow[]) || [] };
}

// A manual entry — "سجّل السعر يدويًا" — for when there's no AI key yet, or
// the user just knows the price and doesn't want to wait on a search call.
// Separate from saveAiOptionsToCatalog (rather than reusing it with a
// source override afterwards) so the inserted row is tagged "manual" from
// the start, with no follow-up update needed.
export async function saveManualOption(userId: string, itemName: string, option: { brand?: string | null; store_name?: string | null; price: number; currency?: string }) {
  const name_normalized = normalizeGroceryName(itemName);
  const { data: existing } = await supabaseAdmin
    .from("grocery_items")
    .select("id")
    .eq("user_id", userId)
    .eq("name_normalized", name_normalized)
    .maybeSingle();

  let itemId = existing?.id as string | undefined;
  if (!itemId) {
    const { data: inserted, error } = await supabaseAdmin
      .from("grocery_items")
      .insert({ user_id: userId, name: itemName, name_normalized })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    itemId = inserted.id;
  }

  const { error: optErr } = await supabaseAdmin.from("grocery_item_options").insert({
    item_id: itemId,
    brand: option.brand || null,
    store_name: option.store_name || "يدوي",
    price: option.price,
    currency: option.currency || "EGP",
    source: "manual",
  });
  if (optErr) throw new Error(optErr.message);

  const { data: allOptions } = await supabaseAdmin.from("grocery_item_options").select("*").eq("item_id", itemId).order("price", { ascending: true });
  return { item_id: itemId as string, options: (allOptions as GroceryOptionRow[]) || [] };
}
