"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import Footer from "@/components/Footer";

export default function ActivatePage() {
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const submit = async () => {
    setError("");
    if (pin !== pin2) { setError("الـ PIN مش متطابق"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/license/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, pin }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "حصل خطأ"); setLoading(false); return; }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("مفيش اتصال بالإنترنت، حاول تاني");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full flex flex-col justify-center max-w-sm mx-auto p-6 space-y-4">
      <div className="text-center space-y-1">
        <div className="w-14 h-14 rounded-full bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400 flex items-center justify-center mx-auto">
          <KeyRound size={24} />
        </div>
        <h1 className="text-lg font-bold">تفعيل حسابك</h1>
        <p className="text-sm text-neutral-400">اكتب كود التفعيل اللي وصلك، واختار PIN خاص بيك للدخول بيه بعد كده.</p>
      </div>

      <input
        placeholder="كود التفعيل (مثال: IDEA-XXXXXXXX)"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2.5 text-sm text-center tracking-wider"
      />
      <input
        type="password"
        inputMode="numeric"
        placeholder="اختار PIN (٤ أرقام على الأقل)"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2.5 text-sm text-center"
      />
      <input
        type="password"
        inputMode="numeric"
        placeholder="أعد كتابة الـ PIN"
        value={pin2}
        onChange={(e) => setPin2(e.target.value)}
        className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2.5 text-sm text-center"
      />

      {error && <p className="text-xs text-red-500 text-center">{error}</p>}

      <button
        disabled={loading || !code || pin.length < 4}
        onClick={submit}
        className="w-full bg-orange-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-60"
      >
        {loading ? "جاري التفعيل..." : "فعّل حسابك"}
      </button>

      <Footer />
    </div>
  );
}
