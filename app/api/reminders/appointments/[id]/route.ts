import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const update: Record<string, any> = {};
  if ("title" in body) update.title = body.title || null;
  if ("kind" in body) update.kind = body.kind === "consultation" ? "consultation" : "checkup";
  if ("appointment_at" in body) {
    update.appointment_at = body.appointment_at;
    // rescheduling should let both the 1-day and 3-hour heads-up remind again
    update.reminded_at = null;
    update.reminded_3h_at = null;
  }
  if ("prescription_image" in body) update.prescription_image = body.prescription_image || null;
  if ("note" in body) update.note = body.note || null;
  if ("status" in body && ["upcoming", "done", "cancelled"].includes(body.status)) update.status = body.status;
  if ("doctor_name" in body) update.doctor_name = body.doctor_name || null;
  if ("doctor_address" in body) update.doctor_address = body.doctor_address || null;
  if ("doctor_phone" in body) update.doctor_phone = body.doctor_phone || null;
  if ("doctor_specialty" in body) update.doctor_specialty = body.doctor_specialty || null;
  if ("parent_appointment_id" in body) update.parent_appointment_id = body.parent_appointment_id || null;

  const { data, error } = await supabaseAdmin.from("medical_appointments").update(update).eq("id", id).eq("user_id", userId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ appointment: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { error } = await supabaseAdmin.from("medical_appointments").delete().eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
