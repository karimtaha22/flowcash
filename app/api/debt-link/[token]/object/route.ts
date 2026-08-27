import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logDebtEvent } from "@/lib/debtLinks";
import { sendText } from "@/lib/telegram";

// PUBLIC route — the debtor's red "اعتراض" button. Debtor-role tokens only
// (role='debtor', i.e. direction='owed_to_me' on the debt — the case where
// the app user is the creditor and the other party is the debtor). Can
// never be cleared from this endpoint — only the creditor, from inside the
// authenticated app, can mark it resolved (see PATCH /api/debts/[id]).
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { reason } = await req.json();
  if (!reason || !String(reason).trim()) {
    return NextResponse.json({ error: "لازم تكتب سبب الاعتراض" }, { status: 400 });
  }

  const { data: link } = await supabaseAdmin.from("debt_links").select("*").eq("token", token).single();
  if (!link || link.revoked_at) return NextResponse.json({ error: "الرابط غير صالح أو تم إلغاؤه" }, { status: 404 });
  if (link.role !== "debtor") return NextResponse.json({ error: "الاعتراض متاح للمدين بس" }, { status: 403 });

  const { data: debt } = await supabaseAdmin.from("debts").select("id,user_id,title,objection_resolved_at,objection_created_at").eq("id", link.debt_id).single();
  if (!debt) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (debt.objection_created_at && !debt.objection_resolved_at) {
    return NextResponse.json({ error: "في اعتراض قائم بالفعل، مستني الدائن يحله الأول" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("debts")
    .update({ objection_reason: String(reason).trim(), objection_created_at: now, objection_resolved_at: null })
    .eq("id", debt.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logDebtEvent(debt.id, "objection_raised", `المدين اعترض: ${String(reason).trim()}`, "debtor");

  const { data: creditor } = await supabaseAdmin.from("app_users").select("telegram_chat_id,telegram_notifications_muted").eq("id", debt.user_id).single();
  const botToken = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (botToken && creditor?.telegram_chat_id && !creditor.telegram_notifications_muted) {
    try {
 await sendText(botToken, creditor.telegram_chat_id,`اعتراض جديد على دين"${debt.title}"\nالسبب: ${String(reason).trim()}\nراجعه من"الأشخاص والديون"في التطبيق.`);
    } catch {
      // best-effort — the in-app bell still surfaces this
    }
  }

  return NextResponse.json({ ok: true });
}
