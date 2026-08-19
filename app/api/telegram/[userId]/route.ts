import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendText, tgCall, MAIN_KEYBOARD, BRAND_FOOTER } from "@/lib/telegram";
import { getSession, setSession, clearSession, accountsKeyboard, yesNoKeyboard, parseAmount } from "@/lib/botHelpers";
import { createTransaction } from "@/lib/transactions";
import { classifyExpense } from "@/lib/categories";
import { getFxRates, toEGP } from "@/lib/fx";
import { startOfDay, startOfWeek, startOfMonth } from "date-fns";

const KEY_MAP: Record<string, string> = {
  "💸 مصروف": "expense",
  "🏧 سحب من حساب": "withdrawal",
  "💰 فلوس جاتلي": "income",
  "🔁 تحويل أونلاين": "transfer",
  "📊 تحديث أرصدة": "balance_update",
  "📄 كشف سريع": "quick_statement",
  "📈 كشف حساب": "account_statement",
};

async function getAccounts(userId: string) {
  const { data } = await supabaseAdmin.from("accounts").select("*").eq("user_id", userId).eq("is_archived", false).order("created_at");
  return data || [];
}

async function getUser(userId: string) {
  const { data } = await supabaseAdmin.from("app_users").select("*").eq("id", userId).single();
  return data;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const { searchParams } = new URL(req.url);
  if (searchParams.get("secret") !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const user = await getUser(userId);
  if (!user || !user.telegram_bot_token) return NextResponse.json({ ok: true });
  const botToken = user.telegram_bot_token;
  const update = await req.json();

  try {
    if (update.message) await handleMessage(userId, botToken, update.message);
    else if (update.callback_query) await handleCallback(userId, botToken, update.callback_query);
  } catch (e) {
    console.error("telegram handler error", e);
  }

  return NextResponse.json({ ok: true });
}

async function reply(botToken: string, chatId: string, text: string, keyboard: any = MAIN_KEYBOARD) {
  return tgCall(botToken, "sendMessage", { chat_id: chatId, text: text + BRAND_FOOTER, reply_markup: keyboard });
}

async function handleMessage(userId: string, botToken: string, msg: any) {
  const chatId = String(msg.chat.id);
  const text: string | undefined = msg.text;

  // persist chat id for outbound notifications (recurring reminders, overdue debts, budget alerts)
  await supabaseAdmin.from("app_users").update({ telegram_chat_id: chatId }).eq("id", userId).is("telegram_chat_id", null);

  const session = await getSession(userId, chatId);

  if (text === "/start") {
    await clearSession(userId, chatId);
    return reply(botToken, chatId, `أهلاً بيك في FlowCash 👋\nاختار من الأزرار تحت.`);
  }
  if (text === "/cancel") {
    await clearSession(userId, chatId);
    return reply(botToken, chatId, "تم الإلغاء ✅");
  }

  // photo → treat as receipt for the last created transaction in this session, if any
  if (msg.photo && session?.payload?.last_tx_id) {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    const fileInfo = await tgCall(botToken, "getFile", { file_id: fileId });
    const receiptUrl = fileInfo?.result?.file_path
      ? `https://api.telegram.org/file/bot${botToken}/${fileInfo.result.file_path}`
      : null;
    if (receiptUrl) {
      await supabaseAdmin.from("transactions").update({ receipt_url: receiptUrl }).eq("id", session.payload.last_tx_id);
      return reply(botToken, chatId, "تم حفظ الإيصال 📎✅");
    }
  }

  if (msg.voice) {
    if (!process.env.OPENAI_API_KEY) {
      return reply(
        botToken,
        chatId,
        "الرسائل الصوتية محتاجة تفعيل مفتاح تحويل الصوت لنص (لسه مش متاح). اكتب المصروف كتابة دلوقتي 🙏"
      );
    }
    // Whisper transcription wiring point — left as an extension hook.
    return reply(botToken, chatId, "استلمت الرسالة الصوتية، جاري تحويلها لنص...");
  }

  // starting a new flow from the keyboard
  if (text && KEY_MAP[text] && !session?.flow) {
    return startFlow(userId, botToken, chatId, KEY_MAP[text]);
  }

  // continue an existing flow
  if (session?.flow) {
    return continueFlow(userId, botToken, chatId, session, text || "");
  }

  return reply(botToken, chatId, "اختار من الأزرار تحت أو دوس /start");
}

async function handleCallback(userId: string, botToken: string, cbq: any) {
  const chatId = String(cbq.message.chat.id);
  const data: string = cbq.data;
  const [prefix, value] = data.split(":");
  await tgCall(botToken, "answerCallbackQuery", { callback_query_id: cbq.id });

  // "دفعت" / "نزل" button on a recurring-item reminder — not part of any multi-step flow
  if (prefix === "recur_paid") {
    return confirmRecurring(userId, botToken, chatId, value);
  }

  const session = await getSession(userId, chatId);
  if (!session?.flow) return;

  await continueFlow(userId, botToken, chatId, session, value, prefix);
}

async function confirmRecurring(userId: string, botToken: string, chatId: string, itemId: string) {
  const { data: item } = await supabaseAdmin.from("recurring_items").select("*").eq("id", itemId).eq("user_id", userId).single();
  if (!item) return reply(botToken, chatId, "العنصر ده مش موجود دلوقتي.");
  if (item.last_confirmed_month === new Date().toISOString().slice(0, 7)) {
    return reply(botToken, chatId, "اتسجل قبل كده الشهر ده ✅");
  }
  try {
    await createTransaction({
      user_id: userId,
      type: item.kind === "income" ? "income" : "expense",
      account_id: item.account_id,
      amount: item.amount,
      currency: item.currency,
      category_id: item.category_id,
      description: item.name,
      source: "bot",
    });
    await supabaseAdmin.from("recurring_items").update({ last_confirmed_month: new Date().toISOString().slice(0, 7) }).eq("id", itemId);
    const { data: acc } = await supabaseAdmin.from("accounts").select("name").eq("id", item.account_id).single();
    const accName = acc?.name || "الحساب";
    const msg = item.kind === "income"
      ? `✅ تم الإيداع في حساب ${accName} — ${Number(item.amount).toLocaleString()} ${item.currency} (${item.name})`
      : `✅ اتخصم من حساب ${accName} — ${Number(item.amount).toLocaleString()} ${item.currency} (${item.name})`;
    return reply(botToken, chatId, msg);
  } catch (e: any) {
    return reply(botToken, chatId, `في مشكلة: ${e.message}`);
  }
}

async function startFlow(userId: string, botToken: string, chatId: string, flow: string) {
  if (flow === "quick_statement") return quickStatement(userId, botToken, chatId);
  if (flow === "account_statement") {
    const accounts = await getAccounts(userId);
    if (!accounts.length) return reply(botToken, chatId, "لسه معملتش أي حساب. ضيفه من التطبيق الأول.");
    await setSession(userId, chatId, "account_statement", "await_account", {});
    return reply(botToken, chatId, "كشف حساب مين؟", accountsKeyboard(accounts, "acct"));
  }
  if (flow === "balance_update") {
    const accounts = await getAccounts(userId);
    if (!accounts.length) return reply(botToken, chatId, "لسه معملتش أي حساب. ضيفه من التطبيق الأول.");
    await setSession(userId, chatId, "balance_update", "await_all", { accounts: accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency })) });
    const list = accounts.map((a, i) => `${i + 1}. ${a.name} (${a.currency}) — الحالي: ${a.balance}`).join("\n");
    return reply(
      botToken,
      chatId,
      `اكتب الأرصدة الجديدة بالترتيب مفصولة بفاصلة:\n${list}\n\nمثال: 1500, 200, 3000`
    );
  }

  // expense / withdrawal / income / transfer all start by asking amount
  await setSession(userId, chatId, flow, "await_amount", {});
  const prompts: Record<string, string> = {
    expense: "كام؟ 💸",
    withdrawal: "هتسحب كام؟ 🏧",
    income: "وصلك كام؟ 💰",
    transfer: "هتحول كام؟ 🔁",
  };
  return reply(botToken, chatId, prompts[flow] || "كام؟", { remove_keyboard: true });
}

