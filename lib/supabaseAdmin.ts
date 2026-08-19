import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client. Never import this from a client component.
// RLS is disabled on all tables in this project (private, invite-only app) —
// access control happens entirely at the Next.js API layer via the session cookie.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_KEY!,
  { auth: { persistSession: false } }
);
