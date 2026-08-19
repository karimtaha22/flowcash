"use client";
import { useEffect, useState } from "react";

export type FontScale = "small" | "medium" | "large";
// scaling the root font-size scales every Tailwind rem-based text utility
// proportionally, so this one line is all "تكبير/تصغير حجم الخط" needs.
export const FONT_SCALE_PX: Record<FontScale, string> = { small: "14px", medium: "16px", large: "18px" };

export function applyFontScale(scale: FontScale) {
  document.documentElement.style.fontSize = FONT_SCALE_PX[scale] || FONT_SCALE_PX.medium;
}

export function useFontScale() {
  const [scale, setScale] = useState<FontScale>("medium");

  useEffect(() => {
    const stored = (localStorage.getItem("flowcash-font-scale") as FontScale) || "medium";
    setScale(stored);
    applyFontScale(stored);
    // reconcile with the server copy in case it was changed on another device
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        const serverScale = d.user?.font_scale as FontScale | undefined;
        if (serverScale && serverScale !== stored) {
          setScale(serverScale);
          applyFontScale(serverScale);
          localStorage.setItem("flowcash-font-scale", serverScale);
        }
      })
      .catch(() => {});
  }, []);

  const change = async (next: FontScale) => {
    setScale(next);
    applyFontScale(next);
    localStorage.setItem("flowcash-font-scale", next);
    try {
      await fetch("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ font_scale: next }) });
    } catch {
      // best-effort — local application already happened
    }
  };

  return { scale, change };
}
