"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Card from "@/components/Card";
import Switch from "@/components/Switch";
import { shrinkImage } from "@/lib/image";
import { shareFile } from "@/lib/shareFile";
import { showExportError } from "@/lib/exportToast";
import { renderHtmlToCanvas, canvasToPdf } from "@/lib/pdfExport";
import { todayISO, daysInMonth, firstWeekdayOfMonth, parseISO, ARABIC_MONTHS, addDays } from "@/lib/laha/dates";
import {
  cycleInfo, cycleRegularity, PRODUCTIVITY_MAP, detectGapFillers, waterRetentionInsight, describeTravelRange,
  dayMedicalSummary, type CyclePhase,
} from "@/lib/laha/cycle";
import { pregnancyInfo, fetalSizeLabel, weekBucket, gestationalMonth } from "@/lib/laha/pregnancy";
import { GENDER_REVEAL_DUA, genderRevealCongrats } from "@/lib/laha/genderReveal";
import {
  Heart, Baby, Calendar, Scale, StickyNote, Footprints, Timer, Stethoscope,
  // Round 47 — "Party Popper 🎉 شيله من أي مكان": استبدلناها بأيقونة Gift.
  // Round 48 — المستخدمة طلبت شيل Gift كمان من كل حتة "من غير أي بديل من
  // دماغي" — اتشالت من كل الأماكن الزخرفية (كارت الاحتفال). المكان الوحيد
  // اللي محتاج أيقونة إجباريًا (تبويب "تيم بينك/بلو" في القائمة الجانبية،
  // كل التبويبات التانية ليها أيقونة) — سألتها واختارت "دائرتين متقابلتين"
  // = أيقونة Blend (نفس شكل رمز البولد/جيرل التقليدي بدايرتين متداخلتين).
  Sparkles, Blend, Copy, Lock, Unlock, Check, X, Wand2, ChevronRight, ChevronLeft, Search,
  CalendarRange, Zap, Users, Plane, Printer, RefreshCw, ExternalLink, FileDown, Trash2, Pencil,
  type LucideIcon,
} from "lucide-react";

// Round 38 — قسم "لها": متابعة الدورة الشهرية والحمل + حفلة "تيم بينك ولا
// تيم بلو؟" (الكشف عن نوع الجنين). مبني بمراجعة كاملة للبروتوتايب المرجعي
// اللي المستخدم رفعه (index 1.html) لكن بمعمارية حقيقية (Supabase + راوتس
// مصادَق عليها بدل localStorage)، ومع تفادي كل الأخطاء اللي طلعت من
// المراجعة (مشكلة التوقيت في حساب التواريخ، عدم التحقق من صحة المدخلات،
// الـ PIN كنص عادي، إلخ — راجع lib/laha/*.ts للتفاصيل).
//
// نطاق الراوند ده تم تبسيطه عمدًا في بعض النواحي الثانوية مقارنة
// بالبروتوتايب المرجعي (زي محاكي توافق السفر/الأحداث، تصدير تقرير الدكتور،
// مشاركة الحالة المزاجية مع الشريك، خريطة الإنتاجية، تنبيه احتباس الماء) —
// الأولوية اتوجهت للأجزاء اللي طلبها المستخدم صراحة (اقتراح الأسماء
// والنصايح بالذكاء الاصطناعي، وحفلة الكشف عن نوع الجنين بالتفصيل).
//
// Round 39 — تعديلات بعد أول تجربة فعلية: (1) نصوص "من جيمناي"/"بنسأل
// جيمناي" اتشالت من كل الواجهة — المستخدمة متشوفش تفاصيل إزاي الاقتراح
// بيتحسب. (2) تقويم تفاعلي حقيقي في تبويب الدورة (`CycleCalendar`) — دوسي
// على أي يوم تحددي بداية/نهاية الدورة بيه، بدل زرار "اليوم" بس. (3) تبويب
// أسماء المولود اتعمله ريديزاين: "اختارلي اسم" بدل "اقتراح بالذكاء
// الاصطناعي"، بيبي متحركة رايحة جاية جوه الزرار وقت التحميل، معالجة أشمل
// للأخطاء (مفيش alert() بعد كده — رسالة داخل الكارت + إعادة محاولة)، خانة
// "اسأل عن معنى اسم" جديدة، وخانة اسم الأب هنا نفسها عشان تتشاف الاسم كامل.
// (4) بانر تذكير قبل الدورة القادمة (PMS/شنطة العناية) في الرئيسية.

// Round 45 — لأي نص حر بيتحط في innerHTML مباشرة (تصدير PDF)، عشان علامات
// زي < أو & متكسرش الرسم. نفس الدالة المستخدمة في reminders/page.tsx.
function escapeHtml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

type Mode = "cycle" | "pregnancy";
type Gender = "boy" | "girl";

interface Settings {
  mode: Mode;
  avg_cycle_length: number;
  avg_period_length: number;
  pregnancy_active: boolean;
  lmp: string | null;
  father_name: string | null;
}

const TABS_CYCLE = [
  { key: "home", label: "الرئيسية", icon: Calendar },
  { key: "planning", label: "التخطيط", icon: CalendarRange },
  { key: "weight", label: "الوزن", icon: Scale },
  { key: "notes", label: "ملاحظات", icon: StickyNote },
  { key: "advice", label: "نصايح البشرة", icon: Sparkles },
  { key: "partner", label: "الشريك", icon: Users },
] as const;

// Round 44 — "تبويبات جوه متابعة الحمل هما تقريبا ١١، خليهم مثلا ٥ وتحتهم
// ٤ علشان كله يبقى ظاهر": صف تبويبات مسطّح من ١١ عنصر كان بيحتاج سحب أفقي
// طويل. اتجمّعوا هنا في ٥ مجموعات (الرئيسية مستقلة + ٤ مجموعات فيها من
// عنصرين لتلاتة كل واحدة) — نفس الـ keys اللي بتتقرا في منطق عرض التبويب
// تحت (activeTabs === "kicks" إلخ) فضلت زي ما هي بالظبط، بس اتلفّت في
// مجموعات للعرض بس. اتكتب النوع صراحة (بدل as const) عشان الاتحاد بين
// مجموعات فيها items مختلفة الطول ميعملش تعارض في أنواع TypeScript.
type TabItem = { key: string; label: string; icon: LucideIcon };
type TabGroup = { key: string; label: string; icon: LucideIcon; items: TabItem[] | null };

const TABS_PREGNANCY_GROUPS: TabGroup[] = [
  { key: "home", label: "الرئيسية", icon: Baby, items: null },
  {
    key: "tracking", label: "المتابعة", icon: Footprints,
    items: [
      { key: "kicks", label: "الركلات", icon: Footprints },
      { key: "contractions", label: "الانقباضات", icon: Timer },
    ],
  },
  {
    key: "medical", label: "متابعة الطبيب", icon: Stethoscope,
    items: [
      { key: "appointments", label: "كارت المتابعة", icon: Stethoscope },
      { key: "doctor", label: "أسئلة للدكتور", icon: Stethoscope },
    ],
  },
  {
    key: "daily", label: "اليوميات", icon: StickyNote,
    items: [
      { key: "weight", label: "الوزن", icon: Scale },
      { key: "notes", label: "ملاحظات", icon: StickyNote },
      { key: "advice", label: "نصايح الحمل", icon: Sparkles },
    ],
  },
  {
    key: "family", label: "المولود والعائلة", icon: Wand2,
    items: [
      { key: "names", label: "أسماء المولود", icon: Wand2 },
      { key: "reveal", label: "تيم بينك/بلو", icon: Blend },
      { key: "partner", label: "الشريك", icon: Users },
    ],
  },
];

// كل مفاتيح التبويبات المسطّحة (نفس الاستخدام القديم) — مستخرجة من
// TABS_PREGNANCY_GROUPS تلقائيًا عشان ميحصلش تكرار/نسيان مفتاح.
const TABS_PREGNANCY: TabItem[] = TABS_PREGNANCY_GROUPS.flatMap((g) => (g.items ? g.items : [{ key: g.key, label: g.label, icon: g.icon }]));

async function api(url: string, opts?: RequestInit) {
  const res = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", ...(opts?.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "حصل خطأ");
  return data;
}

