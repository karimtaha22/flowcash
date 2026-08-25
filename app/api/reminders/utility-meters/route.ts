import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const meterType = searchParams.get("meter_type");

  let query = supabaseAdmin.from("utility_meter_readings").select("*").eq("user_id", userId).order("reading_date", { ascending: false });
  if (meterType) query = query.eq("meter_type", meterType);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ readings: data });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!["electricity", "gas", "water"].includes(body.meter_type)) {
    return NextResponse.json({ error: "نوع العداد لازم يكون كهرباء أو غاز أو مياه" }, { status: 400 });
  }
  if (!(Number(body.reading_value) >= 0)) return NextResponse.json({ error: "قيمة القراءة مطلوبة" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("utility_meter_readings")
    .insert({
      user_id: userId,
      meter_type: body.meter_type,
      reading_value: Number(body.reading_value),
      reading_date: body.reading_date || new Date().toISOString().slice(0, 10),
      photo: body.photo || null,
      note: body.note || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reading: data });
}
