import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { getPregnancyAdvice } from "@/lib/laha/gemini";

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const weekParam = req.nextUrl.searchParams.get("week");
  const week = Number(weekParam);
  if (!Number.isFinite(week) || week < 1 || week > 42) return NextResponse.json({ error: "أسبوع غير صالح" }, { status: 400 });
  const topic = req.nextUrl.searchParams.get("topic");
  const result = await getPregnancyAdvice(week, topic ? topic.slice(0, 200) : null);
  return NextResponse.json(result);
}
