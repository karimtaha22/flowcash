import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

async function ownsGam3eya(userId: string, gam3eyaId: string) {
  const { data } = await supabaseAdmin.from("gam3eyas").select("id").eq("id", gam3eyaId).eq("user_id", userId).single();
  return !!data;
}

// Rating (1-5 نجوم) is the main thing edited here after the fact — the
// organizer scores a participant once the gam3eya wraps up (or any time),
// and it's what feeds the "credit score" lookup (see ../credit-score) the
// next time the same phone number shows up in a new gam3eya.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; pid: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, pid } = await params;
  if (!(await ownsGam3eya(userId, id))) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const allowed = ["name", "phone", "account_number", "address", "id_photo_front", "rating"];
  const update: Record<string, any> = {};
  for (const k of allowed) if (k in body) update[k] = body[k];
  if ("rating" in update && update.rating !== null) {
    const r = Math.floor(Number(update.rating));
    if (!(r >= 1 && r <= 5)) return NextResponse.json({ error: "التقييم لازم يكون من ١ لـ ٥" }, { status: 400 });
    update.rating = r;
  }

  const { data, error } = await supabaseAdmin.from("gam3eya_participants").update(update).eq("id", pid).eq("gam3eya_id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ participant: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; pid: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, pid } = await params;
  if (!(await ownsGam3eya(userId, id))) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { error } = await supabaseAdmin.from("gam3eya_participants").delete().eq("id", pid).eq("gam3eya_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
