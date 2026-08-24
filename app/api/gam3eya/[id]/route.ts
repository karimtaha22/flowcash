import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();

  // Round 25 — "الضغط على اسم الجمعية يفتح تعديل": name/monthly_amount/
  // start_date are now editable too (previously only name/status). When
  // monthly_amount changes, every still-"pending" gam3eya_payments row is
  // bulk-updated to the new amount so the schedule stays consistent —
  // already-paid rows are left untouched, exactly as EditGam3eyaInfoModal's
  // helper text promises.
  const allowed = ["name", "status", "monthly_amount", "start_date"];
  const update: Record<string, any> = {};
  for (const k of allowed) if (k in body) update[k] = body[k];
  if ("monthly_amount" in update) {
    const amt = Number(update.monthly_amount);
    if (!(amt > 0)) return NextResponse.json({ error: "المبلغ الشهري لازم يكون رقم أكبر من صفر" }, { status: 400 });
    update.monthly_amount = amt;
  }
  update.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin.from("gam3eyas").update(update).eq("id", id).eq("user_id", userId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if ("monthly_amount" in update) {
    await supabaseAdmin.from("gam3eya_payments").update({ amount: update.monthly_amount }).eq("gam3eya_id", id).eq("status", "pending");
  }

  return NextResponse.json({ gam3eya: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const { error } = await supabaseAdmin.from("gam3eyas").delete().eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
