import crypto from "crypto";
import { supabaseAdmin } from "./supabaseAdmin";
import { sendText, resolveBaseUrl } from "./telegram";

// Round 24 — "نظام الدين المتقدم" (advanced debt registration: witnesses,
// live links, audit log, objections). Shared helpers used by the advanced
// debt API routes (create, acknowledge, object) — kept out of the route
// files so the "how do links get generated/controlled" mechanics live in
// one place.
//
// ARCHITECTURE (as explained to the user before building):
// - Every role gets its OWN unbuttoned, unguessable token — never one link
//   shared across people. A "debtor" link, a "creditor_view" link (only
//   generated when the app user is themselves the debtor, i.e.
//   direction='i_owe' — see below), and ONE SEPARATE link per witness.
//   Separate witness tokens are what let us track "who exactly opened this
//   and ticked the attestation checkbox" instead of one shared ledger.
// - The creditor NEVER needs a public link to control the debt — control
//   (recording a payment, extending the due date) always happens through
//   the authenticated app itself. "الدائن هو الي يقدر يسجل دفعة أو يمد
//   الأجل" is enforced by simply never exposing those actions on any public
//   /debt/[token] page — those pages are read + (witness) acknowledge +
//   (debtor) object only, nothing that mutates money or dates.
// - Direction handling: debts.direction is 'owed_to_me' (app user = دائن,
//   the `people` row = مدين) or 'i_owe' (app user = مدين, the `people` row
//   = دائن). The advanced flow always generates a link for the *other*
//   party (never for the app user, who's always got full access already):
//   role='debtor' when direction='owed_to_me', role='creditor_view' when
//   direction='i_owe'. Only the debtor role gets the red "اعتراض" button —
//   a creditor_view link is read-only-plus-witness-visibility.
// - Account detection + notification (this round's addition): every link's
//   phone number (debtor/creditor from `people.phone`, witness from
//   `debt_witnesses.phone`) is checked against `app_users.phone`. If it
//   matches ANY FlowCash account (not just a verified one — verification is
//   a separate, stronger badge), that person gets pinged immediately via
//   Telegram (if they've linked their bot) with the link, AND the app's own
//   pull-based alerts bell picks up the same pending request every time
//   they open the app (see app/api/alerts-count/route.ts) — no separate
//   stored "notification" needed, consistent with how every other reminder
//   in this app already works.

export function generateDebtToken() {
  return crypto.randomBytes(24).toString("base64url");
}

export async function logDebtEvent(
  debtId: string,
  eventType: string,
  description: string,
  actorRole: "creditor" | "debtor" | "witness" | "system",
  actorName?: string | null
) {
  await supabaseAdmin.from("debt_events").insert({
    debt_id: debtId,
    event_type: eventType,
    description,
    actor_role: actorRole,
    actor_name: actorName || null,
  });
}

// Looks up an app_users account by phone and, if found and reachable via
// Telegram (linked + not muted), sends an immediate proactive message with
// the link. Best-effort — a missing/unmatched phone or a send failure never
// blocks the caller (link creation must always succeed even if the
// Telegram push doesn't go through).
export async function notifyIfLinkedAccount(phone: string | null | undefined, text: string) {
  const p = (phone || "").trim();
  if (!p) return { matched: false };
  try {
    const { data: account } = await supabaseAdmin
      .from("app_users")
      .select("id,telegram_chat_id,telegram_notifications_muted")
      .eq("phone", p)
      .maybeSingle();
    if (!account) return { matched: false };

    const botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
    if (botToken && account.telegram_chat_id && !account.telegram_notifications_muted) {
      try {
        await sendText(botToken, account.telegram_chat_id, text);
      } catch {
        // best-effort — the in-app bell (alerts-count) still surfaces this
      }
    }
    return { matched: true, accountId: account.id };
  } catch {
    return { matched: false };
  }
}

export function debtLinkUrl(token: string) {
  return `${resolveBaseUrl()}/debt/${token}`;
}
