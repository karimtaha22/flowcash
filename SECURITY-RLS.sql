-- ============================================================================
-- FlowCash — Row Level Security enablement
-- ============================================================================
-- DO NOT auto-run this from an agent. Review it, then run it yourself in the
-- Supabase SQL editor (or via `supabase db push` if you use migrations).
--
-- WHY THIS IS SAFE TO RUN AS-IS (no per-row policies needed):
-- FlowCash does not use Supabase Auth. There is no `auth.uid()` — every
-- request is authenticated by your own signed session cookie
-- (lib/session.ts), and every server route talks to Postgres through
-- supabaseAdmin, which holds the SERVICE ROLE key. The service role always
-- bypasses Row Level Security, by design, regardless of what policies exist.
-- So turning RLS on here does NOT require writing `auth.uid() = user_id`
-- policies (they wouldn't apply to your traffic anyway, since your app never
-- authenticates through Supabase Auth) — it does not change how your app
-- behaves at all.
--
-- WHAT IT DOES DO: it closes off the one path where this would matter — the
-- Supabase anon/publishable key. Right now RLS is OFF, which means IF that
-- key (or the browser-safe URL + a guessed key) is ever used directly
-- against your Supabase project — by a bug, a future client-side feature,
-- or a leaked key — it would have full read/write access to every table,
-- every user's transactions, balances, debts, PINs (hashed, but still).
-- With RLS on and zero policies, the default is deny: the anon/authenticated
-- roles get nothing unless you explicitly write a policy granting it.
--
-- If you later add a feature that DOES query Supabase directly from the
-- browser (with the anon key), you'll need to add real policies then —
-- at that point you'd likely also be introducing Supabase Auth, and the
-- policies would look like `USING (auth.uid() = user_id)`. Until then,
-- deny-by-default is the correct and complete policy set.
-- ============================================================================

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metal_rates ENABLE ROW LEVEL SECURITY;
-- new in Round 7 — added by the security pass itself, include it too:
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

-- Sanity check after running: this should return 17 rows, all `true`.
-- select relname, relrowsecurity from pg_class
-- where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1;
