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
    update.reminded_at = null; // rescheduling should let it remind again
  }
  if ("prescription_image" in body) update.prescription_image = body.prescription_image || null;
  if ("note" in body) update.note = body.note || null;
  if ("status" in body && ["upcoming", "done", "cancelled"].includes(body.status)) update.status = body.status;

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