export default function LahaPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tab, setTab] = useState<string>("home");
  const [loading, setLoading] = useState(true);

  const loadSettings = async () => {
    const d = await api("/api/laha/settings");
    setSettings(d);
  };
  useEffect(() => {
    loadSettings().finally(() => setLoading(false));
  }, []);

  const saveSettings = async (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch } as Settings;
    setSettings(next);
    try {
      await api("/api/laha/settings", { method: "POST", body: JSON.stringify(next) });
    } catch (e: any) {
      alert(e.message);
      loadSettings();
    }
  };

  if (loading || !settings) return <p className="text-sm text-neutral-400 text-center py-10">جاري التحميل...</p>;

  const tabs = settings.mode === "pregnancy" ? TABS_PREGNANCY : TABS_CYCLE;
  const activeTabs = tabs.some((t) => t.key === tab) ? tab : "home";

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-full bg-pink-50 dark:bg-pink-950 text-pink-500 flex items-center justify-center shrink-0">
          <Heart size={18} />
        </div>
        <div>
          <h1 className="text-xl font-bold">لها</h1>
          <p className="text-xs text-neutral-400">متابعة الدورة والحمل، خاص بيكي بالكامل</p>
        </div>
      </div>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">الوضع الحالي</p>
          <div className="flex rounded-full bg-neutral-100 dark:bg-neutral-800 p-0.5 text-xs">
            <button
              onClick={() => saveSettings({ mode: "cycle" })}
              className={`px-3 py-1.5 rounded-full font-medium transition ${settings.mode === "cycle" ? "bg-white dark:bg-neutral-700 shadow-sm" : "text-neutral-400"}`}
            >
              متابعة الدورة
            </button>
            <button
              onClick={() => saveSettings({ mode: "pregnancy", pregnancy_active: true })}
              className={`px-3 py-1.5 rounded-full font-medium transition ${settings.mode === "pregnancy" ? "bg-white dark:bg-neutral-700 shadow-sm" : "text-neutral-400"}`}
            >
              متابعة الحمل
            </button>
          </div>
        </div>

        {settings.mode === "cycle" && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="text-neutral-400">متوسط طول الدورة (يوم)</label>
              <input type="number" value={settings.avg_cycle_length} onChange={(e) => saveSettings({ avg_cycle_length: Number(e.target.value) })}
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 mt-0.5" />
            </div>
            <div>
              <label className="text-neutral-400">مدة الطمث (يوم)</label>
              <input type="number" value={settings.avg_period_length} onChange={(e) => saveSettings({ avg_period_length: Number(e.target.value) })}
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 mt-0.5" />
            </div>
          </div>
        )}

        {settings.mode === "pregnancy" && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="text-neutral-400">تاريخ أول يوم لآخر دورة (LMP)</label>
              <input type="date" value={settings.lmp || ""} onChange={(e) => saveSettings({ lmp: e.target.value || null })}
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 mt-0.5" />
            </div>
            <div>
              <label className="text-neutral-400">اسم الأب (اختياري)</label>
              <input value={settings.father_name || ""} onChange={(e) => saveSettings({ father_name: e.target.value })}
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 mt-0.5" />
            </div>
          </div>
        )}
      </Card>

      {/* Round 42 — "نيون بيلف حوالين التبويب لو مش واقف عليها": المستخدم
          مكنش بيلاحظ إن فيه تبويبات تانية (زي "تيم بينك/بلو" اللي كان
          فاكرها "مش موجودة" أصلاً مع إنها متعملة من راوند 38) — توهج نيون
          خفيف بيلف حوالين كل تبويب مش واقف عليه بيلفت النظر إن فيه محتوى
          تاني يستاهل يتفتح.
          Round 44 — في وضع الحمل، صف التبويبات كان ١١ عنصر مسطّح (سحب أفقي
          طويل) — اتلفّ في ٥ مجموعات (TABS_PREGNANCY_GROUPS)، وأي مجموعة
          فيها أكتر من عنصر بيظهر تحتها صف تبويبات فرعي (بنفس توهج النيون). */}
      {settings.mode === "pregnancy" ? (
        <>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {TABS_PREGNANCY_GROUPS.map((g) => {
              const isActiveGroup = g.items ? g.items.some((i) => i.key === activeTabs) : g.key === activeTabs;
              const Icon = g.icon;
              return (
                <button
                  key={g.key}
                  onClick={() => setTab(g.items ? g.items[0].key : g.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition border ${
                    isActiveGroup
                      ? "bg-pink-500 text-white border-transparent"
                      : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 border-pink-300/70 dark:border-pink-700/60 animate-neon-tab"
                  }`}
                >
                  <Icon size={13} /> {g.label}
                </button>
              );
            })}
          </div>
          {TABS_PREGNANCY_GROUPS.filter((g) => g.items && g.items.some((i) => i.key === activeTabs)).map((g) => (
            <div key={g.key} className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              {g.items!.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0 transition border ${
                    activeTabs === key
                      ? "bg-pink-400 text-white border-transparent"
                      : "bg-white dark:bg-neutral-900 text-neutral-400 border-pink-200/70 dark:border-pink-800/50 animate-neon-tab"
                  }`}
                >
                  <Icon size={12} /> {label}
                </button>
              ))}
            </div>
          ))}
        </>
      ) : (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition border ${
                activeTabs === key
                  ? "bg-pink-500 text-white border-transparent"
                  : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500 border-pink-300/70 dark:border-pink-700/60 animate-neon-tab"
              }`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
      )}

      {activeTabs === "home" && settings.mode === "cycle" && <CycleHomeTab settings={settings} />}
      {activeTabs === "home" && settings.mode === "pregnancy" && <PregnancyHomeTab settings={settings} />}
      {activeTabs === "planning" && <PlanningTab settings={settings} />}
      {activeTabs === "partner" && <PartnerSyncTab mode={settings.mode} />}
      {activeTabs === "weight" && <WeightTab settings={settings} />}
      {activeTabs === "notes" && <NotesTab />}
      {activeTabs === "kicks" && <KicksTab />}
      {activeTabs === "contractions" && <ContractionsTab />}
      {activeTabs === "appointments" && <AppointmentsTab />}
      {activeTabs === "doctor" && settings.lmp && <DoctorQuestionsTab lmp={settings.lmp} />}
      {activeTabs === "names" && <BabyNamesTab settings={settings} saveSettings={saveSettings} />}
      {activeTabs === "advice" && settings.mode === "cycle" && <SkincareAdviceTab settings={settings} />}
      {activeTabs === "advice" && settings.mode === "pregnancy" && <PregnancyAdviceTab settings={settings} />}
      {activeTabs === "reveal" && <GenderRevealTab />}
    </div>
  );
}

// ─────────────────────────────── متابعة الدورة ───────────────────────────

function CycleHomeTab({ settings }: { settings: Settings }) {
  const [periods, setPeriods] = useState<any[]>([]);
  const [info, setInfo] = useState<any>(null);
  const [regularity, setRegularity] = useState<string>("unknown");
  const [busy, setBusy] = useState(false);
  const [gapBusy, setGapBusy] = useState(false);
  const [dismissedGaps, setDismissedGaps] = useState<string[]>([]);

  const load = async () => {
    const d = await api("/api/laha/periods");
    setPeriods(d.periods || []);
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    setInfo(cycleInfo(periods, settings.avg_cycle_length, todayISO(), settings.avg_period_length));
    setRegularity(cycleRegularity(periods));
  }, [periods, settings.avg_cycle_length, settings.avg_period_length]);

  const activePeriod = periods.find((p) => !p.end_date);

  // Round 40 — "التقدير الرجعي": فجوات كبيرة بين دورتين متسجلتين، بتتقترح
  // بس لما المستخدمة توافق عليها صراحة (مفيش إضافة تلقائية أبدًا).
  const gapFillers = detectGapFillers(periods, settings.avg_cycle_length).filter((g) => !dismissedGaps.includes(g.afterStart + g.beforeStart));
  const applyGap = async (dates: string[], gapKey: string) => {
    setGapBusy(true);
    try {
      await api("/api/laha/periods/backfill", { method: "POST", body: JSON.stringify({ dates, period_length: settings.avg_period_length }) });
      setDismissedGaps((prev) => [...prev, gapKey]);
      load();
    } catch (e: any) { alert(e.message); } finally { setGapBusy(false); }
  };
  const applyAllGaps = async () => {
    setGapBusy(true);
    try {
      const allDates = gapFillers.flatMap((g) => g.proposedDates);
      await api("/api/laha/periods/backfill", { method: "POST", body: JSON.stringify({ dates: allDates, period_length: settings.avg_period_length }) });
      setDismissedGaps((prev) => [...prev, ...gapFillers.map((g) => g.afterStart + g.beforeStart)]);
      load();
    } catch (e: any) { alert(e.message); } finally { setGapBusy(false); }
  };

  const startPeriodOn = async (dateISO: string) => {
    setBusy(true);
    try {
      await api("/api/laha/periods", { method: "POST", body: JSON.stringify({ start_date: dateISO }) });
      load();
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const endPeriodOn = async (dateISO: string) => {
    if (!activePeriod) { alert("لازم تحددي بداية الدورة الأول"); return; }
    setBusy(true);
    try {
      await api(`/api/laha/periods/${activePeriod.id}`, { method: "PATCH", body: JSON.stringify({ end_date: dateISO }) });
      load();
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const deletePeriod = async (id: string) => {
    setBusy(true);
    try { await api(`/api/laha/periods/${id}`, { method: "DELETE" }); load(); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

 const REGULARITY_LABEL: Record<string, string> = { regular:"منتظمة", slight:"فيها تفاوت بسيط", irregular:"غير منتظمة", unknown:"لسه مفيش بيانات كفاية"};

  // "شنطة العناية" — بانر لطيف من ٠-٣ أيام قبل الدورة المتوقعة.
  const daysToNextPeriod = info?.nextPeriodDate ? Math.round((new Date(info.nextPeriodDate).getTime() - new Date(todayISO()).getTime()) / 86400000) : null;
  const showCareBag = !activePeriod && daysToNextPeriod !== null && daysToNextPeriod >= 0 && daysToNextPeriod <= 3;
  const showPms = !activePeriod && daysToNextPeriod !== null && daysToNextPeriod >= 0 && daysToNextPeriod <= 7;

  return (
    <div className="space-y-3">
      <Card className="text-center space-y-2">
        {info ? (
          <>
            <p className="text-xs text-neutral-400">يوم {info.dayInCycle} من الدورة — {PHASE_LABEL_AR[info.phase as string]}</p>
            {!activePeriod && info.nextPeriodDate && <p className="text-sm">الدورة القادمة متوقعة: <b>{fmtDate(info.nextPeriodDate)}</b></p>}
            {info.fertileStart && <p className="text-xs text-neutral-400">فترة الخصوبة: {fmtDate(info.fertileStart)} - {fmtDate(info.fertileEnd)}</p>}
          </>
        ) : (
          <p className="text-sm text-neutral-400">سجّلي أول دورة عشان يبدأ الحساب — دوسي على يوم في التقويم تحت</p>
        )}
        <button onClick={() => (activePeriod ? endPeriodOn(todayISO()) : startPeriodOn(todayISO()))} disabled={busy}
          className={`w-full rounded-xl py-2.5 text-sm font-semibold text-white ${activePeriod ? "bg-neutral-500" : "bg-pink-500"}`}>
          {activePeriod ? "انتهت الدورة اليوم" : "بدأت الدورة اليوم"}
        </button>
      </Card>

      {showCareBag && (
        <Card className="bg-pink-50 dark:bg-pink-950/40 border-pink-200 dark:border-pink-900 text-center text-xs font-medium text-pink-600 dark:text-pink-300">
 جهزي شنطة العناية — الدورة متوقعة خلال {daysToNextPeriod === 0 ?"اليوم":`${daysToNextPeriod} يوم`}
        </Card>
      )}
      {showPms && !showCareBag && (
        <Card className="bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-900 text-center text-xs font-medium text-purple-600 dark:text-purple-300">
 قربنا على الدورة — لو حاسة بتقلب مزاج أو نفاد صبر، ده طبيعي جدًا، خدي بالك من نفسك شوية
        </Card>
      )}

      <CycleCalendar
        periods={periods}
        avgCycleLength={settings.avg_cycle_length}
        avgPeriodLength={settings.avg_period_length}
        activePeriodId={activePeriod?.id || null}
        busy={busy}
        onStart={startPeriodOn}
        onEnd={endPeriodOn}
        onDelete={deletePeriod}
      />

      {gapFillers.length > 0 && (
        <Card className="space-y-2 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900">
 <p className="text-xs font-semibold text-amber-700 dark:text-amber-300"> لاحظنا فجوة كبيرة بين دورتين متسجلتين</p>
          {gapFillers.map((g) => (
            <div key={g.afterStart + g.beforeStart} className="text-xs space-y-1.5">
              <p className="text-neutral-500">بين {fmtDate(g.afterStart)} و{fmtDate(g.beforeStart)} — ممكن يكون فيه {g.proposedDates.length} دورة {g.proposedDates.length === 1 ? "متسجلتش" : "متسجلوش"}. حابة نضيفهم كتقدير؟</p>
              <div className="flex flex-wrap gap-1.5">
                {g.proposedDates.map((d) => (
                  <span key={d} className="bg-white dark:bg-neutral-800 rounded-full px-2 py-0.5 text-[10px] border border-amber-200 dark:border-amber-800">{fmtDate(d)}</span>
                ))}
              </div>
              <button disabled={gapBusy} onClick={() => applyGap(g.proposedDates, g.afterStart + g.beforeStart)} className="text-[11px] bg-amber-500 text-white rounded-lg px-3 py-1">تطبيق هذا التقدير</button>
            </div>
          ))}
          {gapFillers.length > 1 && (
            <button disabled={gapBusy} onClick={applyAllGaps} className="w-full text-xs bg-amber-600 text-white rounded-lg py-1.5 font-medium">تطبيق كل التقديرات دفعة واحدة</button>
          )}
        </Card>
      )}

      <DailyMicroLogCard />

      <Card className="flex items-center justify-between text-xs">
        <span className="text-neutral-400">انتظام الدورة (آخر ٦ دورات)</span>
        <span className="font-medium">{REGULARITY_LABEL[regularity]}</span>
      </Card>

      <Link href="/laha/doctor-report" className="flex items-center justify-center gap-1.5 text-xs bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900 rounded-xl py-2.5 font-medium">
        <Printer size={14} /> تقرير جاهز للطبيبة
      </Link>

      <Card className="space-y-2">
        <p className="text-xs font-semibold">آخر الدورات</p>
        {periods.slice(0, 6).map((p) => (
          <div key={p.id} className="flex items-center justify-between text-xs">
            <span>{fmtDate(p.start_date)}{p.end_date ? ` → ${fmtDate(p.end_date)}` : " (مستمرة)"}{p.estimated && <span className="text-neutral-400"> (تقدير)</span>}</span>
          </div>
        ))}
        {!periods.length && <p className="text-xs text-neutral-400">مفيش دورات مسجلة لسه</p>}
      </Card>
    </div>
  );
}

// تقويم شهري تفاعلي — دوسي على يوم تحددي بداية/نهاية الدورة بيه (طلب صريح:
// "التقويم يظهر في الدورة وتختار بالضغط بداية الدورة أو نهايتها"). تلوين كل
// يوم بيتحسب من `cycleInfo` بتاعته هو (مش "اليوم" العام) عشان يشتغل صح لأي
// شهر ماضي أو مستقبلي.
const DOW_LABELS = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

function CycleCalendar({
  periods, avgCycleLength, avgPeriodLength, activePeriodId, busy, onStart, onEnd, onDelete, travelRange,
}: {
  periods: any[]; avgCycleLength: number; avgPeriodLength?: number; activePeriodId: string | null; busy: boolean;
  onStart: (d: string) => void; onEnd: (d: string) => void; onDelete: (id: string) => void;
  travelRange?: { start: string; end: string } | null;
}) {
  const today = parseISO(todayISO());
  const [viewY, setViewY] = useState(today.y);
  const [viewM, setViewM] = useState(today.m);
  const [selected, setSelected] = useState<string | null>(null);

  const changeMonth = (delta: number) => {
    let m = viewM + delta, y = viewY;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setViewY(y); setViewM(m);
    setSelected(null);
  };

  // Round 40 — محاكي توافق السفر بيستخدم نفس مكوّن التقويم ده (`travelRange`
  // prop) بدل ما يعمل تقويم منفصل — لما المدى يتغيّر، الشهر المعروض بيقفز
  // تلقائيًا لشهر أول يوم في المدى.
  useEffect(() => {
    if (!travelRange?.start) return;
    const p = parseISO(travelRange.start);
    setViewY(p.y);
    setViewM(p.m);
  }, [travelRange?.start]);

  const numDays = daysInMonth(viewY, viewM);
  const startOffset = firstWeekdayOfMonth(viewY, viewM);
  const cells: (string | null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: numDays }, (_, i) => `${viewY}-${String(viewM).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`)];

  const categoryOf = (dateISO: string): "period" | "ovulation" | "fertile" | "safe" => {
    const info = cycleInfo(periods, avgCycleLength, dateISO, avgPeriodLength);
    if (!info) return "safe";
    if (info.isPeriodDay) return "period";
    if (info.ovulationDate === dateISO) return "ovulation";
    if (info.fertileStart && info.fertileEnd && dateISO >= info.fertileStart && dateISO <= info.fertileEnd) return "fertile";
    return "safe";
  };

  // Round 42 — "التقويم كبير جدا": ريديزاين مبني على البروتوتايب المرجعي
  // (index (2).html) — بدل ما اليوم يتلوّن بالكامل بلون الفئة (تخانة بصرية
  // كبيرة)، الخلفية بتفضل بيضا/محايدة ونقطة صغيرة تحت الرقم بس بتدّي اللون.
  // ده هو اللي بيخلي التقويم يحس إنه "أصغر" فعليًا حتى لو نفس المقاس بالبيكسل.
  const DOT_CLASS: Record<string, string> = {
    period: "bg-rose-400",
    ovulation: "bg-purple-500",
    fertile: "bg-emerald-400",
    safe: "bg-sky-300",
  };

  const selectedExactPeriod = selected ? periods.find((p) => p.start_date === selected) : null;
  // Round 48 — "أي يوم أقف عليه، اديني مختصر عنه... بالصيغ الطبية": ملخص
  // طبي مختصر لليوم المحدد (يوم دورة رقم كام / يوم تبويض / نافذة خصوبة /
  // يوم آمن) — راجع lib/laha/cycle.ts's dayMedicalSummary.
  const selectedSummary = selected ? dayMedicalSummary(periods, avgCycleLength, selected, avgPeriodLength) : null;
  const todayIso = todayISO();

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={() => changeMonth(1)} className="p-1 text-neutral-400"><ChevronRight size={16} /></button>
        <p className="text-sm font-semibold">{ARABIC_MONTHS[viewM - 1]} {viewY}</p>
        <button onClick={() => changeMonth(-1)} className="p-1 text-neutral-400"><ChevronLeft size={16} /></button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center max-w-xs mx-auto w-full">
        {DOW_LABELS.map((d) => <span key={d} className="text-[9px] text-neutral-400">{d}</span>)}
        {cells.map((dateISO, i) => {
          if (!dateISO) return <span key={`empty-${i}`} />;
          const cat = categoryOf(dateISO);
          const isToday = dateISO === todayIso;
          const isSelected = dateISO === selected;
          const inTravel = !!travelRange?.start && !!travelRange?.end && dateISO >= travelRange.start && dateISO <= travelRange.end;
          const isTravelEdge = dateISO === travelRange?.start || dateISO === travelRange?.end;
          return (
            <button
              key={dateISO}
              onClick={() => setSelected(isSelected ? null : dateISO)}
              className={`relative aspect-square rounded-lg text-[10px] flex flex-col items-center justify-center gap-0.5 transition border ${
                isSelected ? "border-pink-500 bg-pink-50 dark:bg-pink-950/40" : "border-transparent"
              } ${isToday ? "ring-1 ring-pink-400 font-bold" : ""} text-neutral-600 dark:text-neutral-300`}
            >
              {isTravelEdge && <Plane size={11} className="absolute -top-2 text-sky-500" />}
              <span>{parseISO(dateISO).d}</span>
              {inTravel ? (
                <Plane size={8} className="text-sky-400" />
              ) : (
                DOT_CLASS[cat] && <span className={`w-1.5 h-1.5 rounded-full ${DOT_CLASS[cat]}`} />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-neutral-400 justify-center">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-400" /> الدورة</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500" /> التبويض</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> نافذة الخصوبة</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-300" /> أيام آمنة</span>
 {travelRange?.start && <span className="flex items-center gap-1"> أيام الرحلة</span>}
      </div>

      {selected && (
        <div className="rounded-xl bg-neutral-50 dark:bg-neutral-800 p-3 space-y-2">
          <p className="text-xs font-medium text-center">{fmtDate(selected)}</p>
          {selectedSummary && (
            <p className="text-[11px] text-center text-pink-600 dark:text-pink-400 leading-relaxed">{selectedSummary}</p>
          )}
          <div className="flex flex-wrap gap-2 justify-center">
            <button disabled={busy} onClick={() => { onStart(selected); setSelected(null); }} className="text-xs bg-rose-500 text-white rounded-lg px-3 py-1.5">تعيين كبداية الدورة</button>
            <button disabled={busy || !activePeriodId} onClick={() => { onEnd(selected); setSelected(null); }} className="text-xs bg-neutral-500 text-white rounded-lg px-3 py-1.5 disabled:opacity-40">تعيين كنهاية الدورة</button>
            {selectedExactPeriod && (
              <button disabled={busy} onClick={() => { onDelete(selectedExactPeriod.id); setSelected(null); }} className="text-xs bg-red-500 text-white rounded-lg px-3 py-1.5">حذف هذا التسجيل</button>
            )}
            <button onClick={() => setSelected(null)} className="text-xs border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-1.5">إلغاء</button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────── التخطيط (Round 40) ──────────────────────
// تبويب"التخطيط"— سب-تابين زي ما وصف المستخدم في الملف المرجعي: السفر
// والمناسبات (محاكي التوافق + نفس مكوّن التقويم بـ overlay) و الطاقة
// (خريطة الإنتاجية حسب المرحلة الهرمونية). تبويب "عاوزة بيبي" من نفس قسم
// الملف المرجعي اتأجل لراوند قادم (خارج نطاق الميزات الست المتفق عليها).
const SEGMENT_CATEGORY_CLASS: Record<string, string> = {
  period: "border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30",
  ovulation: "border-purple-300 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30",
  fertile: "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30",
  safe: "border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800",
};

function PlanningTab({ settings }: { settings: Settings }) {
  const [sub, setSub] = useState<"travel" | "energy" | "baby">("travel");
  const [periods, setPeriods] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [tripStart, setTripStart] = useState("");
  const [tripEnd, setTripEnd] = useState("");

  const load = async () => { const d = await api("/api/laha/periods"); setPeriods(d.periods || []); };
  useEffect(() => { load(); }, []);

  const activePeriod = periods.find((p) => !p.end_date);
  const startPeriodOn = async (dateISO: string) => {
    setBusy(true);
    try { await api("/api/laha/periods", { method: "POST", body: JSON.stringify({ start_date: dateISO }) }); load(); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const endPeriodOn = async (dateISO: string) => {
    if (!activePeriod) { alert("لازم تحددي بداية الدورة الأول"); return; }
    setBusy(true);
    try { await api(`/api/laha/periods/${activePeriod.id}`, { method: "PATCH", body: JSON.stringify({ end_date: dateISO }) }); load(); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const deletePeriod = async (id: string) => {
    setBusy(true);
    try { await api(`/api/laha/periods/${id}`, { method: "DELETE" }); load(); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  const plan = tripStart && tripEnd ? describeTravelRange(periods, settings.avg_cycle_length, tripStart, tripEnd, settings.avg_period_length) : null;
  const info = cycleInfo(periods, settings.avg_cycle_length, todayISO(), settings.avg_period_length);
  const currentPhase = info?.phase || null;
  const lastPeriod = [...periods].sort((a, b) => (a.start_date < b.start_date ? 1 : -1))[0] || null;

  return (
    <div className="space-y-3">
      {/* Round 44 — "تبويبات جوه التخطيط برضوا حواليها نيون": نفس توهج
          النيون المستخدم في صف التبويبات الرئيسي، هنا حوالين أي سب-تاب مش
          مفعّل، عشان يبقى شكل متسق في كل التطبيق. */}
      <div className="flex gap-1 rounded-full bg-neutral-100 dark:bg-neutral-800 p-0.5 text-xs">
        <button onClick={() => setSub("travel")} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-full font-medium border ${sub === "travel" ? "bg-white dark:bg-neutral-700 shadow-sm border-transparent" : "text-neutral-400 border-pink-300/70 dark:border-pink-700/60 animate-neon-tab"}`}>
          <Plane size={13} /> السفر والمناسبات
        </button>
        <button onClick={() => setSub("energy")} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-full font-medium border ${sub === "energy" ? "bg-white dark:bg-neutral-700 shadow-sm border-transparent" : "text-neutral-400 border-pink-300/70 dark:border-pink-700/60 animate-neon-tab"}`}>
          <Zap size={13} /> الطاقة والإنتاجية
        </button>
        <button onClick={() => setSub("baby")} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-full font-medium border ${sub === "baby" ? "bg-white dark:bg-neutral-700 shadow-sm border-transparent" : "text-neutral-400 border-pink-300/70 dark:border-pink-700/60 animate-neon-tab"}`}>
          <Baby size={13} /> عاوزة بيبي
        </button>
      </div>

      {sub === "travel" && (
        <div className="space-y-3">
          <Card className="space-y-2">
            <p className="text-xs font-semibold">محاكي توافق السفر والمناسبات</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-neutral-400">من</label>
                <input type="date" value={tripStart} onChange={(e) => setTripStart(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 mt-0.5 text-xs" />
              </div>
              <div>
                <label className="text-[10px] text-neutral-400">إلى</label>
                <input type="date" value={tripEnd} onChange={(e) => setTripEnd(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 mt-0.5 text-xs" />
              </div>
            </div>
            {tripStart && tripEnd && !plan && <p className="text-[11px] text-red-500">المدى غير صالح (لازم "إلى" يكون بعد "من"، وبحد أقصى ٦٠ يوم)</p>}
          </Card>

          {plan && (
            <>
              <Card className={`text-xs font-medium text-center ${plan.verdict === "safe" ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300" : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300"}`}>
                {plan.verdictText}
              </Card>
              <Card className="space-y-2">
                {plan.segments.map((seg, i) => (
                  <div key={i} className={`rounded-lg border p-2 text-xs space-y-0.5 ${SEGMENT_CATEGORY_CLASS[seg.category]}`}>
                    <p className="font-medium">{seg.label}</p>
                    <p className="text-neutral-500 dark:text-neutral-400">{seg.note}</p>
                    {seg.extraNote && <p className="text-emerald-600 dark:text-emerald-400">{seg.extraNote}</p>}
                  </div>
                ))}
              </Card>
            </>
          )}

          <CycleCalendar
            periods={periods}
            avgCycleLength={settings.avg_cycle_length}
            avgPeriodLength={settings.avg_period_length}
            activePeriodId={activePeriod?.id || null}
            busy={busy}
            onStart={startPeriodOn}
            onEnd={endPeriodOn}
            onDelete={deletePeriod}
            travelRange={tripStart && tripEnd ? { start: tripStart, end: tripEnd } : null}
          />
        </div>
      )}

      {sub === "energy" && (
        <div className="space-y-3">
          {currentPhase && (
            <Card className="bg-gradient-to-b from-pink-50 to-purple-50 dark:from-pink-950 dark:to-purple-950 border-none text-center">
              <p className="text-xs text-neutral-500">دلوقتي في</p>
              <p className="text-lg font-bold">{PRODUCTIVITY_MAP[currentPhase].title}</p>
            </Card>
          )}
          {(Object.keys(PRODUCTIVITY_MAP) as CyclePhase[]).map((ph) => (
            <Card key={ph} className={`space-y-1.5 text-xs ${currentPhase === ph ? "ring-2 ring-pink-400" : ""}`}>
              <p className="font-semibold">{PHASE_LABEL_AR[ph]} — {PRODUCTIVITY_MAP[ph].title}</p>
              <p><b>العمل:</b> {PRODUCTIVITY_MAP[ph].work}</p>
              <p><b>الاجتماعي:</b> {PRODUCTIVITY_MAP[ph].social}</p>
              <p><b>الرياضة:</b> {PRODUCTIVITY_MAP[ph].fitness}</p>
            </Card>
          ))}
        </div>
      )}

      {sub === "baby" && (
        <div className="space-y-3">
          {!lastPeriod ? (
            <Card className="text-center text-sm text-neutral-400 py-6">سجّلي أول دورة في تبويب "الرئيسية" الأول عشان نقدر نحسب نافذة الخصوبة.</Card>
          ) : (
            <>
              <Card className="space-y-1.5 text-xs">
                <p>
                  دورتك الأخيرة بدأت يوم <b>{fmtDate(lastPeriod.start_date)}</b>{lastPeriod.end_date ? <> وانتهت يوم <b>{fmtDate(lastPeriod.end_date)}</b></> : null}.
                  بناءً على إن متوسط طول دورتك <b>{settings.avg_cycle_length}</b> يوم، من المتوقع إن التبويض هيكون يوم <b>{info?.ovulationDate ? fmtDate(info.ovulationDate) : "-"}</b>، والدورة الجاية متوقعة يوم <b>{info?.nextPeriodDate ? fmtDate(info.nextPeriodDate) : "-"}</b>.
                </p>
              </Card>

              {info?.fertileStart && info?.fertileEnd && (
                <Card className="text-center space-y-1 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">أفضل وقت للحمل — نافذة الخصوبة</p>
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{fmtDate(info.fertileStart)} إلى {fmtDate(info.fertileEnd)}</p>
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400">أعلى فرصة حمل في اليومين اللي قبل التبويض ويوم التبويض نفسه.</p>
                </Card>
              )}

              <Card className="space-y-1.5 text-xs">
                <p className="font-semibold">نصايح تزود فرصة الحمل</p>
                <p>• حمض الفوليك ٤٠٠ ميكروجرام يوميًا — يفضّل تبدئي قبل الحمل بشهر لو ينفع.</p>
                <p>• حاولي توقيتي العلاقة الزوجية خلال نافذة الخصوبة فوق.</p>
                <p>• وزن صحي ونشاط بدني معتدل بيساعدوا في انتظام التبويض.</p>
                <p>• قللي الكافيين، وابعدي تمامًا عن التدخين والكحول.</p>
                <p>• نوم كافٍ وتقليل التوتر قدر الإمكان.</p>
                <p>• لو مرّ ٦-١٢ شهر من المحاولة من غير حمل، يفضّل تستشيري دكتورة.</p>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const PHASE_LABEL_AR: Record<string, string> = { menstrual: "الدورة", follicular: "ما بعد الدورة", ovulation: "فترة التبويض", luteal: "قبل الدورة" };

function fmtDate(iso: string) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ─────────────────────────── سجل اليوم السريع (Micro-Logs) ───────────────
// Round 40 — الـ API (`/api/laha/daily-logs`) كان جاهز من راوند ٣٨ بلا أي
// واجهة تستخدمه؛ دلوقتي بقى ليه بطاقة سريعة في الرئيسية — مطلوبة كمان
// كأساس بيانات حقيقي لتقرير الطبيب وتحليل الأعراض المتكررة. كل ضغطة بتتحفظ
// فورًا (autosave، من غير زرار حفظ منفصل) مع تأكيد"تم الحفظ"بسيط.
const MOOD_OPTIONS = [
 { key:"happy", label:"مبسوطة"}, { key:"calm", label:"هادية"}, { key:"tired", label:"متعبة"},
 { key:"sensitive", label:"حساسة"}, { key:"anxious", label:"قلقانة"}, { key:"irritable", label:"سريعة الانفعال"},
];
const PAIN_OPTIONS = [
  { key: "headache", label: "صداع" }, { key: "cramps", label: "تشنجات" }, { key: "backache", label: "ألم ظهر" },
  { key: "bloating", label: "انتفاخ" }, { key: "chest", label: "ثقل صدر" }, { key: "nausea", label: "غثيان" },
];
const FLOW_OPTIONS = [{ key: "light", label: "خفيف" }, { key: "medium", label: "متوسط" }, { key: "heavy", label: "غزير" }];

function DailyMicroLogCard() {
  const [mood, setMood] = useState<string | null>(null);
  const [painTags, setPainTags] = useState<string[]>([]);
  const [flow, setFlow] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    try {
      const from = addDays(todayISO(), -30);
      const d = await api(`/api/laha/daily-logs?from=${from}`);
      const logs = d.logs || [];
      setHistory(logs);
      const today = logs.find((l: any) => l.log_date === todayISO());
      if (today) {
        setMood(today.mood || null);
        setPainTags(today.pain_tags || []);
        setFlow(today.flow || null);
        setNote(today.note || "");
      }
    } finally {
      setLoaded(true);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async (patch: { mood?: string | null; pain_tags?: string[]; flow?: string | null; note?: string }) => {
    const nextMood = patch.mood !== undefined ? patch.mood : mood;
    const nextPain = patch.pain_tags !== undefined ? patch.pain_tags : painTags;
    const nextFlow = patch.flow !== undefined ? patch.flow : flow;
    const nextNote = patch.note !== undefined ? patch.note : note;
    try {
      await api("/api/laha/daily-logs", {
        method: "POST",
        body: JSON.stringify({ log_date: todayISO(), mood: nextMood, pain_tags: nextPain, flow: nextFlow, note: nextNote || null }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
      load();
    } catch {
      // فشل شبكة عابر — مفيش داعي نزعج المستخدمة بـ alert لحاجة بسيطة زي دي
    }
  };

  const toggleMood = (key: string) => { const next = mood === key ? null : key; setMood(next); save({ mood: next }); };
  const togglePain = (key: string) => {
    const next = painTags.includes(key) ? painTags.filter((t) => t !== key) : [...painTags, key];
    setPainTags(next);
    save({ pain_tags: next });
  };
  const toggleFlow = (key: string) => { const next = flow === key ? null : key; setFlow(next); save({ flow: next }); };
  // Round 45 — الملاحظة نص حر، فالحفظ بيحصل عند ما تسيبي الخانة (onBlur) مش
  // مع كل حرف زي الشيبس اللي بتتحفظ فورًا لما تختاريها.
  const saveNoteIfChanged = () => { if (note !== (history.find((l) => l.log_date === todayISO())?.note || "")) save({ note }); };

  if (!loaded) return null;

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">إزيك النهاردة؟ — حالتي النفسية والصحية</p>
 {saved && <span className="text-[10px] text-emerald-500">تم الحفظ </span>}
      </div>
      <p className="text-[10px] text-neutral-400">دوسي على أي حاجة تنطبق عليكي — بيتحفظ فورًا من غير ما تعملي حاجة تانية.</p>

      <div className="flex flex-wrap gap-1.5">
        {MOOD_OPTIONS.map((o) => (
          <button key={o.key} onClick={() => toggleMood(o.key)} className={`text-[11px] rounded-full px-2.5 py-1 ${mood === o.key ? "bg-pink-500 text-white" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500"}`}>{o.label}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PAIN_OPTIONS.map((o) => (
          <button key={o.key} onClick={() => togglePain(o.key)} className={`text-[11px] rounded-full px-2.5 py-1 ${painTags.includes(o.key) ? "bg-purple-500 text-white" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500"}`}>{o.label}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {FLOW_OPTIONS.map((o) => (
          <button key={o.key} onClick={() => toggleFlow(o.key)} className={`text-[11px] rounded-full px-2.5 py-1 ${flow === o.key ? "bg-rose-500 text-white" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500"}`}>{o.label}</button>
        ))}
      </div>
      <div>
        <label className="text-[10px] text-neutral-400">ملاحظة (اختياري)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNoteIfChanged}
          rows={2}
          placeholder="اكتبي أي ملاحظة عن حالتك النهاردة..."
          className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-transparent px-3 py-2 text-xs"
        />
      </div>

      {history.length > 0 && (
        <details className="text-xs">
          <summary className="text-neutral-400 cursor-pointer">سجل الأيام اللي فاتت ({history.length})</summary>
          <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
            {history.map((l) => (
              <div key={l.log_date} className="text-[11px] text-neutral-500">
                <div className="flex items-center justify-between">
                  <span>{fmtDate(l.log_date)}</span>
                  <span>
                    {[l.mood && MOOD_OPTIONS.find((m) => m.key === l.mood)?.label, ...(l.pain_tags || []).map((t: string) => PAIN_OPTIONS.find((p) => p.key === t)?.label), l.flow && FLOW_OPTIONS.find((f) => f.key === l.flow)?.label].filter(Boolean).join("، ") || "-"}
                  </span>
                </div>
                {l.note && <p className="text-neutral-400 mt-0.5">{l.note}</p>}
              </div>
            ))}
          </div>
        </details>
      )}
    </Card>
  );
}

// ─────────────────────────────── متابعة الحمل ────────────────────────────

function PregnancyHomeTab({ settings }: { settings: Settings }) {
  const [info, setInfo] = useState<any>(null);
  const [fetalSize, setFetalSize] = useState("");

  useEffect(() => {
    if (!settings.lmp) return;
    const i = pregnancyInfo(settings.lmp);
    setInfo(i);
    setFetalSize(fetalSizeLabel(i.week));
  }, [settings.lmp]);

  if (!settings.lmp) {
    return <Card className="text-center text-sm text-neutral-400 py-6">اكتبي تاريخ أول يوم لآخر دورة فوق عشان يبدأ حساب الحمل</Card>;
  }
  if (!info) return null;

  // Round 42 — ريديزاين مبني حرفيًا على البروتوتايب المرجعي (index (2).html):
  // حلقة تقدّم دائرية (SVG) بدل شريط تقدّم عريض، ورقم الأسبوع كبير في
  // النص. الشهر التقويمي التقريبي ("الشهر ٦ من ١٠") بقى ظاهر جنب الأسبوع
  // زي ما طلب المستخدم بالظبط ("حجم البيبي الأسبوع كذا = الشهر كذا").
  const month = gestationalMonth(info.week);
  const R = 60;
  const CIRC = 2 * Math.PI * R;

  return (
    <div className="space-y-3">
      <Card className="space-y-2">
        <div className="flex items-center justify-between">
 <p className="text-sm font-semibold"> متابعة الحمل</p>
          <p className="text-xs text-neutral-400">الشهر {month} من 10</p>
        </div>
        <div className="relative flex items-center justify-center my-2">
          <svg width="130" height="130" viewBox="0 0 130 130">
            <circle cx="65" cy="65" r={R} fill="none" stroke="currentColor" strokeWidth="10" className="text-sky-50 dark:text-neutral-800" />
            <circle
              cx="65" cy="65" r={R} fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - info.progressPct / 100)}
              transform="rotate(-90 65 65)" className="text-sky-400"
            />
          </svg>
          <div className="absolute text-center">
            <p className="text-3xl font-extrabold text-sky-500">{info.week}</p>
            <p className="text-[11px] text-neutral-400">أسبوع و{info.day} يوم</p>
          </div>
        </div>
        <p className="text-[11px] text-center text-neutral-400">الترايمستر {info.trimester === 1 ? "الأول" : info.trimester === 2 ? "الثاني" : "الثالث"}</p>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="bg-sky-50 dark:bg-sky-950/40 rounded-xl p-2.5">
            <p className="text-[10px] text-neutral-400">حجم الجنين تقريبًا</p>
 <p className="font-bold text-sm"> بحجم {fetalSize}</p>
          </div>
          <div className="bg-sky-50 dark:bg-sky-950/40 rounded-xl p-2.5">
            <p className="text-[10px] text-neutral-400">الموعد المتوقع للولادة</p>
            <p className="font-bold text-sm">{fmtDate(info.dueDate)}</p>
          </div>
        </div>
      </Card>

      <UltrasoundGallery />
    </div>
  );
}

// Round 41 —"ألبوم صور السونار": مفيش جدول منفصل للصور (قرار Round 38
// المتعمد — الصور بتتحط داخل المواعيد بس، راجع claude/laha-feature.md's
// قسم "نطاق مبسّط")، فالألبوم هنا بيلمّ أي موعد له صورة ويرتبهم تصاعديًا
// بتاريخ الزيارة، بدل جدول/API جديد بالكامل.
// Round 45 — بعد ما "كارت المتابعة" بقى ليه حقل مخصص `sonar_image`، الألبوم
// بقى بيقرا من `sonar_image` الأول وبيرجع لـ`image` القديم (fallback) لأي
// كارت اتسجل قبل الحقل الجديد ده — عشان صور اتسجلت في راوندات قبل كده متختفيش.
function UltrasoundGallery() {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try { const d = await api("/api/laha/appointments"); setAppointments(d.appointments || []); } catch {}
    })();
  }, []);

  const withImages = appointments
    .map((a) => ({ ...a, _img: a.sonar_image || a.image }))
    .filter((a) => a._img)
    .sort((a, b) => (a.appt_date < b.appt_date ? -1 : 1));
  if (!withImages.length) return null;

  return (
    <Card className="space-y-2">
 <p className="text-xs font-semibold"> ألبوم صور السونار — البيبي بيكبر قصادك</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {withImages.map((a, i) => (
          <button key={a.id} onClick={() => setOpenIdx(i)} className="shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700">
            <img src={a._img} alt={a.title} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>

      {openIdx !== null && withImages[openIdx] && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-4" onClick={() => setOpenIdx(null)}>
          <img src={withImages[openIdx]._img} alt={withImages[openIdx].title} className="max-w-full max-h-[70vh] rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
          <div className="text-center text-white mt-3 space-y-1" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-medium">{fmtDate(withImages[openIdx].appt_date)} — {withImages[openIdx].title}</p>
            {withImages[openIdx].notes && <p className="text-xs text-neutral-300">{withImages[openIdx].notes}</p>}
            <button onClick={() => setOpenIdx(null)} className="mt-2 text-xs bg-white/10 rounded-lg px-4 py-1.5">إغلاق</button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────── الوزن ──────────────────────────────────

function WeightTab({ settings }: { settings: Settings }) {
  const mode = settings.mode;
  const [weights, setWeights] = useState<any[]>([]);
  const [phase, setPhase] = useState<CyclePhase | null>(null);
  const [w, setW] = useState("");

  const load = async () => { const d = await api("/api/laha/weights"); setWeights(d.weights || []); };
  useEffect(() => { load(); }, []);

  // Round 40 — "ميزان احتباس السوائل" محتاج المرحلة الهرمونية الحالية، وده
  // مفهوم بيخص وضع الدورة بس (مش الحمل).
  useEffect(() => {
    if (mode !== "cycle") { setPhase(null); return; }
    (async () => {
      try {
        const d = await api("/api/laha/periods");
        const info = cycleInfo(d.periods || [], settings.avg_cycle_length, todayISO(), settings.avg_period_length);
        setPhase(info?.phase || null);
      } catch { setPhase(null); }
    })();
  }, [mode, settings.avg_cycle_length, settings.avg_period_length]);

  const add = async () => {
    const val = Number(w);
    if (!val || val <= 0) { alert("اكتبي وزن صحيح"); return; }
    try {
      await api("/api/laha/weights", { method: "POST", body: JSON.stringify({ log_date: todayISO(), weight_kg: val, mode }) });
      setW("");
      load();
    } catch (e: any) { alert(e.message); }
  };

  const retention = mode === "cycle" ? waterRetentionInsight(weights, phase) : null;
  const RETENTION_CLASS: Record<string, string> = {
    reassure: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
    flag: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900",
    neutral: "bg-neutral-50 dark:bg-neutral-800 text-neutral-500 border-neutral-200 dark:border-neutral-700",
  };

  return (
    <div className="space-y-3">
      <Card className="space-y-3">
        <div className="flex gap-2">
          <input type="number" step="0.1" value={w} onChange={(e) => setW(e.target.value)} placeholder="الوزن اليوم (كجم)"
            className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          <button onClick={add} className="bg-pink-500 text-white rounded-lg px-4 text-sm font-medium">حفظ</button>
        </div>
        <div className="space-y-1.5">
          {[...weights].reverse().slice(0, 15).map((wt) => (
            <div key={wt.id} className="flex items-center justify-between text-xs">
              <span className="text-neutral-400">{fmtDate(wt.log_date)}</span>
              <span className="font-medium">{wt.weight_kg} كجم</span>
            </div>
          ))}
          {!weights.length && <p className="text-xs text-neutral-400 text-center py-2">مفيش تسجيلات وزن لسه</p>}
        </div>
      </Card>

      {retention && (
        <Card className={`text-xs ${RETENTION_CLASS[retention.type]}`}>
 <p className="font-medium mb-1"> ميزان احتباس السوائل</p>
          <p>{retention.text}</p>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────── ملاحظات ────────────────────────────────

function NotesTab() {
  const [notes, setNotes] = useState<any[]>([]);
  const [text, setText] = useState("");

  const load = async () => { const d = await api("/api/laha/notes"); setNotes(d.notes || []); };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!text.trim()) return;
    try { await api("/api/laha/notes", { method: "POST", body: JSON.stringify({ body: text }) }); setText(""); load(); }
    catch (e: any) { alert(e.message); }
  };
  const del = async (id: string) => { await api(`/api/laha/notes/${id}`, { method: "DELETE" }); load(); };

  return (
    <Card className="space-y-3">
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتبي ملاحظة..."
          className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" onKeyDown={(e) => e.key === "Enter" && add()} />
        <button onClick={add} className="bg-pink-500 text-white rounded-lg px-4 text-sm font-medium">إضافة</button>
      </div>
      <div className="space-y-1.5">
        {notes.map((n) => (
          <div key={n.id} className="flex items-start justify-between gap-2 text-xs bg-neutral-50 dark:bg-neutral-800 rounded-lg p-2">
            <span className="flex-1">{n.body}</span>
            <button onClick={() => del(n.id)} className="text-neutral-400"><X size={12} /></button>
          </div>
        ))}
        {!notes.length && <p className="text-xs text-neutral-400 text-center py-2">مفيش ملاحظات لسه</p>}
      </div>
    </Card>
  );
}

// ─────────────────────────────── عداد الركلات ────────────────────────────

function KicksTab() {
  const [count, setCount] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [sessions, setSessions] = useState<any[]>([]);

  const load = async () => { const d = await api("/api/laha/kicks"); setSessions(d.sessions || []); };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  const tap = async () => {
    if (!startedAt) { setStartedAt(Date.now()); setCount(1); return; }
    const next = count + 1;
    if (next >= 10) {
      const minutes = (Date.now() - startedAt) / 60000;
      try { await api("/api/laha/kicks", { method: "POST", body: JSON.stringify({ minutes_to_ten: minutes }) }); } catch {}
      setStartedAt(null); setCount(0); setElapsed(0);
      load();
    } else {
      setCount(next);
    }
  };

  return (
    <div className="space-y-3">
      <Card className="text-center space-y-3 py-8">
        <p className="text-5xl font-bold text-pink-500">{count}/10</p>
        {startedAt && <p className="text-xs text-neutral-400">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</p>}
        <button onClick={tap} className="w-32 h-32 mx-auto rounded-full bg-pink-500 text-white text-lg font-bold shadow-lg active:scale-95 transition">
          دوسي هنا
        </button>
        <p className="text-xs text-neutral-400">دوسي كل ما تحسي بركلة، لحد ما توصلي ١٠</p>
      </Card>
      <Card className="space-y-1.5">
        <p className="text-xs font-semibold">آخر الجلسات</p>
        {sessions.slice(0, 10).map((s) => (
          <div key={s.id} className="flex items-center justify-between text-xs">
            <span className="text-neutral-400">{fmtDate(s.session_date)}</span>
            <span>{Math.round(s.minutes_to_ten)} دقيقة لـ ١٠ ركلات</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─────────────────────────────── الانقباضات ──────────────────────────────

function ContractionsTab() {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [contractions, setContractions] = useState<any[]>([]);
  const [analysis, setAnalysis] = useState<any>(null);

  const load = async () => { const d = await api("/api/laha/contractions"); setContractions(d.contractions || []); setAnalysis(d.analysis); };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  const toggle = async () => {
    if (!startedAt) { setStartedAt(Date.now()); return; }
    try {
      await api("/api/laha/contractions", { method: "POST", body: JSON.stringify({ started_at: new Date(startedAt).toISOString(), ended_at: new Date().toISOString() }) });
    } catch {}
    setStartedAt(null); setElapsed(0);
    load();
  };

  return (
    <div className="space-y-3">
      {analysis?.shouldGoToHospital && (
        <Card className="bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900 text-center text-sm font-semibold text-red-600 dark:text-red-400">
 الانقباضات بقت متقاربة ومستمرة — قربي وقتها، كلمي الدكتور أو روحي المستشفى
        </Card>
      )}
      <Card className="text-center space-y-3 py-6">
        {startedAt && <p className="text-3xl font-bold text-pink-500">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</p>}
        <button onClick={toggle} className={`w-full rounded-xl py-3 text-sm font-semibold text-white ${startedAt ? "bg-red-500" : "bg-pink-500"}`}>
          {startedAt ? "إيقاف — انتهت الانقباضة" : "بدء انقباضة"}
        </button>
        {analysis?.freqAvgMin != null && (
          <p className="text-xs text-neutral-400">متوسط التقارب: {analysis.freqAvgMin.toFixed(1)} دقيقة — متوسط المدة: {Math.round(analysis.avgDurationSec || 0)} ثانية</p>
        )}
      </Card>
      <Card className="space-y-1.5">
        <p className="text-xs font-semibold">آخر الانقباضات المسجلة</p>
        {contractions.slice(0, 10).map((c) => (
          <div key={c.id} className="flex items-center justify-between text-xs">
            <span className="text-neutral-400">{new Date(c.started_at).toLocaleTimeString("ar-EG")}</span>
            <span>{c.duration_sec ? `${c.duration_sec} ثانية` : "-"}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─────────────────────────────── متابعة الطبيب (كارت المتابعة) ────────────
// Round 45 — من "المواعيد" البسيطة لكارت متابعة حمل قريب من شكل "كارت
// المتابعة" الطبي المصري المعروف. اتنى على مرحلتين حسب طلب المستخدمة: (1)
// حجز الميعاد بس (تاريخ + وقت) وبيتفعل عليه تذكير البوت زي ما هو أصلًا —
// (2) تسجيل بيانات الزيارة التفصيلية (الحقول تحت) بعد/وقت الزيارة الفعلية،
// من غير ما تتحبس المستخدمة في فورم طويل وهي بس بتحجز ميعاد.
// كل حقل شكله: تسمية إنجليزية فوق (اللي الدكتور بيفهمها) وتحتها ترجمة عربية
// باهتة صغيرة (اللي الأم بتفهمها) — طلب صريح من المستخدمة.
//
// ملحوظة أمان مقصودة: حقل SEX هنا نص/اختيار معلوماتي بس، ومش بيتزامن تلقائيًا
// مع laha_gender_reveal_parties.gender — عشان الأم نفسها هي اللي بتسجل بيانات
// الكارت، ولو الحقل ده اتزامن كان هيبقى نفس معنى إنها تقدر تكتب/تشوف نوع
// الجنين بنفسها من غير ما تدوس على رابط الكشف بالرقم السري، وده بيكسر كل
// الفلسفة الأمنية بتاعة "تيم بينك ولا تيم بلو؟" (راجع تعليقات app/api/laha/
// gender-reveal/*). فبالتالي الحقل ده بيتحط كإشارة/تكست حر بس مع تنويه بالرجوع
// لقسم الكشف، مش مصدر حقيقي لنوع الجنين.
const VISIT_FIELDS: { key: string; en: string; ar: string; type: "short" | "long" | "date" | "weight"; note?: string }[] = [
  { key: "lmp_date", en: "Date / LMP", ar: "تاريخ الزيارة الحالية أو أول يوم آخر دورة شهرية", type: "date" },
  { key: "gestational_age", en: "Maturity / M.w", ar: "عمر الحمل ونضج الجنين بالأسابيع أو الشهور", type: "short" },
  { key: "edd_date", en: "EDD", ar: "موعد الولادة المتوقع", type: "date" },
  { key: "gravida", en: "G (Gravida)", ar: "إجمالي عدد مرات الحمل السابقة والحالية", type: "short" },
  { key: "para", en: "P (Para)", ar: "عدد مرات الولادات السابقة بعد اكتمال نمو الجنين", type: "short" },
  { key: "abortions", en: "A (Abortion)", ar: "عدد مرات الإجهاض السابقة", type: "short" },
  { key: "prev_delivery_mode", en: "Mode of Previous Delivery", ar: "طريقة الولادات السابقة (طبيعي NVD أو قيصري CS)", type: "short" },
  { key: "maternal_weight_kg", en: "Weight (kg)", ar: "وزن الأم — بيتزامن تلقائيًا مع يوميات الوزن", type: "weight" },
  { key: "blood_pressure", en: "B.P / Bpa", ar: "قياس ضغط دم الأم لمراقبة أي ارتفاع مفاجئ", type: "short" },
  { key: "hemoglobin_pct", en: "Hb%", ar: "نسبة الهيموجلوبين في الدم لمتابعة الأنيميا", type: "short" },
  { key: "blood_group", en: "Blood Group & Rh", ar: "فصيلة دم الأم وعامل ريزوس", type: "short" },
  { key: "blood_sugar", en: "RBS / FBS", ar: "تحليل سكر الدم العشوائي أو الصائم", type: "short" },
  { key: "urine_sugar", en: "Urine - Sugar", ar: "فحص السكر في البول", type: "short" },
  { key: "urine_albumin", en: "Urine - Albumin", ar: "فحص الزلال في البول للكشف عن تسمم الحمل", type: "short" },
  { key: "oedema", en: "Oedema", ar: "درجة تورم واحتباس السوائل (القدمين واليدين)", type: "short" },
  { key: "fundal_height", en: "Fundal Height (FH)", ar: "ارتفاع قاع الرحم بالسنتيمتر", type: "short" },
  { key: "cervical_assessment", en: "Cervical Assessment", ar: "تقييم طول وحالة عنق الرحم (مغلق أو مفتوح)", type: "short" },
  { key: "fetal_sex", en: "SEX", ar: "نوع الجنين — ده معلومة حرة بس، الكشف الفعلي في قسم «تيم بينك ولا تيم بلو؟»", type: "short" },
  { key: "fetal_weight_g", en: "F.W (Fetal Weight)", ar: "الوزن التقديري للجنين بالجرام عبر السونار", type: "short" },
  { key: "fetal_heart_rate", en: "Fetal H.R.", ar: "معدل نبضات قلب الجنين في الدقيقة", type: "short" },
  { key: "fetal_position", en: "Presentation & Position", ar: "وضعية الجنين واتجاه رأسه (رأسي، مقعدي، مستعرض)", type: "short" },
  { key: "bpd", en: "BPD", ar: "قطر رأس الجنين المقاس بالسونار", type: "short" },
  { key: "hc", en: "HC", ar: "محيط رأس الجنين عبر السونار", type: "short" },
  { key: "ac", en: "AC", ar: "محيط بطن الجنين عبر السونار", type: "short" },
  { key: "fl", en: "FL", ar: "طول عظم فخذ الجنين", type: "short" },
  { key: "afi", en: "AFI", ar: "منسوب وكمية السائل الأمينوسي", type: "short" },
  { key: "placenta", en: "Placenta", ar: "موقع المشيمة في الرحم ودرجة نضجها", type: "short" },
  { key: "fetal_movement", en: "Fetal Movement", ar: "متابعة نشاط وحركة الجنين (Quickening)", type: "short" },
  { key: "investigation", en: "Investigation", ar: "التحاليل والفحوصات الإضافية المطلوبة", type: "long" },
  { key: "treatment", en: "Treatment", ar: "الأدوية والمكملات والفيتامينات الموصوفة", type: "long" },
  { key: "tetanus_toxoid", en: "Tetanus Toxoid (TT)", ar: "جرعات وتواريخ تطعيم التيتانوس", type: "short" },
  { key: "high_risk_factors", en: "High Risk Factors", ar: "أي عوامل خطورة مصاحبة للحمل", type: "long" },
  { key: "next_visit_date", en: "Next Visit", ar: "الموعد المحدد للمتابعة والزيارة القادمة", type: "date" },
];

function VisitField({ f, value, onChange }: { f: (typeof VISIT_FIELDS)[number]; value: any; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-neutral-700 dark:text-neutral-200" dir="ltr">{f.en}</span>
      <span className="block text-[10px] text-neutral-400 mb-1">{f.ar}</span>
      {f.type === "long" ? (
        <textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} rows={2} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2.5 py-1.5 text-xs" />
      ) : (
        <input
          type={f.type === "date" ? "date" : f.type === "weight" ? "number" : "text"}
          inputMode={f.type === "weight" ? "decimal" : undefined}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2.5 py-1.5 text-xs"
        />
      )}
    </label>
  );
}

function AppointmentsTab() {
  const [appts, setAppts] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleTitle, setScheduleTitle] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Round 46 — طلب المستخدم: الدوس على الكارت نفسه يفتحه للعرض/القراءة بس،
  // والتعديل الفعلي بس لو دوسنا على شكل القلم. قبل كده كانوا نفس الفعل.
  const [cardMode, setCardMode] = useState<"view" | "edit">("view");
  const [drafts, setDrafts] = useState<Record<string, any>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportSelected, setExportSelected] = useState<Record<string, boolean>>({});
  const [exporting, setExporting] = useState(false);

  const load = async () => { const d = await api("/api/laha/appointments"); setAppts(d.appointments || []); };
  useEffect(() => { load(); }, []);

  // آخر بيانات دكتور اتسجلت بتتملي أوتوماتيك في كارت جديد — غالبًا نفس
  // الدكتور بيتكرر طول المتابعة، فده بيوفر إعادة الكتابة كل مرة.
  const lastDoctor = appts.find((a) => a.doctor_name);

  const schedule = async () => {
    if (!scheduleDate) { alert("تاريخ الزيارة مطلوب"); return; }
    try {
      await api("/api/laha/appointments", {
        method: "POST",
        body: JSON.stringify({
          appt_date: scheduleDate,
          appt_time: scheduleTime || null,
          title: scheduleTitle.trim() || "زيارة متابعة",
          doctor_name: lastDoctor?.doctor_name || null,
          doctor_phone: lastDoctor?.doctor_phone || null,
          doctor_address: lastDoctor?.doctor_address || null,
        }),
      });
      setScheduleDate(""); setScheduleTime(""); setScheduleTitle(""); setShowForm(false);
      load();
    } catch (e: any) { alert(e.message); }
  };

  const del = async (id: string) => {
    if (!confirm("متأكدة إنك عايزة تمسحي الكارت ده؟")) return;
    await api(`/api/laha/appointments/${id}`, { method: "DELETE" });
    if (expandedId === id) setExpandedId(null);
    load();
  };

  const openView = (a: any) => {
    if (expandedId === a.id && cardMode === "view") { setExpandedId(null); return; }
    setExpandedId(a.id);
    setCardMode("view");
  };

  const startEdit = (a: any) => {
    if (expandedId === a.id && cardMode === "edit") { setExpandedId(null); return; }
    setExpandedId(a.id);
    setCardMode("edit");
    setDrafts((d) => ({ ...d, [a.id]: { ...a } }));
  };

  const setField = (id: string, key: string, value: any) => {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [key]: value } }));
  };

  const saveDetails = async (id: string) => {
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id);
    try {
      const patch: Record<string, any> = {
        title: draft.title?.trim() || "زيارة متابعة",
        appt_date: draft.appt_date,
        appt_time: draft.appt_time || null,
        doctor_name: draft.doctor_name || null,
        doctor_phone: draft.doctor_phone || null,
        doctor_address: draft.doctor_address || null,
        general_note: draft.general_note || null,
        sonar_image: draft.sonar_image || null,
        prescription_image: draft.prescription_image || null,
      };
      for (const f of VISIT_FIELDS) {
        patch[f.key] = f.key === "maternal_weight_kg"
          ? (draft.maternal_weight_kg === "" || draft.maternal_weight_kg == null ? null : Number(draft.maternal_weight_kg))
          : (draft[f.key] || null);
      }
      await api(`/api/laha/appointments/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      setExpandedId(null);
      load();
    } catch (e: any) { alert(e.message); } finally { setSavingId(null); }
  };

  const exportPdf = async () => {
    const selected = appts.filter((a) => exportSelected[a.id]);
    if (!selected.length) {
      // Round 47 — الزرار أصلًا disabled في الحالة دي، لكن لو حصلت بأي شكل
      // (حالة قديمة متعلقة، إلخ) لازم تبان مش تتجاهل بصمت — "التصدير صامت".
      showExportError("اختاري كارت متابعة واحد على الأقل قبل التصدير");
      return;
    }
    setExporting(true);
    const cards = selected
      .slice()
      .sort((a, b) => (a.appt_date < b.appt_date ? 1 : -1))
      .map((a) => {
        const rows = VISIT_FIELDS
          .filter((f) => a[f.key] !== null && a[f.key] !== undefined && a[f.key] !== "")
          .map((f) => `<tr><td style="padding:3px 8px;color:#555;font-size:11px;white-space:nowrap" dir="ltr">${escapeHtml(f.en)}</td><td style="padding:3px 8px;font-size:12px">${escapeHtml(String(a[f.key]))}</td></tr>`)
          .join("");
        return `
          <div style="margin-bottom:18px;border:1px solid #ddd;border-radius:10px;padding:14px;page-break-inside:avoid">
            <p style="font-weight:bold;font-size:14px;margin:0 0 4px">${escapeHtml(a.title)} — ${escapeHtml(fmtDate(a.appt_date))}${a.appt_time ? " " + escapeHtml(a.appt_time) : ""}</p>
            ${a.doctor_name ? `<p style="font-size:11px;color:#666;margin:0 0 8px">د. ${escapeHtml(a.doctor_name)}${a.doctor_phone ? " — " + escapeHtml(a.doctor_phone) : ""}${a.doctor_address ? " — " + escapeHtml(a.doctor_address) : ""}</p>` : ""}
            ${rows ? `<table style="width:100%;border-collapse:collapse">${rows}</table>` : `<p style="font-size:11px;color:#999">لسه مفيش بيانات طبية متسجلة في الكارت ده</p>`}
            ${a.general_note ? `<p style="font-size:12px;margin-top:8px"><b>ملاحظة:</b> ${escapeHtml(a.general_note)}</p>` : ""}
          </div>`;
      })
      .join("");
    const html = `<h2 style="text-align:center;margin-bottom:16px">تقرير متابعة الحمل</h2>${cards}`;
    try {
      // Round 48 — "حل نهائي لتصدير PDF بايظ في أي مكان": بناء الالتقاط
      // والـPDF بقى جوه lib/pdfExport.ts (نفس نقطة الإصلاح المشتركة لكل
      // تصديرات التطبيق — راجع تعليق الملف نفسه لتفاصيل السبب والإصلاح).
      const canvas = await renderHtmlToCanvas(html, 700);
      const pdf = await canvasToPdf(canvas);
      await shareFile(pdf.output("dataurlstring"), "تقرير-متابعة-الحمل.pdf", "application/pdf");
    } catch (e: any) {
      // Round 47 — "تصدير متابعة الطبيب صامت": alert() ممكن يتمنع بصمت في
      // بعض الـwebviews المدمجة (تليجرام، PWA standalone، إلخ) فيحس المستخدم
      // إن الزرار "مايعملش حاجة" — showExportError بديل مضمون الظهور
      // (عنصر HTML فعلي مش نافذة متصفح).
      showExportError(e?.message ? `حصل خطأ في التصدير: ${e.message}` : "حصل خطأ في التصدير");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-3">
      {!showForm ? (
        <button onClick={() => setShowForm(true)} className="w-full bg-pink-500 text-white rounded-xl py-2.5 text-sm font-medium">+ حجز زيارة جديدة</button>
      ) : (
        <Card className="space-y-2">
          <p className="text-xs font-semibold">حجز ميعاد الزيارة</p>
          <input value={scheduleTitle} onChange={(e) => setScheduleTitle(e.target.value)} placeholder="عنوان الزيارة (اختياري)" className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
            <input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          </div>
          {/* Round 42 — لينك المواعيد بتذكير تليجرام تلقائي (يوم قبل + يوم
              الموعد نفسه)، بشرط إن الحساب متربط بالبوت من الإعدادات. */}
          <p className="text-[11px] text-neutral-400">لو حسابك متربط بتليجرام، هنفكّرك بالزيارة دي يوم قبلها وصبح يومها — وبعد الزيارة تقدري تفتحي الكارت وتسجلي بيانات الزيارة بالتفصيل.</p>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm">إلغاء</button>
            <button onClick={schedule} className="flex-1 bg-pink-500 text-white rounded-lg py-2 text-sm font-medium">حجز</button>
          </div>
        </Card>
      )}

      {appts.map((a) => {
        const expanded = expandedId === a.id;
        const draft = drafts[a.id] || a;
        return (
          <Card key={a.id} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <button onClick={() => openView(a)} className="flex-1 flex items-center gap-2 text-right min-w-0">
                <ChevronRight size={14} className={`shrink-0 text-neutral-400 transition-transform ${expanded ? "rotate-90" : ""}`} />
                <span className="min-w-0">
                  <p className="text-sm font-medium truncate">{a.title}</p>
                  <p className="text-[11px] text-neutral-400 truncate">{fmtDate(a.appt_date)}{a.appt_time ? ` — ${a.appt_time}` : ""}{a.doctor_name ? ` · د. ${a.doctor_name}` : ""}</p>
                </span>
              </button>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => startEdit(a)} className="text-neutral-400"><Pencil size={14} /></button>
                <button onClick={() => del(a.id)} className="text-neutral-400"><Trash2 size={14} /></button>
              </div>
            </div>

            {expanded && cardMode === "view" && (
              <div className="space-y-3 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                {(a.doctor_name || a.doctor_address || a.doctor_phone) && (
                  <div>
                    <p className="text-xs font-semibold mb-1">بيانات الطبيب</p>
                    {a.doctor_name && <p className="text-xs">{a.doctor_name}</p>}
                    <p className="text-[11px] text-neutral-400">{[a.doctor_address, a.doctor_phone].filter(Boolean).join(" — ")}</p>
                  </div>
                )}

                {VISIT_FIELDS.some((f) => a[f.key] !== null && a[f.key] !== undefined && a[f.key] !== "") && (
                  <div>
                    <p className="text-xs font-semibold mb-2">بيانات الزيارة الطبية</p>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-2.5">
                      {VISIT_FIELDS.filter((f) => a[f.key] !== null && a[f.key] !== undefined && a[f.key] !== "").map((f) => (
                        <div key={f.key} className={f.type === "long" ? "col-span-2" : ""}>
                          <p className="text-[11px] font-medium text-neutral-700 dark:text-neutral-200" dir="ltr">{f.en}</p>
                          <p className="text-[10px] text-neutral-400">{f.ar}</p>
                          <p className="text-xs mt-0.5 whitespace-pre-wrap">{String(a[f.key])}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(a.sonar_image || a.prescription_image) && (
                  <div className="grid grid-cols-2 gap-2">
                    {a.sonar_image && (
                      <div className="text-center">
                        <p className="text-[10px] text-neutral-400 mb-1">صورة السونار</p>
                        <img src={a.sonar_image} className="rounded-lg max-h-32 mx-auto" />
                      </div>
                    )}
                    {a.prescription_image && (
                      <div className="text-center">
                        <p className="text-[10px] text-neutral-400 mb-1">صورة الروشتة</p>
                        <img src={a.prescription_image} className="rounded-lg max-h-32 mx-auto" />
                      </div>
                    )}
                  </div>
                )}

                {a.general_note && (
                  <div>
                    <p className="text-xs font-semibold mb-1">ملاحظة عامة</p>
                    <p className="text-xs whitespace-pre-wrap">{a.general_note}</p>
                  </div>
                )}

                {!a.doctor_name && !a.doctor_address && !a.doctor_phone && !a.general_note && !a.sonar_image && !a.prescription_image &&
                  !VISIT_FIELDS.some((f) => a[f.key] !== null && a[f.key] !== undefined && a[f.key] !== "") && (
                    <p className="text-xs text-neutral-400">لسه مفيش بيانات زيارة متسجلة في الكارت ده.</p>
                  )}

                <button onClick={() => startEdit(a)} className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-xs">
                  <Pencil size={13} /> تعديل بيانات الزيارة
                </button>
              </div>
            )}

            {expanded && cardMode === "edit" && (
              <div className="space-y-3 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="block text-[11px] text-neutral-500 mb-1">تاريخ الزيارة</span>
                    <input type="date" value={draft.appt_date || ""} onChange={(e) => setField(a.id, "appt_date", e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2.5 py-1.5 text-xs" />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] text-neutral-500 mb-1">الوقت</span>
                    <input type="time" value={draft.appt_time || ""} onChange={(e) => setField(a.id, "appt_time", e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2.5 py-1.5 text-xs" />
                  </label>
                </div>
                <label className="block">
                  <span className="block text-[11px] text-neutral-500 mb-1">عنوان الكارت</span>
                  <input value={draft.title || ""} onChange={(e) => setField(a.id, "title", e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2.5 py-1.5 text-xs" />
                </label>

                <p className="text-xs font-semibold pt-1">بيانات الطبيب</p>
                <label className="block">
                  <span className="block text-[11px] text-neutral-500 mb-1">اسم الدكتور</span>
                  <input value={draft.doctor_name || ""} onChange={(e) => setField(a.id, "doctor_name", e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2.5 py-1.5 text-xs" />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="block text-[11px] text-neutral-500 mb-1">العنوان</span>
                    <input value={draft.doctor_address || ""} onChange={(e) => setField(a.id, "doctor_address", e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2.5 py-1.5 text-xs" />
                  </label>
                  <label className="block">
                    <span className="block text-[11px] text-neutral-500 mb-1">رقم التليفون</span>
                    <input value={draft.doctor_phone || ""} onChange={(e) => setField(a.id, "doctor_phone", e.target.value)} dir="ltr" className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2.5 py-1.5 text-xs" />
                  </label>
                </div>

                <p className="text-xs font-semibold pt-1">بيانات الزيارة الطبية</p>
                <div className="grid grid-cols-2 gap-x-2 gap-y-3">
                  {VISIT_FIELDS.map((f) => (
                    <div key={f.key} className={f.type === "long" ? "col-span-2" : ""}>
                      <VisitField f={f} value={draft[f.key]} onChange={(v) => setField(a.id, f.key, v)} />
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col items-center gap-1 text-[11px] text-neutral-400 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg px-2 py-3 cursor-pointer text-center">
                    {draft.sonar_image ? <img src={draft.sonar_image} className="max-h-16 rounded" /> : <span>رفع صورة السونار</span>}
                    <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (file) setField(a.id, "sonar_image", await shrinkImage(file)); }} />
                  </label>
                  <label className="flex flex-col items-center gap-1 text-[11px] text-neutral-400 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg px-2 py-3 cursor-pointer text-center">
                    {draft.prescription_image ? <img src={draft.prescription_image} className="max-h-16 rounded" /> : <span>رفع صورة الروشتة</span>}
                    <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (file) setField(a.id, "prescription_image", await shrinkImage(file)); }} />
                  </label>
                </div>

                <label className="block">
                  <span className="block text-xs font-semibold mb-1">ملاحظة عامة</span>
                  <textarea value={draft.general_note || ""} onChange={(e) => setField(a.id, "general_note", e.target.value)} rows={3} placeholder="أي حاجة تانية عايزة تسجليها عن الزيارة دي" className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2.5 py-1.5 text-xs" />
                </label>

                <div className="flex gap-2 pt-1">
                  <button onClick={() => setExpandedId(null)} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-xs">إلغاء</button>
                  <button onClick={() => saveDetails(a.id)} disabled={savingId === a.id} className="flex-1 bg-pink-500 text-white rounded-lg py-2 text-xs font-medium disabled:opacity-60">
                    {savingId === a.id ? "جاري الحفظ..." : "حفظ بيانات الزيارة"}
                  </button>
                </div>
              </div>
            )}
          </Card>
        );
      })}

      {appts.length > 0 && (
        <Card className="space-y-2">
          <p className="text-xs font-semibold">تصدير للطبيب</p>
          {/* Round 48 — "خلي كلمة اختيار الكروت في النص وكبيرة ولون مختلف":
              كانت نص رمادي صغير مرمي على يمين العنوان. بقت زرار مستقل في
              النص، بخط أكبر ولون وردي مميز يتماشى مع باقي هوية "لها". */}
          <button
            onClick={() => setExportOpen((v) => !v)}
            className="w-full text-center text-sm font-bold text-pink-600 dark:text-pink-400 py-1"
          >
            {exportOpen ? "إخفاء الكروت" : "اختيار الكروت"}
          </button>
          {exportOpen && (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              <label className="flex items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={appts.length > 0 && appts.every((a) => exportSelected[a.id])}
                  onChange={(e) => { const all: Record<string, boolean> = {}; appts.forEach((a) => (all[a.id] = e.target.checked)); setExportSelected(all); }}
                />
                الكل
              </label>
              {appts.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-xs text-neutral-500">
                  <input type="checkbox" checked={!!exportSelected[a.id]} onChange={(e) => setExportSelected((s) => ({ ...s, [a.id]: e.target.checked }))} />
                  {fmtDate(a.appt_date)} — {a.title}
                </label>
              ))}
            </div>
          )}
          <button
            onClick={() => {
              // Round 48 — "لو مجرد توست تصدير، يظهر الكروت وتختار منها":
              // بدل زرار متعطّل (أو توست بيقول روحي اختاري) لو مفيش كروت
              // متحددة لسه، الدوسة نفسها بتفتح قائمة الاختيار على طول.
              if (!appts.some((a) => exportSelected[a.id])) { setExportOpen(true); return; }
              exportPdf();
            }}
            disabled={exporting}
            className="w-full flex items-center justify-center gap-1.5 bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900 rounded-lg py-2 text-xs font-medium disabled:opacity-50"
          >
            <FileDown size={14} /> {exporting ? "جاري التصدير..." : "تصدير PDF"}
          </button>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────── أسئلة للدكتور ───────────────────────────

function DoctorQuestionsTab({ lmp }: { lmp: string }) {
  const [bucket, setBucket] = useState<"early" | "mid" | "late">("early");
  const [questions, setQuestions] = useState<any[]>([]);
  const [newQ, setNewQ] = useState("");

  useEffect(() => {
    setBucket(weekBucket(pregnancyInfo(lmp).week));
  }, [lmp]);

  const load = async (b: string) => { const d = await api(`/api/laha/doctor-questions?bucket=${b}`); setQuestions(d.questions || []); };
  useEffect(() => { load(bucket); }, [bucket]);

  const toggle = async (id: string, field: "is_important" | "is_asked", val: boolean) => {
    await api(`/api/laha/doctor-questions/${id}`, { method: "PATCH", body: JSON.stringify({ [field]: val }) });
    load(bucket);
  };
  const addQ = async () => {
    if (!newQ.trim()) return;
    await api("/api/laha/doctor-questions", { method: "POST", body: JSON.stringify({ week_bucket: bucket, question: newQ }) });
    setNewQ(""); load(bucket);
  };
  const del = async (id: string) => { await api(`/api/laha/doctor-questions/${id}`, { method: "DELETE" }); load(bucket); };

  const sorted = [...questions].sort((a, b) => Number(b.is_important) - Number(a.is_important) || Number(a.is_asked) - Number(b.is_asked));

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {(["early", "mid", "late"] as const).map((b) => (
          <button key={b} onClick={() => setBucket(b)} className={`flex-1 rounded-lg py-1.5 text-xs font-medium ${bucket === b ? "bg-pink-500 text-white" : "bg-neutral-100 dark:bg-neutral-800"}`}>
            {b === "early" ? "الأول" : b === "mid" ? "المتوسط" : "الأخير"}
          </button>
        ))}
      </div>
      <Card className="space-y-2">
        {sorted.map((q) => (
          <div key={q.id} className={`flex items-start gap-2 text-xs p-2 rounded-lg ${q.is_asked ? "bg-neutral-50 dark:bg-neutral-800 opacity-60" : "bg-pink-50 dark:bg-pink-950/40"}`}>
            <button onClick={() => toggle(q.id, "is_asked", !q.is_asked)} className="mt-0.5 shrink-0">
              {q.is_asked ? <Check size={14} className="text-emerald-500" /> : <div className="w-3.5 h-3.5 rounded-full border border-neutral-300" />}
            </button>
            <span className={`flex-1 ${q.is_asked ? "line-through" : ""}`}>{q.question}</span>
            <button onClick={() => toggle(q.id, "is_important", !q.is_important)}>
              <Sparkles size={13} className={q.is_important ? "text-amber-500" : "text-neutral-300"} />
            </button>
            <button onClick={() => del(q.id)} className="text-neutral-400 shrink-0"><X size={12} /></button>
          </div>
        ))}
        <div className="flex gap-2 pt-1">
          <input value={newQ} onChange={(e) => setNewQ(e.target.value)} placeholder="سؤال إضافي..." className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-1.5 text-xs" />
          <button onClick={addQ} className="bg-pink-500 text-white rounded-lg px-3 text-xs font-medium">إضافة</button>
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────── أسماء المولود ───────────────────────────

function BabyNamesTab({ settings, saveSettings }: { settings: Settings; saveSettings: (patch: Partial<Settings>) => void }) {
  const [names, setNames] = useState<any[]>([]);
  const [gender, setGender] = useState<Gender>("girl");
  const [suggestions, setSuggestions] = useState<{ name: string; meaning: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [suggestError, setSuggestError] = useState("");
  const [fatherName, setFatherName] = useState(settings.father_name || "");

  const [meaningQuery, setMeaningQuery] = useState("");
  const [meaningBusy, setMeaningBusy] = useState(false);
  const [meaningResult, setMeaningResult] = useState<{ found: boolean; meaning: string; error?: string } | null>(null);

  // Round 43 — "حط مربع إضافة اسم يدوي لقائمة التصويت": اسم بيتكتب على طول
  // (مش لازم يكون اقتراح ذكاء اصطناعي) وبيتحفظ selected:true فورًا، فيظهر
  // في تصويت العيلة تحت من غير خطوة "دوسي القلب" منفصلة.
  const [manualName, setManualName] = useState("");
  const [manualBusy, setManualBusy] = useState(false);

  // Round 41 — "Family Heart Poll": لينك حقيقي بمفتاح ثابت لتصويت العيلة
  // على الأسماء المختارة (selected=true)، مع عدّاد لايف.
  const [pollToken, setPollToken] = useState<string | null>(null);
  const [pollBusy, setPollBusy] = useState(false);
  const [pollCopied, setPollCopied] = useState(false);
  const [pollOrigin, setPollOrigin] = useState("");
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});

  useEffect(() => { setPollOrigin(window.location.origin); }, []);

  const load = async () => { const d = await api("/api/laha/baby-names"); setNames(d.names || []); };
  const loadPoll = async () => {
    try {
      const d = await api("/api/laha/baby-names/poll-link");
      setPollToken(d.token);
      if (d.token) {
        const res = await fetch(`/api/name-poll/${d.token}`);
        const pd = await res.json().catch(() => ({}));
        const map: Record<string, number> = {};
        (pd.names || []).forEach((n: any) => { map[n.id] = n.voteCount; });
        setVoteCounts(map);
      }
    } catch {}
  };
  useEffect(() => { load(); loadPoll(); }, []);
  useEffect(() => { setFatherName(settings.father_name || ""); }, [settings.father_name]);

  const generatePollLink = async (regenerate = false) => {
    setPollBusy(true);
    try {
      const d = await api("/api/laha/baby-names/poll-link", { method: "POST", body: JSON.stringify({ regenerate }) });
      setPollToken(d.token);
      loadPoll();
    } catch (e: any) { alert(e.message); } finally { setPollBusy(false); }
  };
  const pollShareLink = pollToken ? `${pollOrigin}/name-poll/${pollToken}` : "";
  const copyPollLink = async () => {
    try { await navigator.clipboard.writeText(pollShareLink); setPollCopied(true); setTimeout(() => setPollCopied(false), 1500); } catch {}
  };

  const fullName = (n: string) => (fatherName.trim() ? `${n} ${fatherName.trim()}` : n);

  const suggest = async () => {
    setBusy(true);
    setSuggestError("");
    try {
      const d = await api("/api/laha/baby-names/suggest", { method: "POST", body: JSON.stringify({ gender }) });
      setSuggestions(d.names || []);
      if (!d.names?.length) setSuggestError("معرفناش نقترح أسماء دلوقتي، جربي تاني كمان شوية.");
    } catch (e: any) {
      setSuggestError(e.message || "حصل خطأ، جربي تاني.");
    } finally {
      setBusy(false);
    }
  };

  const save = async (n: { name: string; meaning: string }) => {
    await api("/api/laha/baby-names", { method: "POST", body: JSON.stringify({ ...n, gender, source: "manual" }) });
    setSuggestions((prev) => prev.filter((s) => s.name !== n.name));
    load();
  };
  const toggleSelect = async (id: string, selected: boolean) => { await api(`/api/laha/baby-names/${id}`, { method: "PATCH", body: JSON.stringify({ selected }) }); load(); loadPoll(); };
  const del = async (id: string) => { await api(`/api/laha/baby-names/${id}`, { method: "DELETE" }); load(); };
  // Round 47 — "عاوزه علامه مختلفة وواضحة... تدوس عليها الأم وده يبقى اسم
  // المولود النهائي": علامة مستقلة عن القلب (اللي معناه "مرشّح لتصويت
  // العيلة" بس) — is_final هي "الاسم اللي استقرينا عليه فعلًا". مسموح
  // بواحد بس لكل نوع (السيرفر بيفرض القيد ده تلقائيًا).
  const toggleFinal = async (id: string, isFinal: boolean) => { await api(`/api/laha/baby-names/${id}`, { method: "PATCH", body: JSON.stringify({ is_final: isFinal }) }); load(); };

  const addManualName = async () => {
    const name = manualName.trim();
    if (!name) return;
    setManualBusy(true);
    try {
      await api("/api/laha/baby-names", { method: "POST", body: JSON.stringify({ name, meaning: "", gender, source: "manual", selected: true }) });
      setManualName("");
      load();
      loadPoll();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setManualBusy(false);
    }
  };

  const lookupMeaning = async () => {
    const name = meaningQuery.trim();
    if (!name) return;
    setMeaningBusy(true);
    setMeaningResult(null);
    try {
      const d = await api("/api/laha/baby-names/meaning", { method: "POST", body: JSON.stringify({ name }) });
      setMeaningResult(d);
    } catch (e: any) {
      setMeaningResult({ found: false, meaning: "", error: e.message || "حصل خطأ" });
    } finally {
      setMeaningBusy(false);
    }
  };

  // Round 46 — لما الاسم يتحدد، علامة "تم اختيار الاسم" تظهر في مربع لوحدها
  // فوق كارت اسم الأب، بلون نيون بينك ونور بيمشي جوه الاسم نفسه
  // (`.neon-name-text` في globals.css).
  // Round 47 — البادچ ده كان بيعتمد على "selected" (القلب — مجرد ترشيح
  // لتصويت العيلة)، والمستخدمة وضّحت إنها عاوزة علامة تانية مختلفة تمامًا
  // تحدد "الاسم النهائي" فعليًا (is_final) — البادچ دلوقتي بيعتمد عليها هي.
  const finalNames = names.filter((n) => n.is_final);

  return (
    <div className="space-y-3">
      {finalNames.length > 0 && (
        <Card className="text-center space-y-2 border-pink-300/60 dark:border-pink-800/60">
          <p className="text-[11px] font-semibold text-pink-500 tracking-wide">تم اختيار الاسم</p>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-1">
            {finalNames.map((n) => (
              <p key={n.id} className="neon-name-text text-2xl font-extrabold">{n.name}</p>
            ))}
          </div>
        </Card>
      )}

      <Card className="space-y-2">
        <p className="text-xs font-semibold">اسم الأب</p>
        <input
          value={fatherName}
          onChange={(e) => setFatherName(e.target.value)}
          onBlur={() => { if (fatherName !== (settings.father_name || "")) saveSettings({ father_name: fatherName || null }); }}
          placeholder="اكتبي اسم الأب عشان تشوفي الاسم كامل"
          className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
        />
      </Card>

      <Card className="space-y-3">
        <div className="flex gap-1.5">
          <button onClick={() => setGender("girl")} className={`flex-1 rounded-lg py-1.5 text-xs font-medium ${gender === "girl" ? "bg-pink-500 text-white" : "bg-neutral-100 dark:bg-neutral-800"}`}>بنت</button>
          <button onClick={() => setGender("boy")} className={`flex-1 rounded-lg py-1.5 text-xs font-medium ${gender === "boy" ? "bg-sky-500 text-white" : "bg-neutral-100 dark:bg-neutral-800"}`}>ولد</button>
        </div>
        <button onClick={suggest} disabled={busy} className="relative w-full overflow-hidden flex items-center justify-center gap-1.5 bg-purple-500 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-80">
          {busy ? (
            <>
              <Baby size={16} className="animate-baby-sway" />
              <span>لحظة واحدة...</span>
            </>
          ) : (
            <>اختارلي اسم</>
          )}
        </button>
        {suggestError && (
          <div className="text-center space-y-1">
            <p className="text-[11px] text-red-500">{suggestError}</p>
            <button onClick={suggest} className="text-[11px] text-purple-500 underline">حاولي تاني</button>
          </div>
        )}
        {suggestions.map((s) => (
          <div key={s.name} className="flex items-center justify-between gap-2 text-xs bg-neutral-50 dark:bg-neutral-800 rounded-lg p-2">
            <div className="flex-1">
              <p className="font-medium">{s.name}</p>
              <p className="text-neutral-400">{s.meaning}</p>
              {fatherName.trim() && <p className="text-neutral-400 mt-0.5">الاسم كامل: {fullName(s.name)}</p>}
            </div>
            <button onClick={() => save(s)} className="text-pink-500 shrink-0"><Heart size={16} /></button>
          </div>
        ))}
      </Card>

      <Card className="space-y-2">
        <p className="text-xs font-semibold">اسألي عن معنى اسم</p>
        <div className="flex gap-1.5">
          <input
            value={meaningQuery}
            onChange={(e) => setMeaningQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") lookupMeaning(); }}
            placeholder="اكتبي أي اسم"
            className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
          />
          <button onClick={lookupMeaning} disabled={meaningBusy || !meaningQuery.trim()} className="shrink-0 bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900 rounded-lg px-3 disabled:opacity-50">
            <Search size={15} />
          </button>
        </div>
        {meaningBusy && <p className="text-[11px] text-neutral-400 text-center">بندور على المعنى...</p>}
        {!meaningBusy && meaningResult && (
          meaningResult.found ? (
            <p className="text-xs bg-neutral-50 dark:bg-neutral-800 rounded-lg p-2">{meaningResult.meaning}</p>
          ) : (
            <p className="text-[11px] text-amber-600 text-center">
              {meaningResult.error ? meaningResult.error : "معرفناش نلاقي معنى موثوق للاسم ده."}
            </p>
          )
        )}
      </Card>

      <Card className="space-y-2">
        <p className="text-xs font-semibold">إضافة اسم يدوي لقائمة التصويت</p>
        <p className="text-[10px] text-neutral-400">اكتبي أي اسم مباشرة — هيتحفظ ويظهر فورًا في تصويت العيلة تحت، من غير ما تحتاجي تدوسي القلب.</p>
        <div className="flex gap-1.5">
          <input
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addManualName(); }}
            placeholder={gender === "girl" ? "اكتبي اسم بنت" : "اكتبي اسم ولد"}
            className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
          />
          <button onClick={addManualName} disabled={manualBusy || !manualName.trim()} className="shrink-0 bg-pink-500 text-white rounded-lg px-3 text-xs font-medium disabled:opacity-50">إضافة</button>
        </div>
      </Card>

      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold">أسماء محفوظة</p>
          <button onClick={() => { load(); loadPoll(); }} className="text-neutral-500 dark:text-neutral-300 flex items-center gap-1.5 text-xs font-medium bg-neutral-100 dark:bg-neutral-800 rounded-full px-3 py-1.5">
            <RefreshCw size={16} /> تحديث
          </button>
        </div>
 <p className="text-[10px] text-neutral-400">دوسي على القلب عشان ترشحي الاسم للتصويت العائلي تحت — دوسي "تحديث" عشان تشوفي أحدث عدد الأصوات</p>
        {names.map((n) => (
          <div key={n.id} className={`flex items-center justify-between gap-2 text-xs rounded-lg ${n.is_final ? "bg-pink-50 dark:bg-pink-950/30 p-1.5 -mx-1.5" : ""}`}>
            <div className="flex-1">
              <p className="font-medium">{n.name}</p>
              {n.meaning && <p className="text-neutral-400">{n.meaning}</p>}
              {fatherName.trim() && <p className="text-neutral-400 mt-0.5">الاسم كامل: {fullName(n.name)}</p>}
              {n.selected && voteCounts[n.id] !== undefined && (
                <p className="text-pink-500 mt-0.5">{voteCounts[n.id]} صوت من العيلة</p>
              )}
            </div>
            {/* Round 47 — علامة "الاسم النهائي": مستقلة تمامًا عن القلب،
                ومختلفة بصريًا عنه (نص/بادچ واضح بدل أيقونة قلب تانية) —
                طلب المستخدمة الصريح "علامه مختلفة وواضحة". ظاهرة بس على
                الأسماء اللي عليها قلب أصلًا (مرشّحة لتصويت العيلة). */}
            {n.selected && (
              n.is_final ? (
                <button onClick={() => toggleFinal(n.id, false)} className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-white bg-pink-500 rounded-full px-2 py-1">
                  <Check size={11} /> الاسم النهائي
                </button>
              ) : (
                <button onClick={() => toggleFinal(n.id, true)} className="shrink-0 text-[10px] font-medium text-pink-500 border border-pink-300 dark:border-pink-800 rounded-full px-2 py-1">
                  اجعليه نهائي
                </button>
              )
            )}
            <button onClick={() => toggleSelect(n.id, !n.selected)} className={n.selected ? "text-pink-500" : "text-neutral-300"}>
              <Heart size={16} fill={n.selected ? "currentColor" : "none"} />
            </button>
            <button onClick={() => del(n.id)} className="text-neutral-400"><X size={12} /></button>
          </div>
        ))}
        {!names.length && <p className="text-xs text-neutral-400 text-center py-2">مفيش أسماء محفوظة لسه</p>}
      </Card>

      <Card className="space-y-2">
 <p className="text-xs font-semibold"> تصويت العيلة على الأسماء</p>
 <p className="text-[10px] text-neutral-400">ابعتي اللينك ده لأي حد في العيلة يصوّت على الأسماء اللي رشحتيها (اللي عليها فوق).</p>
        {!pollToken ? (
          <button onClick={() => generatePollLink(false)} disabled={pollBusy} className="w-full bg-pink-500 text-white rounded-xl py-2.5 text-sm font-medium">
            {pollBusy ? "لحظة واحدة..." : "توليد لينك تصويت العيلة"}
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input readOnly value={pollShareLink} className="flex-1 text-xs rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 truncate" />
              <button onClick={copyPollLink} className="shrink-0 bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900 rounded-lg px-3 py-1.5"><Copy size={14} /></button>
            </div>
 {pollCopied && <p className="text-[10px] text-emerald-500 text-center">اتنسخ! </p>}
            <a href={`https://wa.me/?text=${encodeURIComponent(`ساعدونا نختار اسم البيبي! صوّتوا هنا: ${pollShareLink}`)}`} target="_blank" rel="noopener noreferrer"
              className="block text-center text-xs bg-emerald-500 text-white rounded-lg py-2 font-medium">مشاركة على واتساب</a>
            <button onClick={() => generatePollLink(true)} disabled={pollBusy} className="w-full text-[11px] text-neutral-400 underline">توليد لينك جديد (بيلغي القديم)</button>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────────── نصايح البشرة/الحمل (Gemini) ─────────────

function SkincareAdviceTab({ settings }: { settings: Settings }) {
  const [phase, setPhase] = useState<string | null>(null);
  const [advice, setAdvice] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const d = await api("/api/laha/periods");
      const info = cycleInfo(d.periods || [], settings.avg_cycle_length, todayISO(), settings.avg_period_length);
      setPhase(info?.phase || "follicular");
    })();
  }, [settings.avg_cycle_length, settings.avg_period_length]);

  const ask = async () => {
    if (!phase) return;
    setLoading(true);
    try { setAdvice(await api(`/api/laha/advice/skincare?phase=${phase}`)); }
    finally { setLoading(false); }
  };

  return (
    <Card className="space-y-3 text-center">
      <Sparkles className="mx-auto text-purple-400" size={28} />
      <p className="text-sm text-neutral-500">نصيحة عناية عامة بالبشرة حسب مرحلتك الهرمونية الحالية.</p>
      <button onClick={ask} disabled={loading} className="w-full bg-purple-500 text-white rounded-xl py-2.5 text-sm font-medium">
        {loading ? "لحظة واحدة..." : "اديني نصيحة"}
      </button>
      {advice && (
        <div className="text-right space-y-1 bg-purple-50 dark:bg-purple-950/40 rounded-xl p-3">
          {advice.error && <p className="text-xs text-red-500">{advice.error}</p>}
          {advice.advice && <p className="text-sm">{advice.advice}</p>}
          {advice.disclaimer && <p className="text-[10px] text-neutral-400">{advice.disclaimer}</p>}
        </div>
      )}
    </Card>
  );
}

function PregnancyAdviceTab({ settings }: { settings: Settings }) {
  const [week, setWeek] = useState(0);
  const [topic, setTopic] = useState("");
  const [advice, setAdvice] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!settings.lmp) return;
    setWeek(pregnancyInfo(settings.lmp).week);
  }, [settings.lmp]);

  const ask = async () => {
    setLoading(true);
    try { setAdvice(await api(`/api/laha/advice/pregnancy?week=${week || 1}${topic ? `&topic=${encodeURIComponent(topic)}` : ""}`)); }
    finally { setLoading(false); }
  };

  return (
    <Card className="space-y-3 text-center">
      <Sparkles className="mx-auto text-purple-400" size={28} />
      <p className="text-sm text-neutral-500">نصيحة عامة عن نمط الحياة في الأسبوع {week} من الحمل.</p>
      <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="موضوع معين (اختياري)" className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm text-right" />
      <button onClick={ask} disabled={loading} className="w-full bg-purple-500 text-white rounded-xl py-2.5 text-sm font-medium">
        {loading ? "لحظة واحدة..." : "اديني نصيحة"}
      </button>
      {advice && (
        <div className="text-right space-y-1 bg-purple-50 dark:bg-purple-950/40 rounded-xl p-3">
          {advice.error && <p className="text-xs text-red-500">{advice.error}</p>}
          {advice.advice && <p className="text-sm">{advice.advice}</p>}
          {advice.disclaimer && <p className="text-[10px] text-neutral-400">{advice.disclaimer}</p>}
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────── وضع الشريك الهادئ (Round 40) ────────────
// "Partner Sync" من الملف المرجعي — لينك للشريك يشوف فيه ملخص مطمئن بسيط
// (مزاج اليوم + المرحلة الهرمونية أو أسبوع الحمل) بدل ما يبقى محتاج يسأل
// كل شوية. اللينك حقيقي في قاعدة البيانات (`laha_partner_links`) بمدة
// صلاحية بتختارها المستخدمة، مش base64 مُرمّز جوه الـ URL زي البروتوتايب
// المرجعي — راجع app/api/laha/partner-link و app/api/partner/[token].
const VALIDITY_OPTIONS = [
  { key: "6h", label: "٦ ساعات" },
  { key: "24h", label: "٢٤ ساعة" },
  { key: "3d", label: "٣ أيام" },
  { key: "week", label: "أسبوع" },
];

// Round 45 — تسميات وترتيب سوتشات "يشوف إيه" لكل وضع (نفس مفاتيح
// REVEAL_KEYS في app/api/laha/partner-link/route.ts). كل وضع بيعرض بس
// السوتشات اللي تخصه + "المزاج" و"الملاحظات" المشتركين بين الاتنين.
const PARTNER_REVEAL_FIELDS: Record<"cycle" | "pregnancy", { key: string; label: string }[]> = {
  pregnancy: [
    { key: "heartbeat", label: "نبض قلب الجنين" },
    { key: "kicks", label: "تسجيل الركل" },
    { key: "sonar", label: "آخر صورة سونار" },
    { key: "mood", label: "المزاج والحالة" },
    { key: "notes", label: "الملاحظات" },
  ],
  cycle: [
    { key: "ovulation", label: "أيام التبويض" },
    { key: "fertile", label: "أيام الخصوبة" },
    { key: "mood", label: "المزاج والحالة" },
    { key: "notes", label: "الملاحظات" },
  ],
};

function PartnerSyncTab({ mode }: { mode: "cycle" | "pregnancy" }) {
  const [link, setLink] = useState<{ token: string; expires_at: string } | null>(null);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [validity, setValidity] = useState("24h");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => { setOrigin(window.location.origin); }, []);
  const load = async () => {
    try {
      const d = await api("/api/laha/partner-link");
      setLink(d.link);
      if (d.link?.reveal_config) setReveal(d.link.reveal_config);
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const generate = async () => {
    setBusy(true);
    try {
      const d = await api("/api/laha/partner-link", { method: "POST", body: JSON.stringify({ validity, reveal_config: reveal }) });
      setLink(d.link);
      if (d.link?.reveal_config) setReveal(d.link.reveal_config);
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  const toggleReveal = async (key: string) => {
    const next = { ...reveal, [key]: !reveal[key] };
    setReveal(next);
    if (!link) return; // هيتبعت مع أول توليد لينك
    try { await api("/api/laha/partner-link", { method: "PATCH", body: JSON.stringify({ reveal_config: next }) }); } catch {}
  };

  const shareLink = link ? `${origin}/partner/${link.token}` : "";
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareLink); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  const expiresText = link ? new Date(link.expires_at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" }) : "";
  const fields = PARTNER_REVEAL_FIELDS[mode] || PARTNER_REVEAL_FIELDS.pregnancy;

  return (
    <div className="space-y-3">
      <Card className="space-y-3 text-center">
        <Users className="mx-auto text-pink-400" size={28} />
        <p className="text-sm text-neutral-500">ابعتي لينك لشريكك يشوف فيه ملخص بسيط عن حالتك — إنتي اللي بتحددي إيه اللي يظهر له تحت، وبمدة صلاحية تحددينها إنتي.</p>

        <div className="flex flex-wrap gap-1.5 justify-center">
          {VALIDITY_OPTIONS.map((o) => (
            <button key={o.key} onClick={() => setValidity(o.key)} className={`text-xs rounded-full px-3 py-1.5 font-medium ${validity === o.key ? "bg-pink-500 text-white" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500"}`}>{o.label}</button>
          ))}
        </div>

        <button onClick={generate} disabled={busy} className="w-full bg-pink-500 text-white rounded-xl py-2.5 text-sm font-medium">
          {busy ? "لحظة واحدة..." : link ? "توليد لينك جديد" : "توليد لينك"}
        </button>
      </Card>

      <Card className="space-y-2.5">
        <p className="text-xs font-semibold">شريكك يشوف إيه؟</p>
        {fields.map((f) => (
          <div key={f.key} className="flex items-center justify-between">
            <p className="text-xs text-neutral-500">{f.label}</p>
            <Switch checked={!!reveal[f.key]} onChange={() => toggleReveal(f.key)} />
          </div>
        ))}
      </Card>

      {link && (
        <Card className="space-y-2">
          <p className="text-[11px] text-neutral-400">صالح لحد: {expiresText}</p>
          <div className="flex items-center gap-2">
            <input readOnly value={shareLink} className="flex-1 text-xs rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 truncate" />
            <button onClick={copyLink} className="shrink-0 bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900 rounded-lg px-3 py-1.5"><Copy size={14} /></button>
          </div>
 {copied && <p className="text-[10px] text-emerald-500 text-center">اتنسخ! </p>}
          <a href={`https://wa.me/?text=${encodeURIComponent(`تابع حالتي: ${shareLink}`)}`} target="_blank" rel="noopener noreferrer"
            className="block text-center text-xs bg-emerald-500 text-white rounded-lg py-2 font-medium">مشاركة على واتساب</a>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────── تيم بينك ولا تيم بلو؟ ────────────────
// حفلة الكشف عن نوع الجنين. راجع تعليقات app/api/laha/gender-reveal/* —
// الفلسفة الأمنية بالتفصيل هناك (الـ PIN بيتحطه الدكتور/الصديقة، وميترجعش
// ولا حتى كـ hash لأي حد، وطبقة الحماية إن الـ gender ميترجعش قبل الكشف).

function GenderRevealTab() {
  const [party, setParty] = useState<any>(null);
  const [votes, setVotes] = useState({ boy: 0, girl: 0 });
  const [loading, setLoading] = useState(true);
  const [pin, setPin] = useState("");
  const [unlockError, setUnlockError] = useState("");

  const load = async () => {
    const d = await api("/api/laha/gender-reveal/party");
    setParty(d.party);
    if (d.votes) setVotes(d.votes);
  };
  useEffect(() => { load().finally(() => setLoading(false)); }, []);
  useEffect(() => {
    // Round 44 — "ريفرش في الخلفية كل ٣ ثواني وقت الحفلة": بدل ٥ ثواني،
    // عشان الأم تشوف التصويتات لايف بشكل أسرع وهي فاتحة غرفة الأم.
    if (!party?.unlocked) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [party?.unlocked]);

  const createParty = async () => { await api("/api/laha/gender-reveal/party", { method: "POST" }); load(); };
  const unlock = async () => {
    setUnlockError("");
    try {
      await api("/api/laha/gender-reveal/unlock", { method: "POST", body: JSON.stringify({ pin }) });
      setPin("");
      load();
    } catch (e: any) { setUnlockError(e.message); }
  };

  if (loading) return <p className="text-sm text-neutral-400 text-center py-6">جاري التحميل...</p>;

  if (!party) {
    return (
      <Card className="text-center space-y-3 py-8">
        {/* Round 48 — "شيل أيقونة هدية ومتحطش حاجة من دماغك": اتشالت من هنا
            من غير أي بديل، بناءً على طلب صريح. */}
        <p className="text-sm text-neutral-500">ابدئي حفلة "تيم بينك ولا تيم بلو؟" — هتقدري تدّي الموبايل بعدها للدكتور أو صديقتك المقربة يسجلوا نوع الجنين برقم سري تحت إيديهم بس.</p>
        <button onClick={createParty} className="bg-pink-500 text-white rounded-xl py-2.5 px-6 text-sm font-medium">ابدئي الحفلة</button>
      </Card>
    );
  }

  // Round 45 — "اول ما الدكتورة تحط نوع الجنين وتعمل الرقم السري يظهر لينك
  // التصويت... فوق لينك الانستاباي": رابط التصويت/الهدية بقى ظاهر (مع تعداد
  // الأصوات) بمجرد ما الحفلة تتسجل (status !== awaiting_setup) — بغض النظر
  // عن فتح غرفة الأم بالـ PIN — لأن الفكرة إن الناس تصوّت قبل ما الأم نفسها
  // تعرف، فمينفعش يتحبس وراء نفس القفل اللي بيحجب نوع الجنين. رتّبناه فوق
  // InstapayCard زي ما اتطلب بالظبط.
  return (
    <div className="space-y-3">
      {party.status !== "awaiting_setup" && <ShareVoteCard party={party} votes={votes} onRefresh={load} />}

      <InstapayCard instapayLink={party.instapay_link} onSaved={load} />

      {party.status === "awaiting_setup" && <GenderRevealSetupCard onDone={load} />}

      {party.status !== "awaiting_setup" && !party.unlocked && (
        <Card className="text-center space-y-3 py-8">
          <Lock className="mx-auto text-neutral-400" size={28} />
          <p className="text-sm text-neutral-500">اتسجل نوع الجنين بالفعل — دخلي الرقم السري اللي معاكي (اللي أعطاكي إياه الدكتور/صديقتك) عشان تفتحي غرفة الأم.</p>
          <input value={pin} onChange={(e) => setPin(e.target.value)} type="password" inputMode="numeric" placeholder="الرقم السري" className="w-full text-center rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-lg tracking-widest" />
          {unlockError && <p className="text-xs text-red-500">{unlockError}</p>}
          <button onClick={unlock} className="w-full bg-pink-500 text-white rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-1.5"><Unlock size={14} /> افتحي غرفة الأم</button>
        </Card>
      )}

      {party.status !== "awaiting_setup" && party.unlocked && <MotherRoom party={party} votes={votes} onRefresh={load} />}

      {/* Round 43 — "سوتش حذف نوع الجنين": مقصود إنه يفضل متاح حتى من غير
          فتح غرفة الأم بالـ PIN (ده أصلًا مسار بديل لو الـ PIN اتنسي)،
          فمش جوه شرط party.unlocked. */}
      {party.status !== "awaiting_setup" && <ResetPartySection onReset={load} />}
    </div>
  );
}

// Round 45 — استُخرج من "غرفة الأم" (كان محبوس وراء الـ PIN) لنفس سبب
// InstapayCard: الفكرة كلها إن الناس تصوّت قبل ما الأم تعرف — فلينك
// التصويت وتعداد الأصوات لازم يكونوا متاحين من غير ما تحتاج تفتح غرفة الأم
// بالرقم السري (اللي أصلًا معاها معرفتش نوع الجنين نفسه محبوس وراه، مش
// مجرد كونها تشوف اللينك أو التصويت).
function ShareVoteCard({ party, votes, onRefresh }: { party: any; votes: { boy: number; girl: number }; onRefresh: () => void }) {
  const [copied, setCopied] = useState(false);
  const [linkOrigin, setLinkOrigin] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { setLinkOrigin(window.location.origin); }, []);

  const shareLink = `${linkOrigin}/laha-reveal/${party.share_token}`;
  const totalVotes = votes.boy + votes.girl;
  const boyPct = totalVotes ? Math.round((votes.boy / totalVotes) * 100) : 50;
  const girlPct = totalVotes ? 100 - boyPct : 50;

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareLink); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  const refresh = async () => {
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };

  return (
    <>
      <Card className="space-y-2">
        <p className="text-xs font-semibold">رابط الدعوة — ابعتيه لأهلك وصحابك يصوّتوا</p>
        <div className="flex gap-2">
          <input readOnly value={shareLink} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-2 text-xs" />
          <button onClick={copyLink} className="bg-pink-500 text-white rounded-lg px-3"><Copy size={14} /></button>
        </div>
        {copied && <p className="text-[10px] text-emerald-500">اتنسخ!</p>}
        <a href={`https://wa.me/?text=${encodeURIComponent(`صوّتوا معايا: تيم بينك ولا تيم بلو؟ ${shareLink}`)}`} target="_blank" rel="noopener noreferrer"
          className="block text-center text-xs bg-emerald-500 text-white rounded-lg py-2 font-medium">مشاركة على واتساب</a>
      </Card>

      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex justify-between gap-3 text-xs font-medium">
            <span className="text-sky-600 dark:text-sky-400">ولد {votes.boy}</span>
            <span className="text-pink-600 dark:text-pink-400">{votes.girl} بنت</span>
          </div>
          {/* Round 47 — "كبر مفتاح التحديث عند الأم واديله لون مختلف علشان
              يبان": كان زرار نص صغير رمادي بالكاد يتلاحظ — بقى بادچ بلون
              وردي بارز وحجم أكبر، متسق مع مفاتيح التحديث التانية في نفس
              الصفحة لكن بلون مميز عشان يبان وسط كارت التصويت. */}
          <button onClick={refresh} className="flex items-center gap-1.5 text-xs font-semibold text-white bg-pink-500 rounded-full px-3 py-1.5">
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> تحديث
          </button>
        </div>
        <div className="h-4 rounded-full overflow-hidden flex bg-neutral-100 dark:bg-neutral-800">
          <div className="h-full bg-sky-400 transition-all" style={{ width: `${boyPct}%` }} />
          <div className="h-full bg-pink-400 transition-all" style={{ width: `${girlPct}%` }} />
        </div>
      </Card>
    </>
  );
}

// Round 43 — استُخرج من "غرفة الأم" (كان محبوس وراء unlock token) عشان
// يبقى متاح من غير ما تحتاج تعرف نوع الجنين الأول (راجع الملاحظة فوق).
function InstapayCard({ instapayLink, onSaved }: { instapayLink: string | null; onSaved: () => void }) {
  const [instapay, setInstapay] = useState(instapayLink || "");
  const [saved, setSaved] = useState(false);
  useEffect(() => { setInstapay(instapayLink || ""); }, [instapayLink]);

  const saveInstapay = async () => {
    try {
      await api("/api/laha/gender-reveal/instapay", { method: "POST", body: JSON.stringify({ instapay_link: instapay }) });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onSaved();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <Card className="space-y-2">
      <p className="text-xs font-semibold">رابط انستاباي (يظهر للضيوف يبعتولك عليه "نقطة البيبي")</p>
      <div className="flex gap-2">
        <input value={instapay} onChange={(e) => setInstapay(e.target.value)} placeholder="ipn.eg/S/..." className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-xs" />
        <button onClick={saveInstapay} className="bg-pink-500 text-white rounded-lg px-3 text-xs font-medium">حفظ</button>
      </div>
      {saved && <p className="text-[10px] text-emerald-500">اتحفظ — بيظهر دلوقتي للضيوف كرابط قابل للفتح</p>}
      {!saved && instapayLink && <p className="text-[10px] text-neutral-400">الرابط المحفوظ حاليًا: {instapayLink}</p>}
    </Card>
  );
}

// Round 43 — "سوتش حذف نوع الجنين... يتطلب الرقم السري أو كود تفعيل
// البرنامج": مسار مسح/استرجاع متعمّد بناءً على طلب صريح من المستخدمة.
function ResetPartySection({ onReset }: { onReset: () => void }) {
  const [wantReset, setWantReset] = useState(false);
  const [authCode, setAuthCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = (v: boolean) => {
    setWantReset(v);
    setError("");
    if (!v) setAuthCode("");
  };

  const confirm = async () => {
    if (!authCode.trim()) { setError("اكتبي الرقم السري أو كود تفعيل البرنامج"); return; }
    setBusy(true);
    setError("");
    try {
      await api("/api/laha/gender-reveal/reset", { method: "POST", body: JSON.stringify({ auth_code: authCode.trim() }) });
      setWantReset(false);
      setAuthCode("");
      onReset();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-red-500">امسحي نوع الجنين والرقم السري</p>
        <Switch checked={wantReset} onChange={toggle} />
      </div>
      {wantReset && (
        <div className="space-y-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
          <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
            تنبيه: ده هيمسح نوع الجنين والرقم السري الحاليين، وهيتطلب من الدكتورة أو الصديقة المقربة تسجيلهم من جديد. هيتولّد رابط تصويت جديد للحفلة، وهتتمسح كل الأصوات المسجلة حاليًا.
          </p>
          <input
            value={authCode}
            onChange={(e) => setAuthCode(e.target.value)}
            placeholder="الرقم السري الحالي أو كود تفعيل البرنامج"
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm text-center"
          />
          {error && <p className="text-[11px] text-red-500 text-center">{error}</p>}
          <button onClick={confirm} disabled={busy} className="w-full bg-red-500 text-white rounded-xl py-2.5 text-sm font-medium">
            {busy ? "جاري المسح..." : "تأكيد إعادة الضبط"}
          </button>
        </div>
      )}
    </Card>
  );
}

function GenderRevealSetupCard({ onDone }: { onDone: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [gender, setGender] = useState<Gender>("girl");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [media, setMedia] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (pin.length < 4) { alert("الرقم السري لازم ٤ أرقام على الأقل"); return; }
    if (pin !== pinConfirm) { alert("الرقمين مش متطابقين"); return; }
    setBusy(true);
    try {
      await api("/api/laha/gender-reveal/setup", { method: "POST", body: JSON.stringify({ gender, pin, media_data_url: media }) });
      setGender("girl"); setPin(""); setPinConfirm(""); setMedia(null);
      setDone(true);
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  if (done) {
    return (
      <Card className="text-center space-y-2 py-8">
        <Check className="mx-auto text-emerald-500" size={32} />
        <p className="text-sm font-semibold">تم تسجيل البيانات بأمان</p>
        <p className="text-xs text-neutral-400">دلوقتي رجّعي الموبايل لصاحبة البرنامج — الرقم السري متسجلش في أي مكان تاني، متقوليهولهاش إلا يوم الحفلة.</p>
      </Card>
    );
  }

  if (!showForm) {
    return (
      <Card className="text-center space-y-3 py-8">
        <p className="text-sm font-semibold">دلوقتي دّي الموبايل للدكتور أو صديقتك المقربة</p>
        <p className="text-xs text-neutral-400 leading-relaxed">
          قوليلها: "افتحي الشاشة دي، سجّلي نوع الجنين، وحطي رقم سري من عندك — وممنوع تقوليلي الرقم إلا يوم حفلة الكشف!" وترفع صورة السونار لو حابة (اختياري).
        </p>
        <button onClick={() => setShowForm(true)} className="bg-pink-500 text-white rounded-xl py-2.5 px-6 text-sm font-medium">أنا الدكتورة/الصديقة، هبدأ التسجيل</button>
      </Card>
    );
  }

  return (
    <Card className="space-y-3">
      <p className="text-xs text-neutral-400 text-center">دي بياناتك يا دكتورة/يا صديقة — متقوليش الرقم السري لصاحبة البرنامج إلا يوم الحفلة!</p>
      <div className="flex gap-1.5">
        <button onClick={() => setGender("girl")} className={`flex-1 rounded-lg py-2 text-sm font-medium ${gender === "girl" ? "bg-pink-500 text-white" : "bg-neutral-100 dark:bg-neutral-800"}`}>بنت</button>
        <button onClick={() => setGender("boy")} className={`flex-1 rounded-lg py-2 text-sm font-medium ${gender === "boy" ? "bg-sky-500 text-white" : "bg-neutral-100 dark:bg-neutral-800"}`}>ولد</button>
      </div>
      <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} type="password" inputMode="numeric" placeholder="اختاري رقم سري (٤ أرقام على الأقل)" className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm text-center tracking-widest" />
      <input value={pinConfirm} onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ""))} type="password" inputMode="numeric" placeholder="أعيدي كتابة الرقم" className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm text-center tracking-widest" />
      <label className="flex items-center gap-2 text-xs border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 cursor-pointer">
        {media ? "صورة السونار اتضافت" : "صورة السونار (اختياري)"}
        <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setMedia(await shrinkImage(f)); }} />
      </label>
      <button onClick={submit} disabled={busy} className="w-full bg-pink-500 text-white rounded-xl py-2.5 text-sm font-medium">{busy ? "جاري الحفظ..." : "حفظ وإغلاق"}</button>
    </Card>
  );
}

function MotherRoom({ party, votes, onRefresh }: { party: any; votes: { boy: number; girl: number }; onRefresh: () => void }) {
  const [confirmReveal, setConfirmReveal] = useState(false);
  const [entries, setEntries] = useState<any[]>([]);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [exportingGuestbook, setExportingGuestbook] = useState(false);

  const loadGuestbook = async () => {
    try { const d = await api("/api/laha/gender-reveal/guestbook"); setEntries(d.entries || []); } catch {}
  };
  useEffect(() => { loadGuestbook(); }, [party?.id]);

  const reveal = async () => {
    if (!confirmReveal) { setConfirmReveal(true); return; }
    try { await api("/api/laha/gender-reveal/reveal", { method: "POST" }); onRefresh(); }
    catch (e: any) { alert(e.message); }
    setConfirmReveal(false);
  };

  // Round 45 — "مفتاح تصدير الجيست بوك كامل بي دي إف": تصدير كل رسائل
  // الضيوف (اسم/رسالة/تخمين/حالة الهدية) لملف PDF واحد — نفس نمط
  // exportGroupReferral في reminders/page.tsx (بناء عقدة HTML مخفية،
  // html2canvas-pro لتحويلها لصورة، jsPDF لتغليفها).
  const exportGuestbook = async () => {
    if (!entries.length) {
      // Round 47 — "تصدير الجيست بوك عند الأم بايظ": أول سبب حقيقي لقيناه —
      // الدالة كانت بترجع من غير أي رسالة لو القائمة فاضية، فيبان الزرار
      // "معملش حاجة".
      showExportError("مفيش تهاني متسجلة لسه في الجيست بوك عشان نصدرها");
      return;
    }
    setExportingGuestbook(true);
    const rowsHtml = entries.map((e) => `
      <div style="border:1px solid #e5e5e5;border-radius:10px;padding:12px;margin-bottom:10px;">
        <p style="font-weight:700;font-size:14px;margin:0 0 4px;">${escapeHtml(e.guest_name)}</p>
        <p style="font-size:12px;color:#444;margin:0 0 6px;">${escapeHtml(e.message)}</p>
        <p style="font-size:11px;color:#777;margin:0;">
          ${e.guess_vote ? `خمّنت: ${e.guess_vote === "boy" ? "ولد" : "بنت"}${e.guess_correct !== null ? (e.guess_correct ? " — صح!" : " — غلط") : ""}` : ""}
          ${e.sent_gift && e.payment_screenshot ? " · بعتت نقطة" : ""}
        </p>
      </div>`).join("");
    const html = `
      <h1 style="font-size:18px;font-weight:700;margin:0 0 4px;">جيست بوك حفلة تيم بينك ولا تيم بلو؟</h1>
      <p style="font-size:12px;color:#888;margin:0 0 16px;">${entries.length} تهنئة</p>
      ${rowsHtml}`;
    try {
      // Round 48 — "حل نهائي لتصدير PDF بايظ في أي مكان": بناء الالتقاط
      // والـPDF بقى جوه lib/pdfExport.ts (نفس نقطة الإصلاح المشتركة — راجع
      // تعليق الملف نفسه لتفاصيل سبب "الصندوق الفاضي" وإصلاحه).
      const canvas = await renderHtmlToCanvas(html, 700);
      const pdf = await canvasToPdf(canvas);
      await shareFile(pdf.output("dataurlstring"), "جيست-بوك-الحفلة.pdf", "application/pdf");
    } catch (e: any) {
      // Round 47 fix — السبب الحقيقي وراء "بايظ": الدالة دي كانت من غير أي
      // catch خالص، فأي خطأ (حتى بسيط زي مهلة الشبكة) كان بيفشل بصمت تمامًا
      // من غير ما المستخدمة تعرف إن حاجة غلط أصلًا.
      showExportError(e?.message ? `حصل خطأ في التصدير: ${e.message}` : "حصل خطأ في التصدير");
    } finally {
      setExportingGuestbook(false);
    }
  };

  return (
    <div className="space-y-3">
      {!party.popped ? (
        <Card className="text-center space-y-2">
          <button onClick={reveal} className={`w-full rounded-xl py-3 text-sm font-bold text-white ${confirmReveal ? "bg-red-500" : "bg-pink-500"}`}>
            {confirmReveal ? "دوسي تاني للتأكيد — هيتكشف النوع لكل اللي معاهم اللينك فورًا" : "دوسي علشان تكشفي النوع دلوقتي"}
          </button>
          {confirmReveal && <button onClick={() => setConfirmReveal(false)} className="text-xs text-neutral-400">إلغاء</button>}
        </Card>
      ) : (
        <Card className="text-center space-y-2 bg-gradient-to-b from-pink-50 to-sky-50 dark:from-pink-950 dark:to-sky-950 border-none">
          {/* Round 46 — طلب المستخدم: لو فيه اسم "مختار" بنفس النوع، يتحط
              مكان أيقونة الاحتفال بدل ما تفضل أيقونة عامة من غير معنى.
              Round 48 — أيقونة "هدية" الاحتياطية اتشالت من غير بديل (طلب
              صريح: "شيل أيقونة هدية ومتحطش حاجة من دماغك"). */}
          {party.selected_name && (
            <p className={`text-2xl font-extrabold ${party.gender === "boy" ? "text-sky-500" : "text-pink-500"}`}>{party.selected_name}</p>
          )}
          <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">{GENDER_REVEAL_DUA}</p>
          <h2 className="text-lg font-bold">{genderRevealCongrats(party.gender)}</h2>
        </Card>
      )}

      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold">جيست بوك الضيوف ({entries.length})</p>
          {!!entries.length && (
            <button onClick={exportGuestbook} disabled={exportingGuestbook} className="text-pink-500 flex items-center gap-1 text-[10px] disabled:opacity-50">
              <FileDown size={12} /> {exportingGuestbook ? "جاري التصدير..." : "تصدير PDF"}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {entries.map((e) => (
            <button key={e.id} onClick={() => setOpenEntry(openEntry === e.id ? null : e.id)}
              className="text-right rounded-lg border border-neutral-200 dark:border-neutral-800 p-2.5 space-y-1">
              <p className="text-xs font-semibold truncate">{e.guest_name}</p>
              <p className="text-[10px] text-neutral-400 line-clamp-2">{e.message}</p>
              {/* Round 45 — "ميظهرش إن الضيف بعت نقطة إلا لو رفع صورة الإيصال": بدل ما نعتمد على الـ checkbox بس. */}
              {e.sent_gift && e.payment_screenshot && <span className="text-[10px] text-emerald-500">بعت نقطة</span>}
            </button>
          ))}
        </div>
        {!entries.length && <p className="text-xs text-neutral-400 text-center py-2">مفيش تهاني لسه</p>}
        {openEntry && entries.find((e) => e.id === openEntry) && (
          <div className="rounded-xl bg-neutral-50 dark:bg-neutral-800 p-3 space-y-2 text-xs">
            {(() => {
              const e = entries.find((x) => x.id === openEntry);
              return (
                <>
                  <p className="font-semibold">{e.guest_name}</p>
                  <p>{e.message}</p>
                  {e.guess_vote && (
                    <p>
                      خمّنت: {e.guess_vote === "boy" ? "ولد" : "بنت"}
                      {e.guess_correct !== null && (e.guess_correct ? " — صح!" : " — غلط")}
                    </p>
                  )}
                  {e.payment_screenshot && <img src={e.payment_screenshot} className="rounded-lg max-h-48" />}
                </>
              );
            })()}
          </div>
        )}
      </Card>
    </div>
  );
}
