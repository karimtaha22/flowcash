"use client";
import { useEffect } from "react";

// Best-effort substitute for a true home-screen "total balance" widget: standard
// web PWAs cannot render a native OS widget (no such API on iOS, and only very
// limited/non-standard support on Android). Instead we use the Badging API —
// supported on Chrome/Edge desktop & Android — to put a small number on the
// app icon showing how many things need attention (recurring items due,
// budgets over their alert threshold, overdue debts).
export default function AppBadge() {
  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    fetch("/api/alerts-count")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        if (d.count > 0) (navigator as any).setAppBadge(d.count).catch(() => {});
        else (navigator as any).clearAppBadge?.().catch(() => {});
      })
      .catch(() => {});
  }, []);
  return null;
}
