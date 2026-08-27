"use client";
import { useEffect, useState, use as usePromise } from "react";
import Card from "@/components/Card";
import Footer from "@/components/Footer";
import { Heart } from "lucide-react";

// PUBLIC صفحة — من غير جلسة، زي app/laha-reveal/[token]. Round 40 —
// "وضع الشريك الهادئ": ملخص مطمئن بسيط (مزاج اليوم + المرحلة الهرمونية أو
// أسبوع الحمل) للشريك، من غير أي تفاصيل حساسة تانية. اللينك بينتهي تلقائيًا
// (المدة بتحددها صاحبة الحساب وقت التوليد)، وبتقدر تولّد لينك جديد في أي
// وقت (بيلغي القديم أوتوماتيك — صف واحد بس لكل مستخدمة في الداتابيز).
const MOOD_LABEL: Record<string, string> = {
 happy:"مبسوطة",
 calm:"هادية",
 tired:"متعبة شوية",
 sensitive:"حساسة زيادة النهاردة",
 anxious:"قلقانة شوية",
 irritable:"سريعة الانفعال",
};

export default function PartnerViewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = usePromise(params);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/partner/${token}`);
        const d = await res.json();
        if (!res.ok) { setError(d.error || "الرابط غير صالح"); return; }
        setData(d);
      } catch {
        setError("حصل خطأ في تحميل الصفحة");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) return <div className="min-h-full flex items-center justify-center p-6"><p className="text-sm text-neutral-400">جاري التحميل...</p></div>;
  if (error || !data) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-6 gap-2 text-center">
        <p className="text-sm text-neutral-500">{error || "حصل خطأ"}</p>
      </div>
    );
  }

  const moodText = data.mood ? (MOOD_LABEL[data.mood] || data.mood) : null;

  const shareMessage = data.mode === "pregnancy"
 ?`النهاردة في الأسبوع ${data.week} من الحمل${moodText ?`، وحاسة إنها ${moodText}`:""}.`
    : data.phase
    ? `دلوقتي في ${data.phaseLabel}${moodText ? `، وحاسة إنها ${moodText}` : ""}. ${data.phaseGuide?.title ? `(${data.phaseGuide.title})` : ""}`
    : `${moodText ? `حاسة إنها ${moodText} النهاردة.` : "مفيش بيانات كفاية لسه."}`;

  const copyMessage = async () => {
    try { await navigator.clipboard.writeText(shareMessage); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  return (
    <div className="min-h-full flex flex-col max-w-md mx-auto w-full p-4 space-y-4" dir="rtl">
      <div className="text-center space-y-1 pt-2">
        <Heart className="mx-auto text-pink-500" size={26} />
        <h1 className="text-lg font-bold">وضع الشريك الهادئ</h1>
        <p className="text-xs text-neutral-400">ملخص بسيط، من غير تفاصيل زيادة</p>
      </div>

      {moodText && (
        <Card className="text-center bg-pink-50 dark:bg-pink-950/40 border-none">
          <p className="text-sm">مزاجها النهاردة: <b>{moodText}</b></p>
        </Card>
      )}

      {data.mode === "pregnancy" && (
        <Card className="text-center space-y-2 bg-gradient-to-b from-pink-50 to-purple-50 dark:from-pink-950 dark:to-purple-950 border-none">
          <p className="text-sm">الأسبوع <b>{data.week}</b> من الحمل — الترايمستر {data.trimester === 1 ? "الأول" : data.trimester === 2 ? "الثاني" : "الثالث"}</p>
        </Card>
      )}

      {data.mode === "cycle" && data.phase && (
        <Card className="text-center space-y-2">
          <p className="text-sm">دلوقتي في <b>{data.phaseLabel}</b> {data.phaseGuide?.emoji}</p>
          {data.phaseGuide?.title && <p className="text-xs text-neutral-400">{data.phaseGuide.title}</p>}
          {data.nextPeriodDate && <p className="text-xs text-neutral-400">الدورة الجاية متوقعة قريبًا — خليك متفهم لو مزاجها اتقلب شوية.</p>}
        </Card>
      )}

      {data.mode === "cycle" && !data.phase && (
        <Card className="text-center text-sm text-neutral-400">مفيش بيانات دورة كفاية لسه.</Card>
      )}

      <button onClick={copyMessage} className="w-full bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900 rounded-xl py-2.5 text-sm font-medium">
 {copied ?"اتنسخت الرسالة":"نسخ الرسالة"}
      </button>

      <Footer />
    </div>
  );
}
