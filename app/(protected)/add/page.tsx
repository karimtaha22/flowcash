"use client";
import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Card from "@/components/Card";
import { fmt } from "@/lib/format";
import { toEGP, fromEGP, type FxRates } from "@/lib/fx";
import { shrinkImage } from "@/lib/image";
import { Camera, Loader2, AlertTriangle } from "lucide-react";
import Link from "next/link";

const TYPES = [
  { key: "expense", label: "💸 مصروف" },
  { key: "withdrawal", label: "🏧 سحب" },
  { key: "income", label: "💰 دخل" },
  { key: "transfer", label: "🔁 تحويل" },
];

const CURRENCIES = ["EGP", "USD", "SAR"];

interface Account { id: string; name: string; currency: string; balance: number }
interface Tx { id: string; type: string; amount: number; currency: string; description: string | null; occurred_at: string; counterparty_name: string | null; accounts?: { name: string } }

function AddForm() {
  const params = useSearchParams();
  const router = useRouter();
  const [type, setType] = useState(params.get("type") || "expense");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [history, setHistory] = useState<Tx[]>([]);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [currency, setCurrency] = useState("");
  const [splitDebt, setSplitDebt] = useState(false);
  const [splitAmount, setSplitAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [accountsLoaded, setAccountsLoaded] = useState(false);
  const [accountsLoadError, setAccountsLoadError] = useState("");

  // categories
  const [categories, setCategories] = useState<{ id: string; name: string; icon: string; kind: string }[]>([]);
  const [categoryId, setCategoryId] = useState("");

  // "العزومة" — split a bill evenly across a group, with per-person overrides + WhatsApp share
  interface SplitPerson { name: string; phone: string; amount: string; edited: boolean }
  const [groupSplit, setGroupSplit] = useState(false);
  const [splitCount, setSplitCount] = useState("2");
  const [splitPeople, setSplitPeople] = useState<SplitPerson[]>([{ name: "", phone: "", amount: "", edited: false }]);

  // travel mode: live-convert whatever currency is selected into the user's base currency
  const [travelMode, setTravelMode] = useState(false);
  const [baseCurrency, setBaseCurrency] = useState("EGP");
  const [rates, setRates] = useState<FxRates | null>(null);

  // receipt OCR
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [receiptDataUrl, setReceiptDataUrl] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrMsg, setOcrMsg] = useState("");

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => setAccounts(d.accounts || []))
      .catch(() => setAccountsLoadError("مقدرناش نجيب حساباتك من السيرفر. جرب تسجل خروج وتدخل تاني، ولو استمرت المشكلة كلم الدعم."))
      .finally(() => setAccountsLoaded(true));
    fetch("/api/me").then((r) => r.json()).then((d) => {
      if (d.user) { setTravelMode(!!d.user.travel_mode); setBaseCurrency(d.user.base_currency || "EGP"); }
    });
    fetch("/api/fx").then((r) => r.json()).then((d) => setRates(d.rates || null));
    fetch("/api/categories").then((r) => r.json()).then((d) => setCategories(d.categories || []));
  }, []);

  // recompute the group-split shares whenever the bill amount, person count, or a
  // manual override changes. Anyone not manually edited splits the remaining pool evenly;
  // "نصيبك" (your own share) is whatever's left after everyone else's row.
  useEffect(() => {
    if (!groupSplit) return;
    const count = Math.max(2, parseInt(splitCount) || 2);
    const othersCount = count - 1;
    setSplitPeople((prev) => {
      const next = Array.from({ length: othersCount }, (_, i) => prev[i] || { name: "", phone: "", amount: "", edited: false });
      const total = parseFloat(amount) || 0;
      const editedSum = next.filter((p) => p.edited).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      const uneditedCount = next.filter((p) => !p.edited).length + 1; // +1 = your own share
      const base = uneditedCount > 0 ? (total - editedSum) / uneditedCount : 0;
      return next.map((p) => (p.edited ? p : { ...p, amount: base > 0 ? base.toFixed(2) : "0" }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitCount, amount, groupSplit]);

  const yourShare = (() => {
    const total = parseFloat(amount) || 0;
    const othersSum = splitPeople.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    return Math.max(total - othersSum, 0);
  })();

  const updatePersonAmount = (idx: number, val: string) => {
    setSplitPeople((prev) => prev.map((p, i) => (i === idx ? { ...p, amount: val, edited: true } : p)));
  };
  const updatePersonField = (idx: number, field: "name" | "phone", val: string) => {
    setSplitPeople((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: val } : p)));
  };

  const whatsappShareLink = (p: SplitPerson) => {
    if (!p.phone) return null;
    const digits = p.phone.replace(/\D/g, "");
    const billName = description || "الفاتورة";
    const lines = [
      `فاتورة: ${billName}`,
      `الإجمالي: ${amount} ${currency || "EGP"}`,
      `نصيبك: ${p.amount} ${currency || "EGP"}`,
      "",
      "تفاصيل القسمة:",
      `أنا: ${yourShare.toFixed(2)}`,
      ...splitPeople.map((sp) => `${sp.name || "شخص"}: ${sp.amount}`),
    ];
    return `https://wa.me/${digits}?text=${encodeURIComponent(lines.join("\n"))}`;
  };

  const loadHistory = () => {
    fetch(`/api/transactions?type=${type}&limit=15`).then((r) => r.json()).then((d) => setHistory(d.transactions || []));
  };
  useEffect(() => { loadHistory(); }, [type]);

  useEffect(() => {
    const acc = accounts.find((a) => a.id === accountId);
    if (acc) setCurrency(acc.currency);
  }, [accountId, accounts]);

  const reset = () => {
    setAmount(""); setDescription(""); setAccountId(""); setToAccountId(""); setCounterparty(""); setSplitDebt(false); setSplitAmount("");
    setReceiptDataUrl(null); setOcrMsg(""); setCategoryId("");
    setGroupSplit(false); setSplitCount("2"); setSplitPeople([{ name: "", phone: "", amount: "", edited: false }]);
  };

  const submitSimple = async () => {
    setSaving(true);
    setSaveError("");
    const body: any = { type, amount: parseFloat(amount), account_id: accountId, description, counterparty_name: counterparty, currency: currency || undefined };
    if (type === "transfer") body.to_account_id = toAccountId;
    if ((type === "expense" || type === "income") && categoryId) body.category_id = categoryId;
    if (type === "expense" && splitDebt && splitAmount && !groupSplit) {
      body.split_debt_amount = parseFloat(splitAmount);
      body.split_personal_amount = parseFloat(amount) - parseFloat(splitAmount);
    }
    if (type === "expense" && groupSplit) {
      const validPeople = splitPeople.filter((p) => p.name.trim() && parseFloat(p.amount) > 0);
      body.split_personal_amount = yourShare;
      body.split_debt_amount = validPeople.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
      body.shares = validPeople.map((p) => ({ name: p.name.trim(), phone: p.phone.trim() || null, amount: parseFloat(p.amount), is_debt: true }));
    }
    if (receiptDataUrl) body.receipt_url = receiptDataUrl;
    try {
      const res = await fetch("/api/transactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(data.error || "حصل خطأ ومتحفظتش الحركة، حاول تاني");
      } else {
        setDone(true); reset(); loadHistory(); setTimeout(() => setDone(false), 1800);
      }
    } catch {
      setSaveError("مفيش اتصال بالإنترنت، حاول تاني");
    } finally {
      setSaving(false);
    }
  };

  const typeLabel: Record<string, string> = { expense: "مصروف", withdrawal: "سحب", income: "دخل", transfer: "تحويل" };

  const scanReceipt = async (file: File) => {
    setOcrBusy(true);
    setOcrMsg("جاري قراءة الإيصال...");
    try {
      const dataUrl = await shrinkImage(file);
      setReceiptDataUrl(dataUrl);

      const Tesseract = await import("tesseract.js");
      const { data } = await Tesseract.recognize(dataUrl, "eng");
      const text = data.text || "";
      // pick the largest plausible money-looking number in the OCR text
      const matches = Array.from(text.matchAll(/\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?/g)).map((m) => m[0]);
      const nums = matches
        .map((m) => parseFloat(m.replace(/,/g, "")))
        .filter((n) => !isNaN(n) && n > 0);
      if (nums.length) {
        const guess = Math.max(...nums);
        setAmount(String(guess));
        setOcrMsg(`المبلغ المقترح: ${guess} — راجعه قبل الحفظ`);
      } else {
        setOcrMsg("مقدرتش أقرا مبلغ واضح من الإيصال، اكتبه يدوي.");
      }
    } catch {
      setOcrMsg("حصلت مشكلة في قراءة الإيصال، اكتب المبلغ يدوي.");
    } finally {
      setOcrBusy(false);
    }
  };

  const convertedPreview = (() => {
    if (!travelMode || !rates || !amount || !currency || currency === baseCurrency) return null;
    const inEGP = toEGP(parseFloat(amount), currency, rates);
    const inBase = fromEGP(inEGP, baseCurrency, rates);
    return `≈ ${fmt(inBase, baseCurrency)}`;
  })();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">إضافة حركة</h1>

      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <button
            key={t.key}
            onClick={() => { setType(t.key); router.replace(`/add?type=${t.key}`); reset(); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${type === t.key ? "bg-orange-600 text-white border-orange-600" : "border-neutral-300 dark:border-neutral-700"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {done && <Card className="bg-orange-50 dark:bg-orange-950 border-orange-300 text-orange-700 dark:text-orange-300 text-center text-sm">تم الحفظ ✅</Card>}
      {saveError && <Card className="bg-red-50 dark:bg-red-950 border-red-300 text-red-600 dark:text-red-400 text-center text-sm">{saveError}</Card>}

      {accountsLoadError && (
        <Card className="bg-red-50 dark:bg-red-950 border-red-300 text-red-600 dark:text-red-400 text-sm flex items-start gap-2">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <span>{accountsLoadError}</span>
        </Card>
      )}
      {accountsLoaded && !accountsLoadError && accounts.length === 0 && (
        <Card className="bg-orange-50 dark:bg-orange-950 border-orange-300 text-orange-700 dark:text-orange-300 text-sm space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <span>لسه معملتش أي حساب — لازم تضيف حساب واحد على الأقل الأول عشان تقدر تسجل أي حركة.</span>
          </div>
          <Link href="/accounts" className="block text-center bg-orange-600 text-white rounded-lg py-2 text-sm font-medium">
            ضيف حساب دلوقتي
          </Link>
        </Card>
      )}

      <Card className="space-y-3">
        {type === "expense" && (
          <div className="flex justify-end">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) scanReceipt(f); }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={ocrBusy}
              className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-900 rounded-full px-3 py-1"
            >
              {ocrBusy ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
              {ocrBusy ? "بيقرا..." : "صوّر الإيصال"}
            </button>
          </div>
        )}
        {ocrMsg && <p className="text-[11px] text-center text-orange-600 dark:text-orange-400">{ocrMsg}</p>}
        {receiptDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={receiptDataUrl} alt="الإيصال" className="w-full max-h-32 object-contain rounded-lg border border-neutral-200 dark:border-neutral-800" />
        )}

        <input
          autoFocus
          type="number"
          placeholder="المبلغ"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full text-2xl font-bold text-center rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-3"
        />
        {convertedPreview && <p className="text-center text-xs text-neutral-400 -mt-2">{convertedPreview}</p>}

        {type === "expense" && (
          <>
            <input placeholder="وصف المصروف" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
              <option value="">التصنيف (اختياري)</option>
              {categories.filter((c) => c.kind === "expense").map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </>
        )}
        {type === "income" && (
          <>
            <input placeholder="مصدر الدخل (اختياري)" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
              <option value="">التصنيف (اختياري)</option>
              {categories.filter((c) => c.kind === "income").map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </>
        )}
        {type === "transfer" && (
          <input placeholder="التحويل إلى (اسم، اختياري إذا كان تحويلاً داخلياً)" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
        )}

        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
          <option value="">{type === "income" ? "إلى أي حساب؟" : "من أي حساب؟"}</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name} — {a.balance} {a.currency}</option>
          ))}
        </select>

        {type === "income" && (
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
            <option value="">عملة المبلغ الوارد</option>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        {type === "transfer" && (
          <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
            <option value="">إلى أي حساب؟ (تحويل بين حساباتك)</option>
            {accounts.filter((a) => a.id !== accountId).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}

        {type === "expense" && !groupSplit && (
          <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-2 space-y-2">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={splitDebt} onChange={(e) => setSplitDebt(e.target.checked)} />
              قسّم المصروف — جزء دين على حد؟
            </label>
            {splitDebt && (
              <input type="number" placeholder="مقدار حصة الطرف الآخر (سيُسجَّل كدين لك)" value={splitAmount} onChange={(e) => setSplitAmount(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
            )}
          </div>
        )}

        {type === "expense" && !splitDebt && (
          <div className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-3 space-y-3">
            <label className="flex items-center gap-2 text-xs font-medium">
              <input type="checkbox" checked={groupSplit} onChange={(e) => setGroupSplit(e.target.checked)} />
              🎉 عزومة — قسّم الفاتورة على مجموعة؟
            </label>
            {groupSplit && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-neutral-500 shrink-0">كام فرد (وأنت منهم)؟</span>
                  <input
                    type="number"
                    min={2}
                    value={splitCount}
                    onChange={(e) => setSplitCount(e.target.value)}
                    className="w-20 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-sm text-center"
                  />
                </div>

                <div className="rounded-lg bg-orange-50 dark:bg-orange-950 px-3 py-2 text-xs text-orange-700 dark:text-orange-300 flex justify-between">
                  <span>نصيبك (بعد تعديل الباقي)</span>
                  <span className="font-bold">{fmt(yourShare, currency || "EGP")}</span>
                </div>

                {splitPeople.map((p, i) => {
                  const link = whatsappShareLink(p);
                  return (
                    <div key={i} className="space-y-1.5 border-t border-neutral-100 dark:border-neutral-800 pt-2">
                      <div className="flex gap-2">
                        <input
                          placeholder={`اسم الشخص ${i + 1}`}
                          value={p.name}
                          onChange={(e) => updatePersonField(i, "name", e.target.value)}
                          className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-xs"
                        />
                        <input
                          type="tel"
                          placeholder="رقم موبايل (لواتساب)"
                          value={p.phone}
                          onChange={(e) => updatePersonField(i, "phone", e.target.value)}
                          className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-xs"
                        />
                      </div>
                      <div className="flex gap-2 items-center">
                        <input
                          type="number"
                          placeholder="نصيبه"
                          value={p.amount}
                          onChange={(e) => updatePersonAmount(i, e.target.value)}
                          className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-xs"
                        />
                        {link ? (
                          <a href={link} target="_blank" rel="noopener noreferrer" className="shrink-0 bg-green-500 text-white rounded-lg px-3 py-1.5 text-xs">
                            واتساب
                          </a>
                        ) : (
                          <span className="shrink-0 text-[10px] text-neutral-400 px-2">ضيف رقم للمشاركة</span>
                        )}
                      </div>
                    </div>
                  );
                })}
                <p className="text-[11px] text-neutral-400">
                  نصيب أي حد اتعدل يدويًا بيتخصم من الباقي، وباقي الناس (وأنت) بيقسموا اللي فاضل بالتساوي. كل نصيب هيتسجل كدين مستحق لك على الشخص ده.
                </p>
              </div>
            )}
          </div>
        )}

        <button disabled={saving || !amount || !accountId} onClick={submitSimple} className="w-full bg-orange-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40">
          {saving ? "جاري الحفظ..." : "حفظ الحركة"}
        </button>
        {!saving && (!amount || !accountId) && accounts.length > 0 && (
          <p className="text-[11px] text-center text-neutral-400">
            {!amount ? "اكتب المبلغ الأول" : "اختار الحساب الأول"} عشان تقدر تحفظ
          </p>
        )}
      </Card>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">آخر حركات {typeLabel[type]}</p>
        {history.length === 0 && <p className="text-center text-sm text-neutral-400 py-4">لا توجد حركات {typeLabel[type]} بعد.</p>}
        {history.map((t) => (
          <Card key={t.id} className="flex items-center justify-between py-2.5">
            <div className="min-w-0">
              <p className="text-sm truncate">{t.description || t.counterparty_name || typeLabel[t.type]}</p>
              <p className="text-[11px] text-neutral-400">{t.accounts?.name} · {new Date(t.occurred_at).toLocaleDateString("ar-EG")}</p>
            </div>
            <p className="font-semibold text-sm shrink-0">{fmt(Math.abs(Number(t.amount)), t.currency)}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function AddPage() {
  return (
    <Suspense fallback={null}>
      <AddForm />
    </Suspense>
  );
}
