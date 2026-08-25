import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

// Round 33 — "وضع التسوق" (ابدأ التسوق): تعليم/إلغاء تعليم صنف كـ"في العربة"
// أثناء التسوق الفعلي. entries ماعندهاش user_id مباشر، فبنتأكد إن الـ list
// (list_id) بتاع نفس المستخدم قبل أي تعديل.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, entryId } = await params;
  const body = await req.json();
  if (typeof body.picked !== "boolean") return NextResponse.json({ error: "picked مطلوب" }, { status: 400 });

  const { data: list, error: listErr } = await supabaseAdmin.from("grocery_lists").select("id").eq("id", id).eq("user_id", userId).maybeSingle();
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
  if (!list) return NextResponse.json({ error: "القائمة مش موجودة" }, { status: 404 });

  const { error } = await supabaseAdmin.from("grocery_list_entries").update({ picked: body.picked }).eq("id", entryId).eq("list_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
