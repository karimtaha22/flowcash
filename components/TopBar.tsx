"use client";
import Link from "next/link";
import { Bell, Settings } from "lucide-react";

export default function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">{title}</h1>
        {subtitle && <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/settings"
          className="w-9 h-9 rounded-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-neutral-500"
        >
          <Settings size={16} />
        </Link>
        <span className="w-9 h-9 rounded-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-neutral-500 relative">
          <Bell size={16} />
        </span>
      </div>
    </div>
  );
}
