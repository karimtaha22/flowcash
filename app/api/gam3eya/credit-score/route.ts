import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

// "لو نفس الشخص هيدخل جمعية تاني يبقى في زي الآي-سكور ليه" — looks up this
// SAME organizer's own past participants by phone number and returns their
// rating history. This is a local, per-account trust note (not a shared
// cross-user registry — that's the deferred gam3eya marketplace feature).
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const phone = new URL(req.url).searchParams.get("phone");
  if (!phone) return NextResponse.json({ error: "الرقم مطلوب" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("gam3eya_participants")
    .select("id,name,rating,verified,created_at,gam3eyas!inner(user_id,name)")
    .eq("phone", phone)
    .eq("gam3eyas.user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rated = (data || []).filter((p: any) => p.rating != null);
  const avg = rated.length ? rated.reduce((s: number, p: any) => s + p.rating, 0) / rated.length : null;

  return NextResponse.json({
    history: data || [],
    gam3eyat_count: (data || []).length,
    average_rating: avg,
    ever_verified: (data || []).some((p: any) => p.verified),
  });
}
