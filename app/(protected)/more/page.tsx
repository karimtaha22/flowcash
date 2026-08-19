import Link from "next/link";
import Card from "@/components/Card";
import { Repeat, Search, FileDown, Settings, ChevronLeft } from "lucide-react";

const items = [
  { href: "/planning", label: "التخطيط المالي", desc: "مصاريف ودخل متكرر، ميزانية، أهداف توفير، صدقات وزكاة", icon: Repeat },
  { href: "/search", label: "البحث", desc: "دور بأي حاجة في حساباتك", icon: Search },
  { href: "/export", label: "تصدير كشف حساب", desc: "PDF أو Excel لأي حساب أو شخص", icon: FileDown },
  { href: "/settings", label: "الإعدادات", desc: "العملة الأساسية، التصنيفات، الأشخاص، الوضع الليلي", icon: Settings },
];

export default function MorePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">المزيد</h1>
      <div className="space-y-2">
        {items.map(({ href, label, desc, icon: Icon }) => (
          <Link key={href} href={href}>
            <Card className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
                <Icon size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-neutral-400">{desc}</p>
              </div>
              <ChevronLeft size={16} className="text-neutral-400 shrink-0" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
