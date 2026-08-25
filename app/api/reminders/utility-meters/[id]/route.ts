import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const update: Record<string, any> = {};
  if ("meter_type" in body && ["electricity", "gas", "water"].includes(body.meter_type)) update.meter_type = body.meter_type;
  if ("reading_value" in body && Number(body.reading_value) >= 0) update.reading_value = Number(body.reading_value);
  if ("reading_date" in body) update.reading_date = body.reading_date || new Date().toISOString().slice(0, 10);
  if ("photo" in body) update.photo = body.photo || null;
  if ("note" in body) update.note = body.note || null;

  const { data, error } = await supabaseAdmin.from("utility_meter_readings").update(update).eq("id", id).eq("user_id", userId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reading: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { error } = await supabaseAdmin.from("utility_meter_readings").delete().eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
