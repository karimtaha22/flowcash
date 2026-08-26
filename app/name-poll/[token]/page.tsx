"use client";
import { useEffect, useRef, useState, use as usePromise } from "react";
import Card from "@/components/Card";
import Footer from "@/components/Footer";
import { Heart } from "lucide-react";

// PUBLIC صفحة — من غير جلسة، زي app/laha-reveal/[token] و app/partner/
// [token]. Round 41 — "Family Heart Poll": أي فرد من العيلة معاه اللينك
// يقدر يهارت الأسماء المرشحة (اللي الأم اختارتها كـ shortlist) ويشوف
// العدّاد لايف — بترفريش كل ٥ ثواني زي بواقي صفحات التصويت في التطبيق.
const VOTER_KEY_LS = "flowcash_name_poll_voter_key";

function getVoterKey(): string {
  try {
    let k = localStorage.getItem(VOTER_KEY_LS);
    if (!k) {
      k = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(VOTER_KEY_LS, k);
    }
    return k;
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

export default function NamePollPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = usePromise(params);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [myVotes, setMyVotes] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const voterKeyRef = useRef("");
  useEffect(() => { voterKeyRef.current = getVoterKey(); }, []);

  const load = async () => {
    try {
      const res = await fetch(`/api/name-poll/${token}`);
      const d = await res.json();
      if (!res.ok) { setError(d.error || "الرابط غير صالح"); return; }
      setData(d);
      setError("");
    } catch {
      // شبكة اتقطعت مؤقتًا — نسيب آخر بيانات معروضة، هنحاول تاني في الـ poll الجاي
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [token]);

  const toggleVote = async (nameId: string) => {
    if (busyId) return;
    const currentlyVoted = myVotes.includes(nameId);
    setBusyId(nameId);
    setMyVotes((prev) => (currentlyVoted ? prev.filter((id) => id !== nameId) : [...prev, nameId]));
    try {
      await fetch(`/api/name-poll/${token}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name_id: nameId, voter_key: voterKeyRef.current, vote: !currentlyVoted }),
      });
      load();
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className="min-h-full flex items-center justify-center p-6"><p className="text-sm text-neutral-400">جاري التحميل...</p></div>;
  if (error || !data) {
    return (
      <div className="min-h-full flex flex-col items-center justify-center p-6 gap-2 text-center">
        <p className="text-sm text-neutral-500">{error || "حصل خطأ"}</p>
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col max-w-md mx-auto w-full p-4 space-y-4" dir="rtl">
      <div className="text-center space-y-1 pt-2">
        <p className="text-xs font-bold text-pink-500">👶 اختاروا اسم البيبي معانا!</p>
        <h1 className="text-lg font-bold">صوّتوا على اسمكم المفضّل</h1>
        <p className="text-xs text-neutral-400">تقدروا تصوّتوا لأكتر من اسم</p>
      </div>

      {!data.names?.length && (
        <Card className="text-center text-sm text-neutral-400 py-6">لسه مفيش أسماء مرشحة للتصويت عليها.</Card>
      )}

      <div className="space-y-2">
        {data.names?.map((n: any) => {
          const voted = myVotes.includes(n.id);
          const fullName = data.fatherName ? `${n.name} ${data.fatherName}` : n.name;
          return (
            <Card key={n.id} className="flex items-center justify-between gap-2">
              <div className="flex-1">
                <p className="font-medium">{n.name} {n.gender === "girl" ? "💗" : "💙"}</p>
                {n.meaning && <p className="text-xs text-neutral-400">{n.meaning}</p>}
                {data.fatherName && <p className="text-xs text-neutral-400">الاسم كامل: {fullName}</p>}
              </div>
              <button onClick={() => toggleVote(n.id)} disabled={busyId === n.id} className="flex flex-col items-center gap-0.5 shrink-0">
                <Heart size={22} className={voted ? "text-pink-500" : "text-neutral-300"} fill={voted ? "currentColor" : "none"} />
                <span className="text-[10px] text-neutral-400">{n.voteCount}</span>
              </button>
            </Card>
          );
        })}
      </div>

      <Footer />
    </div>
  );
}
