import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("app_users")
    .select("id,name,is_family,webauthn_credential")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const users = (data || []).map((u) => ({ id: u.id, name: u.name, is_family: u.is_family, has_webauthn: !!u.webauthn_credential }));
  return NextResponse.json({ users });
}
