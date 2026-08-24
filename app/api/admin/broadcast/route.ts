import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminAuth } from "@/lib/adminGuard";
import { sendText } from "@/lib/telegram";

// The admin's "broadcast to everyone" box — one message, two delivery
// channels: every customer's own Telegram bot (if connected) AND an
// in-app banner (GET /api/broadcast/latest) that stays up until each
// customer dismisses it individually.
export async function POST(req: NextRequest) {
  const guard = await requireAdminAuth();
  if (guard) return guard;

  const body = await req.json();
  const message = String(body.message || "").trim();
  if (!message) return NextResponse.json({ error: "اكتب رسالة الأول" }, { status: 400 });

  const { data: broadcast, error } = await supabaseAdmin.from("broadcasts").insert({ message }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const { data: recipients } = await supabaseAdmin
    .from("app_users")
    .select("id,telegram_chat_id")
    .eq("is_admin", false)
    .not("telegram_chat_id", "is", null);

  let sent = 0;
  let failed = 0;
  if (botToken) {
    for (const r of recipients || []) {
      try {
        await sendText(botToken, r.telegram_chat_id as string, `📢 ${message}`);
        sent++;
      } catch {
        failed++;
      }
    }
  }

  return NextResponse.json({ ok: true, broadcast, telegramSent: sent, telegramFailed: failed });
}
