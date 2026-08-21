// Forces /login to render per-request instead of being statically
// prerendered at build time. Required for the CSP nonce (set in
// middleware.ts) to actually reach this page's inline scripts — a
// statically-prerendered page is generated once at build time with no
// request in scope, so it can never pick up a per-request nonce, and its
// inline scripts stay permanently unauthorized under a strict CSP.
export const dynamic = "force-dynamic";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
