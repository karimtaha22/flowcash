// Two jobs:
//   1. force-dynamic — see app/login/layout.tsx for why (statically
//      prerendering /admin would mean the CSP nonce set in middleware.ts
//      never reaches its inline scripts).
//   2. SERVER-SIDE access gate for /admin. Before this, /admin/page.tsx was
//      a plain client component: its HTML/JS shipped to ANY visitor, and
//      access control only happened later, client-side, when it fetched
//      /api/admin/users. That fetch already required an admin session
//      server-side (see lib/adminGuard.ts) — no customer data or mutation
//      ever actually got through without one — but the admin page SHELL
//      itself (every form, including "issue a license code" and "broadcast
//      to all customers") rendered for anyone who opened the URL, logged in
//      or not, and a bug in the page's own error handling could leave it
//      showing that shell instead of a lock screen on anything other than a
//      clean 401 (a network hiccup, a timeout, etc. — fail OPEN instead of
//      fail CLOSED). This redirects unauthenticated/non-admin visitors to
//      /login before the page is ever sent, so there's no client-side path
//      to it at all. The one exception is the true first-run bootstrap
//      window (zero accounts exist yet, anywhere) — same rule
//      requireAdminAuthOrBootstrap already enforces server-side for the API
//      itself, mirrored here (reusing the exact same helpers, not a
//      duplicated query) so first setup still works.
//
// Both isSessionAdmin() and isBootstrap() fail CLOSED on any Supabase error
// (see lib/adminGuard.ts) — a transient DB/network hiccup redirects to
// /login instead of accidentally granting access.
import { redirect } from "next/navigation";
import { isBootstrap, isSessionAdmin } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (await isSessionAdmin()) return children;
  if (await isBootstrap()) return children; // nobody exists yet at all — allow first-run setup

  redirect("/login");
}
