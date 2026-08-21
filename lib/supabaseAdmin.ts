import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client. Never import this from a client component.
// Access control happens entirely at the Next.js API layer via the session
// cookie — RLS (see SECURITY-RLS.sql) is defense-in-depth against a leaked
// anon key, not the primary gate. This client MUST authenticate with the
// service_role key (not anon/publishable): once RLS is enabled with zero
// policies, an anon-key client here would silently see 0 rows on every
// query (no error — RLS just filters everything out), while service_role
// always bypasses RLS. If SUPABASE_KEY in Vercel is ever the wrong key,
// this is exactly what breaks and how it looks: the app "works" (no
// errors) but every list/count comes back empty.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_KEY!,
  { auth: { persistSession: false } }
);
