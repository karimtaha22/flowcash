import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { lookupNameMeaning } from "@/lib/laha/gemini";

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "اكتبي اسم" }, { status: 400 });
  try {
    const result = await lookupNameMeaning(name.slice(0, 40));
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ ok: false, found: false, meaning: "", error: e?.message || "حصل خطأ" });
  }
}
