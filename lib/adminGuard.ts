import { NextResponse } from "next/server";
import { supabaseAdmin } from "./supabaseAdmin";
import { getSessionUserId } from "./session";

// /admin and its API were reachable by ANYONE on the internet with no login
// at all — able to see every user's name, create accounts, and edit/delete
// existing ones. The only legitimate anonymous case is the very first-ever
// signup, before any user exists yet ("لسه مفيش مستخدمين" bootstrap flow).
// Once at least one user exists, admin access requires a logged-in session.
export async function isBootstrap() {
  const { count } = await supabaseAdmin.from("app_users").select("id", { count: "exact", head: true });
  return (count ?? 0) === 0;
}

// Use for anything that reads/creates during the open bootstrap window
// (listing users, creating the very first account) — allowed once no users
// exist yet, otherwise requires a valid session.
export async function requireAdminAuthOrBootstrap(): Promise<NextResponse | null> {
  if (await isBootstrap()) return null;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "لازم تسجل دخول الأول" }, { status: 401 });
  return null;
}

// Use for anything that touches an EXISTING user (edit/delete a user, manage
// someone's Telegram bot) — always requires a valid session, no bootstrap
// exception, since there's already at least one real account by definition.
export async function requireAdminAuth(): Promise<NextResponse | null> {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "لازم تسجل دخول الأول" }, { status: 401 });
  return null;
}
