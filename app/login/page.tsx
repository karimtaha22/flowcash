"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Footer from "@/components/Footer";
import { Fingerprint } from "lucide-react";

interface U {
  id: string;
  name: string;
  is_family: boolean;
  has_webauthn?: boolean;
}

export default function LoginPage() {
  const [hasUsers, setHasUsers] = useState<boolean | null>(null);
  const [nameQuery, setNameQuery] = useState("");
  const [users, setUsers] = useState<U[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<U | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [bioSupported, setBioSupported] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Only checks whether ANY account exists yet (for the first-run "go set
    // up /admin" message) — never lists customer names to an unauthenticated
    // visitor. The visitor types their own name below instead.
    fetch("/api/auth/exists")
      .then((r) => r.json())
      .then((d) => setHasUsers(!!d.hasUsers));
    setBioSupported(typeof window !== "undefined" && !!window.PublicKeyCredential);
  }, []);

  const searchByName = async () => {
    if (nameQuery.trim().length < 2) { setError("اكتب اسمك (حرفين على الأقل)"); return; }
    setSearching(true);
    setError("");
    try {
      const res = await fetch("/api/auth/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameQuery.trim() }),
      });
      const data = await res.json();
      setSearched(true);
      if (!res.ok) { setError(data.error || "حصل خطأ"); setUsers([]); return; }
      setUsers(data.users || []);
    } finally {
      setSearching(false);
    }
  };

  const submitBiometric = async () => {
    if (!selected) return;
    setLoading(true);
    setError("");
    try {
      const { startAuthentication } = await import("@simplewebauthn/browser");
      const optRes = await fetch("/api/webauthn/login-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selected.id }),
      });
      const optData = await optRes.json();
      if (!optRes.ok) { setError(optData.error || "مفيش بصمة مسجلة"); setLoading(false); return; }
      const response = await startAuthentication({ optionsJSON: optData.options });
      const verifyRes = await fetch("/api/webauthn/login-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) { setError(verifyData.error || "فشل الدخول بالبصمة"); setLoading(false); return; }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("اتلغت البصمة أو حصلت مشكلة، جرب الـ PIN");
      setLoading(false);
    }
  };

  const submit = async () => {
    if (!selected) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selected.id, pin }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "خطأ");
      setPin("");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  };

  // No fixed-length auto-submit: PINs can be 4-8 digits (set freely in /admin), so
  // guessing a length here would submit a truncated PIN and always fail. The user
  // submits explicitly (Enter key or the button below).

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 bg-gradient-to-b from-orange-50 to-white dark:from-neutral-950 dark:to-neutral-900">
      <div className="text-center">
        <div className="text-4xl mb-2">💰</div>
        <h1 className="text-2xl font-bold text-orange-700 dark:text-orange-400">FlowCash</h1>
        <p className="text-neutral-500 text-sm mt-1">إدارة الحسابات الشخصية</p>
      </div>

      {!selected ? (
        <div className="w-full max-w-xs space-y-2">
          {hasUsers === false && (
            <p className="text-center text-sm text-neutral-500">
              لسه مفيش مستخدمين. روح صفحة{" "}
              <a href="/admin" className="text-orange-600 underline">
                الإعداد /admin
              </a>{" "}
              وضيف نفسك.
            </p>
          )}
          {hasUsers !== false && (
            <>
              <div className="flex gap-2">
                <input
                  autoFocus
                  placeholder="اكتب اسمك"
                  value={nameQuery}
                  onChange={(e) => { setNameQuery(e.target.value); setSearched(false); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && !searching) searchByName(); }}
                  className="flex-1 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <button
                  onClick={searchByName}
                  disabled={searching}
                  className="bg-orange-600 disabled:opacity-40 text-white rounded-xl px-4 text-sm font-medium"
                >
                  {searching ? "..." : "دخول"}
                </button>
              </div>
              {error && <p className="text-sm text-red-500 text-center">{error}</p>}
              {searched && users.length === 0 && !error && (
                <p className="text-center text-sm text-neutral-500">مفيش حساب بالاسم ده. تأكد من الاسم أو تواصل مع فريق الدعم.</p>
              )}
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setSelected(u)}
                  className="w-full flex items-center gap-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3 shadow-sm hover:border-orange-400 transition"
                >
                  <div className="w-9 h-9 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center text-orange-700 dark:text-orange-300 font-bold">
                    {u.name[0]}
                  </div>
                  <span className="font-medium">{u.name}</span>
                  {u.is_family && <span className="ms-auto text-xs text-neutral-400">عائلة</span>}
                </button>
              ))}
            </>
          )}
        </div>
      ) : (
        <div className="w-full max-w-xs flex flex-col items-center gap-4">
          <p className="text-sm text-neutral-500">
            أهلاً {selected.name} — ادخل الـ PIN
          </p>
          <input
            autoFocus
            type="password"
            inputMode="numeric"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter" && pin.length >= 4 && !loading) submit(); }}
            className="w-40 text-center text-2xl tracking-[0.5em] rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <button
            onClick={submit}
            disabled={pin.length < 4 || loading}
            className="w-40 bg-orange-600 disabled:opacity-40 text-white rounded-xl py-2.5 text-sm font-medium"
          >
            {loading ? "جاري الدخول..." : "دخول"}
          </button>
          {bioSupported && selected.has_webauthn && (
            <button
              onClick={submitBiometric}
              disabled={loading}
              className="w-40 flex items-center justify-center gap-2 border border-orange-300 dark:border-orange-800 text-orange-600 dark:text-orange-400 rounded-xl py-2.5 text-sm font-medium"
            >
              <Fingerprint size={16} /> دخول بالبصمة
            </button>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button onClick={() => { setSelected(null); setPin(""); setError(""); }} className="text-xs text-neutral-400 underline">
            رجوع
          </button>
        </div>
      )}
      <Footer />
    </div>
  );
}
