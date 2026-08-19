"use client";
import { useEffect } from "react";

// A stale service worker was serving old, already-fixed pages/JS chunks back
// to users after every deploy — this is why fixes kept looking "not applied"
// even after a real, successful redeploy. This component now actively
// detects a new service worker taking over and reloads once to pick it up,
// instead of silently sitting on old cached code indefinitely.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        // check for a newer sw.js immediately, and again whenever the tab
        // regains focus (covers PWA instances left open for a long time)
        registration.update().catch(() => {});
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") registration.update().catch(() => {});
        });
      })
      .catch(() => {});
  }, []);
  return null;
}
