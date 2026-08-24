import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";
import { verifyIdAgainstSelfie } from "@/lib/gemini";

// Optional trust step — "الخطوة دي مش إجبارية". Takes the ID-card front
// photo + a live selfie (both already shrunk client-side to small base64
// JPEGs, see lib/image.ts) and asks Gemini vision to judge whether they're
// the same person and whether either photo looks like a re-photographed
// screen/printout. NOT a real government-grade identity check — see
// lib/gemini.ts's prompt and the caveat shown in the UI.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; pid: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, pid } = await params;

  const { data: g } = await supabaseAdmin.from("gam3eyas").select("id").eq("id", id).eq("user_id", userId).single();
  if (!g) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const { id_photo_front, id_photo_back, selfie_photo } = body;
  if (!id_photo_front || !selfie_photo) {
    return NextResponse.json({ error: "لازم صورة وش البطاقة والسيلفي على الأقل" }, { status: 400 });
  }

  const result = await verifyIdAgainstSelfie(id_photo_front, selfie_photo);

  const { data: participant, error } = await supabaseAdmin
    .from("gam3eya_participants")
    .update({
      id_photo_front,
      id_photo_back: id_photo_back || null,
      selfie_photo,
      verified: result.verified,
      verification_note: result.error || result.notes,
      verification_checked_at: new Date().toISOString(),
    })
    .eq("id", pid)
    .eq("gam3eya_id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ participant, result });
}
