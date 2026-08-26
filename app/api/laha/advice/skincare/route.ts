import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { getSkincareAdvice } from "@/lib/laha/gemini";

const VALID = ["menstrual", "follicular", "ovulation", "luteal"];

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const phase = req.nextUrl.searchParams.get("phase");
  if (!phase || !VALID.includes(phase)) return NextResponse.json({ error: "phase غير صالحة" }, { status: 400 });
  const result = await getSkincareAdvice(phase as any);
  return NextResponse.json(result);
}
