import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { newShareToken } from "@/lib/laha/pin";

// Round 40 — "Partner Sync" (وضع الشريك الهادئ) من الملف المرجعي: في
// البروتوتايب كان اللينك عبارة عن JSON مُرمّز base64 جوه الـ URL نفسه (مفيش
// أي تحقق سيرفر-سايد ولا إمكانية إلغاء). هنا بنفس فلسفة `laha_gender_reveal_
// parties.share_token`/`debt_links` الموجودة أصلًا في التطبيق: توكن حقيقي
// في قاعدة البيانات، صف واحد بس لكل مستخدمة (`unique(user_id)`) — توليد
// لينك جديد بيستبدل القديم تلقائيًا (upsert)، ومفيش أي بيانات حساسة متحطة
// في الـ URL نفسه غير التوكن العشوائي.
const VALIDITY_MS: Record<string, number> = {
  "6h": 6 * 3600000,
  "24h": 24 * 3600000,
  "3d": 3 * 24 * 3600000,
  week: 7 * 24 * 3600000,
};

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await supabaseAdmin.from("laha_partner_links").select("token,expires_at").eq("user_id", userId).maybeSingle();
  if (!data || new Date(data.expires_at).getTime() < Date.now()) return NextResponse.json({ link: null });
  return NextResponse.json({ link: data });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const validity = typeof body.validity === "string" && VALIDITY_MS[body.validity] ? body.validity : "24h";
  const expiresAt = new Date(Date.now() + VALIDITY_MS[validity]).toISOString();
  const token = newShareToken();

  const { error } = await supabaseAdmin
    .from("laha_partner_links")
    .upsert({ user_id: userId, token, expires_at: expiresAt }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ link: { token, expires_at: expiresAt } });
}
