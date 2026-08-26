import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isValidISO } from "@/lib/laha/dates";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const { data: existing } = await supabaseAdmin.from("laha_periods").select("start_date").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const endDate = body.end_date;
  if (endDate !== null && endDate !== undefined) {
    if (!isValidISO(endDate) || endDate < existing.start_date) {
      return NextResponse.json({ error: "تاريخ نهاية الدورة لازم يكون بعد أو يساوي تاريخ البداية" }, { status: 400 });
    }
  }

  const { error } = await supabaseAdmin.from("laha_periods").update({ end_date: endDate ?? null }).eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { error } = await supabaseAdmin.from("laha_periods").delete().eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
