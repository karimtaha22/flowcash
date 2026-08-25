import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

const LABELS: Record<string, string> = { electricity: "كهرباء", gas: "غاز", water: "مياه" };

// "قراءة العدادات ... ممكن كل شهر تقوله استخدام الشهر ده اعلي في الكهرباء
// مثلا و اقل في المياه" — compares the most recent usage delta (last two
// readings of a meter type) against the delta before it, per meter type.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: readings, error } = await supabaseAdmin
    .from("utility_meter_readings")
    .select("meter_type,reading_value,reading_date")
    .eq("user_id", userId)
    .order("reading_date", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byType: Record<string, { reading_value: number; reading_date: string }[]> = {};
  for (const r of readings || []) (byType[r.meter_type] ||= []).push(r);

  const insights = Object.keys(byType).map((type) => {
      const list = byType[type];
      if (list.length < 2) return { meter_type: type, label: LABELS[type] || type, comparable: false as const };
      const last = list[list.length - 1];
      const prev = list[list.length - 2];
      const lastUsage = Number(last.reading_value) - Number(prev.reading_value);
      if (list.length < 3) {
        return { meter_type: type, label: LABELS[type] || type, comparable: false as const, last_usage: lastUsage };
      }
      const prevPrev = list[list.length - 3];
      const prevUsage = Number(prev.reading_value) - Number(prevPrev.reading_value);
      const diffPct = prevUsage > 0 ? Math.round(((lastUsage - prevUsage) / prevUsage) * 100) : null;
      return { meter_type: type, label: LABELS[type] || type, comparable: true as const, last_usage: lastUsage, prev_usage: prevUsage, diff_pct: diffPct };
    });

  return NextResponse.json({ insights });
}
