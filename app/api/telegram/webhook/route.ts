import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { handleTelegramMessage, handleTelegramCallback } from "@/lib/telegramBot";
import { tgCall } from "@/lib/telegram";

// ONE shared webhook for every customer (replaces the old per-customer
// /api/telegram/[userId] route, where each customer had to create their own
// bot and paste its token into /admin). Now there's a single official bot
// (TELEGRAM_BOT_TOKEN) and a single webhook URL registered with Telegram —
// which customer sent a message is resolved from the update's own chat_id
// against app_users.telegram_chat_id, exactly the same "look up who this
// belongs to from a trusted, server-controlled identifier" pattern already
// used for the web session cookie. A message from a chat_id that doesn't
// match ANY customer is either a brand-new /start (send them to Settings to
// link) or a one-time linking code (see handleStart below).
async function findUserIdByChatId(chatId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("app_users").select("id").eq("telegram_chat_id", chatId).maybeSingle();
  return data?.id || null;
}

// /start <code> — the deep link from "اربط حسابك بتليجرام" in الإعدادات
// (see /api/telegram/link) lands here as the very first message in a fresh
// chat. The code is single-use and short-lived (see /api/telegram/link) —
// consuming it here is what actually saves this chat_id against the right
// customer's account, i.e. the whole point of self-service linking.
async function handleStart(botToken: string, chatId: string, code: string) {
  const { data: link } = await supabaseAdmin
    .from("telegram_link_codes")
    .select("code,user_id,expires_at,used_at")
    .eq("code", code)
    .maybeSingle();

  if (!link || link.used_at || new Date(link.expires_at).getTime() < Date.now()) {
    return tgCall(botToken, "sendMessage", {
      chat_id: chatId,
      text: "لينك الربط ده مش صالح أو خلصت صلاحيته. ارجع لصفحة الإعدادات في التطبيق واطلب لينك جديد.",
    });
  }

  await supabaseAdmin.from("app_users").update({ telegram_chat_id: chatId }).eq("id", link.user_id);
  await supabaseAdmin.from("telegram_link_codes").update({ used_at: new Date().toISOString() }).eq("code", code);

  return handleTelegramMessage(link.user_id, botToken, { chat: { id: Number(chatId) }, text: "/start" });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("secret") !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!botToken) return NextResponse.json({ ok: true }); // not configured yet — silently no-op

  const update = await req.json();

  try {
    if (update.message) {
      const chatId = String(update.message.chat.id);
      const text: string | undefined = update.message.text;

      if (text && text.startsWith("/start")) {
        const parts = text.trim().split(/\s+/);
        const code = parts[1];
        if (code) {
          await handleStart(botToken, chatId, code);
          return NextResponse.json({ ok: true });
        }
      }

      const userId = await findUserIdByChatId(chatId);
      if (!userId) {
        await tgCall(botToken, "sendMessage", {
          chat_id: chatId,
          text: "حسابك مش مربوط لسه. افتح تطبيق FlowCash → الإعدادات → اربط حسابك بتليجرام.",
        });
        return NextResponse.json({ ok: true });
      }
      await handleTelegramMessage(userId, botToken, update.message);
    } else if (update.callback_query) {
      const chatId = String(update.callback_query.message.chat.id);
      const userId = await findUserIdByChatId(chatId);
      if (userId) await handleTelegramCallback(userId, botToken, update.callback_query);
    }
  } catch (e) {
    console.error("telegram webhook error", e);
  }

  return NextResponse.json({ ok: true });
}
