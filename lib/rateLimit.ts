import { NextRequest } from "next/server";
import { supabaseAdmin } from "./supabaseAdmin";

// SERVER-ONLY. Vercel serverless functions don't share memory between
// invocations (and can run many in parallel), so an in-memory counter gives
// NO real protection against a brute-force PIN attack — it has to be
// backed by something persistent. Supabase (already the app's only
// datastore) is good enough at this app's traffic scale; a dedicated
// service like Upstash Redis would be the upgrade if that ever changes.

export function clientIp(req: NextRequest): string {
  // Vercel sets x-forwarded-for; take the first (client) hop.
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

// Returns true if the caller is currently rate-limited (should be refused).
export async function isLoginRateLimited(ip: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 min
  const { count } = await supabaseAdmin
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("success", false)
    .gte("created_at", windowStart);
  return (count ?? 0) >= 10; // 10 failed attempts / 15 min / IP
}

export async function recordLoginAttempt(ip: string, userId: string | null, success: boolean) {
  await supabaseAdmin.from("login_attempts").insert({ ip, user_id: userId, success });
}
