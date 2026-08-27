"use client";
import { useEffect, useRef, useState, use as usePromise } from "react";
import Card from "@/components/Card";
import Footer from "@/components/Footer";
import { shrinkImage } from "@/lib/image";
import { CheckCircle2, PartyPopper, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { GENDER_REVEAL_DUA, genderRevealCongrats } from "@/lib/laha/genderReveal";

// PUBLIC صفحة — من غير جلسة، من غير Sidebar/BottomNav (برّه (protected)
// عمدًا). دي "تيم بينك ولا تيم بلو؟": صفحة التصويت اللايف والجيست بوك
// اللي أي حد معاه اللينك يقدر يفتحها — بترفريش نفسها كل ٥ ثواني عشان تعرض
// عدد التصويت والكشف (لو حصل) لايف من غير ما الضيف يعمل أي حاجة.
const GUEST_KEY_LS = "flowcash_laha_reveal_guest_key";

function getGuestKey(): string {
  try {
    let k = localStorage.getItem(GUEST_KEY_LS);
    if (!k) {
      k = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(GUEST_KEY_LS, k);
    }
    return k;
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

// Round 44 — "اللينك اللي بيروح للضيوف... ممكن الشخص يصوّت أكتر من مرة":
// بعد ما الضيف يبعت تخمينه وتهنئته، نسجّل ده في localStorage (خاص بكل
// حفلة/توكن) عشان لو فتح اللينك تاني (حتى بعد ما الصفحة تتقفل وتترفتح)
// يشوف بس ملخص تصويته وحالة إرساله — من غير ما يقدر يبعت تاني أو يغيّر
// تخمينه من نفس الجهاز.
function submissionKey(token: string) {
  return `flowcash_laha_reveal_submitted_${token}`;
}
function readSubmission(token: string): { vote: "boy" | "girl" | null; sentGift: boolean } | null {
  try {
    const raw = localStorage.getItem(submissionKey(token));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeSubmission(token: string, vote: "boy" | "girl" | null, sentGift: boolean) {
  try {
    localStorage.setItem(submissionKey(token), JSON.stringify({ vote, sentGift }));
  } catch {}
}

export default function GenderRevealGuestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = usePromise(params);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [myVote, setMyVote] = useState<"boy" | "girl" | null>(null);
  const [voting, setVoting] = useState(false);

  const [guestName, setGuestName] = useState("");
  const [message, setMessage] = useState("");
  const [sentGift, setSentGift] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [msg, setMsg] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const guestKeyRef = useRef<string>("");
  useEffect(() => {
    guestKeyRef.current = getGuestKey();
    const existing = readSubmission(token);
    if (existing) {
      setMyVote(existing.vote);
      setSentGift(existing.sentGift);
      setSubmitted(true);
    }
  }, [token]);

  const load = async () => {
    try {
      const res = await fetch(`/api/laha-reveal/${token}`);
      const d = await res.json();
      if (!res.ok) { setError(d.error || "الرابط غير صالح"); return; }
      setData(d);
      setError("");
    } catch {
      // شبكة اتقطعت — نسيب آخر بيانات معروضة زي ما هي، هنحاول تاني في الـ poll الجاي
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [token]);

  const castVote = async (vote: "boy" | "girl") => {
    if (voting) return;
    setVoting(true);
    setMyVote(vote);
    try {
      await fetch(`/api/laha-reveal/${token}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guest_key: guestKeyRef.current, vote }),
      });
      load();
    } finally {
      setVoting(false);
    }
  };

  const submitGuestbook = async () => {
    if (!message.trim()) { setMsg("اكتبي رسالة تهنئة"); return; }
    setSubmitting(true);
    setMsg("");
    try {
      const res = await fetch(`/api/laha-reveal/${token}/guestbook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guest_name: guestName || "ضيف",
          message,
          guess_vote: myVote,
          sent_gift: sentGift,
          payment_screenshot: receipt,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setMsg(d.error || "حصل خطأ"); return; }
      writeSubmission(token, myVote, sentGift);
      setSubmitted(true);
    } finally {
      setSubmitting(false);
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

  const totalVotes = data.votes.boy + data.votes.girl;
  const boyPct = totalVotes ? Math.round((data.votes.boy / totalVotes) * 100) : 50;
  const girlPct = totalVotes ? 100 - boyPct : 50;

  const instapayHref = data.instapay_link
    ? (data.instapay_link.startsWith("http") ? data.instapay_link : `https://${data.instapay_link}`)
    : null;

  return (
    <div className="min-h-full flex flex-col max-w-md mx-auto w-full p-4 space-y-4" dir="rtl">
      <div className="text-center space-y-1 pt-2">
        <p className="text-xs font-bold text-pink-500">تيم بينك ولا تيم بلو؟</p>
        <h1 className="text-lg font-bold">صوّتوا على نوع البيبي!</h1>
      </div>

      {data.popped ? (
        <Card className="text-center space-y-3 bg-gradient-to-b from-pink-50 to-sky-50 dark:from-pink-950 dark:to-sky-950 border-none">
          <PartyPopper className={`mx-auto ${data.gender === "boy" ? "text-sky-500" : "text-pink-500"}`} size={40} />
          <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">{GENDER_REVEAL_DUA}</p>
          <h2 className="text-xl font-bold">{genderRevealCongrats(data.gender)}</h2>
          {data.media_data_url && (
            data.media_data_url.startsWith("data:video") ? (
              <video src={data.media_data_url} controls className="rounded-xl w-full" />
            ) : (
              <img src={data.media_data_url} alt="سونار" className="rounded-xl w-full" />
            )
          )}
        </Card>
      ) : (
        <Card className="text-center space-y-1">
          <p className="text-sm text-neutral-500">لسه مفيش كشف... يلا صوّتوا وخمّنوا!</p>
        </Card>
      )}

      <Card className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-sky-600 dark:text-sky-400">ولد {data.votes.boy}</span>
            <button
              onClick={async () => { setRefreshing(true); try { await load(); } finally { setRefreshing(false); } }}
              className="text-neutral-400 flex items-center gap-1 text-[10px] font-normal"
            >
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} /> تحديث
            </button>
            <span className="text-pink-600 dark:text-pink-400">{data.votes.girl} بنت</span>
          </div>
          <div className="h-4 rounded-full overflow-hidden flex bg-neutral-100 dark:bg-neutral-800">
            <div className="h-full bg-sky-400 transition-all" style={{ width: `${boyPct}%` }} />
            <div className="h-full bg-pink-400 transition-all" style={{ width: `${girlPct}%` }} />
          </div>
        </div>
        {!data.popped && !submitted && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => castVote("boy")}
              disabled={voting}
              className={`rounded-xl py-2.5 text-sm font-semibold border-2 transition ${myVote === "boy" ? "bg-sky-500 text-white border-sky-500" : "border-sky-300 text-sky-600 dark:text-sky-400"}`}
            >
              صوّت لولد
            </button>
            <button
              onClick={() => castVote("girl")}
              disabled={voting}
              className={`rounded-xl py-2.5 text-sm font-semibold border-2 transition ${myVote === "girl" ? "bg-pink-500 text-white border-pink-500" : "border-pink-300 text-pink-600 dark:text-pink-400"}`}
            >
              صوّت لبنت
            </button>
          </div>
        )}
        {submitted && myVote && (
          <p className="text-xs text-center text-neutral-500">صوّتِ لـ{myVote === "boy" ? "ولد" : "بنت"} — شكرًا لمشاركتك</p>
        )}
      </Card>

      {submitted ? (
        <Card className="text-center space-y-1 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="mx-auto" size={24} />
          <p className="text-sm font-medium">وصلت تهنئتك! تسلم إيدك</p>
          <p className="text-xs text-neutral-500">{sentGift ? "اتسجل إنك بعتِ نقطة" : "متسجلش إنك بعتِ نقطة"}</p>
        </Card>
      ) : (
        <Card className="space-y-2">
          <p className="text-xs font-semibold">جيست بوك — سجّل تهنئتك</p>
          <div>
            <label className="text-[10px] text-neutral-400">اسمك</label>
            <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="ضيف" className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-[10px] text-neutral-400">رسالة التهنئة</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" placeholder="ألف مبروك ومبارك المولود الجديد..." />
          </div>

          {data.instapay_link && (
            <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800 p-2.5 text-xs space-y-1.5">
              <p className="text-neutral-400">رابط انستاباي الأم</p>
              <div className="flex gap-1.5">
                <a
                  href={instapayHref!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 bg-pink-500 text-white rounded-lg py-2 font-medium"
                >
                  <ExternalLink size={13} /> فتح رابط انستاباي
                </a>
                <button
                  type="button"
                  onClick={() => { try { navigator.clipboard.writeText(data.instapay_link); } catch {} }}
                  className="shrink-0 border border-neutral-300 dark:border-neutral-700 rounded-lg px-3"
                >
                  <Copy size={14} />
                </button>
              </div>
            </div>
          )}

          <label className="flex items-center justify-between gap-2 text-xs cursor-pointer border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2">
            <span className="flex items-center gap-1.5">
              <input type="checkbox" checked={sentGift} onChange={(e) => setSentGift(e.target.checked)} />
              {data.gift_label}
            </span>
            {sentGift && <CheckCircle2 size={14} className="text-emerald-500" />}
          </label>

          {sentGift && (
            <label className="flex items-center gap-2 text-[11px] text-neutral-600 dark:text-neutral-300 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 cursor-pointer">
              {receipt ? "صورة التحويل اتصورت — دوس لتغييرها" : "ارفع صورة إيصال التحويل"}
              <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setReceipt(await shrinkImage(f)); }} />
            </label>
          )}

          {msg && <p className="text-xs text-center text-red-500">{msg}</p>}
          <button onClick={submitGuestbook} disabled={submitting} className="w-full bg-pink-500 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
            {submitting ? "جاري الإرسال..." : "إرسال التهنئة"}
          </button>
        </Card>
      )}

      <Footer />
    </div>
  );
}