async function quickStatement(userId: string, botToken: string, chatId: string) {
  const { rates } = await getFxRates();
  const [{ data: accounts }, { data: debts }, { data: txs }] = await Promise.all([
    supabaseAdmin.from("accounts").select("*").eq("user_id", userId).eq("is_archived", false),
    supabaseAdmin.from("debts").select("*").eq("user_id", userId).eq("status", "open"),
    supabaseAdmin.from("transactions").select("*").eq("user_id", userId).order("occurred_at", { ascending: false }).limit(300),
  ]);
  const owned = (accounts || []).reduce((s, a) => s + toEGP(Number(a.balance), a.currency, rates), 0);
  const owedToMe = (debts || []).filter((d) => d.direction === "owed_to_me").reduce((s, d) => s + toEGP(Number(d.remaining_amount), d.currency, rates), 0);
  const iOwe = (debts || []).filter((d) => d.direction === "i_owe").reduce((s, d) => s + toEGP(Number(d.remaining_amount), d.currency, rates), 0);
  const net = owned + owedToMe - iOwe;

  const spendables = (txs || []).filter((t) => t.type === "expense" || t.type === "withdrawal");
  const monthStart = startOfMonth(new Date());
  const dayStart = startOfDay(new Date());
  const spentToday = spendables.filter((t) => new Date(t.occurred_at) >= dayStart).reduce((s, t) => s + toEGP(Math.abs(Number(t.amount)), t.currency, rates), 0);
  const spentMonth = spendables.filter((t) => new Date(t.occurred_at) >= monthStart).reduce((s, t) => s + toEGP(Math.abs(Number(t.amount)), t.currency, rates), 0);

  const text = `📊 كشف سريع\n\nتملك: ${owned.toLocaleString()} + مستحق لي: ${owedToMe.toLocaleString()}\nمستحق عليّ: ${iOwe.toLocaleString()}\nصافي الثروة: ${net.toLocaleString()} جنيه\n\nصرفت النهاردة: ${spentToday.toLocaleString()}\nصرفت الشهر ده: ${spentMonth.toLocaleString()}`;
  return reply(botToken, chatId, text);
}

