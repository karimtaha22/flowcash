// The actual bot conversation logic (menus, multi-step flows, quick reports)
// — moved here from app/api/telegram/[userId]/route.ts unchanged, so it can
// be shared by the new single webhook (app/api/telegram/webhook/route.ts)
// now that every customer talks to the SAME bot instead of their own. Every
// function here already took `userId` as an explicit parameter (never
// inferred it from the request URL), so nothing about the flow logic itself
// had to change — only how the caller figures out `userId` before invoking
// these changed (see the webhook route: it's now resolved from the
// incoming message's chat_id via app_users.telegram_chat_id, not from a
// per-user URL segment).
import { supabaseAdmin } from "./supabaseAdmin";
import { sendText, tgCall, MAIN_KEYBOARD, CANCEL_KEYBOARD, CANCEL_TEXT, BRAND_FOOTER } from "./telegram";
import { getSession, setSession, clearSession, accountsKeyboard, yesNoKeyboard, parseAmount } from "./botHelpers";
import { createTransaction } from "./transactions";
import { confirmRecurringItem, isConfirmedForCurrentPeriod } from "./recurringConfirm";
import { classifyExpense } from "./categories";
import { toEGP } from "./fx";
import { getFxRates } from "./fxRates";
import { startOfDay, startOfWeek, startOfMonth } from "date-fns";

const KEY_MAP: Record<string, string> = {
  "💸 تسجيل مصروف": "expense",
  "🏧 سحب من حساب": "withdrawal",
  "💰 فلوس جاتلي": "income",
  "🔁 تحويل أونلاين": "transfer",
  "📊 تحديث أرصدة": "balance_update",
  "📄 كشف سريع": "quick_statement",
  "📈 كشف حساب": "account_statement",
  "🔍 استعلام عن مصروف": "expense_query",
  "🔔 التنبيهات": "alerts",
  "🔕 كتم/تفعيل تنبيهات البوت": "toggle_mute",
  "➕ إضافة تذكير": "add_reminder",
};

// round 27 — "➕ إضافة تذكير": asks which of the 3 reminder kinds, then takes
// one free-text message and saves it as a minimal record of that kind,
// tagged source:"telegram" so it's visibly distinguishable in the app (see
// /reminders' UI — each list badges telegram-sourced rows). Deliberately NOT
// the full multi-field forms (date/time picker, medication schedule,
// brand/price picking) — those stay app-only; the bot is a fast capture path
// ("تكتب و يتسجل") the user can flesh out later in the app if they want to.
const REMINDER_TYPE_LABELS: Record<string, string> = { general: "تذكير عام", medication: "دواء", grocery: "سوبر ماركت" };

async function getAccounts(userId: string) {
  const { data } = await supabaseAdmin.from("accounts").select("*").eq("user_id", userId).eq("is_archived", false).order("created_at");
  return data || [];
}

async function reply(botToken: string, chatId: string, text: string, keyboard: any = MAIN_KEYBOARD) {
  return tgCall(botToken, "sendMessage", { chat_id: chatId, text: text + BRAND_FOOTER, reply_markup: keyboard });
}

// Telegram can't show a persistent reply keyboard (like CANCEL_KEYBOARD) and
// an inline keyboard on the same message — so every step that prompts with
// an inline keyboard (account pickers, etc.) sends a tiny companion message
// carrying the ❌ إنهاء button first, then the actual inline-keyboard prompt.
// This is what makes "إنهاء" reachable at ANY step, not just typed-input ones.
async function replyInlineWithCancel(botToken: string, chatId: string, text: string, inlineKeyboard: any) {
  await reply(botToken, chatId, "اضغط ❌ إنهاء في أي وقت لو غيّرت رأيك.", CANCEL_KEYBOARD);
  return tgCall(botToken, "sendMessage", { chat_id: chatId, text, reply_markup: inlineKeyboard });
}

