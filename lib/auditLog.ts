// Lightweight audit trail, reusing the existing (previously unused) sync_log
// table. Every write that can change a user's money picture — transactions,
// accounts — calls logEvent() so /admin can show a history of what happened
// and from where (app, bot, admin panel...), which lets the user trace back
// through old/new entries if their numbers ever look confused.
//
// Logging must never break the action it's attached to: any failure here is
// swallowed, not thrown.
import { supabaseAdmin } from "./supabaseAdmin";

export type AuditSource = "app" | "bot" | "sheet" | "voice" | "ocr" | "admin" | "system";

export interface LogEventInput {
  user_id?: string | null;
  source: AuditSource;
  action: string;
  payload?: Record<string, unknown> | null;
  status?: "ok" | "error";
}

export async function logEvent(input: LogEventInput) {
  try {
    await supabaseAdmin.from("sync_log").insert({
      user_id: input.user_id || null,
      source: input.source,
      action: input.action,
      payload: input.payload ?? null,
      status: input.status || "ok",
    });
  } catch {
    // best-effort only
  }
}
