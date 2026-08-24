import { NextResponse } from "next/server";
import { setWebhook, getWebhookInfo } from "@/lib/telegram";
import { requireAdminAuth } from "@/lib/adminGuard";

// Global, one-time setup for the SHARED bot every customer now talks to
// (replaces the old per-customer app/api/admin/telegram/[id] route — there's
// no per-customer bot token anymore, just TELEGRAM_BOT_TOKEN in Vercel).
// GET  → live status straight from Telegram (getWebhookInfo).
// POST → (re-)register the webhook using the CURRENT TELEGRAM_BOT_TOKEN,
//         TELEGRAM_WEBHOOK_SECRET, and deployment URL — run this once after
//         setting the env vars, and again any time TELEGRAM_WEBHOOK_SECRET
//         changes or the app moves to a new domain.
export async function GET() {
  const guard = await requireAdminAuth();
  if (guard) return guard;

  const botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!botToken) return NextResponse.json({ ok: false, error: "TELEGRAM_BOT_TOKEN لسه مش متسجل في Vercel." });

  try {
    const info = await getWebhookInfo(botToken);
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

export async function POST() {
  const guard = await requireAdminAuth();
  if (guard) return guard;

  const botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!botToken) return NextResponse.json({ ok: false, error: "TELEGRAM_BOT_TOKEN لسه مش متسجل في Vercel." });

  try {
    const result: any = await setWebhook(botToken);
    return NextResponse.json({
      ok: !!result.ok,
      error: result.ok ? null : result.description || "فشل تسجيل الويب هوك",
      computedUrl: result.computedUrl || null,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || "فشل الاتصال بتليجرام" });
  }
}
