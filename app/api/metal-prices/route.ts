import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { getMetalRates } from "@/lib/metalPrices";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const rates = await getMetalRates();
    return NextResponse.json(rates);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
