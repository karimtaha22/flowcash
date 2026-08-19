import type { NextRequest } from "next/server";

// WebAuthn's rpID must exactly match (or be a registrable suffix of) the domain the
// browser is actually on, so we derive it from the incoming request each time instead
// of hardcoding a single deployment URL. This makes fingerprint login work whether the
// app is on a vercel.app preview URL or a custom domain, with no config needed.
export function rpInfoFromRequest(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  const rpID = host.split(":")[0];
  const proto = req.headers.get("x-forwarded-proto") || (rpID === "localhost" ? "http" : "https");
  const origin = `${proto}://${host}`;
  return { rpID, origin, rpName: "FlowCash" };
}
