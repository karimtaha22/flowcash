import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ transactions: [], debts: [], people: [] });
  const like = `%${q}%`;

  const [txByText, catMatch, peopleMatch, debtsByText] = await Promise.all([
    supabaseAdmin
      .from("transactions")
      .select("*, accounts(name,currency), categories(name,icon), debts(id,title,people(name))")
      .eq("user_id", userId)
      .or(`description.ilike.${like},counterparty_name.ilike.${like}`)
      .order("occurred_at", { ascending: false })
      .limit(25),
    supabaseAdmin.from("categories").select("id").eq("user_id", userId).ilike("name", like),
    supabaseAdmin.from("people").select("*").eq("user_id", userId).ilike("name", like),
    supabaseAdmin.from("debts").select("*, people(name)").eq("user_id", userId).or(`title.ilike.${like},reason.ilike.${like}`),
  ]);

  let txByCat: any[] = [];
  if (catMatch.data?.length) {
    const ids = catMatch.data.map((c) => c.id);
    const r = await supabaseAdmin
      .from("transactions")
      .select("*, accounts(name,currency), categories(name,icon), debts(id,title,people(name))")
      .eq("user_id", userId)
      .in("category_id", ids)
      .order("occurred_at", { ascending: false })
      .limit(25);
    txByCat = r.data || [];
  }

  let debtsByPerson: any[] = [];
  if (peopleMatch.data?.length) {
    const ids = peopleMatch.data.map((p) => p.id);
    const r = await supabaseAdmin.from("debts").select("*, people(name)").eq("user_id", userId).in("person_id", ids);
    debtsByPerson = r.data || [];
  }

  const txMap = new Map<string, any>();
  [...(txByText.data || []), ...txByCat].forEach((t) => txMap.set(t.id, t));
  const debtMap = new Map<string, any>();
  [...(debtsByText.data || []), ...debtsByPerson].forEach((d) => debtMap.set(d.id, d));

  return NextResponse.json({
    transactions: Array.from(txMap.values()),
    debts: Array.from(debtMap.values()),
    people: peopleMatch.data || [],
  });
}
