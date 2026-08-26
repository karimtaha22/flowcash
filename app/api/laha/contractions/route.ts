import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { analyzeContractions } from "@/lib/laha/pregnancy";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await supabaseAdmin
    .from("laha_contractions")
    .select("*")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(50);
  const contractions = data || [];
  const analysis = analyzeContractions(contractions);
  return NextResponse.json({ contractions, analysis });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const startedAt = body.started_at;
  const endedAt = body.ended_at || null;
  if (!startedAt || Number.isNaN(new Date(startedAt).getTime())) {
    return NextResponse.json({ error: "وقت بداية الانقباضة غير صالح" }, { status: 400 });
  }
  let durationSec: number | null = null;
  if (endedAt) {
    if (Number.isNaN(new Date(endedAt).getTime()) || new Date(endedAt).getTime() < new Date(startedAt).getTime()) {
      return NextResponse.json({ error: "وقت نهاية الانقباضة غير صالح" }, { status: 400 });
    }
    durationSec = Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000);
  }

  const { data, error } = await supabaseAdmin
    .from("laha_contractions")
    .insert({ user_id: userId, started_at: startedAt, ended_at: endedAt, duration_sec: durationSec })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contraction: data });
}
