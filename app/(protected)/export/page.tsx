"use client";
import { useEffect, useState } from "react";
import Card from "@/components/Card";
import { fmt } from "@/lib/format";
import { FileDown, FileSpreadsheet } from "lucide-react";

interface Account { id: string; name: string; currency: string }
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

  useEffect(() => {
    fetch("/api/accounts").then((r) => r.json()).then((d) => setAccounts(d.accounts || []));
    fetch("/api/people").then((r) => r.json()).then((d) => setPeople((d.people || []).map((p: any) => ({ id: p.id, name: p.name }))));
  }, []);

  const inRange = (dateStr: string) => {
    if (from && dateStr < from) return false;
    if (to && dateStr > `${to}T23:59:59`) return false;
    return true;
  };

  const load = async () => {
    setLoading(true);
    if (mode === "account") {
      if (!accountId) { setLoading(false); return; }
      const acc = accounts.find((a) => a.id === accountId);
      setLabel(acc?.name || "");
      const params = new URLSearchParams({ account_id: accountId, limit: "1000" });
      if (from) params.set("from", from);
      if (to) params.set("to", `${to}T23:59:59`);
      const d = await fetch(`/api/transactions?${params}`).then((r) => r.json());
      setRows((d.transactions || []).map((t: any) => ({
        date: new Date(t.occurred_at).toLocaleDateString("ar-EG"),
        type: t.type,
        description: t.description || t.counterparty_name || "",
        amount: Number(t.amount),
        currency: t.currency,
      })));
    } else {
      if (!personId) { setLoading(false); return; }
      const person = people.find((p) => p.id === personId);
      setLabel(person?.name || "");
      const d = await fetch(`/api/debts?person_id=${personId}`).then((r) => r.json());
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
    const header = "التاريخ,النوع,الوصف,المبلغ,العملة\n";
    const body = rows.map((r) => `${r.date},${r.type},"${(r.description || "").replace(/"/g, '""')}",${r.amount},${r.currency}`).join("\n");
    downloadBlob("﻿" + header + body, `كشف-${label || "حساب"}.csv`, "text/csv;charset=utf-8;");
  };

  const exportPDF = async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Statement: ${label}`, 14, 16);
    doc.setFontSize(9);
    doc.text(`Range: ${from || "-"} to ${to || "-"}`, 14, 23);
    let y = 34;
    doc.setFontSize(10);
    doc.text("Date", 14, y);
    doc.text("Type", 50, y);
    doc.text("Description", 85, y);
    doc.text("Amount", 175, y);
    y += 6;
    for (const r of rows) {
      if (y > 280) { doc.addPage(); y = 20; }
      doc.text(String(r.date), 14, y);
      doc.text(String(r.type), 50, y);
      doc.text(String(r.description || "").slice(0, 40), 85, y);
      doc.text(`${r.amount} ${r.currency}`, 175, y);
      y += 6;
    }
    doc.save(`statement-${label || "account"}.pdf`);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">تصدير كشف حساب</h1>

      <div className="grid grid-cols-2 gap-2 bg-neutral-100 dark:bg-neutral-800 rounded-xl p-1">
        <button onClick={() => { setMode("account"); setRows([]); }} className={`py-2 rounded-lg text-sm font-medium ${mode === "account" ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>كشف حساب بنكي</button>
        <button onClick={() => { setMode("person"); setRows([]); }} className={`py-2 rounded-lg text-sm font-medium ${mode === "person" ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>كشف حساب شخص</button>
      </div>

      <Card className="space-y-2">
        {mode === "account" ? (
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm">
            <option value="">اختار الحساب</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
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

      {rows.length > 0 && (
        <>
          <div className="flex gap-2">
            <button onClick={exportCSV} className="flex-1 flex items-center justify-center gap-1 text-sm bg-neutral-800 dark:bg-neutral-700 text-white rounded-lg py-2">
              <FileSpreadsheet size={15} /> تصدير Excel
            </button>
            <button onClick={exportPDF} className="flex-1 flex items-center justify-center gap-1 text-sm bg-orange-600 text-white rounded-lg py-2">
              <FileDown size={15} /> تصدير PDF
            </button>
          </div>
          <div className="space-y-1.5">
            {rows.map((r, i) => (
              <Card key={i} className="flex items-center justify-between py-2 text-xs">
                <div>
                  <p className="font-medium">{r.description}</p>
                  <p className="text-neutral-400">{r.date} · {r.type}</p>
                </div>
                <p className="font-semibold">{fmt(Math.abs(r.amount), r.currency)}</p>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
