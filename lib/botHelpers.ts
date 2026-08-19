import { supabaseAdmin } from "./supabaseAdmin";

export async function getSession(userId: string, chatId: string) {
  const { data } = await supabaseAdmin
    .from("bot_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("chat_id", chatId)
    .maybeSingle();
  return data;
}

export async function setSession(userId: string, chatId: string, flow: string | null, step: string | null, payload: any = {}) {
  await supabaseAdmin.from("bot_sessions").upsert(
    { user_id: userId, chat_id: chatId, flow, step, payload, updated_at: new Date().toISOString() },
    { onConflict: "user_id,chat_id" }
  );
}

export async function clearSession(userId: string, chatId: string) {
  await setSession(userId, chatId, null, null, {});
}

export function accountsKeyboard(accounts: any[], prefix: string) {
  return {
    inline_keyboard: accounts.map((a) => [
      { text: `${a.name} — ${Number(a.balance).toLocaleString()} ${a.currency}`, callback_data: `${prefix}:${a.id}` },
    ]),
  };
}

export function yesNoKeyboard(prefix: string) {
  return {
    inline_keyboard: [
      [{ text: "نعم", callback_data: `${prefix}:yes` }, { text: "لا", callback_data: `${prefix}:no` }],
    ],
  };
}

const num = (s: string) => {
  const cleaned = s.replace(/[^\d.]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
};

export { num as parseAmount };
