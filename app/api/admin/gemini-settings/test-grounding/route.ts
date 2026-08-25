import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminGuard";
import { resolveGeminiConfig } from "@/lib/gemini";

// "اختبر البحث الحي (Google Search Grounding)" — a cheap real-world check
// that the currently-effective key+model actually support live search
// grounding, which is what powers the grocery price-estimator's AI lookup
// (lib/groceryPricing.ts's fetchAiPrice). A model can pass the plain text
// test in /api/admin/gemini-settings/test but still not support grounding
// (older/lite models sometimes don't) — this catches that specifically,
// against a real query with a checkable, time-sensitive-looking answer.
export async function POST(req: NextRequest) {
  const guard = await requireAdminAuth();
  if (guard) return guard;

  const { apiKey, model } = await resolveGeminiConfig();
  if (!apiKey) return NextResponse.json({ ok: false, error: "مفيش مفتاح Gemini متسجل — لا في الداتابيز ولا في Vercel." });

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // no body sent — fine, use the default query below
  }
  const query = String(body.query || "").trim() || "سعر لتر زيت عافية 1.5 لتر في كارفور مصر دلوقتي";

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: query }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.1 },
      }),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ ok: false, model, error: data?.error?.message || `Gemini API error (${res.status})` });

    const candidate = data?.candidates?.[0];
    const text = (candidate?.content?.parts || []).map((p: any) => p.text || "").join("\n").trim();
    const usedGrounding = !!candidate?.groundingMetadata;
    return NextResponse.json({
      ok: true,
      model,
      usedGrounding,
      reply: text || "(رد فاضي بس الاتصال نجح)",
      note: usedGrounding ? "النموذج ده بيستخدم البحث الحي فعلاً ✅" : "النموذج رد من غير ما يستخدم البحث الحي — النتيجة ممكن تكون غير دقيقة أو قديمة.",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, model, error: e?.message || "فشل الاتصال بـ Gemini" });
  }
}
