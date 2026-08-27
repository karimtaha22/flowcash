"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Wallet, Users, PlusCircle, Settings, Receipt, Wallet2, Repeat, CreditCard, Search, FileDown, BarChart3, Bell, Heart } from "lucide-react";

// "التقويم" اتسمّى "التقارير" ونزل آخر عنصر فوق الإعدادات مباشرة (round 21)
// — مش بس تقويم شهري، بقى فيه تحليلات وربط مباشر بالأقساط والجمعيات.
const items = [
  { href: "/dashboard", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/accounts", label: "الحسابات", icon: Wallet },
  { href: "/activity", label: "الحركة", icon: Receipt },
  { href: "/add", label: "إضافة حركة", icon: PlusCircle },
  { href: "/people", label: "الأشخاص والديون", icon: Users },
  { href: "/planning", label: "التخطيط المالي", icon: Repeat },
  { href: "/installments", label: "أقساط وجمعيات", icon: CreditCard },
  { href: "/reminders", label: "التذكيرات", icon: Bell },
  { href: "/laha", label: "لها", icon: Heart },
  { href: "/export", label: "تصدير كشف حساب", icon: FileDown },
  { href: "/calendar", label: "التقارير", icon: BarChart3 },
  { href: "/search", label: "البحث", icon: Search },
  { href: "/settings", label: "الإعدادات", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 md:right-0 bg-neutral-950 text-neutral-300 px-4 py-6">
      <div className="flex items-center gap-2 px-2 mb-8">
        <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center text-white">
          <Wallet2 size={18} />
        </div>
        <div>
          <p className="text-white font-bold leading-tight">FlowCash</p>
          <p className="text-[11px] text-neutral-500 leading-tight">إدارة الحسابات الشخصية</p>
        </div>
      </div>

      <p className="px-2 text-[10px] font-semibold tracking-wider text-neutral-600 mb-2">القائمة</p>
      <nav className="flex-1 space-y-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(href + "/");
          // طلب المستخدم صراحة: مفتاح "لها" في القائمة يتلون وردي (مش برتقالي
          // زي باقي القائمة) لما نكون واقفين عليه أو بنعمله hover، وفي حالته
          // العادية (مش واقفين عليه) يفضل جواه أيقونة بتنبض برفق — "شكل مريح
 // للأعصاب". Round 42 — الوردة القديمة كانت"مش حلوة"(طلب صريح)،
 // بدّلناها بقلب وردي (.animate-heart-glow) بينبض زي نبضة قلب.
          if (href === "/laha") {
            return (
              <Link
                key={href}
                href={href}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                  active ? "bg-pink-500 text-white font-medium" : "text-neutral-400 hover:bg-pink-500/15 hover:text-pink-300"
                }`}
              >
                <Icon size={18} />
                {label}
                {!active && (
                  <span className="ms-auto animate-heart-glow leading-none select-none" aria-hidden>
                    <Heart size={13} fill="currentColor" className="text-pink-400" />
                  </span>
                )}
              </Link>
            );
          }
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                active ? "bg-orange-500 text-white font-medium" : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-2 pt-4 border-t border-neutral-900 text-[10px] text-neutral-600 leading-relaxed">
        © 2022–2026 IDEA-EG
      </div>
    </aside>
  );
}
