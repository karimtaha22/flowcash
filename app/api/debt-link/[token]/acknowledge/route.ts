import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logDebtEvent } from "@/lib/debtLinks";

// PUBLIC route — the witness's "قرأت بيانات الدين بالتفصيل واشهد على هذا
// الدين" checkbox + confirm button. Witness-role tokens only; each witness
// has their own token, so this can only ever mark THAT ONE witness as
// acknowledged, never anyone else's.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data: link } = await supabaseAdmin.from("debt_links").select("*, debt_witnesses(name)").eq("token", token).single();
  if (!link || link.revoked_at) return NextResponse.json({ error: "الرابط غير صالح أو تم إلغاؤه" }, { status: 404 });
  if (link.role !== "witness") return NextResponse.json({ error: "الإجراء ده متاح للشهود بس" }, { status: 403 });
  if (link.acknowledged_at) return NextResponse.json({ ok: true, acknowledgedAt: link.acknowledged_at });

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("debt_links").update({ acknowledged_at: now, viewed_at: link.viewed_at || now }).eq("id", link.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logDebtEvent(link.debt_id, "witness_acknowledged", `الشاهد "${link.debt_witnesses?.name || ""}" قرأ بيانات الدين وأشهد عليه`, "witness", link.debt_witnesses?.name);
  return NextResponse.json({ ok: true, acknowledgedAt: now });
}
