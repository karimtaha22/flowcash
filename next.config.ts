import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Content-Security-Policy is NOT set here — it moved to middleware.ts.
// Reason: Next.js's App Router injects its own inline bootstrap scripts on
// every page (the `self.__next_f.push(...)` RSC streaming payload) and needs
// a per-request nonce to allow them under a strict script-src. A static
// header from next.config can't carry a per-request value, so a CSP applied
// only here — with no nonce — silently blocks Next's own scripts and breaks
// hydration on every page (caught via a production smoke test: React error
// #412 on every route). See middleware.ts for the nonce-based CSP.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()" },
  // HSTS only makes sense over HTTPS (always true on Vercel prod) — skip in dev.
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
