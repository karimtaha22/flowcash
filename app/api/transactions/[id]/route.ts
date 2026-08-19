import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { deleteTransactionAndReverse } from "@/lib/transactions";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    await deleteTransactionAndReverse(id, userId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
