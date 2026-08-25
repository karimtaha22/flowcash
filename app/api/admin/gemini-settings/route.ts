import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminAuth } from "@/lib/adminGuard";
import { resolveGeminiConfig } from "@/lib/gemini";

// Admin panel card for the Gemini identity-verification key/model — round
// 22. Mirrors the "بوت تليجرام المركزي" card's shape (status + change +
// test), but unlike the Telegram token (pure env var, needs a Vercel
// redeploy to change) this one is DB-backed (app_settings singleton row) so
// the admin can swap the key or model live. Env vars (GEMINI_API_KEY/
// GEMINI_MODEL) still work as the zero-config fallback if no DB override is
// saved — see lib/gemini.ts's resolveGeminiConfig.
export async function GET() {
  const guard = await requireAdminAuth();
  if (guard) return guard;

  const { data } = await supabaseAdmin.from("app_settings").select("gemini_api_key,gemini_model").eq("id", "default").single();
  const { apiKey, model } = await resolveGeminiConfig();
  return NextResponse.json({
    // المفتاح الفعلي مايترجعش خالص — بس بنقول هل فيه واحد شغال دلوقتي (من
    // الداتابيز أو من env في Vercel) وهل ده override محفوظ في الداتابيز
    // ولا رجّع لقيمة env الافتراضية.
    hasKey: !!apiKey,
    keySource: data?.gemini_api_key ? "db" : process.env.GEMINI_API_KEY ? "env" : "none",
    effectiveModel: model,
    dbModelOverride: data?.gemini_model || null,
  });
}

export async function PATCH(req: NextRequest) {
  const guard = await requireAdminAuth();
  if (guard) return guard;

  const body = await req.json();
  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  // فاضي = امسح الـ override وارجع لـ env في Vercel (أو الافتراضي الذكي).
  if ("gemini_api_key" in body) update.gemini_api_key = body.gemini_api_key ? String(body.gemini_api_key).trim() : null;
  if ("gemini_model" in body) update.gemini_model = body.gemini_model ? String(body.gemini_model).trim() : null;

  const { error } = await supabaseAdmin.from("app_settings").update(update).eq("id", "default");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
