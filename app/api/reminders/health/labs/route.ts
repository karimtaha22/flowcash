import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

// Round 34 — "مكان رفع صورة نتائج تحاليل وممكن ربطه مع دكتور". الصورة
// بتتضغط جوه الواجهة (shrinkImage) قبل ما توصل هنا.
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await supabaseAdmin
    .from("lab_results")
    .select("*, medication_groups(id, name, doctor_name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ labs: data });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const image = String(body.image || "");
  if (!image) return NextResponse.json({ error: "صورة نتيجة التحليل مطلوبة" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("lab_results")
    .insert({
      user_id: userId,
      image,
      group_id: body.group_id || null,
      note: body.note || null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lab: data });
}
