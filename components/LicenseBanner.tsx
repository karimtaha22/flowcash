"use client";
import { useEffect, useState } from "react";
import { X, Megaphone, Clock } from "lucide-react";
import { computeLicenseStatus } from "@/lib/license";

// Two independent, dismissible-per-message banners at the top of every
// protected page: an admin broadcast (until this user marks it seen) and a
// "trial ends in N days" nudge (recomputed client-side every load — no
// dismiss-tracking needed since it's just informational, not a gate; the
// actual gate is enforced server-side in middleware.ts).
export default function LicenseBanner() {
  const [broadcast, setBroadcast] = useState<{ id: string; message: string } | null>(null);
  const [trialDaysLeft, setTrialDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/broadcast/latest").then((r) => r.json()).then((d) => setBroadcast(d.broadcast || null)).catch(() => {});
    fetch("/api/me").then((r) => r.json()).then((d) => {
      if (!d.user) return;
      const status = computeLicenseStatus(d.user);
      setTrialDaysLeft(status.kind === "active" && status.type === "trial" && status.daysLeft !== null && status.daysLeft <= 7 ? status.daysLeft : null);
    }).catch(() => {});
  }, []);

  const dismissBroadcast = async () => {
    setBroadcast(null);
    await fetch("/api/broadcast/seen", { method: "POST" }).catch(() => {});
  };

  if (!broadcast && trialDaysLeft === null) return null;

  return (
    <div className="space-y-2 mb-3">
      {broadcast && (
        <div className="flex items-start gap-2 rounded-xl bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-900 px-3 py-2.5 text-sm">
          <Megaphone size={16} className="text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
          <p className="flex-1 text-orange-800 dark:text-orange-200">{broadcast.message}</p>
          <button onClick={dismissBroadcast} className="text-orange-400 hover:text-orange-700 shrink-0"><X size={14} /></button>
        </div>
      )}
      {trialDaysLeft !== null && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200">
          <Clock size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
          {trialDaysLeft <= 0 ? "النسخة التجريبية بتنتهي النهاردة" : `باقي ${trialDaysLeft} يوم على انتهاء النسخة التجريبية — تواصل مع فريق الدعم للشراء`}
        </div>
      )}
    </div>
  );
}
