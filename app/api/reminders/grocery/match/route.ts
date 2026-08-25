import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { lookupCatalog } from "@/lib/groceryPricing";

// Local, instant, no-Gemini-call catalog match for a quick multi-line grocery
// list ("لبن، زبادي، بامبرز" one per line). For any line with no local match
// the client shows a "دوّر بالذكاء الاصطناعي" action that separately calls
// POST /api/reminders/grocery/ai-price — kept as two calls (not one) so
// typing/pasting a list never blocks on a Gemini round-trip per line.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const lines: string[] = Array.isArray(body.lines) ? body.lines : [];
  const cleaned = lines.map((l) => String(l).trim()).filter(Boolean);
  if (!cleaned.length) return NextResponse.json({ error: "لازم تكتب صنف واحد على الأقل" }, { status: 400 });

  const matches = await Promise.all(cleaned.map((line) => lookupCatalog(userId, line)));
  return NextResponse.json({ matches });
}
