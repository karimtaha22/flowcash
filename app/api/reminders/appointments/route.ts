import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Flat select (no self-join embed — PostgREST can't unambiguously embed a
  // self-referencing FK in both directions in one query). The UI already
  // loads every appointment in one shot, so it links parent_appointment_id
  // to its follow-up consultation client-side instead.
  const { data, error } = await supabaseAdmin
    .from("medical_appointments")
    .select("*, medications(name)")
    .eq("user_id", userId)
    .order("appointment_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ appointments: data });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.appointment_at) return NextResponse.json({ error: "معاد الكشف/الاستشارة مطلوب" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("medical_appointments")
    .insert({
      user_id: userId,
      medication_id: body.medication_id || null,
      kind: body.kind === "consultation" ? "consultation" : "checkup",
      title: body.title || null,
      appointment_at: body.appointment_at,
      prescription_image: body.prescription_image || null,
      note: body.note || null,
      doctor_name: body.doctor_name || null,
      doctor_address: body.doctor_address || null,
      doctor_phone: body.doctor_phone || null,
      doctor_specialty: body.doctor_specialty || null,
      parent_appointment_id: body.parent_appointment_id || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ appointment: data });
}
