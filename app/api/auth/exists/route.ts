import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Public, but leaks nothing about WHO the customers are — only whether the
// database is completely empty (used by /login to show the first-run
// "go set up /admin" message). Replaces the old GET /api/auth/users, which
// used to hand back every customer's name to any unauthenticated visitor —
// fine for a single-family app, a real privacy leak once this is a
// multi-tenant SaaS with paying customers who don't know about each other.
export async function GET() {
  const { count, error } = await supabaseAdmin.from("app_users").select("id", { count: "exact", head: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ hasUsers: (count ?? 0) > 0 });
}
