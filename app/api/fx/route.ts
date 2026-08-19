import { NextResponse } from "next/server";
import { getFxRates } from "@/lib/fxRates";

export async function GET() {
  const rates = await getFxRates();
  return NextResponse.json(rates);
}
