import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";
import { verifyIdAgainstSelfie } from "@/lib/gemini";

// Round 22 — account-level self-verification, "من الإعدادات". This is the
// same optional trust step already built for gam3eya participants
// (ID-front photo + a live selfie, judged by Gemini vision — see
// lib/gemini.ts), but here it verifies the ACCOUNT itself
// (app_users.is_verified), not a participant row a gam3eya organizer
// entered about someone else. The result is what /admin's user list shows
// as a blue checkmark next to the person's name, and (separately) what a
// gam3eya participant row can be cross-referenced against by phone number
// to show "شخص موثّق" under their name — see app/(protected)/installments
// page's participant rows.
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id_photo_front, selfie_photo } = body;
  if (!id_photo_front || !selfie_photo) {
    return NextResponse.json({ error: "لازم صورة وش البطاقة والسيلفي على الأقل" }, { status: 400 });
  }

  const result = await verifyIdAgainstSelfie(id_photo_front, selfie_photo);

  const { data: user, error } = await supabaseAdmin
    .from("app_users")
    .update({
      id_photo_front,
      selfie_photo,
      is_verified: result.verified,
      verification_note: result.error || result.notes,
      verification_checked_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select("id,is_verified,verification_note,verification_checked_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ user, result });
}
