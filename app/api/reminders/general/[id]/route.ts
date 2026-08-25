import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

// PATCH covers both the edit form and the "نشط/غير نشط" toggle switch
// (active:true/false → status "active"/"cancelled") plus marking "مكتمل"
// directly (status:"completed").
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  const update: Record<string, any> = {};
  if ("title" in body) update.title = String(body.title).trim();
  if ("remind_at" in body) update.remind_at = body.remind_at || null;
  if ("note" in body) update.note = body.note || null;
  if ("status" in body && ["active", "completed", "cancelled"].includes(body.status)) update.status = body.status;
  if ("active" in body) update.status = body.active ? "active" : "cancelled";
  if ("repeat_frequency" in body && ["none", "daily", "weekly", "monthly"].includes(body.repeat_frequency)) update.repeat_frequency = body.repeat_frequency;
  // re-arming a reminder (new date, or flipped back to active) should let it
  // fire again — otherwise the once-only reminded_at guard in
  // lib/reminders.ts would silently skip it forever.
  if ("remind_at" in body || update.status === "active") update.reminded_at = null;

  const { data, error } = await supabaseAdmin.from("general_reminders").update(update).eq("id", id).eq("user_id", userId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reminder: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { error } = await supabaseAdmin.from("general_reminders").delete().eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
