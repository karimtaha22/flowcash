import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySignedValue, SESSION_COOKIE_NAME } from "@/lib/sessionCrypto";
import { computeLicenseStatus, type PageKey } from "@/lib/license";

// Runs on (almost) every request and does TWO independent jobs:
//
//   1. Content-Security-Policy with a per-request nonce. Next.js's App
//      Router injects its own inline bootstrap scripts on every page (the
//      `self.__next_f.push(...)` RSC streaming payload) — a strict
//      `script-src 'self'` with no nonce blocks those and breaks hydration
//      on EVERY route (confirmed via a production smoke test: React error
//      #412 everywhere). Next automatically nonce-tags its own inline/chunk
//      scripts once it can read the nonce off the CSP header — which
//      requires the header to be set in middleware (not next.config, which
//      is static and can't carry a per-request value) and forwarded on both
//      the outgoing request headers and the response headers, per Next's
//      documented CSP pattern. This has to run on every page route
//      (including /login, /activate, /expired — previously excluded) since
//      those are exactly the pages that were breaking.
//
//   2. SaaS licensing enforcement (unchanged from before):
//      - A fully expired (or admin-deleted, which just force-sets the
//        expiry to "now") account gets redirected to /expired for page
//        views, and a 403 JSON error for API calls — login itself stays
//        reachable.
//      - A trial account whose current page/feature isn't in its
//        license_allowed_pages gets its WRITE requests (non-GET /api/*)
//        blocked with the upsell message — reads still go through, so the
//        page can render read-only.
//      GET requests are never blocked (browsing is always allowed); only
//      mutating calls are gated, since that's what "read-only" means here.

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|manifest\\.json|sw\\.js|theme-init\\.js|images/).*)"],
};

// API route prefix -> the "page" it belongs to, for trial page-permission
// enforcement. Only mutating requests to these prefixes are gated; anything
// not listed here (settings, search, dashboard, fx, metal-prices...) is
// left ungated on purpose — locking account preferences or read-only
// lookups isn't what "restrict a page" is meant to do.
const API_PAGE_MAP: { prefix: string; page: PageKey }[] = [
  { prefix: "/api/accounts", page: "accounts" },
  { prefix: "/api/transactions", page: "add" },
  { prefix: "/api/people", page: "people" },
  { prefix: "/api/debts", page: "people" },
  { prefix: "/api/recurring", page: "planning" },
  { prefix: "/api/budgets", page: "planning" },
  { prefix: "/api/goals", page: "planning" },
  { prefix: "/api/zakat", page: "planning" },
  { prefix: "/api/categories", page: "categories" },
];

function supabaseFromEnv() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_KEY!, { auth: { persistSession: false } });
}

const UPSELL_MESSAGE = "دي نسخة تجريبية مجانية — تواصل مع فريق الدعم لشراء النسخة الكاملة.";
const isDev = process.env.NODE_ENV !== "production";

function buildCsp(nonce: string): string {
  // Every source here is deliberate, matched against what the app actually
  // loads: the Cairo font from Google Fonts, receipt images fetched straight
  // from the Telegram file API, and nothing else external. 'unsafe-eval' is
  // only added in dev because Next's dev-mode HMR needs it — production
  // never gets it. No 'strict-dynamic': our one hand-written script tag
  // (/theme-init.js) is external and same-origin, so plain 'self' already
  // covers it without also needing a nonce on that specific tag.
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://api.telegram.org",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export async function middleware(req: NextRequest) {
  // crypto.randomUUID() is available in the Node.js middleware runtime
  // (config.runtime: "nodejs" above) — base64-encoded so it's a valid CSP
  // nonce token.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  // Forward the CSP (with nonce) on the REQUEST headers too, not just the
  // response — this is what lets Next's renderer read the nonce and
  // automatically tag its own inline/chunk scripts with it. `x-nonce` is
  // also exposed for any of our own code that ever needs to read it via
  // headers() in a Server Component.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const passThrough = () => {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };
  const withCsp = (res: NextResponse) => {
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  const raw = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!raw) return passThrough(); // no session — existing per-route auth handles this

  let userId: string | null;
  try {
    userId = verifySignedValue(raw);
  } catch {
    return passThrough(); // e.g. SESSION_SECRET missing — let the route handler surface that error properly
  }
  if (!userId) return passThrough();

  const isApi = req.nextUrl.pathname.startsWith("/api/");

  let user: any;
  try {
    const supabase = supabaseFromEnv();
    const { data } = await supabase
      .from("app_users")
      .select("is_admin,license_type,license_expires_at,license_allowed_pages,license_redeemed_at")
      .eq("id", userId)
      .single();
    user = data;
  } catch {
    return passThrough(); // fail open on infra errors — don't take the whole app down over a licensing check
  }
  if (!user) return passThrough();

  const status = computeLicenseStatus(user);

  if (status.kind === "expired") {
    if (isApi) {
      return withCsp(
        NextResponse.json(
          { error: "انتهت مدة البرنامج. سيتم حفظ بياناتك لمدة 30 يوم. تواصل مع فريق الدعم لتجديد الترخيص." },
          { status: 403 }
        )
      );
    }
    if (!req.nextUrl.pathname.startsWith("/expired")) {
      return withCsp(NextResponse.redirect(new URL("/expired", req.url)));
    }
    return passThrough();
  }

  // trial page-permission enforcement — only blocks WRITES to pages not
  // explicitly unlocked; GETs and admin/unmanaged/permanent-with-full-access
  // accounts are never touched here.
  if (isApi && status.kind === "active" && status.type === "trial" && req.method !== "GET") {
    const match = API_PAGE_MAP.find((m) => req.nextUrl.pathname.startsWith(m.prefix));
    if (match && !status.allowedPages.includes(match.page)) {
      return withCsp(NextResponse.json({ error: UPSELL_MESSAGE }, { status: 403 }));
    }
  }

  return passThrough();
}
