// See app/login/layout.tsx for why this is needed — same fix, applied here
// too since /admin was equally affected (statically prerendered, so the CSP
// nonce set in middleware.ts never reached its inline scripts).
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
