import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSessionUserId } from "@/lib/session";
import { isValidPhone } from "@/lib/phone";
import { generateDebtToken, logDebtEvent, notifyIfLinkedAccount, debtLinkUrl } from "@/lib/debtLinks";

const WITNESS_SLOTS: Record<string, number> = { two_men: 2, man_two_women: 3 };

// "تسجيل متقدم" — creditor/debtor/witness structured debt registration with
// a live link per role. See lib/debtLinks.ts's top comment for the full
// architecture (why per-role tokens, how notification-on-match works, why
// the creditor never needs a public link to act).
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    direction, person_id, new_person_name,
    other_party, // { address?, id_number?, id_photo_front? }
    title, reason, amount, value_type, metal_karat, unit_label,
    debt_date, due_date,
    witness_mode, witnesses,
  } = body;

  if (!direction || !["owed_to_me", "i_owe"].includes(direction)) {
    return NextResponse.json({ error: "نوع الدين غير صحيح" }, { status: 400 });
  }
  if (!title || !(Number(amount) > 0)) {
    return NextResponse.json({ error: "اسم الدين والمبلغ لازم يتملوا صح" }, { status: 400 });
  }
  if (!person_id && !new_person_name?.trim()) {
    return NextResponse.json({ error: "لازم تختار شخص أو تكتب اسم جديد" }, { status: 400 });
  }
  const vType = ["currency", "gold", "silver", "other"].includes(value_type) ? value_type : "currency";
  if (!witness_mode || !WITNESS_SLOTS[witness_mode]) {
    return NextResponse.json({ error: "لازم تختار نوع الشهود (رجلين، أو رجل وامرأتان)" }, { status: 400 });
  }
  const requiredWitnesses = WITNESS_SLOTS[witness_mode];
  const witnessList: { name: string; phone?: string; address?: string; id_photo_front?: string }[] = witnesses || [];
  if (witnessList.length !== requiredWitnesses || witnessList.some((w) => !w.name?.trim())) {
    return NextResponse.json({ error: `لازم بيانات ${requiredWitnesses} شهود بالاسم على الأقل` }, { status: 400 });
  }
  if (witnessList.some((w) => w.phone && !isValidPhone(w.phone))) {
    return NextResponse.json({ error: "رقم موبايل غير صالح — راجع أرقام الشهود" }, { status: 400 });
  }
  if (other_party?.phone !== undefined && other_party.phone && !isValidPhone(other_party.phone)) {
    return NextResponse.json({ error: "رقم موبايل غير صالح" }, { status: 400 });
  }

  // resolve/update the `people` row for the other party (debtor if I'm the
  // creditor, creditor if I'm the debtor) — same "pick existing or add new"
  // pattern the simple debt form already uses, plus the round-24 identity
  // fields (address/id_number/id_photo_front) layered on top since those
  // belong to the PERSON, not to any one debt.
  let personId = person_id as string | undefined;
  if (!personId && new_person_name) {
    const { data: p, error: pErr } = await supabaseAdmin
      .from("people")
      .insert({ user_id: userId, name: new_person_name.trim(), phone: other_party?.phone || null })
      .select()
      .single();
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    personId = p.id;
  }
  if (other_party && personId) {
    const personUpdate: Record<string, any> = {};
    if ("address" in other_party) personUpdate.address = other_party.address || null;
    if ("id_number" in other_party) personUpdate.id_number = other_party.id_number || null;
    if ("id_photo_front" in other_party) personUpdate.id_photo_front = other_party.id_photo_front || null;
    if (Object.keys(personUpdate).length) {
      await supabaseAdmin.from("people").update(personUpdate).eq("id", personId).eq("user_id", userId);
    }
  }
  const { data: person } = await supabaseAdmin.from("people").select("id,name,phone").eq("id", personId).eq("user_id", userId).single();
  if (!person) return NextResponse.json({ error: "الشخص غير موجود" }, { status: 404 });

  const { data: debt, error: debtErr } = await supabaseAdmin
    .from("debts")
    .insert({
      user_id: userId,
      person_id: personId,
      direction,
      title,
      reason: reason || null,
      original_amount: Number(amount),
      remaining_amount: Number(amount),
      currency: vType === "currency" ? body.currency || "EGP" : unit_label || (vType === "gold" ? "جرام ذهب" : vType === "silver" ? "جرام فضة" : "وحدة"),
      value_type: vType,
      metal_karat: vType === "gold" ? Number(metal_karat) || null : null,
      due_date: due_date || null,
      debt_date: debt_date || new Date().toISOString().slice(0, 10),
      status: "open",
      is_advanced: true,
      witness_mode,
    })
    .select()
    .single();
  if (debtErr) return NextResponse.json({ error: debtErr.message }, { status: 500 });

  // witnesses + their individual links
  const witnessRows = witnessList.map((w, i) => ({
    debt_id: debt.id,
    slot_index: i + 1,
    name: w.name.trim(),
    phone: w.phone || null,
    address: w.address || null,
    id_photo_front: w.id_photo_front || null,
  }));
  const { data: insertedWitnesses, error: wErr } = await supabaseAdmin.from("debt_witnesses").insert(witnessRows).select();
  if (wErr) {
    await supabaseAdmin.from("debts").delete().eq("id", debt.id);
    return NextResponse.json({ error: wErr.message }, { status: 500 });
  }

  const linkRows: { debt_id: string; token: string; role: string; witness_id: string | null }[] = [];
  const otherPartyRole = direction === "owed_to_me" ? "debtor" : "creditor_view";
  linkRows.push({ debt_id: debt.id, token: generateDebtToken(), role: otherPartyRole, witness_id: null });
  for (const w of insertedWitnesses) {
    linkRows.push({ debt_id: debt.id, token: generateDebtToken(), role: "witness", witness_id: w.id });
  }
  const { data: insertedLinks, error: lErr } = await supabaseAdmin.from("debt_links").insert(linkRows).select();
  if (lErr) {
    await supabaseAdmin.from("debts").delete().eq("id", debt.id); // cascades witnesses
    return NextResponse.json({ error: lErr.message }, { status: 500 });
  }

  await logDebtEvent(debt.id, "created", `تم إنشاء الدين (تسجيل متقدم)${person?.name ? ` — ${person.name}` : ""}`, "creditor");

  // notify anyone (other party or a witness) who happens to already have a
  // FlowCash account with a matching phone number — Telegram push (if
  // linked) + the in-app bell picks it up on its own (see alerts-count).
  const otherPartyLink = insertedLinks.find((l) => l.role === otherPartyRole)!;
  const otherPartyLabel = otherPartyRole === "debtor" ? "طلب توثيق دين عليك" : "طلب مراجعة دين ليك";
  await notifyIfLinkedAccount(person.phone, `📜 ${otherPartyLabel}\n"${title}"\n${debtLinkUrl(otherPartyLink.token)}`);

  for (const w of insertedWitnesses) {
    const link = insertedLinks.find((l) => l.witness_id === w.id)!;
    await notifyIfLinkedAccount(w.phone, `📜 طلب شهادة على دين\n"${title}"\n${debtLinkUrl(link.token)}`);
  }

  return NextResponse.json({
    debt,
    witnesses: insertedWitnesses,
    links: insertedLinks.map((l) => ({ ...l, url: debtLinkUrl(l.token) })),
  });
}
