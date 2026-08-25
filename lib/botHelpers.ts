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

// Round 35 — expense-flow account picker gains an explicit "كاش" option
// (account_id ends up null, exactly like leaving the account blank in the
// app's own /add form) so a cash purchase can be recorded from the bot
// without forcing a real tracked account to be debited — this is also what
// makes the "تخصم من المحفظة؟" wallet prompt reachable from the bot at all.
export function accountsKeyboardWithCash(accounts: any[], prefix: string) {
  const kb = accountsKeyboard(accounts, prefix);
  kb.inline_keyboard.push([{ text: "🚶 كاش (من غير حساب)", callback_data: `${prefix}:none` }]);
  return kb;
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