async function continueFlow(userId: string, botToken: string, chatId: string, session: any, input: string, cbPrefix?: string) {
  const { flow, step, payload } = session;

  // ===== ACCOUNT STATEMENT =====
  if (flow === "account_statement" && step === "await_account" && cbPrefix === "acct") {
    const { data: acc } = await supabaseAdmin.from("accounts").select("*").eq("id", input).single();
    const { data: txs } = await supabaseAdmin
      .from("transactions")
      .select("*")
      .eq("account_id", input)
      .order("occurred_at", { ascending: false })
      .limit(10);
    const lines = (txs || [])
      .map((t) => `${new Date(t.occurred_at).toLocaleDateString("ar-EG")} — ${t.type} — ${t.amount} ${t.currency}${t.description ? " — " + t.description : ""}`)
      .join("\n");
    await clearSession(userId, chatId);
    return reply(botToken, chatId, `📈 ${acc?.name}\nالرصيد: ${acc?.balance} ${acc?.currency}\n\nآخر الحركات:\n${lines || "لا يوجد"}`);
  }

  // ===== BALANCE UPDATE =====
  if (flow === "balance_update" && step === "await_all") {
    const nums = input.split(",").map((s) => parseAmount(s.trim()));
    const accts = payload.accounts as { id: string; name: string; currency: string }[];
    if (nums.length !== accts.length || nums.some((n) => n === null)) {
      return reply(botToken, chatId, `العدد لازم يكون ${accts.length} رقم مفصول بفاصلة. حاول تاني أو /cancel`);
    }
    for (let i = 0; i < accts.length; i++) {
      await createTransaction({
        user_id: userId,
        type: "balance_update",
        account_id: accts[i].id,
        amount: nums[i] as number,
        currency: accts[i].currency,
        source: "bot",
      });
    }
    await clearSession(userId, chatId);
    return reply(botToken, chatId, "تم تحديث كل الأرصدة ✅");
  }

  // ===== EXPENSE / WITHDRAWAL / INCOME / TRANSFER =====
  if (["expense", "withdrawal", "income", "transfer"].includes(flow)) {
    if (step === "await_amount") {
      const n = parseAmount(input);
      if (!n || n <= 0) return reply(botToken, chatId, "اكتب رقم صحيح للمبلغ 🙏");
      payload.amount = n;
      if (flow === "expense") {
        await setSession(userId, chatId, flow, "await_description", payload);
        return reply(botToken, chatId, "اتصرف في ايه؟ ✍️");
      }
      if (flow === "income") {
        await setSession(userId, chatId, flow, "await_source", payload);
        return reply(botToken, chatId, "جاتلك من مين؟ (اختياري، اكتب - لو مفيش)");
      }
      // withdrawal & transfer go straight to account selection
      const accounts = await getAccounts(userId);
      if (!accounts.length) return reply(botToken, chatId, "لسه معملتش أي حساب. ضيفه من التطبيق.");
      await setSession(userId, chatId, flow, "await_account", payload);
      return reply(botToken, chatId, "من انهي حساب؟", accountsKeyboard(accounts, "acc"));
    }

    if (step === "await_description") {
      payload.description = input;
      const { data: cats } = await supabaseAdmin.from("categories").select("id,name,keywords,kind").eq("user_id", userId);
      const guess = classifyExpense(input, cats || []);
      if (guess) payload.category_id = guess;
      const accounts = await getAccounts(userId);
      if (!accounts.length) return reply(botToken, chatId, "لسه معملتش أي حساب. ضيفه من التطبيق.");
      await setSession(userId, chatId, flow, "await_account", payload);
      return reply(botToken, chatId, "من انهي حساب؟", accountsKeyboard(accounts, "acc"));
    }

    if (step === "await_source") {
      payload.counterparty_name = input === "-" ? null : input;
      const accounts = await getAccounts(userId);
      if (!accounts.length) return reply(botToken, chatId, "لسه معملتش أي حساب. ضيفه من التطبيق.");
      await setSession(userId, chatId, flow, "await_account", payload);
      return reply(botToken, chatId, "دخلت انهي حساب؟", accountsKeyboard(accounts, "acc"));
    }

    if (step === "await_account" && cbPrefix === "acc") {
      payload.account_id = input;
      if (flow === "transfer") {
        const accounts = (await getAccounts(userId)).filter((a) => a.id !== input);
        await setSession(userId, chatId, flow, "await_to_account", payload);
        return reply(botToken, chatId, "تحويل لانهي حساب؟", accountsKeyboard(accounts, "to"));
      }
      return finalizeSimpleTx(userId, botToken, chatId, flow, payload);
    }

    if (step === "await_to_account" && cbPrefix === "to") {
      payload.to_account_id = input;
      return finalizeSimpleTx(userId, botToken, chatId, flow, payload);
    }
  }
}

async function finalizeSimpleTx(userId: string, botToken: string, chatId: string, flow: string, payload: any) {
  try {
    const tx = await createTransaction({
      user_id: userId,
      type: flow as any,
      account_id: payload.account_id,
      to_account_id: payload.to_account_id,
      amount: payload.amount,
      description: payload.description,
      counterparty_name: payload.counterparty_name,
      category_id: payload.category_id,
      source: "bot",
    });
    await setSession(userId, chatId, null, null, { last_tx_id: tx.id });
    const labels: Record<string, string> = { expense: "المصروف", withdrawal: "السحب", income: "الفلوس", transfer: "التحويل" };
    return reply(
      botToken,
      chatId,
      `تم تسجيل ${labels[flow]} ✅ (${payload.amount})\nابعت صورة الإيصال لو عندك 📎، أو كمّل من الأزرار.`
    );
  } catch (e: any) {
    await clearSession(userId, chatId);
    return reply(botToken, chatId, `في مشكلة: ${e.message}`);
  }
}