export async function handleTelegramMessage(userId: string, botToken: string, msg: any) {
  const chatId = String(msg.chat.id);
  const text: string | undefined = msg.text;

  const session = await getSession(userId, chatId);

  if (text === "/start") {
    await clearSession(userId, chatId);
    return reply(botToken, chatId, `أهلاً بيك في FlowCash 👋\nاختار من الأزرار تحت.`);
  }
  // "إنهاء" works at ANY step of ANY flow — even before typing/selecting anything —
  // so an accidental tap (e.g. "سحب من حساب" by mistake) can always be backed out of.
  if (text === "/cancel" || text === CANCEL_TEXT) {
    const hadFlow = !!session?.flow;
    await clearSession(userId, chatId);
    return reply(botToken, chatId, hadFlow ? "تم الإلغاء ✅ رجعنا للقائمة الرئيسية" : "القائمة الرئيسية 👇");
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

  // starting a new flow from the keyboard — if a different flow was already
  // mid-way (e.g. user tapped "سحب من حساب" by mistake while an "expense" flow
  // was active), silently cancel it and start the newly tapped one instead of
  // swallowing the tap as raw input for the old flow's current step.
  if (text && KEY_MAP[text]) {
    if (session?.flow) await clearSession(userId, chatId);
    return startFlow(userId, botToken, chatId, KEY_MAP[text]);
  }

  // continue an existing flow
  if (session?.flow) {
    return continueFlow(userId, botToken, chatId, session, text || "");
  }

  return reply(botToken, chatId, "اختار من الأزرار تحت أو دوس /start");
}

export async function handleTelegramCallback(userId: string, botToken: string, cbq: any) {
  const chatId = String(cbq.message.chat.id);
  const data: string = cbq.data;
  const [prefix, value] = data.split(":");
  await tgCall(botToken, "answerCallbackQuery", { callback_query_id: cbq.id });

  // "دفعت" / "نزل" button on a recurring-item reminder — not part of any multi-step flow
  if (prefix === "recur_paid") {
    return startRecurConfirm(userId, botToken, chatId, value);
  }

  // "تم إخراج الصدقة" button on the charity reminder — mutes today's reminders,
  // mirroring the in-app "سكّت تذكير النهاردة" toggle on صدقات وزكاة.
  if (prefix === "charity_mute") {
    const todayIso = new Date().toISOString().slice(0, 10);
    await supabaseAdmin.from("app_users").update({ charity_muted_date: todayIso }).eq("id", userId);
    return reply(botToken, chatId, "تم تسجيل إخراج الصدقة ✅ مش هتوصلك تذكيرات صدقة تانية النهاردة.");
  }

  // "✅ تم الدفع" button on an installment/gam3eya due-day reminder — marks
  // that one month's row paid directly from Telegram, same effect as tapping
  // it in the app (see app/api/installments/[id]/payments/[paymentId] and
  // app/api/gam3eya/[id]/payments/[paymentId]). No account/balance is
  // touched here, unlike recurring items — these are just schedule trackers.
  if (prefix === "installment_paid") {
    const { data: payment } = await supabaseAdmin
      .from("installment_payments")
      .select("id,status,plan_id,installment_plans!inner(user_id,item_name)")
      .eq("id", value)
      .single();
    if (!payment || (payment as any).installment_plans?.user_id !== userId) return reply(botToken, chatId, "القسط ده مش موجود.");
    if (payment.status === "paid") return reply(botToken, chatId, "اتسجل قبل كده ✅");
    await supabaseAdmin.from("installment_payments").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", value);
    const { count } = await supabaseAdmin.from("installment_payments").select("id", { count: "exact", head: true }).eq("plan_id", payment.plan_id).eq("status", "pending");
    if ((count || 0) === 0) await supabaseAdmin.from("installment_plans").update({ status: "completed" }).eq("id", payment.plan_id);
    return reply(botToken, chatId, `✅ اتسجل قسط "${(payment as any).installment_plans?.item_name}" مدفوع.`);
  }

  // "✅ اتاخدت" on a medication dose-due reminder — logs the dose exactly
  // like POST /api/reminders/medications/[id]/dose does for the in-app
  // button, so both paths share the same next-dose math (lib/medicationSchedule.ts).
  if (prefix === "dose_taken") {
    const { data: med } = await supabaseAdmin
      .from("medications")
      .select("id,name,remaining_doses,schedule_type,meal_timing,interval_hours")
      .eq("id", value)
      .eq("user_id", userId)
      .single();
    if (!med) return reply(botToken, chatId, "الدواء ده مش موجود دلوقتي.");
    const { computeNextDoseAt } = await import("./medicationSchedule");
    const newRemaining = med.remaining_doses !== null ? Math.max(0, med.remaining_doses - 1) : null;
    const nextDose = med.schedule_type ? computeNextDoseAt(med.schedule_type, med.meal_timing, med.interval_hours) : null;
    await supabaseAdmin
      .from("medications")
      .update({
        remaining_doses: newRemaining,
        last_dose_at: new Date().toISOString(),
        next_dose_at: nextDose ? nextDose.toISOString() : null,
        last_dose_reminded_at: null,
      })
      .eq("id", value);
    return reply(botToken, chatId, `✅ اتسجلت جرعة "${med.name}"${newRemaining !== null ? ` — باقي ${newRemaining}` : ""}`);
  }

  if (prefix === "gam3eya_paid") {
    const { data: payment } = await supabaseAdmin
      .from("gam3eya_payments")
      .select("id,status,gam3eya_id,gam3eyas!inner(user_id,name)")
      .eq("id", value)
      .single();
    if (!payment || (payment as any).gam3eyas?.user_id !== userId) return reply(botToken, chatId, "الدفعة دي مش موجودة.");
    if (payment.status === "paid") return reply(botToken, chatId, "اتسجلت قبل كده ✅");
    await supabaseAdmin.from("gam3eya_payments").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", value);
    const { count } = await supabaseAdmin.from("gam3eya_payments").select("id", { count: "exact", head: true }).eq("gam3eya_id", payment.gam3eya_id).eq("status", "pending");
    if ((count || 0) === 0) await supabaseAdmin.from("gam3eyas").update({ status: "completed" }).eq("id", payment.gam3eya_id);
    return reply(botToken, chatId, `✅ اتسجلت الدفعة في "${(payment as any).gam3eyas?.name || "الجمعية"}".`);
  }

  const session = await getSession(userId, chatId);
  if (!session?.flow) return;

  await continueFlow(userId, botToken, chatId, session, value, prefix);
}

// asks "تخصم من حساب؟ نعم/لا" before touching any balance — a plain "دفعت"
// tap used to deduct silently from the item's original account; now the
// user explicitly confirms, and can pick a different account than the one
// the item was created with.
async function startRecurConfirm(userId: string, botToken: string, chatId: string, itemId: string) {
  const { data: item } = await supabaseAdmin.from("recurring_items").select("*").eq("id", itemId).eq("user_id", userId).single();
  if (!item) return reply(botToken, chatId, "العنصر ده مش موجود دلوقتي.");
  if (isConfirmedForCurrentPeriod(item)) {
    return reply(botToken, chatId, "اتسجل قبل كده في نفس المدة دي ✅");
  }
  await setSession(userId, chatId, "recur_confirm", "ask_deduct", { itemId });
  return replyInlineWithCancel(
    botToken,
    chatId,
    `تخصم ${Number(item.amount).toLocaleString()} ${item.currency} (${item.name}) من حساب؟`,
    yesNoKeyboard("rdeduct")
  );
}

async function startFlow(userId: string, botToken: string, chatId: string, flow: string) {
  if (flow === "quick_statement") return quickStatement(userId, botToken, chatId);
  if (flow === "expense_query") return expenseQuery(userId, botToken, chatId);
  if (flow === "alerts") return alertsReport(userId, botToken, chatId);
  if (flow === "toggle_mute") return toggleMuteAll(userId, botToken, chatId);
  if (flow === "add_reminder") {
    await setSession(userId, chatId, "add_reminder", "await_type", {});
    return replyInlineWithCancel(botToken, chatId, "هتضيف انهي تذكير؟", {
      inline_keyboard: [
        [{ text: "📅 تذكير عام", callback_data: "remtype:general" }],
        [{ text: "💊 دواء", callback_data: "remtype:medication" }],
        [{ text: "🛒 سوبر ماركت", callback_data: "remtype:grocery" }],
      ],
    });
  }
  if (flow === "account_statement") {
    const accounts = await getAccounts(userId);
    if (!accounts.length) return reply(botToken, chatId, "لسه معملتش أي حساب. ضيفه من التطبيق الأول.");
    await setSession(userId, chatId, "account_statement", "await_account", {});
    return replyInlineWithCancel(botToken, chatId, "كشف حساب مين؟", accountsKeyboard(accounts, "acct"));
  }
  if (flow === "balance_update") {
    const accounts = await getAccounts(userId);
    if (!accounts.length) return reply(botToken, chatId, "لسه معملتش أي حساب. ضيفه من التطبيق الأول.");
    await setSession(userId, chatId, "balance_update", "await_all", { accounts: accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency })) });
    const list = accounts.map((a, i) => `${i + 1}. ${a.name} (${a.currency}) — الحالي: ${a.balance}`).join("\n");
    return reply(
      botToken,
      chatId,
      `اكتب الأرصدة الجديدة بالترتيب مفصولة بفاصلة:\n${list}\n\nمثال: 1500, 200, 3000`,
      CANCEL_KEYBOARD
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
  return reply(botToken, chatId, prompts[flow] || "كام؟", CANCEL_KEYBOARD);
}

