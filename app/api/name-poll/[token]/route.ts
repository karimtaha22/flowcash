import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// PUBLIC route — من غير جلسة، زي app/api/partner/[token] و
// app/api/laha-reveal/[token]. بترجع بس الأسماء "المختارة" (shortlisted،
// selected=true) لصاحبة اللينك — مش كل الأسماء المسجلة، ومفيش أي بيانات
// حساسة تانية غير اسم الأب (لمعاينة الاسم كامل، لو متسجل).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: settings } = await supabaseAdmin
    .from("laha_settings")
    .select("user_id,father_name")
    .eq("name_poll_token", token)
    .maybeSingle();
  if (!settings) return NextResponse.json({ error: "الرابط غير صالح" }, { status: 404 });

  const { data: names } = await supabaseAdmin
    .from("laha_baby_names")
    .select("id,name,meaning,gender")
    .eq("user_id", settings.user_id)
    .eq("selected", true)
    .order("created_at", { ascending: true });

  const nameIds = (names || []).map((n: any) => n.id);
  let voteCounts = new Map<string, number>();
  if (nameIds.length) {
    const { data: votes } = await supabaseAdmin.from("laha_name_poll_votes").select("name_id").in("name_id", nameIds);
    for (const v of votes || []) voteCounts.set(v.name_id, (voteCounts.get(v.name_id) || 0) + 1);
  }

  return NextResponse.json({
    fatherName: settings.father_name || null,
    names: (names || []).map((n: any) => ({ ...n, voteCount: voteCounts.get(n.id) || 0 })),
  });
}
