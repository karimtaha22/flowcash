"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, ChevronLeft } from "lucide-react";

interface AlertItem {
  label: string;
  href: string;
}

// A real, working notifications bell — floats on every protected page (see
// app/(protected)/layout.tsx), not just the dashboard. Before this, the
// only "bell" in the codebase (components/TopBar.tsx) was a decorative
// <span> wired to nothing: no badge, no click, no content. This one shows
// an actual badge count and, on tap, a short specific description of each
// pending item ("مرتب — لسه ماتأكدش الشهر ده") instead of just a number —
// tapping an item jumps straight to where it needs attention.
export default function NotificationsBell() {
  const [items, setItems] = useState<AlertItem[]>([]);
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/alerts-count")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return;
        setCount(d.count || 0);
        setItems(d.items || []);
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="fixed top-4 left-4 z-40 w-10 h-10 rounded-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-sm flex items-center justify-center text-neutral-600 dark:text-neutral-300"
        aria-label="التنبيهات"
      >
        <Bell size={17} />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-orange-600 text-white text-[10px] font-bold flex items-center justify-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)}>
          <div
            className="absolute top-16 left-4 w-72 max-w-[calc(100vw-2rem)] rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 shadow-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-4 py-3 text-sm font-bold border-b border-neutral-100 dark:border-neutral-800">التنبيهات</p>
            {items.length === 0 ? (
 <p className="px-4 py-6 text-xs text-center text-neutral-400">مفيش تنبيهات دلوقتي </p>
            ) : (
              <div className="max-h-80 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800">
                {items.map((it, i) => (
                  <Link
                    key={i}
                    href={it.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 px-4 py-3 text-xs text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  >
                    <span className="flex-1">{it.label}</span>
                    <ChevronLeft size={14} className="text-neutral-400 shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
