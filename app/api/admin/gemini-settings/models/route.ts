import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminGuard";
import { resolveGeminiConfig } from "@/lib/gemini";

// "تجربة جميع النماذج و تثبيت النموذج الأفضل" — this session had NO live
// GEMINI_API_KEY anywhere (Vercel env or the /admin DB override) to actually
// run that comparison. This route is what lets the admin do it themselves
// once a real key exists: it calls Google's own ListModels endpoint (the
// real inventory of what's available to THIS key, not a hardcoded guess),
// filtered to models that support generateContent, so the "الأفضل" model
// choice can be tried directly from /admin instead of guessing a name.
export async function GET() {
  const guard = await requireAdminAuth();
  if (guard) return guard;

  const { apiKey } = await resolveGeminiConfig();
  if (!apiKey) return NextResponse.json({ ok: false, error: "مفيش مفتاح Gemini متسجل — لا في الداتابيز ولا في Vercel." });

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`);
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ ok: false, error: data?.error?.message || `Gemini API error (${res.status})` });

    const models = (data.models || [])
      .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
      .map((m: any) => ({
        name: String(m.name || "").replace(/^models\//, ""),
        displayName: m.displayName || "",
        description: m.description || "",
      }));
    return NextResponse.json({ ok: true, models });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "فشل الاتصال بـ Gemini" });
  }
}
