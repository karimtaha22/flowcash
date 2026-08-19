"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Watches for user activity (mouse/keyboard/touch/scroll) and signs the user out after
// N minutes of idle time, per their setting in /settings. Someone else picking up the
// device later has to log back in — with fingerprint, if it's already set up.
export default function AutoLogout() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minutesRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;

    const doLogout = async () => {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch {
        // best-effort; redirect regardless
      }
      router.push("/login");
      router.refresh();
    };

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (minutesRef.current > 0) {
        timerRef.current = setTimeout(doLogout, minutesRef.current * 60 * 1000);
      }
    };

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];

    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const minutes = Number(d.user?.auto_logout_minutes) || 0;
        minutesRef.current = minutes;
        if (minutes > 0) {
          events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
          resetTimer();
        }
      });

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
