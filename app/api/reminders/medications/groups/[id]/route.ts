import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const update: Record<string, any> = {};
  if ("name" in body && String(body.name || "").trim()) update.name = String(body.name).trim();
  if ("doctor_name" in body) update.doctor_name = body.doctor_name || null;
  if ("doctor_phone" in body) update.doctor_phone = body.doctor_phone || null;
  if ("doctor_address" in body) update.doctor_address = body.doctor_address || null;
  if ("doctor_specialty" in body) update.doctor_specialty = body.doctor_specialty || null;

  const { data, error } = await supabaseAdmin.from("medication_groups").update(update).eq("id", id).eq("user_id", userId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ group: data });
}

// حذف مجموعة ما بيمسحش أدويتها — بس بيفك الربط (medications.group_id
// يرجع NULL تلقائي عن طريق on delete set null)، فالدواء يتحول "حر".
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { error } = await supabaseAdmin.from("medication_groups").delete().eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
