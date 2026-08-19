import { NextResponse } from "next/server";
import { getFxRates } from "@/lib/fx";

export async function GET() {
  const rates = await getFxRates();
  return NextResponse.json(rates);
}
