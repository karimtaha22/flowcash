import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isValidISO } from "@/lib/laha/dates";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await supabaseAdmin.from("laha_appointments").select("*").eq("user_id", userId).order("appt_date", { ascending: false });
  return NextResponse.json({ appointments: data || [] });
}

// image (لو موجودة) متوقّعة data URL جاهزة اتضغطت client-side بـ
// lib/image.ts's shrinkImage — نفس الأسلوب المتبع في باقي التطبيق (صور
// الشهود/الروشتات) بدل تخزين سحابي منفصل.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const apptDate = body.appt_date;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!isValidISO(apptDate)) return NextResponse.json({ error: "تاريخ الموعد غير صالح" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "عنوان الموعد مطلوب" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("laha_appointments")
    .insert({
      user_id: userId,
      appt_date: apptDate,
      title: title.slice(0, 120),
      notes: typeof body.notes === "string" ? body.notes.slice(0, 1000) : null,
      image: typeof body.image === "string" && body.image.startsWith("data:image") ? body.image : null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ appointment: data });
}
