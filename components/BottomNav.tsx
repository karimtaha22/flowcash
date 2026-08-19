"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Wallet, Users, PlusCircle, CalendarDays, Receipt, MoreHorizontal } from "lucide-react";

const items = [
  { href: "/dashboard", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/accounts", label: "الحسابات", icon: Wallet },
  { href: "/activity", label: "الحركة", icon: Receipt },
  { href: "/add", label: "إضافة", icon: PlusCircle },
  { href: "/people", label: "الأشخاص", icon: Users },
  { href: "/calendar", label: "التقويم", icon: CalendarDays },
  { href: "/more", label: "المزيد", icon: MoreHorizontal },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-neutral-950/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-7 max-w-lg mx-auto">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] ${
                active ? "text-orange-500" : "text-neutral-500"
              }`}
            >
              <Icon size={19} strokeWidth={active ? 2.5 : 2} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
