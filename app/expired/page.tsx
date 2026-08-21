"use client";
import { useRouter } from "next/navigation";
import { Clock, LogOut } from "lucide-react";
import Footer from "@/components/Footer";

export default function ExpiredPage() {
  const router = useRouter();

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="min-h-full flex flex-col justify-center max-w-sm mx-auto p-6 space-y-4 text-center">
      <div className="w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
        <Clock size={28} />
      </div>
      <h1 className="text-lg font-bold">انتهت مدة البرنامج</h1>
      <p className="text-sm text-neutral-500 leading-relaxed">
        اشتراكك أو فترتك التجريبية خلصت. هنحافظ على بياناتك لمدة 30 يوم من تاريخ الانتهاء — تواصل مع فريق الدعم عشان تجدد أو تشتري النسخة الكاملة وترجع تستخدم حسابك زي ما هو من غير ما تفقد أي حاجة.
      </p>
      <button onClick={logout} className="flex items-center justify-center gap-1.5 mx-auto text-sm text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 pt-2">
        <LogOut size={14} /> تسجيل خروج
      </button>
      <Footer />
    </div>
  );
}
