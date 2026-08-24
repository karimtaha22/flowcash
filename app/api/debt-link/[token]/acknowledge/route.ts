import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isValidPhone } from "@/lib/phone";
import { logDebtEvent } from "@/lib/debtLinks";

// PUBLIC route — the witness's "قرأت بيانات الدين بالتفصيل واشهد على هذا
// الدين" checkbox + confirm button. Witness-role tokens only; each witness
// has their own token, so this can only ever mark THAT ONE witness as
// acknowledged, never anyone else's.
//
// Round 25 — الشاهد هو اللي بيدخل بياناته بنفسه (مش الدائن بالنيابة عنه):
// the creditor only picks HOW MANY witnesses (via witness_mode) and shares
// each empty-slot link directly to whoever they intend to witness. Whoever
// opens the link sees "الدائن والمدين طالبين شهادتك على الدين" and fills in
// their own name/phone/address/ID photo here, in the same step as
// acknowledging — so the witness's identity always comes from the witness
// themselves, never typed in by the creditor.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const { data: link } = await supabaseAdmin.from("debt_links").select("*, debt_witnesses(id,name)").eq("token", token).single();
  if (!link || link.revoked_at) return NextResponse.json({ error: "الرابط غير صالح أو تم إلغاؤه" }, { status: 404 });
  if (link.role !== "witness") return NextResponse.json({ error: "الإجراء ده متاح للشهود بس" }, { status: 403 });
  if (link.acknowledged_at) return NextResponse.json({ ok: true, acknowledgedAt: link.acknowledged_at });

  const existingName = (link.debt_witnesses?.name || "").trim();
  const name: string = (body.name ?? link.debt_witnesses?.name ?? "").toString().trim();
  if (!name) return NextResponse.json({ error: "اسمك لازم يتملى الأول" }, { status: 400 });
  if (body.phone && !isValidPhone(body.phone)) return NextResponse.json({ error: "رقم موبايل غير صالح" }, { status: 400 });

  const witnessUpdate: Record<string, any> = { name };
  if ("phone" in body) witnessUpdate.phone = body.phone || null;
  if ("address" in body) witnessUpdate.address = body.address || null;
  if ("id_photo_front" in body) witnessUpdate.id_photo_front = body.id_photo_front || null;
  if (link.witness_id) {
    const { error: wErr } = await supabaseAdmin.from("debt_witnesses").update(witnessUpdate).eq("id", link.witness_id);
    if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });
  }

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("debt_links").update({ acknowledged_at: now, viewed_at: link.viewed_at || now }).eq("id", link.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const msg = existingName ? `الشاهد "${name}" قرأ بيانات الدين وأشهد عليه` : `الشاهد "${name}" دخل بياناته وأشهد على الدين`;
  await logDebtEvent(link.debt_id, "witness_acknowledged", msg, "witness", name);
  return NextResponse.json({ ok: true, acknowledgedAt: now });
}
