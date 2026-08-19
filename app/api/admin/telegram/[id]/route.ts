import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { setWebhook, getWebhookInfo } from "@/lib/telegram";

// GET  → real-time status straight from Telegram (getWebhookInfo), including
//        last_error_message — this is what actually explains "the bot is silent"
//        instead of us guessing.
// POST → re-register the webhook using the ALREADY-SAVED bot token, the
//        CURRENT TELEGRAM_WEBHOOK_SECRET, and the CURRENT deployment URL.
//        Use this after changing TELEGRAM_WEBHOOK_SECRET or redeploying,
//        without having to re-paste the bot token.

async function getToken(id: string) {
  const { data } = await supabaseAdmin.from("app_users").select("telegram_bot_token").eq("id", id).single();
  return data?.telegram_bot_token as string | null | undefined;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await getToken(id);
  if (!token) return NextResponse.json({ ok: false, error: "لسه مفيش توكن بوت متسجل للمستخدم ده." });

  try {
    const info = await getWebhookInfo(token);
    if (!info.ok) return NextResponse.json({ ok: false, error: info.description || "تليجرام رفض الطلب — التوكن غالبًا غلط." });
    const r = info.result || {};
    return NextResponse.json({
      ok: true,
      url: r.url || null,
      hasErrors: !!r.last_error_message,
      last_error_message: r.last_error_message || null,
      last_error_date: r.last_error_date ? new Date(r.last_error_date * 1000).toISOString() : null,
      pending_update_count: r.pending_update_count ?? 0,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || "فشل الاتصال بتليجرام" });
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = await getToken(id);
  if (!token) return NextResponse.json({ ok: false, error: "لسه مفيش توكن بوت متسجل للمستخدم ده." });

  try {
    const result = await setWebhook(token, id);
    return NextResponse.json({ ok: !!result.ok, error: result.ok ? null : result.description || "فشل تسجيل الويب هوك", raw: result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || "فشل الاتصال بتليجرام" });
  }
}