async function quickStatement(userId: string, botToken: string, chatId: string) {
  const { rates } = await getFxRates();
  const [{ data: accounts }, { data: debts }, { data: txs }] = await Promise.all([
    supabaseAdmin.from("accounts").select("*").eq("user_id", userId).eq("is_archived", false),
    supabaseAdmin.from("debts").select("*").eq("user_id", userId).eq("status", "open"),
    supabaseAdmin.from("transactions").select("*").eq("user_id", userId).order("occurred_at", { ascending: false }).limit(300),
  ]);
  const owned = (accounts || [])
    .filter((a: any) => a.include_in_net_worth !== false)
    .reduce((s, a) => s + toEGP(Number(a.balance), a.currency, rates), 0);
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

// "🔍 استعلام عن مصروف" — today's expenses, plus (as of round 21) any
// pending installment/gam3eya payments due today أو متأخرة — دي مش
// "transactions" لكنها التزامات مالية فعلية، فطلب المستخدم إنها تظهر هنا
// كمان بدل ما تفضل مقصورة على "🔔 التنبيهات".
async function expenseQuery(userId: string, botToken: string, chatId: string) {
  const dayStart = startOfDay(new Date());
  const todayIso = new Date().toISOString().slice(0, 10);

  const [{ data: txs }, { data: installmentPlans }, { data: gam3eyat }] = await Promise.all([
    supabaseAdmin
      .from("transactions")
      .select("*, categories(name,icon)")
      .eq("user_id", userId)
      .eq("type", "expense")
      .gte("occurred_at", dayStart.toISOString())
      .order("occurred_at", { ascending: false }),
    supabaseAdmin
      .from("installment_plans")
      .select("item_name,currency,installment_payments(due_date,amount,status)")
      .eq("user_id", userId)
      .eq("status", "active"),
    supabaseAdmin
      .from("gam3eyas")
      .select("name,type,currency,gam3eya_payments(due_date,amount,status,participant_id,gam3eya_participants(name))")
      .eq("user_id", userId)
      .eq("status", "active"),
  ]);

  const list = txs || [];
  const dueInstallments = (installmentPlans || []).flatMap((p: any) =>
    (p.installment_payments || [])
      .filter((x: any) => x.status === "pending" && x.due_date <= todayIso)
      .map((x: any) => `• قسط "${p.item_name}" — ${Number(x.amount).toLocaleString()} ${p.currency}${x.due_date < todayIso ? " (متأخر)" : ""}`)
  );
  const dueGam3eya = (gam3eyat || []).flatMap((g: any) =>
    (g.gam3eya_payments || [])
      .filter((x: any) => x.status === "pending" && x.due_date <= todayIso)
      .map((x: any) => {
        const who = x.gam3eya_participants?.name ? ` — ${x.gam3eya_participants.name}` : "";
        return `• جمعية "${g.name || "بدون اسم"}"${who} — ${Number(x.amount).toLocaleString()} ${g.currency}${x.due_date < todayIso ? " (متأخرة)" : ""}`;
      })
  );

  if (!list.length && !dueInstallments.length && !dueGam3eya.length) {
    return reply(botToken, chatId, "مفيش مصاريف اتسجلت النهاردة، ولا أقساط/جمعيات مستحقة عليك دلوقتي 👌");
  }

  const parts: string[] = [];
  if (list.length) {
    const total = list.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
    const lines = list
      .slice(0, 10)
      .map((t) => `• ${t.categories?.icon || ""} ${t.description || t.categories?.name || "مصروف"} — ${Number(t.amount).toLocaleString()} ${t.currency}`)
      .join("\n");
    const more = list.length > 10 ? `\n+${list.length - 10} حركة تانية...` : "";
    parts.push(`💸 مصاريف النهاردة (${list.length}) — الإجمالي: ${total.toLocaleString()} جنيه تقريبًا\n${lines}${more}`);
  } else {
    parts.push("💸 مفيش مصاريف اتسجلت النهاردة لحد دلوقتي.");
  }
  if (dueInstallments.length) parts.push(`📦 أقساط مستحقة (${dueInstallments.length}):\n${dueInstallments.join("\n")}`);
  if (dueGam3eya.length) parts.push(`🤝 دفعات جمعيات مستحقة (${dueGam3eya.length}):\n${dueGam3eya.join("\n")}`);

  return reply(botToken, chatId, `🔍 استعلام عن مصروف\n\n${parts.join("\n\n")}\n\nلو عايز بيانات أكتر أو فترة تانية، افتح التطبيق 📱`);
}

// "🔔 التنبيهات" — same signal as the orange alert banner on the dashboard
// (overdue debts, over-budget categories, due recurring items، وكمان أقساط
// وجمعيات مستحقة من round 21 — قبل كده كانت ناقصة من هنا رغم إنها موجودة في
// جرس التنبيهات جوه التطبيق نفسه وفي alerts-count).
async function alertsReport(userId: string, botToken: string, chatId: string) {
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthStart = startOfMonth(new Date()).toISOString();
  const todayIso = new Date().toISOString().slice(0, 10);

  const [{ data: recurring }, { data: budgets }, { data: overdueDebts }, { data: txs }, { data: overdueInstallments }, { data: overdueGam3eya }] = await Promise.all([
    supabaseAdmin.from("recurring_items").select("id,name,last_confirmed_month,is_active").eq("user_id", userId).eq("is_active", true),
    supabaseAdmin.from("budgets").select("id,category_id,monthly_limit,alert_threshold_pct,categories(name)").eq("user_id", userId),
    supabaseAdmin.from("debts").select("id,title,remaining_amount,currency,people(name)").eq("user_id", userId).eq("status", "overdue"),
    supabaseAdmin.from("transactions").select("category_id,amount").eq("user_id", userId).eq("type", "expense").gte("occurred_at", monthStart),
    supabaseAdmin
      .from("installment_payments")
      .select("id,due_date,amount,installment_plans!inner(user_id,item_name,currency)")
      .eq("installment_plans.user_id", userId)
      .eq("status", "pending")
      .lte("due_date", todayIso),
    supabaseAdmin
      .from("gam3eya_payments")
      .select("id,due_date,amount,gam3eyas!inner(user_id,name,currency),gam3eya_participants(name)")
      .eq("gam3eyas.user_id", userId)
      .eq("status", "pending")
      .lte("due_date", todayIso),
  ]);

  const dueRecurring = (recurring || []).filter((r) => r.last_confirmed_month !== monthKey);

  const spentByCategory: Record<string, number> = {};
  for (const t of txs || []) {
    if (!t.category_id) continue;
    spentByCategory[t.category_id] = (spentByCategory[t.category_id] || 0) + Math.abs(Number(t.amount));
  }
  const overBudget = (budgets || []).filter((b) => {
    const pct = b.monthly_limit > 0 ? ((spentByCategory[b.category_id] || 0) / Number(b.monthly_limit)) * 100 : 0;
    return pct >= (b.alert_threshold_pct || 80);
  });

  const installmentsList = (overdueInstallments || []) as any[];
  const gam3eyaList = (overdueGam3eya || []) as any[];

  const total = dueRecurring.length + overBudget.length + (overdueDebts || []).length + installmentsList.length + gam3eyaList.length;
  if (!total) return reply(botToken, chatId, "مفيش تنبيهات دلوقتي، كله تمام ✅");

  const lines: string[] = [];
  if (dueRecurring.length) lines.push(`📅 ${dueRecurring.length} مصروف/دخل متكرر مستني تأكيد: ${dueRecurring.map((r) => r.name).join("، ")}`);
  if (overBudget.length) lines.push(`📊 ${overBudget.length} ميزانية تخطت الحد: ${overBudget.map((b: any) => b.categories?.name || "").filter(Boolean).join("، ")}`);
  if ((overdueDebts || []).length) {
    lines.push(
      `⏰ ${overdueDebts!.length} دين متأخر: ` +
        overdueDebts!.map((d: any) => `${d.people?.name || "شخص"} (${Number(d.remaining_amount).toLocaleString()} ${d.currency})`).join("، ")
    );
  }
  if (installmentsList.length) {
    lines.push(
      `📦 ${installmentsList.length} قسط مستحق: ` +
        installmentsList.map((p) => `${p.installment_plans?.item_name} (${Number(p.amount).toLocaleString()} ${p.installment_plans?.currency})`).join("، ")
    );
  }
  if (gam3eyaList.length) {
    lines.push(
      `🤝 ${gam3eyaList.length} دفعة جمعية مستحقة: ` +
        gam3eyaList.map((p) => `${p.gam3eyas?.name || "جمعية"}${p.gam3eya_participants?.name ? ` — ${p.gam3eya_participants.name}` : ""} (${Number(p.amount).toLocaleString()} ${p.gam3eyas?.currency})`).join("، ")
    );
  }

  return reply(botToken, chatId, `🔔 عندك ${total} حاجة محتاجة انتباهك\n\n${lines.join("\n")}`);
}

// "🔕 كتم/تفعيل تنبيهات البوت" — زرار ثابت في القايمة الرئيسية (سياسة
// تليجرام بتطلب إن أي بوت يبعت تنبيهات دورية يديك طريقة توقفها بسهولة، وإلا
// ممكن يتقفل). بيوقف/يشغّل كل التذكيرات الاستباقية (صدقة/زكاة/ديون/متكرر/
// أقساط/جمعيات) من هنا — الأزرار التفاعلية زي "🔍 استعلام عن مصروف" و"🔔
// التنبيهات" بتفضل شغالة عادي لأنها بطلب المستخدم نفسه مش بوش من البوت.
async function toggleMuteAll(userId: string, botToken: string, chatId: string) {
  const { data: user } = await supabaseAdmin.from("app_users").select("telegram_notifications_muted").eq("id", userId).single();
  const next = !user?.telegram_notifications_muted;
  await supabaseAdmin.from("app_users").update({ telegram_notifications_muted: next }).eq("id", userId);
  return reply(
    botToken,
    chatId,
    next
      ? "🔕 تم كتم كل تنبيهات البوت (الصدقة، الزكاة، الديون، المصاريف المتكررة، الأقساط، الجمعيات). تقدر تشغّلها تاني بنفس الزرار في أي وقت.\n\nملحوظة: تقدر تشوف نفس البيانات دايمًا من جرس التنبيهات جوه التطبيق."
      : "🔔 اتفعّلت تنبيهات البوت تاني ✅"
  );
}

async function continueFlow(userId: string, botToken: string, chatId: string, session: any, input: string, cbPrefix?: string) {
  const { flow, step, payload } = session;

  // ===== RECURRING ITEM "دفعت" CONFIRMATION =====
  if (flow === "recur_confirm" && step === "ask_deduct" && cbPrefix === "rdeduct") {
    if (input === "no") {
      const { data: item } = await supabaseAdmin.from("recurring_items").select("name,amount,currency").eq("id", payload.itemId).single();
      try {
        await confirmRecurringItem(userId, payload.itemId, { deduct: false });
      } catch (e: any) {
        await clearSession(userId, chatId);
        return reply(botToken, chatId, `في مشكلة: ${e.message}`);
      }
      await clearSession(userId, chatId);
      return reply(
        botToken,
        chatId,
        `⚠️ اتسجل إن "${item?.name}" اتدفع (${Number(item?.amount || 0).toLocaleString()} ${item?.currency}) بس متسجلش في مصروفاتك ولا اتخصم من أي حساب.`
      );
    }
    const accounts = await getAccounts(userId);
    if (!accounts.length) {
      await clearSession(userId, chatId);
      return reply(botToken, chatId, "لسه معملتش أي حساب. ضيفه من التطبيق.");
    }
    await setSession(userId, chatId, "recur_confirm", "await_account", payload);
    return replyInlineWithCancel(botToken, chatId, "اطبق الخصم من انهي حساب؟", accountsKeyboard(accounts, "racc"));
  }

  if (flow === "recur_confirm" && step === "await_account" && cbPrefix === "racc") {
    try {
      const { transaction, item } = await confirmRecurringItem(userId, payload.itemId, { deduct: true, account_id: input, source: "bot" });
      await clearSession(userId, chatId);
      const { data: acc } = await supabaseAdmin.from("accounts").select("name").eq("id", input).single();
      const accName = acc?.name || "الحساب";
      const msg =
        item.kind === "income"
          ? `✅ تم الإيداع في حساب ${accName} — ${Number(item.amount).toLocaleString()} ${item.currency} (${item.name})`
          : `✅ اتخصم من حساب ${accName} — ${Number(item.amount).toLocaleString()} ${item.currency} (${item.name})`;
      return reply(botToken, chatId, msg);
    } catch (e: any) {
      await clearSession(userId, chatId);
      return reply(botToken, chatId, `في مشكلة: ${e.message}`);
    }
  }

  // ===== ADD REMINDER (round 27) =====
  if (flow === "add_reminder" && step === "await_type" && cbPrefix === "remtype") {
    payload.type = input; // "general" | "medication" | "grocery"
    await setSession(userId, chatId, "add_reminder", "await_text", payload);
    const prompts: Record<string, string> = {
      general: "اكتب التذكير اللي عايزه ✍️",
      medication: "اكتب اسم الدواء ✍️",
      grocery: "اكتب اللي عايز تضيفه للسوبر ماركت ✍️",
    };
    return reply(botToken, chatId, prompts[input] || "اكتب ✍️", CANCEL_KEYBOARD);
  }

  if (flow === "add_reminder" && step === "await_text") {
    const text = input.trim();
    if (!text) return reply(botToken, chatId, "اكتب نص مش فاضي 🙏");
    const note = "جاي من تليجرام";
    try {
      if (payload.type === "general") {
        await supabaseAdmin.from("general_reminders").insert({ user_id: userId, title: text, source: "telegram", note });
      } else if (payload.type === "medication") {
        await supabaseAdmin.from("medications").insert({ user_id: userId, name: text, source: "telegram", note });
      } else {
        const { data: list } = await supabaseAdmin.from("grocery_lists").insert({ user_id: userId, status: "draft", source: "telegram" }).select("id").single();
        if (list) await supabaseAdmin.from("grocery_list_entries").insert({ list_id: list.id, raw_text: text, note });
      }
    } catch (e: any) {
      await clearSession(userId, chatId);
      return reply(botToken, chatId, `في مشكلة: ${e.message}`);
    }
    await clearSession(userId, chatId);
    return reply(botToken, chatId, `✅ اتسجل "${text}" كـ ${REMINDER_TYPE_LABELS[payload.type] || "تذكير"}. تقدر تكمّل بياناته من التطبيق (زي المعاد أو السعر) لو حابب.`);
  }

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
        return reply(botToken, chatId, "اتصرف في ايه؟ ✍️", CANCEL_KEYBOARD);
      }
      if (flow === "income") {
        await setSession(userId, chatId, flow, "await_source", payload);
        return reply(botToken, chatId, "جاتلك من مين؟ (اختياري، اكتب - لو مفيش)", CANCEL_KEYBOARD);
      }
      // withdrawal & transfer go straight to account selection
      const accounts = await getAccounts(userId);
      if (!accounts.length) return reply(botToken, chatId, "لسه معملتش أي حساب. ضيفه من التطبيق.");
      await setSession(userId, chatId, flow, "await_account", payload);
      return replyInlineWithCancel(botToken, chatId, "من انهي حساب؟", accountsKeyboard(accounts, "acc"));
    }

    if (step === "await_description") {
      payload.description = input;
      const { data: cats } = await supabaseAdmin.from("categories").select("id,name,keywords,kind").eq("user_id", userId);
      const guess = classifyExpense(input, cats || []);
      if (guess) payload.category_id = guess;
      const accounts = await getAccounts(userId);
      if (!accounts.length) return reply(botToken, chatId, "لسه معملتش أي حساب. ضيفه من التطبيق.");
      await setSession(userId, chatId, flow, "await_account", payload);
      return replyInlineWithCancel(botToken, chatId, "من انهي حساب؟", accountsKeyboard(accounts, "acc"));
    }

    if (step === "await_source") {
      payload.counterparty_name = input === "-" ? null : input;
      const accounts = await getAccounts(userId);
      if (!accounts.length) return reply(botToken, chatId, "لسه معملتش أي حساب. ضيفه من التطبيق.");
      await setSession(userId, chatId, flow, "await_account", payload);
      return replyInlineWithCancel(botToken, chatId, "دخلت انهي حساب؟", accountsKeyboard(accounts, "acc"));
    }

    if (step === "await_account" && cbPrefix === "acc") {
      payload.account_id = input;
      if (flow === "transfer") {
        const accounts = (await getAccounts(userId)).filter((a) => a.id !== input);
        await setSession(userId, chatId, flow, "await_to_account", payload);
        return replyInlineWithCancel(botToken, chatId, "تحويل لانهي حساب؟", accountsKeyboard(accounts, "to"));
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
