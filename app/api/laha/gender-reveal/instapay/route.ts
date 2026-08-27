import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Round 43 — "رابط انستاباي يظهر بره، الأم تحطه قبل ما تفتح تعرف ولد ولا
// بنت": شيلنا شرط unlock token اللي كان هنا (كان قاصر تسجيل اللينك على
// "غرفة الأم" بس، يعني بعد ما تعرف النوع). اللينك أصلًا مش حساس زي النوع
// نفسه — publicPartyShape في app/api/laha/gender-reveal/party بيرجّعه
// دايمًا بغض النظر عن unlocked، فمفيش داعي يتقفل وراء نفس القفل.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const link = typeof body.instapay_link === "string" ? body.instapay_link.trim().slice(0, 300) : "";

  const { data: party } = await supabaseAdmin.from("laha_gender_reveal_parties").select("id").eq("user_id", userId).maybeSingle();
  if (!party) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { error } = await supabaseAdmin.from("laha_gender_reveal_parties").update({ instapay_link: link || null }).eq("id", party.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
