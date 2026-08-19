import { supabaseAdmin } from "./supabaseAdmin";
import { logEvent } from "./auditLog";

const TX_SELECT =
  "*, accounts!transactions_account_id_fkey(name,currency), to_accounts:accounts!transactions_to_account_id_fkey(name,currency), categories(name,icon), debts(id,title,people(name))";

export type TxType = "expense" | "withdrawal" | "income" | "transfer" | "balance_update";

export interface CreateTxInput {
  user_id: string;
  type: TxType;
  account_id?: string | null;
  to_account_id?: string | null;
  amount: number; // for balance_update: the NEW balance, not delta
  currency?: string;
  category_id?: string | null;
  description?: string | null;
  counterparty_name?: string | null;
  receipt_url?: string | null;
  split_personal_amount?: number | null;
  split_debt_amount?: number | null;
  debt_person_id?: string | null; // person to attach the debt-share to, if splitting
  debt_title?: string | null;
  source?: "app" | "bot" | "sheet" | "voice" | "ocr";
  occurred_at?: string;
}

async function getAccount(id: string) {
  const { data } = await supabaseAdmin.from("accounts").select("*").eq("id", id).single();
  return data;
}

async function adjustBalance(accountId: string, delta: number) {
  const acc = await getAccount(accountId);
  if (!acc) throw new Error("account not found");
  const newBalance = Number(acc.balance) + delta;
  await supabaseAdmin.from("accounts").update({ balance: newBalance, updated_at: new Date().toISOString() }).eq("id", accountId);
  return newBalance;
}

