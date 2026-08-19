import { supabaseAdmin } from "./supabaseAdmin";

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
      if (!input.account_id || !input.to_account_id) throw new Error("account_id and to_account_id required");
      await adjustBalance(input.account_id, -Math.abs(txAmount));
      await adjustBalance(input.to_account_id, Math.abs(txAmount));
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
  return tx;
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
}
