import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendText } from "@/lib/telegram";

// Runs daily via Vercel Cron (see vercel.json). Reminds every user who
// enabled the charity reminder (صدقات وزكاة tab) with the hadith + verse the
// user asked for, plus the amount/frequency they set — "don't forget today's
// charity". Guarded by charity_last_reminded_date so a second run the same
// day (retry, manual trigger) doesn't double-send.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  const { data: users, error } = await supabaseAdmin
    .from("app_users")
    .select("id,name,base_currency,telegram_bot_token,telegram_chat_id,charity_amount,charity_frequency,charity_last_reminded_date")
    .eq("charity_reminder_enabled", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let notified = 0;
  for (const u of users || []) {
    if (!u.telegram_bot_token || !u.telegram_chat_id) continue;
    if (u.charity_last_reminded_date === todayIso) continue;

    const amountLine = u.charity_amount
      ? `\n💚 قيمة الصدقة اللي حددتها: ${Number(u.charity_amount).toLocaleString()} ${u.base_currency || "EGP"} (${u.charity_frequency === "monthly" ? "شهريًا" : "يوميًا"})`
      : "";

    const text =
      `🌙 لا تنسَ صدقة اليوم${amountLine}\n\n` +
      `"مَا نَقَصَ مَالُ عَبدٍ مِن صَدَقَةٍ"\n\n` +
      `"وَمَا أَنفَقْتُم مِّن شَيْءٍ فَهُوَ يُخْلِفُهُ وَهُوَ خَيْرُ الرَّازِقِينَ" {سبأ:39}`;

    try {
      await sendText(u.telegram_bot_token, u.telegram_chat_id, text);
      await supabaseAdmin.from("app_users").update({ charity_last_reminded_date: todayIso }).eq("id", u.id);
      notified++;
    } catch {
      // best-effort; keep going for the rest of the users
    }
  }

  return NextResponse.json({ ok: true, checked: (users || []).length, notified });
}
