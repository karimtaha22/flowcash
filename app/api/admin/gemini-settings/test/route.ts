import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminGuard";
import { resolveGeminiConfig } from "@/lib/gemini";

// "اختبر النموذج" — a cheap text-only sanity call (no images, no vision
// tokens) that confirms the currently-effective key+model actually work
// against the real Gemini API right now, surfacing the exact error text
// Google returns (e.g. a deprecated-model message) instead of the admin
// only finding out the hard way when a real customer's verification fails.
export async function POST() {
  const guard = await requireAdminAuth();
  if (guard) return guard;

  const { apiKey, model } = await resolveGeminiConfig();
  if (!apiKey) return NextResponse.json({ ok: false, error: "مفيش مفتاح Gemini متسجل — لا في الداتابيز ولا في Vercel." });

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "قول 'تمام' بس، من غير أي حاجة تانية." }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 10 },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ ok: false, model, error: data?.error?.message || `Gemini API error (${res.status})` });
    }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    return NextResponse.json({ ok: true, model, reply: text || "(رد فاضي بس الاتصال نجح)" });
  } catch (e: any) {
    return NextResponse.json({ ok: false, model, error: e?.message || "فشل الاتصال بـ Gemini" });
  }
}
