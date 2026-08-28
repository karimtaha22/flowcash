import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cycleInfo, PHASE_LABEL, PRODUCTIVITY_MAP } from "@/lib/laha/cycle";
import { pregnancyInfo } from "@/lib/laha/pregnancy";
import { todayISO } from "@/lib/laha/dates";

// PUBLIC route — من غير جلسة، زي app/api/laha-reveal/[token] و
// app/api/debt-link/[token]. Round 40 — "غرفة الشريك": صفحة للشريك يشوف
// فيها مزاج اليوم + ملخص المرحلة الهرمونية بس، من غير أي تفاصيل حساسة تانية.
// Round 45 — بدل ما تكون شكل ثابت واحد، دلوقتي المستخدمة نفسها بتختار
// بسوتشات (`laha_partner_links.reveal_config`) إيه اللي يظهر للشريك، فئة
// فئة — فصلنا حاجات الدورة (تبويض/خصوبة) عن حاجات الحمل (ركل/نبض/سونار) في
// الفلاتر تحت لأن كل واحد بيتحكم فيه من شاشة اللينك بتاعة وضعه هو بس.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: link } = await supabaseAdmin.from("laha_partner_links").select("user_id,expires_at,reveal_config").eq("token", token).maybeSingle();
  if (!link) return NextResponse.json({ error: "الرابط غير صالح" }, { status: 404 });
  if (new Date(link.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "انتهت صلاحية الرابط" }, { status: 410 });
  }
  const reveal: Record<string, boolean> = link.reveal_config || {};

  const { data: settings } = await supabaseAdmin
    .from("laha_settings")
    .select("mode,avg_cycle_length,avg_period_length,lmp")
    .eq("user_id", link.user_id)
    .maybeSingle();
  if (!settings) return NextResponse.json({ error: "مفيش بيانات كفاية لسه" }, { status: 404 });

  const today = todayISO();
  const { data: todayLog } = await supabaseAdmin
    .from("laha_daily_logs")
    .select("mood,note")
    .eq("user_id", link.user_id)
    .eq("log_date", today)
    .maybeSingle();

  const base: Record<string, any> = { ok: true, expiresAt: link.expires_at };
  if (reveal.mood) base.mood = todayLog?.mood || null;
  if (reveal.notes) base.note = todayLog?.note || null;

  if (settings.mode === "pregnancy" && settings.lmp) {
    const info = pregnancyInfo(settings.lmp, today);
    const out: Record<string, any> = { ...base, mode: "pregnancy", week: info.week, trimester: info.trimester };

    if (reveal.kicks) {
      const { data: kicks } = await supabaseAdmin
        .from("laha_kicks_sessions").select("session_date,minutes_to_ten")
        .eq("user_id", link.user_id).order("session_date", { ascending: false }).limit(1).maybeSingle();
      out.lastKicks = kicks || null;
    }
    if (reveal.heartbeat) {
      const { data: appt } = await supabaseAdmin
        .from("laha_appointments").select("appt_date,fetal_heart_rate")
        .eq("user_id", link.user_id).not("fetal_heart_rate", "is", null)
        .order("appt_date", { ascending: false }).limit(1).maybeSingle();
      out.fetalHeartRate = appt ? { date: appt.appt_date, value: appt.fetal_heart_rate } : null;
    }
    if (reveal.sonar) {
      const { data: appt } = await supabaseAdmin
        .from("laha_appointments").select("appt_date,sonar_image,image")
        .eq("user_id", link.user_id)
        .order("appt_date", { ascending: false }).limit(10);
      const withImage = (appt || []).find((a) => a.sonar_image || a.image);
      out.lastSonar = withImage ? { date: withImage.appt_date, image: withImage.sonar_image || withImage.image } : null;
    }
    return NextResponse.json(out);
  }

  const { data: periods } = await supabaseAdmin.from("laha_periods").select("start_date,end_date").eq("user_id", link.user_id);
  const info = cycleInfo(periods || [], settings.avg_cycle_length, today, settings.avg_period_length);
  if (!info) return NextResponse.json({ ...base, mode: "cycle", phase: null });

  const out: Record<string, any> = { ...base, mode: "cycle", phase: info.phase, phaseLabel: PHASE_LABEL[info.phase], phaseGuide: PRODUCTIVITY_MAP[info.phase], nextPeriodDate: info.nextPeriodDate };
  if (reveal.ovulation) out.ovulationDate = info.ovulationDate;
  if (reveal.fertile) { out.fertileStart = info.fertileStart; out.fertileEnd = info.fertileEnd; }
  return NextResponse.json(out);
}
