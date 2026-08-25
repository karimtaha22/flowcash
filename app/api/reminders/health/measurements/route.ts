import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

// Round 34 — "قياس سكر قياس ضغط و يتربط بمعاد و تاريخ كل تسجيل". kind:
// blood_sugar → value1 = قراءة السكر، value2 فاضية. blood_pressure →
// value1 = الانقباضي (systolic)، value2 = الانبساطي (diastolic).
const KINDS = ["blood_sugar", "blood_pressure"];

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const kind = searchParams.get("kind");
  let query = supabaseAdmin.from("health_measurements").select("*").eq("user_id", userId).order("measured_at", { ascending: false });
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ measurements: data });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!KINDS.includes(body.kind)) return NextResponse.json({ error: "نوع القياس لازم يكون سكر أو ضغط" }, { status: 400 });
  if (!(Number(body.value1) >= 0)) return NextResponse.json({ error: "القيمة مطلوبة" }, { status: 400 });
  if (body.kind === "blood_pressure" && !(Number(body.value2) >= 0)) {
    return NextResponse.json({ error: "قياس الضغط محتاج رقمين (الانقباضي والانبساطي)" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("health_measurements")
    .insert({
      user_id: userId,
      kind: body.kind,
      value1: Number(body.value1),
      value2: body.kind === "blood_pressure" ? Number(body.value2) : null,
      measured_at: body.measured_at ? new Date(body.measured_at).toISOString() : new Date().toISOString(),
      note: body.note || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ measurement: data });
}
