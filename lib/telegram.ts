export async function tgCall(botToken: string, method: string, payload: any = {}) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

// The one stable, confirmed-working alias for this specific project (from
// Vercel's own project.domains — verified directly, not guessed). On this
// account VERCEL_PROJECT_PRODUCTION_URL resolves to an unaliased team-scoped
// fallback host (flowcash-karimtaha22s-projects.vercel.app) that 404s on
// every request — confirmed via Telegram's own "last_error_message". So in
// production we trust this hardcoded domain over that env var.
const KNOWN_GOOD_PRODUCTION_DOMAIN = "flowcash-ruddy.vercel.app";

// Always returns a URL that starts with a protocol — trims accidental
// whitespace and adds "https://" if whoever set APP_BASE_URL forgot it
// (a bare host like "flowcash-ruddy.vercel.app" makes Telegram reject the
// whole webhook registration with "invalid webhook URL specified").
function resolveBaseUrl() {
  const explicit = (process.env.APP_BASE_URL || "").trim();
  if (explicit) {
    const withProtocol = /^https?:\/\//i.test(explicit) ? explicit : `https://${explicit}`;
    return withProtocol.replace(/\/+$/, "");
  }
  if (process.env.VERCEL_ENV === "production") return `https://${KNOWN_GOOD_PRODUCTION_DOMAIN}`;
  const host = (process.env.VERCEL_URL || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (host) return `https://${host}`;
  return "http://localhost:3000";
}

export async function setWebhook(botToken: string, userId: string) {
  const base = resolveBaseUrl();
  const secret = (process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  const url = `${base}/api/telegram/${userId}?secret=${encodeURIComponent(secret)}`;
  const redactedUrl = secret ? url.replace(secret, "<secret>") : url;

  if (!secret) {
    return { ok: false, description: "TELEGRAM_WEBHOOK_SECRET مش متسجل في Vercel خالص.", computedUrl: redactedUrl };
  }
  if (!/^https:\/\//i.test(url)) {
    return { ok: false, description: `الرابط اللي هيتسجل عند تليجرام لازم يبدأ بـ https:// وده مش بيبدأ بيها. راجع APP_BASE_URL في Vercel.`, computedUrl: redactedUrl };
  }
  try {
    new URL(url);
  } catch {
    return { ok: false, description: "الرابط اللي اتحسب مش صالح (URL غير صحيح).", computedUrl: redactedUrl };
  }

  const result = await tgCall(botToken, "setWebhook", { url });
  return { ...result, computedUrl: redactedUrl };
}

export async function getWebhookInfo(botToken: string) {
  return tgCall(botToken, "getWebhookInfo", {});
}

export const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: "💸 تسجيل مصروف" }, { text: "🏧 سحب من حساب" }],
    [{ text: "💰 فلوس جاتلي" }, { text: "🔁 تحويل أونلاين" }],
    [{ text: "📊 تحديث أرصدة" }, { text: "📄 كشف سريع" }],
    [{ text: "📈 كشف حساب" }, { text: "🔍 استعلام عن مصروف" }],
    [{ text: "🔔 التنبيهات" }],
  ],
  resize_keyboard: true,
};

// shown during every step of every multi-step flow so the user can always bail
// out immediately, even before typing/selecting anything for that step.
export const CANCEL_KEYBOARD = {
  keyboard: [[{ text: "❌ إنهاء" }]],
  resize_keyboard: true,
};

export const CANCEL_TEXT = "❌ إنهاء";

export function sendText(botToken: string, chatId: string | number, text: string, extra: any = {}) {
  return tgCall(botToken, "sendMessage", {
    chat_id: chatId,
    text,
    reply_markup: MAIN_KEYBOARD,
    ...extra,
  });
}

export const BRAND_FOOTER = "\n\n— IDEA-EG Operating System | www.ideaeg.online";
