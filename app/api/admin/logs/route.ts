import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdminAuth } from "@/lib/adminGuard";

// Read-only view over sync_log for the admin panel, so if account data ever
// looks confused, whoever's investigating can page back through what
// actually happened (create/update/delete, and whether it came from the app,
// the Telegram bot, etc.) rather than guessing.
export async function GET(req: NextRequest) {
  const guard = await requireAdminAuth();
  if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") || 50), 200);
  const before = searchParams.get("before"); // created_at cursor for "load older"
  const userId = searchParams.get("user_id");
  const source = searchParams.get("source");
  const action = searchParams.get("action");

  let query = supabaseAdmin
    .from("sync_log")
    .select("*, app_users(name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) query = query.lt("created_at", before);
  if (userId) query = query.eq("user_id", userId);
  if (source) query = query.eq("source", source);
  if (action) query = query.eq("action", action);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ logs: data });
}
