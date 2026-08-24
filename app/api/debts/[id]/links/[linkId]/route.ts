import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";
import { logDebtEvent } from "@/lib/debtLinks";

// Creditor-only (authenticated) — revoke one specific link (e.g. sent a
// witness the wrong link, or a witness needs to be replaced) without
// touching any other role's link.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, linkId } = await params;

  const { data: debt } = await supabaseAdmin.from("debts").select("id").eq("id", id).eq("user_id", userId).single();
  if (!debt) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: link, error } = await supabaseAdmin
    .from("debt_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId)
    .eq("debt_id", id)
    .select("role, debt_witnesses(name)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const roleLabel = link?.role === "witness" ? `رابط الشاهد "${(link as any).debt_witnesses?.name || ""}"` : "الرابط";
  await logDebtEvent(id, "link_revoked", `تم إلغاء ${roleLabel}`, "creditor");

  return NextResponse.json({ ok: true });
}
