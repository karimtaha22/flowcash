"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// التصنيفات moved into الإعدادات (Settings) — no longer a standalone main
// tab. This route stays as a redirect so any old links/bookmarks still land
// somewhere useful instead of a dead page.
export default function CategoriesRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/settings"); }, [router]);
  return <p className="text-center text-sm text-neutral-400 py-10">التصنيفات دلوقتي جوه الإعدادات — بنوديك هناك...</p>;
}
