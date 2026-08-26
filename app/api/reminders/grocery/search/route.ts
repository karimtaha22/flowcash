import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { searchMarketCatalog } from "@/lib/marketCatalog";

// Round 37 — "عند كتابة أي صنف في قسم التذكيرات/السوبر ماركت، تظهر قائمة
// إكمال تلقائي (Autocomplete) سريعة تبحث في الكلمات المفتاحية": بيبحث في
// الكتالوج العام المشترك (market_catalog، متغذّي من سكريبت السحب) — منفصل
// عن /api/reminders/grocery/match اللي بيبحث في كتالوج المستخدم الشخصي.
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q") || "";
  const results = await searchMarketCatalog(q, 8);
  return NextResponse.json({ results });
}