export async function createTransaction(input: CreateTxInput) {
  let currency = input.currency;
  if (!currency && input.account_id) {
    const acc = await getAccount(input.account_id);
    currency = acc?.currency || "EGP";
  }
  currency = currency || "EGP";
  let debtId: string | null = null;
  let txAmount = input.amount;

  // handle split-into-debt: create/attach a debt for the other person's share
  if (input.type === "expense" && input.split_debt_amount && input.split_debt_amount > 0 && input.debt_person_id) {
    const { data: debt } = await supabaseAdmin
      .from("debts")
      .insert({
        user_id: input.user_id,
        person_id: input.debt_person_id,
        direction: "owed_to_me",
        title: input.debt_title || input.description || "نصيب من مصروف",
        reason: input.description || null,
        original_amount: input.split_debt_amount,
        remaining_amount: input.split_debt_amount,
        currency,
        status: "open",
      })
      .select()
      .single();
    debtId = debt?.id || null;
  }

  switch (input.type) {
    case "expense":
    case "withdrawal": {
      if (!input.account_id) throw new Error("account_id required");
      await adjustBalance(input.account_id, -Math.abs(txAmount));
      break;
    }
    case "income": {
      if (!input.account_id) throw new Error("account_id required");
      await adjustBalance(input.account_id, Math.abs(txAmount));
      break;
    }
    case "transfer": {
      // to_account_id is optional: a transfer between two of the user's own
      // accounts sets it and both balances move; a transfer OUT to a person
      // who isn't one of the user's tracked accounts just debits account_id
      // and records counterparty_name instead (no second balance to credit).
      if (!input.account_id) throw new Error("account_id required");
      await adjustBalance(input.account_id, -Math.abs(txAmount));
      if (input.to_account_id) await adjustBalance(input.to_account_id, Math.abs(txAmount));
      break;
    }
    case "balance_update": {
      if (!input.account_id) throw new Error("account_id required");
      const acc = await getAccount(input.account_id);
      const oldBalance = Number(acc.balance);
      const newBalance = input.amount;
      txAmount = newBalance - oldBalance; // store the delta for history
      await supabaseAdmin
        .from("accounts")
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq("id", input.account_id);
      break;
    }
  }

  const { data: tx, error } = await supabaseAdmin
    .from("transactions")
    .insert({
      user_id: input.user_id,
      type: input.type,
      account_id: input.account_id || null,
      to_account_id: input.to_account_id || null,
      amount: txAmount,
      currency,
      category_id: input.category_id || null,
      description: input.description || null,
      counterparty_name: input.counterparty_name || null,
      receipt_url: input.receipt_url || null,
      split_personal_amount: input.split_personal_amount || null,
      split_debt_amount: input.split_debt_amount || null,
      debt_id: debtId,
      source: input.source || "app",
      occurred_at: input.occurred_at || new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  await logEvent({
    user_id: input.user_id,
    source: input.source === "bot" ? "bot" : "app",
    action: "transaction_created",
    payload: { id: tx.id, type: tx.type, amount: tx.amount, currency: tx.currency, account_id: tx.account_id, to_account_id: tx.to_account_id, description: tx.description },
  });

  return tx;
}

export interface UpdateTxInput {
  amount?: number;
  description?: string | null;
  category_id?: string | null;
  counterparty_name?: string | null;
  receipt_url?: string | null;
  occurred_at?: string;
}

// Editing is deliberately conservative: account/type/to_account can't be
// changed here (too easy to corrupt balances), but amount can — and when it
// does, the account balance is nudged by the delta so it stays correct.
export async function updateTransaction(id: string, userId: string, updates: UpdateTxInput) {
  const { data: tx } = await supabaseAdmin.from("transactions").select("*").eq("id", id).eq("user_id", userId).single();
  if (!tx) throw new Error("الحركة غير موجودة");

  const patch: Record<string, unknown> = {};
  if (updates.description !== undefined) patch.description = updates.description;
  if (updates.category_id !== undefined) patch.category_id = updates.category_id;
  if (updates.counterparty_name !== undefined) patch.counterparty_name = updates.counterparty_name;
  if (updates.receipt_url !== undefined) patch.receipt_url = updates.receipt_url;
  if (updates.occurred_at !== undefined) patch.occurred_at = updates.occurred_at;

  if (updates.amount !== undefined && Number.isFinite(updates.amount) && Number(updates.amount) !== Number(tx.amount)) {
    const newAmount = Number(updates.amount);
    const oldAmount = Number(tx.amount);
    if (tx.type === "expense" || tx.type === "withdrawal") {
      if (tx.account_id) await adjustBalance(tx.account_id, Math.abs(oldAmount) - Math.abs(newAmount));
    } else if (tx.type === "income") {
      if (tx.account_id) await adjustBalance(tx.account_id, Math.abs(newAmount) - Math.abs(oldAmount));
    } else {
      throw new Error("مبلغ هذا النوع من الحركات (تحويل / تحديث رصيد) مايتغيرش من هنا");
    }
    patch.amount = newAmount;
  }

  if (Object.keys(patch).length === 0) {
    const { data: unchanged } = await supabaseAdmin.from("transactions").select(TX_SELECT).eq("id", id).single();
    return unchanged;
  }

  const { data: updated, error } = await supabaseAdmin
    .from("transactions")
    .update(patch)
    .eq("id", id)
    .select(TX_SELECT)
    .single();
  if (error) throw new Error(error.message);

  await logEvent({ user_id: userId, source: "app", action: "transaction_updated", payload: { id, patch } });

  return updated;
}

export async function deleteTransactionAndReverse(id: string, userId: string) {
  const { data: tx } = await supabaseAdmin.from("transactions").select("*").eq("id", id).eq("user_id", userId).single();
  if (!tx) throw new Error("not found");

  // reverse balance effects (best-effort; balance_update is not reversible to old value reliably, so we skip it)
  if (tx.type === "expense" || tx.type === "withdrawal") {
    if (tx.account_id) await adjustBalance(tx.account_id, Math.abs(tx.amount));
  } else if (tx.type === "income") {
    if (tx.account_id) await adjustBalance(tx.account_id, -Math.abs(tx.amount));
  } else if (tx.type === "transfer") {
    if (tx.account_id) await adjustBalance(tx.account_id, Math.abs(tx.amount));
    if (tx.to_account_id) await adjustBalance(tx.to_account_id, -Math.abs(tx.amount));
  }

  if (tx.debt_id) {
    await supabaseAdmin.from("debts").delete().eq("id", tx.debt_id);
  }

  await supabaseAdmin.from("transactions").delete().eq("id", id);

  await logEvent({
    user_id: userId,
    source: "app",
    action: "transaction_deleted",
    payload: { id, type: tx.type, amount: tx.amount, currency: tx.currency, account_id: tx.account_id, description: tx.description, source_of_tx: tx.source },
  });
}
