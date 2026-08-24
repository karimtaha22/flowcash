import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; paymentId: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, paymentId } = await params;
  const body = await req.json().catch(() => ({}));

  const { data: g } = await supabaseAdmin.from("gam3eyas").select("id").eq("id", id).eq("user_id", userId).single();
  if (!g) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: payment, error } = await supabaseAdmin
    .from("gam3eya_payments")
    .update({ status: "paid", paid_at: new Date().toISOString(), receipt_url: body.receipt_url || null })
    .eq("id", paymentId)
    .eq("gam3eya_id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { count } = await supabaseAdmin
    .from("gam3eya_payments")
    .select("id", { count: "exact", head: true })
    .eq("gam3eya_id", id)
    .eq("status", "pending");
  if ((count || 0) === 0) {
    await supabaseAdmin.from("gam3eyas").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", id);
  }

  return NextResponse.json({ ok: true, payment, gam3eyaCompleted: (count || 0) === 0 });
}
