// See app/login/layout.tsx for why this is needed — same fix, applied to
// this route too since it was equally affected (statically prerendered, so
// the CSP nonce set in middleware.ts never reached its inline scripts).
export const dynamic = "force-dynamic";

export default function ForgotCodeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
