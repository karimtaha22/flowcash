export async function tgCall(botToken: string, method: string, payload: any = {}) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

function resolveBaseUrl() {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (host) return `https://${host}`;
  return "http://localhost:3000";
}

export async function setWebhook(botToken: string, userId: string) {
  const base = resolveBaseUrl();
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const url = `${base}/api/telegram/${userId}?secret=${secret}`;
  return tgCall(botToken, "setWebhook", { url });
}

export const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: "💸 مصروف" }, { text: "🏧 سحب من حساب" }],
    [{ text: "💰 فلوس جاتلي" }, { text: "🔁 تحويل أونلاين" }],
    [{ text: "📊 تحديث أرصدة" }, { text: "📄 كشف سريع" }],
    [{ text: "📈 كشف حساب" }],
  ],
  resize_keyboard: true,
};

export function sendText(botToken: string, chatId: string | number, text: string, extra: any = {}) {
  return tgCall(botToken, "sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: MAIN_KEYBOARD,
    ...extra,
  });
}

export const BRAND_FOOTER = "\n\n— IDEA-EG Operating System | www.ideaeg.online";
