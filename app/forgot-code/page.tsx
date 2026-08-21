"use client";
import { useState } from "react";
import { Mail } from "lucide-react";
import Footer from "@/components/Footer";

export default function ForgotCodePage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (name.trim().length < 2 || !email.trim()) {
      setError("اكتب اسمك وإيميلك");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/license/forgot-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "حصل خطأ"); setLoading(false); return; }
      setSent(true);
    } catch {
      setError("مفيش اتصال بالإنترنت، حاول تاني");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full flex flex-col justify-center max-w-sm mx-auto p-6 space-y-4">
      <div className="text-center space-y-1">
        <div className="w-14 h-14 rounded-full bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400 flex items-center justify-center mx-auto">
          <Mail size={24} />
        </div>
        <h1 className="text-lg font-bold">نسيت كود التفعيل؟</h1>
        <p className="text-sm text-neutral-400">
          اكتب اسمك والإيميل اللي سجله الأدمن ليك، ولو مطابقين هيوصلك الكود على إيميلك.
        </p>
      </div>

      {sent ? (
        <p className="text-sm text-center text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950 rounded-lg py-3 px-4">
          لو الاسم والإيميل مطابقين لعميل عنده كود لسه ماتفعّلش، هيوصله الكود على إيميله. راجع صندوق الوارد (والسبام).
        </p>
      ) : (
        <>
          <input
            placeholder="اسمك"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2.5 text-sm text-center"
          />
          <input
            type="email"
            placeholder="إيميلك"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !loading) submit(); }}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2.5 text-sm text-center"
          />

          {error && <p className="text-xs text-red-500 text-center">{error}</p>}

          <button
            disabled={loading || !name || !email}
            onClick={submit}
            className="w-full bg-orange-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-60"
          >
            {loading ? "جاري الإرسال..." : "ابعتلي الكود"}
          </button>
        </>
      )}

      <a href="/activate" className="text-xs text-neutral-400 underline text-center">
        عندك الكود بالفعل؟ روح صفحة التفعيل
      </a>

      <Footer />
    </div>
  );
}
