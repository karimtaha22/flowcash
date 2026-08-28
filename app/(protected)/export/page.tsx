"use client";
import { useEffect, useState } from "react";
import Card from "@/components/Card";
import { fmt } from "@/lib/format";
import { toEGP, fromEGP, type FxRates } from "@/lib/fx";
import { shareFile } from "@/lib/shareFile";
import { showExportError } from "@/lib/exportToast";
import { renderHtmlToCanvas, canvasToPdf } from "@/lib/pdfExport";
import { FileDown, FileSpreadsheet } from "lucide-react";

interface Account { id: string; name: string; currency: string; parent_account_id?: string | null; balance?: number }
interface Person { id: string; name: string }

function downloadBlob(content: BlobPart, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportPage() {
  const [mode, setMode] = useState<"account" | "person">("account");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [accountId, setAccountId] = useState("");
  const [personId, setPersonId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [baseCurrency, setBaseCurrency] = useState("EGP");
  const [rates, setRates] = useState<FxRates | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [familyAccounts, setFamilyAccounts] = useState<Account[]>([]);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    fetch("/api/accounts").then((r) => r.json()).then((d) => setAccounts(d.accounts || []));
    fetch("/api/people").then((r) => r.json()).then((d) => setPeople((d.people || []).map((p: any) => ({ id: p.id, name: p.name }))));
    fetch("/api/me").then((r) => r.json()).then((d) => setBaseCurrency(d.user?.base_currency || "EGP"));
    fetch("/api/fx").then((r) => r.json()).then((d) => setRates(d.rates || null));
  }, []);

  // convert an amount in `currency` into the user's base currency, for
  // display alongside statement rows/totals when the two differ.
  const toBase = (amount: number, currency: string) => {
    if (!rates || currency === baseCurrency) return null;
    return fromEGP(toEGP(amount, currency, rates), baseCurrency, rates);
  };

  const inRange = (dateStr: string) => {
    if (from && dateStr < from) return false;
    if (to && dateStr > `${to}T23:59:59`) return false;
    return true;
  };

  const load = async () => {
    setLoading(true);
    setHasSearched(true);
    if (mode === "account") {
      if (!accountId) { setLoading(false); return; }
      const acc = accounts.find((a) => a.id === accountId);
      // a statement is per "account family", not per single row: pick the
      // main account (the selected one, or its parent if a sub was picked)
      // and roll its sub-accounts' transactions into the same statement.
      const mainId = acc?.parent_account_id || accountId;
      const main = accounts.find((a) => a.id === mainId);
      const subs = accounts.filter((a) => a.parent_account_id === mainId);
      const familyIds = [mainId, ...subs.map((s) => s.id)];
      setFamilyAccounts([main, ...subs].filter(Boolean) as Account[]);
      setLabel(subs.length ? `${main?.name || acc?.name || ""} (شامل الحسابات الفرعية)` : acc?.name || "");
      const params = new URLSearchParams({ account_id: familyIds.join(","), limit: "1000" });
      if (from) params.set("from", from);
      if (to) params.set("to", `${to}T23:59:59`);
      const d = await fetch(`/api/transactions?${params}`).then((r) => r.json());
      setRows((d.transactions || []).map((t: any) => ({
        date: new Date(t.occurred_at).toLocaleDateString("ar-EG"),
        type: t.type,
        description: t.description || t.counterparty_name || "",
        account: t.accounts?.name || "",
        amount: Number(t.amount),
        currency: t.currency,
      })));
    } else {
      setFamilyAccounts([]);
      if (!personId) { setLoading(false); return; }
      const person = people.find((p) => p.id === personId);
      setLabel(person?.name || "");
      // Round 48 — GET /api/debts بقى بيستبعد الديون المؤرشفة (المسددة)
      // افتراضيًا (راجع تعليق الراوت). كشف حساب الشخص هنا تاريخي بطبيعته —
      // لازم يفضل يشمل الديون المسددة القديمة كمان، فبنمرر ?archived=all
      // صراحة عشان ميختفوش من الكشف.
      const d = await fetch(`/api/debts?person_id=${personId}&archived=all`).then((r) => r.json());
      const flat: any[] = [];
      for (const debt of d.debts || []) {
        flat.push({
          date: new Date(debt.created_at).toLocaleDateString("ar-EG"),
          type: debt.direction === "owed_to_me" ? "دين مستحق لي" : "دين مستحق عليّ",
          description: debt.title,
          amount: Number(debt.original_amount),
          currency: debt.currency,
        });
        for (const p of debt.debt_payments || []) {
          const iso = p.paid_at?.slice(0, 10);
          if (!inRange(iso)) continue;
          flat.push({
            date: new Date(p.paid_at).toLocaleDateString("ar-EG"),
            type: "سداد",
            description: `سداد جزئي — ${debt.title}`,
            amount: -Number(p.amount),
            currency: debt.currency,
          });
        }
      }
      setRows(flat);
    }
    setLoading(false);
  };

  const exportCSV = () => {
    const header = `التاريخ,النوع,الوصف,المبلغ,العملة,ما يعادلها بـ ${baseCurrency}\n`;
    const body = rows
      .map((r) => {
        const eq = toBase(Math.abs(r.amount), r.currency);
        return `${r.date},${r.type},"${(r.description || "").replace(/"/g, '""')}",${r.amount},${r.currency},${eq !== null ? eq.toFixed(2) : ""}`;
      })
      .join("\n");
    downloadBlob("﻿" + header + body, `كشف-${label || "حساب"}.csv`, "text/csv;charset=utf-8;");
  };

  // jsPDF's built-in fonts can't shape/render Arabic at all — doc.text()
  // with Arabic input came out completely garbled. Same fix used for
  // debt/gam3eya exports: build the statement as a styled, off-screen HTML
  // table (Cairo font, RTL) and rasterize it with html2canvas-pro, then wrap
  // the resulting image in a jsPDF sized to match — this sidesteps jsPDF's
  // text-shaping entirely, so Arabic renders exactly as the browser drew it.
  const exportPDF = async () => {
    // Round 47 — "كل التصدير PDF بايظ في جميع البرنامج": الدالة دي كانت من
    // غير أي try/catch خالص — أي استثناء (شبكة، مشاركة، إلخ) كان بيبقى
    // unhandled promise rejection بصمت تمامًا، وده أرجح سبب حقيقي وراء بلاغ
    // "صامت" العام (كشف الحساب استخدام شائع جدًا). دلوقتي زي كل تصدير تاني.
    // Round 48 — بناء العنصر المخفي + الالتقاط + تحويله لـPDF مضغوط بقى
    // كله جوه lib/pdfExport.ts (نفس النقطة المشتركة لكل تصديرات التطبيق —
    // راجع تعليق الملف نفسه لتفاصيل سبب "الصندوق الفاضي" وإصلاحه).
    setExportingPdf(true);
    try {
      const rowsHtml = rows
        .map((r) => {
          const eq = toBase(Math.abs(r.amount), r.currency);
          const desc = String(r.description || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          return `
          <tr>
            <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:11px;white-space:nowrap;">${r.date}</td>
            <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:11px;white-space:nowrap;">${r.type}${r.account ? " · " + r.account : ""}</td>
            <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:11px;">${desc}</td>
            <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:11px;font-weight:600;white-space:nowrap;">${fmt(Math.abs(r.amount), r.currency)}</td>
            <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:10px;color:#9ca3af;white-space:nowrap;">${eq !== null ? "≈ " + fmt(eq, baseCurrency) : ""}</td>
          </tr>`;
        })
        .join("");
      const html = `
      <div style="text-align:center;margin-bottom:16px;">
        <p style="font-size:12px;color:#ea580c;font-weight:700;">FlowCash</p>
        <h2 style="font-size:17px;margin:6px 0 2px;">كشف حساب${label ? " — " + label : ""}</h2>
        <p style="font-size:11px;color:#6b7280;margin:0;">${from || to ? `الفترة: ${from || "البداية"} إلى ${to || "الآن"}` : "كل الفترة"}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:6px 4px;font-size:11px;text-align:right;">التاريخ</th>
            <th style="padding:6px 4px;font-size:11px;text-align:right;">النوع</th>
            <th style="padding:6px 4px;font-size:11px;text-align:right;">الوصف</th>
            <th style="padding:6px 4px;font-size:11px;text-align:right;">المبلغ</th>
            <th style="padding:6px 4px;font-size:11px;text-align:right;">≈ ${baseCurrency}</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div style="border-top:1px solid #e5e7eb;margin-top:16px;padding-top:10px;text-align:center;">
        <img src="/icons/icon-192.png" style="width:28px;height:28px;border-radius:6px;margin-bottom:4px;" />
        <p style="font-size:10px;color:#9ca3af;margin:0;">تم الإنشاء بواسطة FlowCash — ${new Date().toLocaleDateString("ar-EG")}</p>
        <p style="font-size:9px;color:#d1d5db;margin:2px 0 0;">© 2022–2026 IDEA-EG · www.ideaeg.online</p>
      </div>
    `;
      const canvas = await renderHtmlToCanvas(html, 700);
      const pdf = await canvasToPdf(canvas);
      const pdfDataUrl = pdf.output("dataurlstring");
      await shareFile(pdfDataUrl, `كشف-${label || "حساب"}.pdf`, "application/pdf");
    } catch (e: any) {
      showExportError(e?.message ? `حصل خطأ في التصدير: ${e.message}` : "حصل خطأ في التصدير");
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">تصدير كشف حساب</h1>

      <div className="grid grid-cols-2 gap-2 bg-neutral-100 dark:bg-neutral-800 rounded-xl p-1">
        <button onClick={() => { setMode("account"); setRows([]); setHasSearched(false); setFamilyAccounts([]); }} className={`py-2 rounded-lg text-sm font-medium ${mode === "account" ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>كشف حساب بنكي</button>
        <button onClick={() => { setMode("person"); setRows([]); setHasSearched(false); setFamilyAccounts([]); }} className={`py-2 rounded-lg text-sm font-medium ${mode === "person" ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>كشف حساب شخص</button>
      </div>

      <Card className="space-y-2">
        {mode === "account" ? (
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
            <option value="">اختار الحساب</option>
            {/* show every account (بما فيها الحسابات الفرعية والعملات غير الجنيه) —
                subs are indented under their parent so they're clearly visible and selectable. */}
            {accounts.filter((a) => !a.parent_account_id).map((a) => (
              <optgroup key={a.id} label={`${a.name} (${a.currency})`}>
                <option value={a.id}>{a.name} — {a.currency}</option>
                {accounts.filter((s) => s.parent_account_id === a.id).map((s) => (
                  <option key={s.id} value={s.id}>&nbsp;&nbsp;└ {s.name} — {s.currency}</option>
                ))}
              </optgroup>
            ))}
          </select>
        ) : (
          <select value={personId} onChange={(e) => setPersonId(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
            <option value="">اختار الشخص</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
        </div>
        <button onClick={load} disabled={loading} className="w-full bg-orange-600 text-white rounded-lg py-2 text-sm font-medium">
          {loading ? "جاري التحميل..." : "عرض الكشف"}
        </button>
      </Card>

      {hasSearched && !loading && rows.length === 0 && (
        <Card className="text-center text-sm text-neutral-400 space-y-3">
          <p>
            لا يوجد معاملات في {mode === "account" ? "الحساب" : "سجل الشخص"} ده{from || to ? " خلال الفترة المحددة" : ""} — الكشف مش فاضي بسبب خطأ، ده معناه إنه فعلاً لسه مفيش حركات مسجلة عليه.
          </p>
          {mode === "account" && familyAccounts.length > 0 && (
            <div className="border-t border-neutral-100 dark:border-neutral-800 pt-3 space-y-1.5 text-right">
              <p className="text-xs text-neutral-500 font-medium">الرصيد الحالي مسجل على الحساب، بس من غير حركات:</p>
              {familyAccounts.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-xs">
                  <span>{a.name}</span>
                  <span className="font-semibold text-neutral-700 dark:text-neutral-300">{fmt(Number(a.balance) || 0, a.currency)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {rows.length > 0 && (
        <>
          {mode === "account" && familyAccounts.length > 0 && (
            <Card className="!py-2.5 space-y-1">
              <p className="text-[11px] text-neutral-500 font-medium">الرصيد الحالي</p>
              {familyAccounts.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-xs">
                  <span className="text-neutral-500">{a.name}</span>
                  <span className="font-semibold">{fmt(Number(a.balance) || 0, a.currency)}</span>
                </div>
              ))}
            </Card>
          )}
          <div className="flex gap-2">
            <button onClick={exportCSV} className="flex-1 flex items-center justify-center gap-1 text-sm bg-neutral-800 dark:bg-neutral-700 text-white rounded-lg py-2">
              <FileSpreadsheet size={15} /> تصدير Excel
            </button>
            <button disabled={exportingPdf} onClick={exportPDF} className="flex-1 flex items-center justify-center gap-1 text-sm bg-orange-600 text-white rounded-lg py-2 disabled:opacity-60">
              <FileDown size={15} /> {exportingPdf ? "جاري التصدير..." : "تصدير PDF"}
            </button>
          </div>
          <div className="space-y-1.5">
            {rows.map((r, i) => {
              const eq = toBase(Math.abs(r.amount), r.currency);
              return (
                <Card key={i} className="flex items-center justify-between py-2 text-xs">
                  <div>
                    <p className="font-medium">{r.description}</p>
                    <p className="text-neutral-400">{r.date} · {r.type}{r.account ? ` · ${r.account}` : ""}</p>
                  </div>
                  <div className="text-left shrink-0">
                    <p className="font-semibold">{fmt(Math.abs(r.amount), r.currency)}</p>
                    {eq !== null && <p className="text-[10px] text-neutral-400">≈ {fmt(eq, baseCurrency)}</p>}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
