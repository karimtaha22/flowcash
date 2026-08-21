import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/session";
import BottomNav from "@/components/BottomNav";
import Sidebar from "@/components/Sidebar";
import Footer from "@/components/Footer";
import AppBadge from "@/components/AppBadge";
import AutoLogout from "@/components/AutoLogout";
import LicenseBanner from "@/components/LicenseBanner";
import NotificationsBell from "@/components/NotificationsBell";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  return (
    <div className="flex-1 flex flex-col md:flex-row bg-neutral-50 dark:bg-neutral-950">
      <Sidebar />
      <div className="flex-1 flex flex-col md:mr-64">
        <main className="flex-1 w-full max-w-3xl mx-auto px-4 pt-4 pb-24 md:pb-10 md:pt-8">
          <LicenseBanner />
          {children}
          <Footer />
        </main>
      </div>
      <BottomNav />
      <AppBadge />
      <AutoLogout />
      <NotificationsBell />
    </div>
  );
}
