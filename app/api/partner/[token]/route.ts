import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cycleInfo, PHASE_LABEL, PRODUCTIVITY_MAP } from "@/lib/laha/cycle";
import { pregnancyInfo } from "@/lib/laha/pregnancy";
import { todayISO } from "@/lib/laha/dates";

// PUBLIC route — من غير جلسة، زي app/api/laha-reveal/[token] و
// app/api/debt-link/[token]. Round 40 — "غرفة الشريك": صفحة للشريك يشوف
// فيها مزاج اليوم + ملخص المرحلة الهرمونية بس، من غير أي تفاصيل حساسة تانية
// (مفيش أسماء دورات بالتاريخ، مفيش وزن، مفيش ملاحظات) — طلب المستخدم كان
// "وضع الشريك الهادئ" يعني ملخص مطمئن بسيط مش كل بيانات التطبيق.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: link } = await supabaseAdmin.from("laha_partner_links").select("user_id,expires_at").eq("token", token).maybeSingle();
  if (!link) return NextResponse.json({ error: "الرابط غير صالح" }, { status: 404 });
  if (new Date(link.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "انتهت صلاحية الرابط" }, { status: 410 });
  }

  const { data: settings } = await supabaseAdmin
    .from("laha_settings")
    .select("mode,avg_cycle_length,lmp")
    .eq("user_id", link.user_id)
    .maybeSingle();
  if (!settings) return NextResponse.json({ error: "مفيش بيانات كفاية لسه" }, { status: 404 });

  const today = todayISO();
  const { data: todayLog } = await supabaseAdmin
    .from("laha_daily_logs")
    .select("mood")
    .eq("user_id", link.user_id)
    .eq("log_date", today)
    .maybeSingle();

  const base = { ok: true, expiresAt: link.expires_at, mood: todayLog?.mood || null };

  if (settings.mode === "pregnancy" && settings.lmp) {
    const info = pregnancyInfo(settings.lmp, today);
    return NextResponse.json({
      ...base,
      mode: "pregnancy",
      week: info.week,
      trimester: info.trimester,
    });
  }

  const { data: periods } = await supabaseAdmin.from("laha_periods").select("start_date,end_date").eq("user_id", link.user_id);
  const info = cycleInfo(periods || [], settings.avg_cycle_length, today);
  if (!info) return NextResponse.json({ ...base, mode: "cycle", phase: null });

  return NextResponse.json({
    ...base,
    mode: "cycle",
    phase: info.phase,
    phaseLabel: PHASE_LABEL[info.phase],
    phaseGuide: PRODUCTIVITY_MAP[info.phase],
    nextPeriodDate: info.nextPeriodDate,
    ovulationDate: info.ovulationDate,
    fertileStart: info.fertileStart,
    fertileEnd: info.fertileEnd,
  });
}
