import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { RETENTION_DAYS } from "@/lib/license";

// Runs daily — permanently deletes any non-admin customer whose license
// expired (naturally, or via the admin's "delete" action, which just
// force-sets license_expires_at to now — see /api/admin/licenses/[id])
// more than RETENTION_DAYS ago. Every child table's FK to app_users is
// ON DELETE CASCADE, so this one delete wipes accounts/transactions/debts/
// everything for that customer — verified against the live schema before
// relying on it (see the migration in this round for the constraint list).
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
  const { data: toPurge, error: selectError } = await supabaseAdmin
    .from("app_users")
    .select("id,name,license_expires_at")
    .eq("is_admin", false)
    .not("license_expires_at", "is", null)
    .lt("license_expires_at", cutoff);
  if (selectError) return NextResponse.json({ error: selectError.message }, { status: 500 });
  if (!toPurge?.length) return NextResponse.json({ ok: true, purged: 0 });

  const { error: deleteError } = await supabaseAdmin.from("app_users").delete().in("id", toPurge.map((u) => u.id));
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ ok: true, purged: toPurge.length, ids: toPurge.map((u) => u.id) });
}
