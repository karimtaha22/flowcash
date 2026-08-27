"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Wallet, Users, PlusCircle, Repeat, CreditCard, Receipt, MoreHorizontal } from "lucide-react";

// التقويم اتنقل لصفحة "المزيد" — مكانه بقى للتخطيط المالي وأقساط وجمعيات
// (طلب المستخدم مباشرة)، فبقى الشريط ٨ عناصر بدل ٧.
const items = [
  { href: "/dashboard", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/accounts", label: "الحسابات", icon: Wallet },
  { href: "/activity", label: "الحركات", icon: Receipt },
  { href: "/add", label: "إضافة", icon: PlusCircle },
  { href: "/people", label: "الأشخاص", icon: Users },
  { href: "/planning", label: "التخطيط", icon: Repeat },
  { href: "/installments", label: "أقساط", icon: CreditCard },
  { href: "/more", label: "المزيد", icon: MoreHorizontal },
];

export default function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-neutral-950/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-8 max-w-lg mx-auto">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[9px] ${
                active ? "text-orange-500" : "text-neutral-500"
              }`}
            >
              <Icon size={17} strokeWidth={active ? 2.5 : 2} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
