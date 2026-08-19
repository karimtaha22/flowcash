import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";
import { createTransaction } from "@/lib/transactions";
import { classifyExpense } from "@/lib/categories";

export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") || 50);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const q = searchParams.get("q");
  const type = searchParams.get("type");
  const account_id = searchParams.get("account_id");

  let query = supabaseAdmin
    .from("transactions")
    .select(
      "*, accounts!transactions_account_id_fkey(name,currency), to_accounts:accounts!transactions_to_account_id_fkey(name,currency), categories(name,icon), debts(id,title,people(name))"
    )
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (from) query = query.gte("occurred_at", from);
  if (to) query = query.lte("occurred_at", to);
  if (q) query = query.ilike("description", `%${q}%`);
  if (type) query = query.eq("type", type);
  if (account_id) query = query.or(`account_id.eq.${account_id},to_account_id.eq.${account_id}`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ transactions: data });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();

  // auto-classify category if not provided and it's an expense
  if (body.type === "expense" && !body.category_id && body.description) {
    const { data: cats } = await supabaseAdmin.from("categories").select("id,name,keywords,kind").eq("user_id", userId);
    const guess = classifyExpense(body.description, cats || []);
    if (guess) body.category_id = guess;
  }

  try {
    const tx = await createTransaction({ ...body, user_id: userId, source: "app" });

    // optional group bill-split ("العزومة"): each share becomes a real, trackable
    // debt owed to the user (find-or-create the person by phone, then a debt row),
    // so it shows up in الأشخاص والديون just like any other debt.
    if (Array.isArray(body.shares) && body.shares.length) {
      const shareRows: any[] = [];
      for (const s of body.shares) {
        let debtId: string | null = null;
        if (s.is_debt && Number(s.amount) > 0 && (s.name || s.person_id)) {
          let personId = s.person_id || null;
          if (!personId && s.phone) {
            const { data: existing } = await supabaseAdmin
              .from("people")
              .select("id")
              .eq("user_id", userId)
              .eq("phone", s.phone)
              .maybeSingle();
            personId = existing?.id || null;
          }
          if (!personId) {
            const { data: created } = await supabaseAdmin
              .from("people")
              .insert({ user_id: userId, name: s.name || "بدون اسم", phone: s.phone || null })
              .select()
              .single();
            personId = created?.id || null;
          }
          if (personId) {
            const { data: debt } = await supabaseAdmin
              .from("debts")
              .insert({
                user_id: userId,
                person_id: personId,
                direction: "owed_to_me",
                title: body.description ? `نصيبه من: ${body.description}` : "نصيب من فاتورة مقسومة",
                reason: body.description || null,
                original_amount: s.amount,
                remaining_amount: s.amount,
                currency: tx.currency,
                status: "open",
              })
              .select()
              .single();
            debtId = debt?.id || null;
          }
        }
        shareRows.push({
          transaction_id: tx.id,
          whatsapp_contact_id: s.whatsapp_contact_id || null,
          name: s.name,
          phone: s.phone,
          amount: s.amount,
          is_debt: !!s.is_debt,
          debt_id: debtId,
        });
      }
      await supabaseAdmin.from("transaction_shares").insert(shareRows);
    }

    return NextResponse.json({ transaction: tx });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
