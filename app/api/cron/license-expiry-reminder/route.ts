import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendText } from "@/lib/telegram";

// Runs daily — nudges any customer (trial or permanent) whose license
// expires within the next 3 days, once a day at most per customer (guarded
// by license_expiry_last_reminded_at). Admin accounts and lifetime
// (expires_at = null) licenses are naturally excluded by the query.
const WARNING_WINDOW_DAYS = 3;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const windowEnd = new Date(Date.now() + WARNING_WINDOW_DAYS * 86_400_000).toISOString();
  const { data: users, error } = await supabaseAdmin
    .from("app_users")
    .select("id,name,telegram_bot_token,telegram_chat_id,license_type,license_expires_at,license_expiry_last_reminded_at")
    .eq("is_admin", false)
    .not("license_expires_at", "is", null)
    .lte("license_expires_at", windowEnd)
    .gt("license_expires_at", new Date().toISOString()); // don't nag already-expired accounts — /expired covers that

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const todayKey = new Date().toISOString().slice(0, 10);
  let notified = 0;
  for (const u of users || []) {
    if (u.license_expiry_last_reminded_at?.slice(0, 10) === todayKey) continue;
    if (!u.telegram_bot_token || !u.telegram_chat_id) continue;

    const daysLeft = Math.ceil((new Date(u.license_expires_at as string).getTime() - Date.now()) / 86_400_000);
    const label = u.license_type === "trial" ? "فترتك التجريبية" : "ترخيصك";
    const text = daysLeft <= 0
      ? `⏰ ${label} بتنتهي النهاردة. تواصل مع فريق الدعم للتجديد عشان تفضل تستخدم البرنامج من غير انقطاع.`
      : `⏰ ${label} هتنتهي بعد ${daysLeft} يوم. تواصل مع فريق الدعم للتجديد عشان تفضل تستخدم البرنامج من غير انقطاع.`;

    try {
      await sendText(u.telegram_bot_token, u.telegram_chat_id, text);
      await supabaseAdmin.from("app_users").update({ license_expiry_last_reminded_at: new Date().toISOString() }).eq("id", u.id);
      notified++;
    } catch {
      // best-effort; keep going
    }
  }

  return NextResponse.json({ ok: true, checked: (users || []).length, notified });
}
