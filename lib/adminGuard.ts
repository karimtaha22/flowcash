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

// SECURITY (fixed as part of the SaaS/licensing pass): this used to treat
// "has a valid session" as "is an admin" — meaning ANY logged-in customer,
// once the app has paying customers, could open /admin and see, edit, or
// delete every other customer's account. It now also requires is_admin=true
// on that user's row (set once, on your own account, by the licensing
// migration — see lib/license.ts).
async function isSessionAdmin(): Promise<boolean> {
  const userId = await getSessionUserId();
  if (!userId) return false;
  const { data } = await supabaseAdmin.from("app_users").select("is_admin").eq("id", userId).single();
  return !!data?.is_admin;
}

// Use for anything that reads/creates during the open bootstrap window
// (listing users, creating the very first account) — allowed once no users
// exist yet, otherwise requires a logged-in ADMIN session.
export async function requireAdminAuthOrBootstrap(): Promise<NextResponse | null> {
  if (await isBootstrap()) return null;
  if (await isSessionAdmin()) return null;
  return NextResponse.json({ error: "لازم تسجل دخول بحساب الإدارة" }, { status: 401 });
}

// Use for anything that touches an EXISTING user (edit/delete a user, manage
// someone's Telegram bot, licensing) — always requires a logged-in ADMIN
// session, no bootstrap exception.
export async function requireAdminAuth(): Promise<NextResponse | null> {
  if (await isSessionAdmin()) return null;
  return NextResponse.json({ error: "لازم تسجل دخول بحساب الإدارة" }, { status: 401 });
}
