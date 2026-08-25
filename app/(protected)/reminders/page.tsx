"use client";
import { useEffect, useRef, useState } from "react";
import Card from "@/components/Card";
import Switch from "@/components/Switch";
import { shrinkImage } from "@/lib/image";
import { shareFile } from "@/lib/shareFile";
import { MEAL_TIMING_LABELS, MEDICATION_FORM_LABELS, SCHEDULE_TYPE_LABELS } from "@/lib/medicationSchedule";
import { Trash2, Camera, Loader2, Sparkles, FileDown, CheckCircle2, Pill, Pencil, X } from "lucide-react";

type Tab = "grocery" | "general" | "medications" | "utility";

const inputCls = "w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm";
const btnPrimary = "bg-orange-500 hover:bg-orange-600 text-white rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50";
const btnGhost = "border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 text-sm";

export default function RemindersPage() {
  const [tab, setTab] = useState<Tab>("grocery");
  const tabs: { key: Tab; label: string }[] = [
    { key: "grocery", label: "🛒 سوبر ماركت" },
    { key: "general", label: "📅 عامة" },
    { key: "medications", label: "💊 أدوية" },
    { key: "utility", label: "🔌 عدادات" },
  ];
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">التذكيرات</h1>
      <div className="grid grid-cols-4 gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-xl p-1 text-[11px] sm:text-xs">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`py-2 rounded-lg font-medium ${tab === t.key ? "bg-white dark:bg-neutral-900 shadow" : "text-neutral-500"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "grocery" && <GroceryTab />}
      {tab === "general" && <GeneralTab />}
      {tab === "medications" && <MedicationsTab />}
      {tab === "utility" && <UtilityTab />}
    </div>
  );
}

/* ============================= سوبر ماركت ============================= */

interface OptionRow {
  id: string;
  brand: string | null;
  store_name: string | null;
  price: number;
  currency: string;
  source: string;
}
const GROCERY_UNITS = ["علبة", "كيس", "كيلو", "زجاجة", "صندوق كامل"];
// how many rows' worth of "no catalog match" names get sent to Gemini in one
// call — the user hit a real quota-exceeded error and asked directly whether
// to batch lookups instead of one-call-per-item; grouping by 3 cuts the call
// count roughly 3x for a typical multi-item list while keeping each response
// small enough that a single failure doesn't stall the whole list.
const AI_BATCH_SIZE = 3;

interface LineState {
  id: number;
  raw_text: string;
  unit: string;
  item_id: string | null;
  item_name: string | null;
  options: OptionRow[];
  selectedOptionId: string | null;
  quantity: number;
  loadingAi: boolean;
  aiMessage: string | null;
  manualOpen: boolean;
  manualStore: string;
  manualBrand: string;
  manualPrice: string;
}

function blankRow(id: number): LineState {
  return {
    id,
    raw_text: "",
    unit: "",
    item_id: null,
    item_name: null,
    options: [],
    selectedOptionId: null,
    quantity: 1,
    loadingAi: false,
    aiMessage: null,
    manualOpen: false,
    manualStore: "",
    manualBrand: "",
    manualPrice: "",
  };
}

function GroceryTab() {
  const [listText, setListText] = useState("");
  const [lines, setLines] = useState<LineState[]>([]);
  const [matching, setMatching] = useState(false);
  const [listName, setListName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedLists, setSavedLists] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [exporting, setExporting] = useState(false);
  // set when "تعديل القائمة"/"أكمل القائمة" is tapped on an existing saved
  // (or telegram draft) list — its raw lines get loaded back into the editor
  // above, and saving replaces it (deletes the old row, inserts the edited
  // version) instead of adding a duplicate for the same shopping trip.
  const [replacingListId, setReplacingListId] = useState<string | null>(null);
  // previous quantity/unit/selected-option per raw_text, carried over from
  // the list being edited so re-matching doesn't silently reset choices the
  // user already made — consumed (and cleared) the next time runMatch resolves.
  const [pendingEntries, setPendingEntries] = useState<Record<string, { quantity: number; unit: string; selected_option_id: string | null }> | null>(null);

  const nextIdRef = useRef(1);
  // per-row debounce timers (name typed → catalog check) and the shared
  // "no catalog match" queue that gets flushed to the batched AI endpoint —
  // see enqueueAi/flushAiQueue below.
  const rowTimersRef = useRef<Record<number, any>>({});
  const aiQueueRef = useRef<{ id: number; name: string }[]>([]);
  const aiFlushTimerRef = useRef<any>(null);

  const loadLists = () => fetch("/api/reminders/grocery/lists").then((r) => r.json()).then((d) => setSavedLists(d.lists || []));
  useEffect(() => {
    loadLists();
  }, []);

  const updateLine = (id: number, patch: Partial<LineState>) => setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  // Batches up to AI_BATCH_SIZE queued item names into one Gemini call. If
  // more arrive while a batch is in flight (or more than AI_BATCH_SIZE were
  // queued at once, e.g. from a big pasted list), the remainder is flushed
  // shortly after instead of all at once, so calls stay spaced out.
  const flushAiQueue = async () => {
    const batch = aiQueueRef.current.slice(0, AI_BATCH_SIZE);
    aiQueueRef.current = aiQueueRef.current.slice(AI_BATCH_SIZE);
    if (!batch.length) return;
    try {
      const res = await fetch("/api/reminders/grocery/ai-price-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_names: batch.map((b) => b.name) }),
      });
      const data = await res.json();
      if (!res.ok) {
        for (const b of batch) updateLine(b.id, { loadingAi: false, aiMessage: data.error || "تعذر البحث عن السعر" });
      } else {
        for (const b of batch) {
          const r = data.results?.[b.name];
          if (!r) { updateLine(b.id, { loadingAi: false, aiMessage: "تعذر البحث عن السعر" }); continue; }
          updateLine(b.id, { loadingAi: false, item_id: r.item_id, options: r.options || [], selectedOptionId: r.options?.[0]?.id || null, aiMessage: r.message || null });
        }
      }
    } catch {
      for (const b of batch) updateLine(b.id, { loadingAi: false, aiMessage: "تعذر الاتصال بنظام التسعير" });
    } finally {
      if (aiQueueRef.current.length) aiFlushTimerRef.current = setTimeout(flushAiQueue, 1200);
    }
  };

  const enqueueAi = (id: number, name: string) => {
    aiQueueRef.current = [...aiQueueRef.current.filter((q) => q.id !== id), { id, name }];
    updateLine(id, { loadingAi: true, aiMessage: null });
    if (aiFlushTimerRef.current) clearTimeout(aiFlushTimerRef.current);
    aiFlushTimerRef.current = setTimeout(flushAiQueue, 900);
  };

  // Instant, local, no-Gemini-call catalog check for one row — if it misses,
  // the row is queued for the batched AI lookup automatically instead of
  // needing a manual "دوّر بالذكاء الاصطناعي" tap.
  const matchRow = async (id: number, name: string) => {
    try {
      const res = await fetch("/api/reminders/grocery/match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines: [name] }) });
      const data = await res.json();
      const m = data.matches?.[0];
      if (!res.ok || !m) return;
      if (m.options?.length) {
        updateLine(id, { item_id: m.item_id, item_name: m.item_name, options: m.options, selectedOptionId: m.options[0]?.id || null });
      } else {
        enqueueAi(id, name);
      }
    } catch {
      // best-effort — the manual-price fallback is always available
    }
  };

  // Called on every keystroke in a row's name field — debounced so it only
  // fires ~700ms after the user stops typing, matching "مجرد ما كتب لبن في
  // الخلفيه بيحصل استدعاء للقوائم المحفوظه" from the feedback.
  const onNameChange = (id: number, value: string) => {
    updateLine(id, { raw_text: value, item_id: null, item_name: null, options: [], selectedOptionId: null, aiMessage: null });
    if (rowTimersRef.current[id]) clearTimeout(rowTimersRef.current[id]);
    aiQueueRef.current = aiQueueRef.current.filter((q) => q.id !== id);
    const trimmed = value.trim();
    if (trimmed.length < 2) return;
    rowTimersRef.current[id] = setTimeout(() => matchRow(id, trimmed), 700);
  };

  const addRow = () => setLines((prev) => [...prev, blankRow(nextIdRef.current++)]);

  const removeLine = (id: number) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
    if (rowTimersRef.current[id]) { clearTimeout(rowTimersRef.current[id]); delete rowTimersRef.current[id]; }
    aiQueueRef.current = aiQueueRef.current.filter((q) => q.id !== id);
  };

  // "قائمة سريعة" — paste several items at once (one per line). Each becomes
  // a row exactly like a manually-added one: instant catalog check, then an
  // automatic (batched) AI lookup for anything not already in the catalog.
  const runMatch = async () => {
    const raw = listText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!raw.length) return;
    setMatching(true);
    try {
      const res = await fetch("/api/reminders/grocery/match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines: raw }) });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || "حصل خطأ"); return; }
      const newRows: LineState[] = (data.matches || []).map((m: any) => {
        const prev = pendingEntries?.[m.raw_text];
        const prevOptionStillValid = prev?.selected_option_id && (m.options || []).some((o: any) => o.id === prev.selected_option_id);
        const row = blankRow(nextIdRef.current++);
        return {
          ...row,
          raw_text: m.raw_text,
          unit: prev?.unit || "",
          item_id: m.item_id,
          item_name: m.item_name,
          options: m.options || [],
          selectedOptionId: prevOptionStillValid ? prev!.selected_option_id : m.options?.[0]?.id || null,
          quantity: prev?.quantity || 1,
        };
      });
      setLines((prevLines) => [...prevLines, ...newRows]);
      setPendingEntries(null);
      setListText("");
      for (const row of newRows) if (!row.options.length) enqueueAi(row.id, row.raw_text);
    } finally {
      setMatching(false);
    }
  };

  const saveManual = async (id: number) => {
    const l = lines.find((x) => x.id === id);
    if (!l) return;
    const price = Number(l.manualPrice);
    if (!(price > 0)) return;
    const res = await fetch("/api/reminders/grocery/manual-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_name: l.raw_text, price, brand: l.manualBrand || null, store_name: l.manualStore || null }),
    });
    const data = await res.json();
    if (!res.ok) return;
    updateLine(id, { item_id: data.item_id, options: data.options || [], selectedOptionId: data.options?.[0]?.id || null, manualOpen: false, manualPrice: "", manualBrand: "", manualStore: "" });
  };

  const total = lines.reduce((sum, l) => {
    const opt = l.options.find((o) => o.id === l.selectedOptionId);
    return opt ? sum + opt.price * l.quantity : sum;
  }, 0);

  const saveList = async () => {
    const usable = lines.filter((l) => l.raw_text.trim());
    if (!usable.length) return;
    setSaving(true);
    try {
      const res = await fetch("/api/reminders/grocery/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: listName || null,
          entries: usable.map((l) => ({ raw_text: l.raw_text, item_id: l.item_id, selected_option_id: l.selectedOptionId, quantity: l.quantity, unit: l.unit || null })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || "حصل خطأ في الحفظ"); return; }
      if (replacingListId) {
        await fetch(`/api/reminders/grocery/lists/${replacingListId}`, { method: "DELETE" });
        setReplacingListId(null);
      }
      setMsg("تم حفظ القائمة ✅");
      setListName("");
      setLines([]);
      setListText("");
      loadLists();
    } finally {
      setSaving(false);
    }
  };

  const deleteList = async (id: string) => {
    await fetch(`/api/reminders/grocery/lists/${id}`, { method: "DELETE" });
    loadLists();
  };

  // "أكمل القائمة" — loads a saved (or telegram draft) list's raw lines back
  // into the quick-entry editor so prices can be picked/completed; the actual
  // list row it came from gets replaced (not duplicated) when re-saved.
  const continueList = (sl: any) => {
    const entries = sl.grocery_list_entries || [];
    const rawLines = entries.map((e: any) => e.raw_text);
    const pending: Record<string, { quantity: number; unit: string; selected_option_id: string | null }> = {};
    for (const e of entries) pending[e.raw_text] = { quantity: e.quantity || 1, unit: e.unit || "", selected_option_id: e.selected_option_id || null };
    setPendingEntries(pending);
    setListText(rawLines.join("\n"));
    setListName(sl.name || "");
    setReplacingListId(sl.id);
    setLines([]);
    setMsg('اتحمّلت القائمة فوق — دوس "دوّر على الأسعار" وكمّل منها.');
  };

  // "تصدير" — rasterizes the current (in-progress or saved) list as a
  // shareable PDF, same off-screen-HTML → html2canvas-pro → jsPDF pattern
  // used everywhere else in the app for Arabic text (see app/(protected)/export/page.tsx).
  const exportRows = async (rows: { label: string; optionLabel: string; price: number; currency: string; qty: number }[], total: number, title: string) => {
    setExporting(true);
    try {
      const node = document.createElement("div");
      node.style.position = "fixed";
      node.style.left = "-9999px";
      node.style.top = "0";
      node.style.width = "700px";
      node.style.background = "#ffffff";
      node.style.padding = "24px";
      node.style.fontFamily = "Cairo, sans-serif";
      node.style.direction = "rtl";
      node.style.color = "#111827";
      const rowsHtml = rows
        .map(
          (r) => `<tr>
            <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:12px;">${r.label}</td>
            <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:11px;color:#6b7280;">${r.optionLabel}</td>
            <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:11px;">×${r.qty}</td>
            <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:12px;font-weight:600;white-space:nowrap;">${(r.price * r.qty).toLocaleString()} ${r.currency}</td>
          </tr>`
        )
        .join("");
      node.innerHTML = `
        <div style="text-align:center;margin-bottom:16px;">
          <p style="font-size:12px;color:#ea580c;font-weight:700;">FlowCash</p>
          <h2 style="font-size:17px;margin:6px 0 2px;">${title}</h2>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="background:#f9fafb;"><th style="padding:6px 4px;font-size:11px;text-align:right;">الصنف</th><th style="padding:6px 4px;font-size:11px;text-align:right;">التفاصيل</th><th style="padding:6px 4px;font-size:11px;text-align:right;">الكمية</th><th style="padding:6px 4px;font-size:11px;text-align:right;">السعر</th></tr></thead>
          <tbody>${rowsHtml || '<tr><td style="font-size:11px;color:#9ca3af;padding:6px 4px;">لا يوجد</td></tr>'}</tbody>
        </table>
        <div style="border-top:1px solid #e5e7eb;margin-top:12px;padding-top:10px;display:flex;justify-content:space-between;">
          <p style="font-size:13px;font-weight:700;">الإجمالي</p>
          <p style="font-size:13px;font-weight:700;color:#ea580c;">${total.toLocaleString()} EGP</p>
        </div>
        <div style="border-top:1px solid #e5e7eb;margin-top:12px;padding-top:10px;text-align:center;">
          <p style="font-size:10px;color:#9ca3af;margin:0;">تم الإنشاء بواسطة FlowCash — ${new Date().toLocaleDateString("ar-EG")}</p>
        </div>`;
      document.body.appendChild(node);
      const html2canvas = (await import("html2canvas-pro")).default;
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
      document.body.removeChild(node);
      const { jsPDF } = await import("jspdf");
      const w = canvas.width / 2;
      const h = canvas.height / 2;
      const pdf = new jsPDF({ unit: "px", format: [w, h] });
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, w, h);
      await shareFile(pdf.output("dataurlstring"), `${title}.pdf`, "application/pdf");
    } finally {
      setExporting(false);
    }
  };

  const exportCurrentList = () => {
    const rows = lines
      .map((l) => {
        const opt = l.options.find((o) => o.id === l.selectedOptionId);
        return { label: l.raw_text, optionLabel: opt ? `${opt.brand ? opt.brand + " — " : ""}${opt.store_name || ""}` : "بدون سعر", price: opt?.price || 0, currency: opt?.currency || "EGP", qty: l.quantity };
      });
    exportRows(rows, total, `قائمة سوبر ماركت${listName ? " — " + listName : ""}`);
  };

  const exportSavedList = (sl: any) => {
    const entries = sl.grocery_list_entries || [];
    const rows = entries.map((e: any) => ({
      label: e.raw_text,
      optionLabel: e.grocery_item_options ? `${e.grocery_item_options.brand ? e.grocery_item_options.brand + " — " : ""}${e.grocery_item_options.store_name || ""}` : "بدون سعر",
      price: e.grocery_item_options?.price || 0,
      currency: e.grocery_item_options?.currency || "EGP",
      qty: e.quantity || 1,
    }));
    const listTotal = rows.reduce((s: number, r: any) => s + r.price * r.qty, 0);
    exportRows(rows, listTotal, `قائمة سوبر ماركت${sl.name ? " — " + sl.name : ""}`);
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <p className="text-sm font-medium">قائمة سريعة</p>
        <p className="text-xs text-neutral-400">اكتب كل صنف في سطر — مثال: لبن، زبادي، بامبرز</p>
        <textarea value={listText} onChange={(e) => setListText(e.target.value)} rows={4} className={inputCls} placeholder={"لبن\nزبادي\nبامبرز"} />
        <button onClick={runMatch} disabled={matching} className={btnPrimary}>
          {matching ? <Loader2 size={14} className="animate-spin inline" /> : "دوّر على الأسعار"}
        </button>
        {msg && <p className="text-xs text-orange-600">{msg}</p>}
      </Card>

      <div className="space-y-2">
        {lines.map((l) => (
          <Card key={l.id} className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                placeholder="اسم الصنف — مثال: لبن"
                value={l.raw_text}
                onChange={(e) => onNameChange(l.id, e.target.value)}
                className={`${inputCls} flex-1`}
              />
              {l.loadingAi && <Loader2 size={14} className="animate-spin text-orange-500 shrink-0" />}
              <button onClick={() => removeLine(l.id)} className="text-red-500 p-1 shrink-0">
                <Trash2 size={14} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select value={l.unit} onChange={(e) => updateLine(l.id, { unit: e.target.value })} className={inputCls}>
                <option value="">الكمية / العبوة</option>
                {GROCERY_UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={l.quantity}
                onChange={(e) => updateLine(l.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                className={`${inputCls} text-center`}
                placeholder="العدد"
              />
            </div>

            {l.options.length > 0 ? (
              <div className="space-y-1">
                {l.options.map((o) => (
                  <label key={o.id} className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={l.selectedOptionId === o.id} onChange={() => updateLine(l.id, { selectedOptionId: l.selectedOptionId === o.id ? null : o.id })} />
                    <span className="flex-1">
                      {o.brand ? `${o.brand} — ` : ""}
                      {o.store_name || (o.source === "manual" ? "يدوي" : "")}
                    </span>
                    <span className="font-medium">{o.price.toLocaleString()} {o.currency}</span>
                    {o.source === "ai" && <Sparkles size={12} className="text-orange-500" />}
                  </label>
                ))}
              </div>
            ) : (
              !l.loadingAi && l.raw_text.trim() && <p className="text-xs text-neutral-400">مفيش سعر مسجل للصنف ده لسه.</p>
            )}

            {l.aiMessage && <p className="text-xs text-orange-500">{l.aiMessage}</p>}

            <button onClick={() => updateLine(l.id, { manualOpen: !l.manualOpen })} className={btnGhost}>
              سجّل السعر يدويًا
            </button>

            {l.manualOpen && (
              <div className="grid grid-cols-3 gap-1">
                <input placeholder="السعر" value={l.manualPrice} onChange={(e) => updateLine(l.id, { manualPrice: e.target.value })} className={inputCls} />
                <input placeholder="الماركة (اختياري)" value={l.manualBrand} onChange={(e) => updateLine(l.id, { manualBrand: e.target.value })} className={inputCls} />
                <div className="flex gap-1">
                  <input placeholder="المتجر (اختياري)" value={l.manualStore} onChange={(e) => updateLine(l.id, { manualStore: e.target.value })} className={inputCls} />
                  <button onClick={() => saveManual(l.id)} className={btnPrimary}>حفظ</button>
                </div>
              </div>
            )}
          </Card>
        ))}

        <button onClick={addRow} className={`${btnGhost} w-full`}>+ إضافة صف</button>

        {lines.length > 0 && (
          <Card className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <p className="text-neutral-400">عدد الأصناف</p>
              <p className="font-medium">{lines.filter((l) => l.raw_text.trim()).length}</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">الإجمالي التقريبي{replacingListId ? " (استكمال قائمة)" : ""}</p>
              <p className="text-lg font-bold text-orange-600">{total.toLocaleString()} EGP</p>
            </div>
            <p className="text-[11px] text-neutral-400">ملحوظة: الأسعار متوسط استرشادي من كارفور، أمازون مصر، سبينيس، واللولو — ممكن تختلف شوية حسب الفرع.</p>
            <input placeholder="اسم القائمة (اختياري)" value={listName} onChange={(e) => setListName(e.target.value)} className={inputCls} />
            <div className="flex items-center gap-2">
              <button onClick={saveList} disabled={saving} className={btnPrimary}>
                {saving ? <Loader2 size={14} className="animate-spin inline" /> : "احفظ القائمة"}
              </button>
              <button onClick={exportCurrentList} disabled={exporting} className={`${btnGhost} flex items-center gap-1`}>
                {exporting ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />} تصدير
              </button>
              {replacingListId && (
                <button onClick={() => { setReplacingListId(null); setPendingEntries(null); setLines([]); setListText(""); setListName(""); }} className="text-red-500 p-1"><X size={14} /></button>
              )}
            </div>
          </Card>
        )}
      </div>

      {savedLists.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">قوائم محفوظة</p>
          {savedLists.map((sl) => {
            const entries = sl.grocery_list_entries || [];
            const listTotal = entries.reduce((s: number, e: any) => s + (e.grocery_item_options?.price || 0) * (e.quantity || 1), 0);
            return (
              <Card key={sl.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {sl.name || "قائمة بدون اسم"}
                    {sl.source === "telegram" ? " (تليجرام)" : ""}
                    {sl.status === "draft" ? " — مسودة" : ""}
                  </p>
                  <button onClick={() => deleteList(sl.id)} className="text-red-500 p-1"><Trash2 size={14} /></button>
                </div>
                <p className="text-xs text-neutral-400">{entries.map((e: any) => e.raw_text).join("، ")}</p>
                <p className="text-xs font-medium">الإجمالي: {listTotal.toLocaleString()} EGP</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => continueList(sl)} className={`${btnGhost} flex items-center gap-1`}>
                    <Pencil size={12} /> {sl.status === "draft" ? "أكمل القائمة" : "تعديل القائمة"}
                  </button>
                  <button onClick={() => exportSavedList(sl)} disabled={exporting} className={`${btnGhost} flex items-center gap-1`}>
                    {exporting ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />} تصدير
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================= تذكيرات عامة ============================= */

const REPEAT_LABELS: Record<string, string> = { none: "أبدًا (مرة واحدة)", daily: "يوميًا", weekly: "أسبوعيًا", monthly: "شهريًا" };

function GeneralTab() {
  const [reminders, setReminders] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [repeatFrequency, setRepeatFrequency] = useState("none");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editRemindAt, setEditRemindAt] = useState("");
  const [editRepeatFrequency, setEditRepeatFrequency] = useState("none");
  const [editSaving, setEditSaving] = useState(false);

  const load = () => fetch("/api/reminders/general").then((r) => r.json()).then((d) => setReminders(d.reminders || []));
  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/reminders/general", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, remind_at: remindAt || null, repeat_frequency: repeatFrequency }) });
      setTitle("");
      setRemindAt("");
      setRepeatFrequency("none");
      load();
    } finally {
      setSaving(false);
    }
  };

  const patch = async (id: string, body: any) => {
    await fetch(`/api/reminders/general/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    load();
  };
  const del = async (id: string) => {
    await fetch(`/api/reminders/general/${id}`, { method: "DELETE" });
    load();
  };

  const startEdit = (r: any) => {
    setEditingId(r.id);
    setEditTitle(r.title);
    setEditRemindAt(r.remind_at ? r.remind_at.slice(0, 16) : "");
    setEditRepeatFrequency(r.repeat_frequency || "none");
  };
  const saveEdit = async (id: string) => {
    if (!editTitle.trim()) return;
    setEditSaving(true);
    try {
      await patch(id, { title: editTitle, remind_at: editRemindAt || null, repeat_frequency: editRepeatFrequency });
      setEditingId(null);
    } finally {
      setEditSaving(false);
    }
  };

  const statusLabel: Record<string, string> = { active: "نشط", completed: "مكتمل", cancelled: "ملغي" };
  const statusColor: Record<string, string> = { active: "text-green-600", completed: "text-blue-600", cancelled: "text-neutral-400" };

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <p className="text-sm font-medium">تذكير جديد</p>
        <input placeholder="العنوان" value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        <input type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} className={inputCls} />
        <select value={repeatFrequency} onChange={(e) => setRepeatFrequency(e.target.value)} className={inputCls}>
          {Object.entries(REPEAT_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <button onClick={submit} disabled={saving} className={btnPrimary}>
          {saving ? <Loader2 size={14} className="animate-spin inline" /> : "إضافة"}
        </button>
      </Card>

      <div className="space-y-2">
        {reminders.map((r) =>
          editingId === r.id ? (
            <Card key={r.id} className="space-y-2">
              <input placeholder="العنوان" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={inputCls} />
              <input type="datetime-local" value={editRemindAt} onChange={(e) => setEditRemindAt(e.target.value)} className={inputCls} />
              <select value={editRepeatFrequency} onChange={(e) => setEditRepeatFrequency(e.target.value)} className={inputCls}>
                {Object.entries(REPEAT_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <button onClick={() => saveEdit(r.id)} disabled={editSaving} className={btnPrimary}>
                  {editSaving ? <Loader2 size={14} className="animate-spin inline" /> : "حفظ"}
                </button>
                <button onClick={() => setEditingId(null)} className={btnGhost}>إلغاء</button>
              </div>
            </Card>
          ) : (
            <Card key={r.id} className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{r.title}{r.source === "telegram" ? " (تليجرام)" : ""}</p>
                <Switch checked={r.status === "active"} onChange={(v) => patch(r.id, { active: v })} />
              </div>
              <div className="flex items-center justify-between text-xs">
                <p className="text-neutral-400">
                  {r.remind_at ? new Date(r.remind_at).toLocaleString("ar-EG") : "بدون معاد"}
                  {r.repeat_frequency && r.repeat_frequency !== "none" ? ` — ${REPEAT_LABELS[r.repeat_frequency]}` : ""}
                </p>
                <p className={statusColor[r.status]}>{statusLabel[r.status]}</p>
              </div>
              <div className="flex items-center gap-2">
                {r.status !== "completed" && (
                  <button onClick={() => patch(r.id, { status: "completed" })} className={`${btnGhost} flex items-center gap-1`}>
                    <CheckCircle2 size={12} /> تم
                  </button>
                )}
                <button onClick={() => startEdit(r)} className="text-neutral-400 hover:text-orange-600 p-1"><Pencil size={14} /></button>
                <button onClick={() => del(r.id)} className="text-red-500 p-1"><Trash2 size={14} /></button>
              </div>
            </Card>
          )
        )}
        {!reminders.length && <p className="text-sm text-neutral-400 text-center py-6">مفيش تذكيرات لسه</p>}
      </div>
    </div>
  );
}

/* ============================= أدوية وروشتات ============================= */

const FORM_EMOJI: Record<string, string> = { injection: "💉", capsule: "💊", tablet: "🔵", effervescent: "🫧", syrup: "🧴", drops: "💧" };

// Round 30 — full set of schedule types (was meal/interval only).
const SCHEDULE_TYPES: string[] = ["meal", "interval", "daily", "weekly", "monthly"];
// "بداية أول جرعة" only matters as an anchor for schedules that repeat by a
// fixed clock-time+day step — meal times are already fixed daily slots, so
// there's nothing for an anchor to add there.
const NEEDS_FIRST_DOSE = (t: string) => t !== "meal";

function medScheduleLabel(m: any) {
  if (m.schedule_type === "meal") return MEAL_TIMING_LABELS[m.meal_timing] || SCHEDULE_TYPE_LABELS.meal;
  if (m.schedule_type === "interval") return `كل ${m.interval_hours} ساعة`;
  if (m.schedule_type && SCHEDULE_TYPE_LABELS[m.schedule_type]) return SCHEDULE_TYPE_LABELS[m.schedule_type];
  return "بدون جدول";
}

function MedicationsTab() {
  const [meds, setMeds] = useState<any[]>([]);
  const [appts, setAppts] = useState<any[]>([]);
  const [form, setForm] = useState<any>({
    name: "",
    formType: "tablet",
    pack_size: "",
    schedule_type: "meal",
    meal_timing: "after_breakfast",
    interval_hours: "8",
    first_dose_at: "",
    course_duration_days: "",
    reminder_enabled: true,
    remind_before_minutes: "15",
    low_stock_threshold: "2",
  });
  const [saving, setSaving] = useState(false);
  const [medError, setMedError] = useState("");
  const apptFormRef = useRef<HTMLDivElement>(null);
  const [apptForm, setApptForm] = useState<any>({
    kind: "checkup",
    title: "",
    appointment_at: "",
    medication_id: "",
    prescription_image: "",
    doctor_name: "",
    doctor_address: "",
    doctor_phone: "",
    doctor_specialty: "",
    parent_appointment_id: "",
  });
  const [savingAppt, setSavingAppt] = useState(false);
  const [apptError, setApptError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [editingMedId, setEditingMedId] = useState<string | null>(null);
  const [editMedForm, setEditMedForm] = useState<any>(null);
  const [editMedSaving, setEditMedSaving] = useState(false);
  const [editingApptId, setEditingApptId] = useState<string | null>(null);
  const [editApptForm, setEditApptForm] = useState<any>(null);
  const [editApptSaving, setEditApptSaving] = useState(false);

  const loadMeds = () => fetch("/api/reminders/medications").then((r) => r.json()).then((d) => setMeds(d.medications || []));
  const loadAppts = () => fetch("/api/reminders/appointments").then((r) => r.json()).then((d) => setAppts(d.appointments || []));
  useEffect(() => {
    loadMeds();
    loadAppts();
  }, []);

  // "إضافة دواء مش بينزل" (Round 30 postmortem): the old submitMed never
  // checked res.ok, so a DB rejection (the schedule_type constraint bug that
  // caused this exact report) failed completely silently — the button just
  // looked like it did nothing. Every submit function below now checks res.ok
  // and surfaces the real error message instead.
  const submitMed = async () => {
    if (!form.name.trim()) { setMedError("اسم الدواء مطلوب"); return; }
    setSaving(true);
    setMedError("");
    try {
      const res = await fetch("/api/reminders/medications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          form: form.formType,
          pack_size: form.pack_size || null,
          schedule_type: form.schedule_type,
          meal_timing: form.schedule_type === "meal" ? form.meal_timing : null,
          interval_hours: form.schedule_type === "interval" ? Number(form.interval_hours) : null,
          first_dose_at: NEEDS_FIRST_DOSE(form.schedule_type) && form.first_dose_at ? new Date(form.first_dose_at).toISOString() : null,
          course_duration_days: form.course_duration_days ? Number(form.course_duration_days) : null,
          reminder_enabled: form.reminder_enabled,
          remind_before_minutes: form.schedule_type === "meal" ? 0 : Number(form.remind_before_minutes) || 0,
          low_stock_threshold: Number(form.low_stock_threshold) || 2,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMedError(data.error || "حصل خطأ أثناء إضافة الدواء"); return; }
      setForm({ ...form, name: "", pack_size: "", first_dose_at: "", course_duration_days: "" });
      loadMeds();
    } catch {
      setMedError("تعذر الاتصال بالسيرفر — حاول تاني.");
    } finally {
      setSaving(false);
    }
  };

  const logDose = async (id: string) => {
    await fetch(`/api/reminders/medications/${id}/dose`, { method: "POST" });
    loadMeds();
  };
  const toggleReminder = async (id: string, v: boolean) => {
    await fetch(`/api/reminders/medications/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reminder_enabled: v }) });
    loadMeds();
  };
  const delMed = async (id: string) => {
    await fetch(`/api/reminders/medications/${id}`, { method: "DELETE" });
    loadMeds();
  };

  const startEditMed = (m: any) => {
    setEditingMedId(m.id);
    setEditMedForm({
      name: m.name,
      formType: m.form || "tablet",
      pack_size: m.pack_size ?? "",
      schedule_type: m.schedule_type || "meal",
      meal_timing: m.meal_timing || "after_breakfast",
      interval_hours: m.interval_hours ? String(m.interval_hours) : "8",
      first_dose_at: m.first_dose_at ? m.first_dose_at.slice(0, 16) : "",
      course_duration_days: m.course_duration_days ?? "",
      reminder_enabled: m.reminder_enabled,
      remind_before_minutes: m.remind_before_minutes ?? 0,
      low_stock_threshold: m.low_stock_threshold ?? 2,
    });
  };
  const saveEditMed = async (id: string) => {
    if (!editMedForm.name.trim()) return;
    setEditMedSaving(true);
    setMedError("");
    try {
      const res = await fetch(`/api/reminders/medications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editMedForm.name,
          form: editMedForm.formType,
          pack_size: editMedForm.pack_size || null,
          schedule_type: editMedForm.schedule_type,
          meal_timing: editMedForm.schedule_type === "meal" ? editMedForm.meal_timing : null,
          interval_hours: editMedForm.schedule_type === "interval" ? Number(editMedForm.interval_hours) : null,
          first_dose_at: NEEDS_FIRST_DOSE(editMedForm.schedule_type) && editMedForm.first_dose_at ? new Date(editMedForm.first_dose_at).toISOString() : null,
          course_duration_days: editMedForm.course_duration_days ? Number(editMedForm.course_duration_days) : null,
          reminder_enabled: editMedForm.reminder_enabled,
          remind_before_minutes: editMedForm.schedule_type === "meal" ? 0 : Number(editMedForm.remind_before_minutes) || 0,
          low_stock_threshold: Number(editMedForm.low_stock_threshold) || 2,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMedError(data.error || "حصل خطأ أثناء الحفظ"); return; }
      setEditingMedId(null);
      loadMeds();
    } catch {
      setMedError("تعذر الاتصال بالسيرفر — حاول تاني.");
    } finally {
      setEditMedSaving(false);
    }
  };

  // "تسجيل استشارة متابعة" على كشف طبي — يملي فورم الموعد فوق بربط
  // parent_appointment_id بالكشف ده، وبمعلومات الطبيب لو موجودة، فيبقى محتاج
  // بس يحدد المعاد ويحفظ.
  const startFollowUp = (checkup: any) => {
    setApptForm({
      kind: "consultation",
      title: checkup.title ? `متابعة: ${checkup.title}` : "استشارة متابعة",
      appointment_at: "",
      medication_id: "",
      prescription_image: "",
      doctor_name: checkup.doctor_name || "",
      doctor_address: checkup.doctor_address || "",
      doctor_phone: checkup.doctor_phone || "",
      doctor_specialty: checkup.doctor_specialty || "",
      parent_appointment_id: checkup.id,
    });
    setApptError("");
    apptFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const submitAppt = async () => {
    if (!apptForm.appointment_at) { setApptError("معاد الكشف/الاستشارة مطلوب"); return; }
    setSavingAppt(true);
    setApptError("");
    try {
      const res = await fetch("/api/reminders/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: apptForm.kind,
          title: apptForm.title || null,
          appointment_at: apptForm.appointment_at,
          medication_id: apptForm.medication_id || null,
          prescription_image: apptForm.prescription_image || null,
          doctor_name: apptForm.doctor_name || null,
          doctor_address: apptForm.doctor_address || null,
          doctor_phone: apptForm.doctor_phone || null,
          doctor_specialty: apptForm.doctor_specialty || null,
          parent_appointment_id: apptForm.parent_appointment_id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setApptError(data.error || "حصل خطأ أثناء إضافة الموعد"); return; }
      setApptForm({ kind: "checkup", title: "", appointment_at: "", medication_id: "", prescription_image: "", doctor_name: "", doctor_address: "", doctor_phone: "", doctor_specialty: "", parent_appointment_id: "" });
      loadAppts();
    } catch {
      setApptError("تعذر الاتصال بالسيرفر — حاول تاني.");
    } finally {
      setSavingAppt(false);
    }
  };
  const delAppt = async (id: string) => {
    await fetch(`/api/reminders/appointments/${id}`, { method: "DELETE" });
    loadAppts();
  };
  const markApptDone = async (id: string) => {
    await fetch(`/api/reminders/appointments/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "done" }) });
    loadAppts();
  };

  const startEditAppt = (a: any) => {
    setEditingApptId(a.id);
    setEditApptForm({
      kind: a.kind,
      title: a.title || "",
      appointment_at: a.appointment_at ? a.appointment_at.slice(0, 16) : "",
      medication_id: a.medication_id || "",
      prescription_image: a.prescription_image || "",
      doctor_name: a.doctor_name || "",
      doctor_address: a.doctor_address || "",
      doctor_phone: a.doctor_phone || "",
      doctor_specialty: a.doctor_specialty || "",
    });
  };
  const saveEditAppt = async (id: string) => {
    if (!editApptForm.appointment_at) return;
    setEditApptSaving(true);
    try {
      await fetch(`/api/reminders/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: editApptForm.kind,
          title: editApptForm.title || null,
          appointment_at: editApptForm.appointment_at,
          prescription_image: editApptForm.prescription_image || null,
          doctor_name: editApptForm.doctor_name || null,
          doctor_address: editApptForm.doctor_address || null,
          doctor_phone: editApptForm.doctor_phone || null,
          doctor_specialty: editApptForm.doctor_specialty || null,
        }),
      });
      setEditingApptId(null);
      loadAppts();
    } finally {
      setEditApptSaving(false);
    }
  };

  // export the medication + appointment schedule as a shareable PDF —
  // exact rasterize-off-screen-HTML pattern used in app/(protected)/export/page.tsx
  // (jsPDF's built-in fonts can't shape Arabic text at all).
  const exportSchedule = async () => {
    setExporting(true);
    try {
      const node = document.createElement("div");
      node.style.position = "fixed";
      node.style.left = "-9999px";
      node.style.top = "0";
      node.style.width = "700px";
      node.style.background = "#ffffff";
      node.style.padding = "24px";
      node.style.fontFamily = "Cairo, sans-serif";
      node.style.direction = "rtl";
      node.style.color = "#111827";
      const medRows = meds
        .map(
          (m) => `<tr>
            <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:12px;">${FORM_EMOJI[m.form] || ""} ${m.name}</td>
            <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:11px;">${medScheduleLabel(m)}</td>
            <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:11px;">${m.remaining_doses ?? "-"} / ${m.pack_size ?? "-"}</td>
          </tr>`
        )
        .join("");
      const apptRows = appts
        .map(
          (a) => `<tr>
            <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:12px;">${a.kind === "consultation" ? "استشارة" : "كشف"}${a.title ? " — " + a.title : ""}</td>
            <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:11px;">${new Date(a.appointment_at).toLocaleString("ar-EG")}</td>
          </tr>`
        )
        .join("");
      node.innerHTML = `
        <div style="text-align:center;margin-bottom:16px;">
          <p style="font-size:12px;color:#ea580c;font-weight:700;">FlowCash</p>
          <h2 style="font-size:17px;margin:6px 0 2px;">جدول الأدوية والمواعيد الطبية</h2>
        </div>
        <p style="font-size:13px;font-weight:700;margin:10px 0 4px;">الأدوية</p>
        <table style="width:100%;border-collapse:collapse;"><tbody>${medRows || '<tr><td style="font-size:11px;color:#9ca3af;padding:6px 4px;">لا يوجد</td></tr>'}</tbody></table>
        <p style="font-size:13px;font-weight:700;margin:14px 0 4px;">المواعيد الطبية</p>
        <table style="width:100%;border-collapse:collapse;"><tbody>${apptRows || '<tr><td style="font-size:11px;color:#9ca3af;padding:6px 4px;">لا يوجد</td></tr>'}</tbody></table>
        <div style="border-top:1px solid #e5e7eb;margin-top:16px;padding-top:10px;text-align:center;">
          <p style="font-size:10px;color:#9ca3af;margin:0;">تم الإنشاء بواسطة FlowCash — ${new Date().toLocaleDateString("ar-EG")}</p>
        </div>`;
      document.body.appendChild(node);
      const html2canvas = (await import("html2canvas-pro")).default;
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
      document.body.removeChild(node);
      const { jsPDF } = await import("jspdf");
      const w = canvas.width / 2;
      const h = canvas.height / 2;
      const pdf = new jsPDF({ unit: "px", format: [w, h] });
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, w, h);
      await shareFile(pdf.output("dataurlstring"), "جدول-الأدوية.pdf", "application/pdf");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <p className="text-sm font-medium">دواء جديد</p>
        <input placeholder="اسم الدواء" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
        <div className="flex flex-wrap gap-1">
          {Object.entries(MEDICATION_FORM_LABELS).map(([key, label]) => (
            <button key={key} onClick={() => setForm({ ...form, formType: key })} className={`px-2 py-1 rounded-lg text-xs border ${form.formType === key ? "bg-orange-500 text-white border-orange-500" : "border-neutral-300 dark:border-neutral-700"}`}>
              {FORM_EMOJI[key]} {label}
            </button>
          ))}
        </div>
        <input
          type="number"
          placeholder="عدد الحبات داخل العلبة (اختياري)"
          value={form.pack_size}
          onChange={(e) => setForm({ ...form, pack_size: e.target.value })}
          className="w-40 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-xs"
        />

        <div className="grid grid-cols-3 gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-1 text-xs">
          {SCHEDULE_TYPES.map((t) => (
            <button key={t} onClick={() => setForm({ ...form, schedule_type: t })} className={`py-1.5 rounded-md ${form.schedule_type === t ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>
              {SCHEDULE_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        {form.schedule_type === "meal" && (
          <select value={form.meal_timing} onChange={(e) => setForm({ ...form, meal_timing: e.target.value })} className={inputCls}>
            {Object.entries(MEAL_TIMING_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        )}
        {form.schedule_type === "interval" && (
          <select value={form.interval_hours} onChange={(e) => setForm({ ...form, interval_hours: e.target.value })} className={inputCls}>
            {[6, 8, 12, 24].map((h) => (
              <option key={h} value={h}>كل {h} ساعة</option>
            ))}
          </select>
        )}
        {NEEDS_FIRST_DOSE(form.schedule_type) && (
          <div className="space-y-1">
            <p className="text-xs text-neutral-400">بداية أول جرعة — بيتحسب عليها كل المواعيد الجاية</p>
            <input type="datetime-local" value={form.first_dose_at} onChange={(e) => setForm({ ...form, first_dose_at: e.target.value })} className={inputCls} />
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-sm">ذكرني</p>
          <Switch checked={form.reminder_enabled} onChange={(v) => setForm({ ...form, reminder_enabled: v })} />
        </div>
        {form.reminder_enabled && (
          form.schedule_type === "meal" ? (
            <p className="text-xs text-neutral-400">هيتبعتلك تذكير في معاد الوجبة نفسه تلقائيًا.</p>
          ) : (
            <input type="number" placeholder="تنبيه قبل الموعد بكام دقيقة" value={form.remind_before_minutes} onChange={(e) => setForm({ ...form, remind_before_minutes: e.target.value })} className={inputCls} />
          )
        )}
        <input type="number" placeholder="مدة العلاج بالأيام (اختياري) — يتقفل تلقائي بعدها" value={form.course_duration_days} onChange={(e) => setForm({ ...form, course_duration_days: e.target.value })} className={inputCls} />
        <input type="number" placeholder="تنبيه لو باقي كام حبة (نفاد المخزون)" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} className={inputCls} />

        {medError && <p className="text-xs text-red-500">{medError}</p>}
        <button onClick={submitMed} disabled={saving} className={btnPrimary}>
          {saving ? <Loader2 size={14} className="animate-spin inline" /> : "إضافة الدواء"}
        </button>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">الأدوية المسجلة</p>
        {(meds.length > 0 || appts.length > 0) && (
          <button onClick={exportSchedule} disabled={exporting} className={`${btnGhost} flex items-center gap-1`}>
            <FileDown size={12} /> تصدير الجدول
          </button>
        )}
      </div>
      <div className="space-y-2">
        {meds.map((m) =>
          editingMedId === m.id ? (
            <Card key={m.id} className="space-y-2">
              <input placeholder="اسم الدواء" value={editMedForm.name} onChange={(e) => setEditMedForm({ ...editMedForm, name: e.target.value })} className={inputCls} />
              <div className="flex flex-wrap gap-1">
                {Object.entries(MEDICATION_FORM_LABELS).map(([key, label]) => (
                  <button key={key} onClick={() => setEditMedForm({ ...editMedForm, formType: key })} className={`px-2 py-1 rounded-lg text-xs border ${editMedForm.formType === key ? "bg-orange-500 text-white border-orange-500" : "border-neutral-300 dark:border-neutral-700"}`}>
                    {FORM_EMOJI[key]} {label}
                  </button>
                ))}
              </div>
              <input
                type="number"
                placeholder="عدد الحبات داخل العلبة"
                value={editMedForm.pack_size}
                onChange={(e) => setEditMedForm({ ...editMedForm, pack_size: e.target.value })}
                className="w-40 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 text-xs"
              />
              <div className="grid grid-cols-3 gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-1 text-xs">
                {SCHEDULE_TYPES.map((t) => (
                  <button key={t} onClick={() => setEditMedForm({ ...editMedForm, schedule_type: t })} className={`py-1.5 rounded-md ${editMedForm.schedule_type === t ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>
                    {SCHEDULE_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
              {editMedForm.schedule_type === "meal" && (
                <select value={editMedForm.meal_timing} onChange={(e) => setEditMedForm({ ...editMedForm, meal_timing: e.target.value })} className={inputCls}>
                  {Object.entries(MEAL_TIMING_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              )}
              {editMedForm.schedule_type === "interval" && (
                <select value={editMedForm.interval_hours} onChange={(e) => setEditMedForm({ ...editMedForm, interval_hours: e.target.value })} className={inputCls}>
                  {[6, 8, 12, 24].map((h) => (
                    <option key={h} value={h}>كل {h} ساعة</option>
                  ))}
                </select>
              )}
              {NEEDS_FIRST_DOSE(editMedForm.schedule_type) && (
                <div className="space-y-1">
                  <p className="text-xs text-neutral-400">بداية أول جرعة</p>
                  <input type="datetime-local" value={editMedForm.first_dose_at} onChange={(e) => setEditMedForm({ ...editMedForm, first_dose_at: e.target.value })} className={inputCls} />
                </div>
              )}
              <div className="flex items-center justify-between">
                <p className="text-sm">ذكرني</p>
                <Switch checked={editMedForm.reminder_enabled} onChange={(v) => setEditMedForm({ ...editMedForm, reminder_enabled: v })} />
              </div>
              {editMedForm.reminder_enabled && (
                editMedForm.schedule_type === "meal" ? (
                  <p className="text-xs text-neutral-400">هيتبعتلك تذكير في معاد الوجبة نفسه تلقائيًا.</p>
                ) : (
                  <input type="number" placeholder="تنبيه قبل الموعد بكام دقيقة" value={editMedForm.remind_before_minutes} onChange={(e) => setEditMedForm({ ...editMedForm, remind_before_minutes: e.target.value })} className={inputCls} />
                )
              )}
              <input type="number" placeholder="مدة العلاج بالأيام (اختياري)" value={editMedForm.course_duration_days} onChange={(e) => setEditMedForm({ ...editMedForm, course_duration_days: e.target.value })} className={inputCls} />
              <input type="number" placeholder="تنبيه لو باقي كام حبة" value={editMedForm.low_stock_threshold} onChange={(e) => setEditMedForm({ ...editMedForm, low_stock_threshold: e.target.value })} className={inputCls} />
              {medError && <p className="text-xs text-red-500">{medError}</p>}
              <div className="flex items-center gap-2">
                <button onClick={() => saveEditMed(m.id)} disabled={editMedSaving} className={btnPrimary}>
                  {editMedSaving ? <Loader2 size={14} className="animate-spin inline" /> : "حفظ"}
                </button>
                <button onClick={() => { setEditingMedId(null); setMedError(""); }} className={btnGhost}>إلغاء</button>
              </div>
            </Card>
          ) : (
            <Card key={m.id} className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{FORM_EMOJI[m.form] || <Pill size={14} className="inline" />} {m.name}{m.source === "telegram" ? " (تليجرام)" : ""}</p>
                <Switch checked={m.reminder_enabled} onChange={(v) => toggleReminder(m.id, v)} />
              </div>
              <p className="text-xs text-neutral-400">
                {medScheduleLabel(m)}
                {m.next_dose_at ? ` — الجرعة الجاية: ${new Date(m.next_dose_at).toLocaleString("ar-EG")}` : ""}
              </p>
              {m.course_duration_days != null && (
                <p className="text-xs text-neutral-400">مدة العلاج: {m.course_duration_days} يوم</p>
              )}
              {m.pack_size != null && (
                <p className={`text-xs ${m.remaining_doses <= m.low_stock_threshold ? "text-red-500 font-medium" : "text-neutral-400"}`}>
                  باقي {m.remaining_doses} من {m.pack_size}
                </p>
              )}
              <div className="flex items-center gap-2">
                <button onClick={() => logDose(m.id)} className={`${btnGhost} flex items-center gap-1`}>
                  <CheckCircle2 size={12} /> سجّل جرعة اتاخدت
                </button>
                <button onClick={() => startEditMed(m)} className="text-neutral-400 hover:text-orange-600 p-1"><Pencil size={14} /></button>
                <button onClick={() => delMed(m.id)} className="text-red-500 p-1"><Trash2 size={14} /></button>
              </div>
            </Card>
          )
        )}
        {!meds.length && <p className="text-sm text-neutral-400 text-center py-4">مفيش أدوية مسجلة</p>}
      </div>

      <div ref={apptFormRef}>
      <Card className="space-y-2">
        <p className="text-sm font-medium">موعد طبي جديد</p>
        <div className="grid grid-cols-2 gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-1 text-xs">
          <button onClick={() => setApptForm({ ...apptForm, kind: "checkup" })} className={`py-1.5 rounded-md ${apptForm.kind === "checkup" ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>كشف طبي</button>
          <button onClick={() => setApptForm({ ...apptForm, kind: "consultation" })} className={`py-1.5 rounded-md ${apptForm.kind === "consultation" ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>استشارة</button>
        </div>
        {apptForm.parent_appointment_id && (
          <div className="flex items-center justify-between bg-orange-50 dark:bg-orange-950/30 rounded-lg px-2 py-1.5">
            <p className="text-xs text-orange-600">مربوطة كمتابعة لكشف سابق</p>
            <button onClick={() => setApptForm({ ...apptForm, parent_appointment_id: "" })} className="text-orange-600 p-0.5"><X size={12} /></button>
          </div>
        )}
        <input placeholder="العنوان (اختياري)" value={apptForm.title} onChange={(e) => setApptForm({ ...apptForm, title: e.target.value })} className={inputCls} />
        <input type="datetime-local" value={apptForm.appointment_at} onChange={(e) => setApptForm({ ...apptForm, appointment_at: e.target.value })} className={inputCls} />
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="اسم الطبيب المعالج" value={apptForm.doctor_name} onChange={(e) => setApptForm({ ...apptForm, doctor_name: e.target.value })} className={inputCls} />
          <input placeholder="التخصص" value={apptForm.doctor_specialty} onChange={(e) => setApptForm({ ...apptForm, doctor_specialty: e.target.value })} className={inputCls} />
        </div>
        <input placeholder="رقم الهاتف" value={apptForm.doctor_phone} onChange={(e) => setApptForm({ ...apptForm, doctor_phone: e.target.value })} className={inputCls} />
        <input placeholder="عنوان العيادة" value={apptForm.doctor_address} onChange={(e) => setApptForm({ ...apptForm, doctor_address: e.target.value })} className={inputCls} />
        {meds.length > 0 && (
          <select value={apptForm.medication_id} onChange={(e) => setApptForm({ ...apptForm, medication_id: e.target.value })} className={inputCls}>
            <option value="">بدون ربط بدواء</option>
            {meds.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        )}
        <label className={`${btnGhost} flex items-center justify-center gap-1 cursor-pointer`}>
          <Camera size={14} /> {apptForm.prescription_image ? "تغيير صورة الروشتة" : "إرفاق صورة الروشتة"}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setApptForm({ ...apptForm, prescription_image: await shrinkImage(f) }); }} />
        </label>
        {apptForm.prescription_image && <img src={apptForm.prescription_image} alt="روشتة" className="rounded-lg max-h-32 mx-auto" />}
        <p className="text-xs text-neutral-400">هيتبعتلك تذكير قبلها بيوم، وتاني قبلها بـ 3 ساعات.</p>
        {apptError && <p className="text-xs text-red-500">{apptError}</p>}
        <button onClick={submitAppt} disabled={savingAppt} className={btnPrimary}>
          {savingAppt ? <Loader2 size={14} className="animate-spin inline" /> : "إضافة الموعد"}
        </button>
      </Card>
      </div>

      <div className="space-y-2">
        {appts.map((a) => {
          const followUp = a.kind === "checkup" ? appts.find((x) => x.parent_appointment_id === a.id) : null;
          const parent = a.parent_appointment_id ? appts.find((x) => x.id === a.parent_appointment_id) : null;
          return editingApptId === a.id ? (
            <Card key={a.id} className="space-y-2">
              <div className="grid grid-cols-2 gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-1 text-xs">
                <button onClick={() => setEditApptForm({ ...editApptForm, kind: "checkup" })} className={`py-1.5 rounded-md ${editApptForm.kind === "checkup" ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>كشف طبي</button>
                <button onClick={() => setEditApptForm({ ...editApptForm, kind: "consultation" })} className={`py-1.5 rounded-md ${editApptForm.kind === "consultation" ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>استشارة</button>
              </div>
              <input placeholder="العنوان (اختياري)" value={editApptForm.title} onChange={(e) => setEditApptForm({ ...editApptForm, title: e.target.value })} className={inputCls} />
              <input type="datetime-local" value={editApptForm.appointment_at} onChange={(e) => setEditApptForm({ ...editApptForm, appointment_at: e.target.value })} className={inputCls} />
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="اسم الطبيب المعالج" value={editApptForm.doctor_name} onChange={(e) => setEditApptForm({ ...editApptForm, doctor_name: e.target.value })} className={inputCls} />
                <input placeholder="التخصص" value={editApptForm.doctor_specialty} onChange={(e) => setEditApptForm({ ...editApptForm, doctor_specialty: e.target.value })} className={inputCls} />
              </div>
              <input placeholder="رقم الهاتف" value={editApptForm.doctor_phone} onChange={(e) => setEditApptForm({ ...editApptForm, doctor_phone: e.target.value })} className={inputCls} />
              <input placeholder="عنوان العيادة" value={editApptForm.doctor_address} onChange={(e) => setEditApptForm({ ...editApptForm, doctor_address: e.target.value })} className={inputCls} />
              <label className={`${btnGhost} flex items-center justify-center gap-1 cursor-pointer`}>
                <Camera size={14} /> {editApptForm.prescription_image ? "تغيير صورة الروشتة" : "إرفاق صورة الروشتة"}
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setEditApptForm({ ...editApptForm, prescription_image: await shrinkImage(f) }); }} />
              </label>
              {editApptForm.prescription_image && <img src={editApptForm.prescription_image} alt="روشتة" className="rounded-lg max-h-32 mx-auto" />}
              <div className="flex items-center gap-2">
                <button onClick={() => saveEditAppt(a.id)} disabled={editApptSaving} className={btnPrimary}>
                  {editApptSaving ? <Loader2 size={14} className="animate-spin inline" /> : "حفظ"}
                </button>
                <button onClick={() => setEditingApptId(null)} className={btnGhost}>إلغاء</button>
              </div>
            </Card>
          ) : (
            <Card key={a.id} className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{a.kind === "consultation" ? "استشارة طبية" : "كشف طبي"}{a.title ? ` — ${a.title}` : ""}</p>
                {a.status === "upcoming" && (
                  <button onClick={() => markApptDone(a.id)} className="text-xs text-blue-600">تم ✓</button>
                )}
              </div>
              <p className="text-xs text-neutral-400">{new Date(a.appointment_at).toLocaleString("ar-EG")}{a.medications?.name ? ` — ${a.medications.name}` : ""}</p>
              {(a.doctor_name || a.doctor_specialty || a.doctor_phone || a.doctor_address) && (
                <p className="text-xs text-neutral-400">
                  {a.doctor_name ? `د. ${a.doctor_name}` : ""}{a.doctor_specialty ? ` (${a.doctor_specialty})` : ""}{a.doctor_phone ? ` — ${a.doctor_phone}` : ""}{a.doctor_address ? ` — ${a.doctor_address}` : ""}
                </p>
              )}
              {parent && <p className="text-xs text-orange-500">متابعة لكشف: {parent.title || new Date(parent.appointment_at).toLocaleDateString("ar-EG")}</p>}
              {followUp && <p className="text-xs text-orange-500">فيه استشارة متابعة يوم {new Date(followUp.appointment_at).toLocaleString("ar-EG")}</p>}
              {a.prescription_image && <img src={a.prescription_image} alt="روشتة" className="rounded-lg max-h-24" />}
              <div className="flex items-center gap-2 flex-wrap">
                {a.kind === "checkup" && !followUp && (
                  <button onClick={() => startFollowUp(a)} className={`${btnGhost} text-xs`}>تسجيل استشارة متابعة</button>
                )}
                <button onClick={() => startEditAppt(a)} className="text-neutral-400 hover:text-orange-600 p-1"><Pencil size={14} /></button>
                <button onClick={() => delAppt(a.id)} className="text-red-500 p-1"><Trash2 size={14} /></button>
              </div>
            </Card>
          );
        })}
        {!appts.length && <p className="text-sm text-neutral-400 text-center py-4">مفيش مواعيد مسجلة</p>}
      </div>
    </div>
  );
}

/* ============================= قراءة العدادات ============================= */

const METER_LABELS: Record<string, string> = { electricity: "كهرباء", gas: "غاز", water: "مياه" };
const METER_EMOJI: Record<string, string> = { electricity: "⚡", gas: "🔥", water: "💧" };

function UtilityTab() {
  const [meterType, setMeterType] = useState("electricity");
  const [readingValue, setReadingValue] = useState("");
  const [readingDate, setReadingDate] = useState(new Date().toISOString().slice(0, 10));
  const [photo, setPhoto] = useState("");
  const [readings, setReadings] = useState<any[]>([]);
  const [insights, setInsights] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);
  const [editSaving, setEditSaving] = useState(false);

  const load = () => {
    fetch("/api/reminders/utility-meters").then((r) => r.json()).then((d) => setReadings(d.readings || []));
    fetch("/api/reminders/utility-meters/insights").then((r) => r.json()).then((d) => setInsights(d.insights || []));
  };
  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    if (!(Number(readingValue) >= 0)) return;
    setSaving(true);
    try {
      await fetch("/api/reminders/utility-meters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meter_type: meterType, reading_value: Number(readingValue), reading_date: readingDate, photo: photo || null }),
      });
      setReadingValue("");
      setPhoto("");
      load();
    } finally {
      setSaving(false);
    }
  };
  const del = async (id: string) => {
    await fetch(`/api/reminders/utility-meters/${id}`, { method: "DELETE" });
    load();
  };

  const startEdit = (r: any) => {
    setEditingId(r.id);
    setEditForm({ meter_type: r.meter_type, reading_value: String(r.reading_value), reading_date: r.reading_date, photo: r.photo || "" });
  };
  const saveEdit = async (id: string) => {
    if (!(Number(editForm.reading_value) >= 0)) return;
    setEditSaving(true);
    try {
      await fetch(`/api/reminders/utility-meters/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meter_type: editForm.meter_type, reading_value: Number(editForm.reading_value), reading_date: editForm.reading_date, photo: editForm.photo || null }),
      });
      setEditingId(null);
      load();
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <p className="text-sm font-medium">تسجيل قراءة جديدة</p>
        <div className="grid grid-cols-3 gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-1 text-xs">
          {Object.entries(METER_LABELS).map(([key, label]) => (
            <button key={key} onClick={() => setMeterType(key)} className={`py-1.5 rounded-md ${meterType === key ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>
              {METER_EMOJI[key]} {label}
            </button>
          ))}
        </div>
        <input type="number" placeholder="قيمة القراءة" value={readingValue} onChange={(e) => setReadingValue(e.target.value)} className={inputCls} />
        <input type="date" value={readingDate} onChange={(e) => setReadingDate(e.target.value)} className={inputCls} />
        <label className={`${btnGhost} flex items-center justify-center gap-1 cursor-pointer`}>
          <Camera size={14} /> {photo ? "تغيير صورة العداد" : "صوّر العداد (اختياري)"}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await shrinkImage(f)); }} />
        </label>
        {photo && <img src={photo} alt="العداد" className="rounded-lg max-h-32 mx-auto" />}
        <button onClick={submit} disabled={saving} className={btnPrimary}>
          {saving ? <Loader2 size={14} className="animate-spin inline" /> : "تسجيل القراءة"}
        </button>
      </Card>

      {insights.length > 0 && (
        <Card className="space-y-1">
          <p className="text-sm font-medium">مقارنة الاستهلاك</p>
          {insights.map((i) => (
            <p key={i.meter_type} className="text-xs">
              {METER_EMOJI[i.meter_type]} {i.label}:{" "}
              {i.comparable ? (i.diff_pct === null ? "مش كفاية بيانات للمقارنة" : `${i.diff_pct > 0 ? "أعلى" : "أقل"} بـ ${Math.abs(i.diff_pct)}% عن الفترة اللي قبلها`) : "محتاج قراءتين على الأقل للمقارنة"}
            </p>
          ))}
        </Card>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">آخر القراءات</p>
        {readings.map((r) =>
          editingId === r.id ? (
            <Card key={r.id} className="space-y-2">
              <div className="grid grid-cols-3 gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-1 text-xs">
                {Object.entries(METER_LABELS).map(([key, label]) => (
                  <button key={key} onClick={() => setEditForm({ ...editForm, meter_type: key })} className={`py-1.5 rounded-md ${editForm.meter_type === key ? "bg-white dark:bg-neutral-900 shadow" : ""}`}>
                    {METER_EMOJI[key]} {label}
                  </button>
                ))}
              </div>
              <input type="number" placeholder="قيمة القراءة" value={editForm.reading_value} onChange={(e) => setEditForm({ ...editForm, reading_value: e.target.value })} className={inputCls} />
              <input type="date" value={editForm.reading_date} onChange={(e) => setEditForm({ ...editForm, reading_date: e.target.value })} className={inputCls} />
              <label className={`${btnGhost} flex items-center justify-center gap-1 cursor-pointer`}>
                <Camera size={14} /> {editForm.photo ? "تغيير صورة العداد" : "صوّر العداد (اختياري)"}
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setEditForm({ ...editForm, photo: await shrinkImage(f) }); }} />
              </label>
              {editForm.photo && <img src={editForm.photo} alt="العداد" className="rounded-lg max-h-32 mx-auto" />}
              <div className="flex items-center gap-2">
                <button onClick={() => saveEdit(r.id)} disabled={editSaving} className={btnPrimary}>
                  {editSaving ? <Loader2 size={14} className="animate-spin inline" /> : "حفظ"}
                </button>
                <button onClick={() => setEditingId(null)} className={btnGhost}>إلغاء</button>
              </div>
            </Card>
          ) : (
            <Card key={r.id} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{METER_EMOJI[r.meter_type]} {r.reading_value.toLocaleString()}</p>
                <p className="text-xs text-neutral-400">{r.reading_date}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => startEdit(r)} className="text-neutral-400 hover:text-orange-600 p-1"><Pencil size={14} /></button>
                <button onClick={() => del(r.id)} className="text-red-500 p-1"><Trash2 size={14} /></button>
              </div>
            </Card>
          )
        )}
        {!readings.length && <p className="text-sm text-neutral-400 text-center py-4">مفيش قراءات مسجلة</p>}
      </div>
    </div>
  );
}
