import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

// Round 34 — "قسم الادويه في مجموعات ... مجموعه ده علشان يرتبط بطبيب و
// يبقي عندنا كشف يروح للدكتور": مجموعة = طبيب + اسم، وكذا دواء ممكن
// يتحط تحتها (medications.group_id) — التصدير المخصوص للمجموعة (كشف فيه
// بيانات الطبيب + أدويتها) في app/(protected)/reminders/page.tsx.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await supabaseAdmin.from("medication_groups").select("*").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ groups: data });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "اسم المجموعة مطلوب" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("medication_groups")
    .insert({
      user_id: userId,
      name,
      doctor_name: body.doctor_name || null,
      doctor_phone: body.doctor_phone || null,
      doctor_address: body.doctor_address || null,
      doctor_specialty: body.doctor_specialty || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ group: data });
}
