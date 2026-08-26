"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Card from "@/components/Card";
import { shrinkImage } from "@/lib/image";
import { todayISO, daysInMonth, firstWeekdayOfMonth, parseISO, ARABIC_MONTHS, addDays } from "@/lib/laha/dates";
import {
  cycleInfo, cycleRegularity, PRODUCTIVITY_MAP, detectGapFillers, waterRetentionInsight, describeTravelRange,
  type CyclePhase,
} from "@/lib/laha/cycle";
import { pregnancyInfo, fetalSizeLabel, weekBucket } from "@/lib/laha/pregnancy";
import {
  Heart, Baby, Calendar, Scale, StickyNote, Footprints, Timer, Stethoscope,
  Sparkles, PartyPopper, Copy, Lock, Unlock, Check, X, Wand2, ChevronRight, ChevronLeft, Search,
  CalendarRange, Zap, Users, Plane, Printer,
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

const TABS_PREGNANCY = [
  { key: "home", label: "الرئيسية", icon: Baby },
  { key: "kicks", label: "الركلات", icon: Footprints },
  { key: "contractions", label: "الانقباضات", icon: Timer },
  { key: "appointments", label: "المواعيد", icon: Stethoscope },
  { key: "doctor", label: "أسئلة للدكتور", icon: Stethoscope },
  { key: "names", label: "أسماء المولود", icon: Wand2 },
  { key: "weight", label: "الوزن", icon: Scale },
  { key: "notes", label: "ملاحظات", icon: StickyNote },
  { key: "advice", label: "نصايح الحمل", icon: Sparkles },
  { key: "partner", label: "الشريك", icon: Users },
  { key: "reveal", label: "🎈 تيم بينك/بلو", icon: PartyPopper },
] as const;

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

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition ${
              activeTabs === key ? "bg-pink-500 text-white" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500"
            }`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {activeTabs === "home" && settings.mode === "cycle" && <CycleHomeTab settings={settings} />}
      {activeTabs === "home" && settings.mode === "pregnancy" && <PregnancyHomeTab settings={settings} />}
      {activeTabs === "planning" && <PlanningTab settings={settings} />}
      {activeTabs === "partner" && <PartnerSyncTab />}
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
    setInfo(cycleInfo(periods, settings.avg_cycle_length));
    setRegularity(cycleRegularity(periods));
  }, [periods, settings.avg_cycle_length]);

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

  const REGULARITY_LABEL: Record<string, string> = { regular: "منتظمة ✅", slight: "فيها تفاوت بسيط", irregular: "غير منتظمة", unknown: "لسه مفيش بيانات كفاية" };

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
          🎒 جهزي شنطة العناية — الدورة متوقعة خلال {daysToNextPeriod === 0 ? "اليوم" : `${daysToNextPeriod} يوم`}
        </Card>
      )}
      {showPms && !showCareBag && (
        <Card className="bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-900 text-center text-xs font-medium text-purple-600 dark:text-purple-300">
          🌙 قربنا على الدورة — لو حاسة بتقلب مزاج أو نفاد صبر، ده طبيعي جدًا، خدي بالك من نفسك شوية
        </Card>
      )}

      <CycleCalendar
        periods={periods}
        avgCycleLength={settings.avg_cycle_length}
        activePeriodId={activePeriod?.id || null}
        busy={busy}
        onStart={startPeriodOn}
        onEnd={endPeriodOn}
        onDelete={deletePeriod}
      />

      {gapFillers.length > 0 && (
        <Card className="space-y-2 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">🔎 لاحظنا فجوة كبيرة بين دورتين متسجلتين</p>
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
  periods, avgCycleLength, activePeriodId, busy, onStart, onEnd, onDelete, travelRange,
}: {
  periods: any[]; avgCycleLength: number; activePeriodId: string | null; busy: boolean;
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
    const info = cycleInfo(periods, avgCycleLength, dateISO);
    if (!info) return "safe";
    if (info.isPeriodDay) return "period";
    if (info.ovulationDate === dateISO) return "ovulation";
    if (info.fertileStart && info.fertileEnd && dateISO >= info.fertileStart && dateISO <= info.fertileEnd) return "fertile";
    return "safe";
  };

  const CATEGORY_CLASS: Record<string, string> = {
    period: "bg-rose-500 text-white",
    ovulation: "bg-purple-500 text-white",
    fertile: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    safe: "bg-neutral-50 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300",
  };

  const selectedExactPeriod = selected ? periods.find((p) => p.start_date === selected) : null;
  const todayIso = todayISO();

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={() => changeMonth(1)} className="p-1 text-neutral-400"><ChevronRight size={16} /></button>
        <p className="text-sm font-semibold">{ARABIC_MONTHS[viewM - 1]} {viewY}</p>
        <button onClick={() => changeMonth(-1)} className="p-1 text-neutral-400"><ChevronLeft size={16} /></button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
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
              className={`relative aspect-square rounded-lg text-[11px] flex items-center justify-center transition ${CATEGORY_CLASS[cat]} ${isSelected ? "ring-2 ring-pink-500" : ""} ${isToday ? "font-bold" : ""} ${inTravel ? "ring-2 ring-sky-400" : ""}`}
            >
              {parseISO(dateISO).d}
              {isToday && <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-current" />}
              {isTravelEdge && <span className="absolute -top-1 -left-1 text-[10px]">✈️</span>}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-neutral-400">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> الدورة</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500" /> التبويض</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-300" /> نافذة الخصوبة</span>
        {travelRange?.start && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full ring-2 ring-sky-400" /> أيام الرحلة</span>}
      </div>

      {selected && (
        <div className="rounded-xl bg-neutral-50 dark:bg-neutral-800 p-3 space-y-2">
          <p className="text-xs font-medium text-center">{fmtDate(selected)}</p>
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
// تبويب "التخطيط" — سب-تابين زي ما وصف المستخدم في الملف المرجعي: ✈️ السفر
// والمناسبات (محاكي التوافق + نفس مكوّن التقويم بـ overlay) و⚡ الطاقة
// (خريطة الإنتاجية حسب المرحلة الهرمونية). تبويب "عاوزة بيبي" من نفس قسم
// الملف المرجعي اتأجل لراوند قادم (خارج نطاق الميزات الست المتفق عليها).
const SEGMENT_CATEGORY_CLASS: Record<string, string> = {
  period: "border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30",
  ovulation: "border-purple-300 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30",
  fertile: "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30",
  safe: "border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800",
};

function PlanningTab({ settings }: { settings: Settings }) {
  const [sub, setSub] = useState<"travel" | "energy">("travel");
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

  const plan = tripStart && tripEnd ? describeTravelRange(periods, settings.avg_cycle_length, tripStart, tripEnd) : null;
  const currentPhase = cycleInfo(periods, settings.avg_cycle_length)?.phase || null;

  return (
    <div className="space-y-3">
      <div className="flex rounded-full bg-neutral-100 dark:bg-neutral-800 p-0.5 text-xs">
        <button onClick={() => setSub("travel")} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-full font-medium ${sub === "travel" ? "bg-white dark:bg-neutral-700 shadow-sm" : "text-neutral-400"}`}>
          <Plane size={13} /> السفر والمناسبات
        </button>
        <button onClick={() => setSub("energy")} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-full font-medium ${sub === "energy" ? "bg-white dark:bg-neutral-700 shadow-sm" : "text-neutral-400"}`}>
          <Zap size={13} /> الطاقة والإنتاجية
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
              <p className="text-lg font-bold">{PRODUCTIVITY_MAP[currentPhase].emoji} {PRODUCTIVITY_MAP[currentPhase].title}</p>
            </Card>
          )}
          {(Object.keys(PRODUCTIVITY_MAP) as CyclePhase[]).map((ph) => (
            <Card key={ph} className={`space-y-1.5 text-xs ${currentPhase === ph ? "ring-2 ring-pink-400" : ""}`}>
              <p className="font-semibold">{PRODUCTIVITY_MAP[ph].emoji} {PHASE_LABEL_AR[ph]} — {PRODUCTIVITY_MAP[ph].title}</p>
              <p><b>العمل:</b> {PRODUCTIVITY_MAP[ph].work}</p>
              <p><b>الاجتماعي:</b> {PRODUCTIVITY_MAP[ph].social}</p>
              <p><b>الرياضة:</b> {PRODUCTIVITY_MAP[ph].fitness}</p>
            </Card>
          ))}
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
// فورًا (autosave، من غير زرار حفظ منفصل) مع تأكيد "تم الحفظ ✓" بسيط.
const MOOD_OPTIONS = [
  { key: "happy", label: "مبسوطة 😊" }, { key: "calm", label: "هادية 🙂" }, { key: "tired", label: "متعبة 😴" },
  { key: "sensitive", label: "حساسة 🥺" }, { key: "anxious", label: "قلقانة 😟" }, { key: "irritable", label: "سريعة الانفعال 😤" },
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
      }
    } finally {
      setLoaded(true);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async (patch: { mood?: string | null; pain_tags?: string[]; flow?: string | null }) => {
    const nextMood = patch.mood !== undefined ? patch.mood : mood;
    const nextPain = patch.pain_tags !== undefined ? patch.pain_tags : painTags;
    const nextFlow = patch.flow !== undefined ? patch.flow : flow;
    try {
      await api("/api/laha/daily-logs", {
        method: "POST",
        body: JSON.stringify({ log_date: todayISO(), mood: nextMood, pain_tags: nextPain, flow: nextFlow }),
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

  if (!loaded) return null;

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">إزيك النهاردة؟</p>
        {saved && <span className="text-[10px] text-emerald-500">تم الحفظ ✓</span>}
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

      {history.length > 0 && (
        <details className="text-xs">
          <summary className="text-neutral-400 cursor-pointer">سجل الأيام اللي فاتت ({history.length})</summary>
          <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
            {history.map((l) => (
              <div key={l.log_date} className="flex items-center justify-between text-[11px] text-neutral-500">
                <span>{fmtDate(l.log_date)}</span>
                <span>
                  {[l.mood && MOOD_OPTIONS.find((m) => m.key === l.mood)?.label, ...(l.pain_tags || []).map((t: string) => PAIN_OPTIONS.find((p) => p.key === t)?.label), l.flow && FLOW_OPTIONS.find((f) => f.key === l.flow)?.label].filter(Boolean).join("، ") || "-"}
                </span>
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

  return (
    <div className="space-y-3">
      <Card className="text-center space-y-2 bg-gradient-to-b from-pink-50 to-purple-50 dark:from-pink-950 dark:to-purple-950 border-none">
        <p className="text-xs text-neutral-500">الأسبوع {info.week} + {info.day} يوم — الترايمستر {info.trimester === 1 ? "الأول" : info.trimester === 2 ? "الثاني" : "الثالث"}</p>
        <div className="h-3 rounded-full bg-white/60 dark:bg-black/20 overflow-hidden">
          <div className="h-full bg-purple-400" style={{ width: `${info.progressPct}%` }} />
        </div>
        <p className="text-2xl font-bold">🍇 حجم البيبي دلوقتي: {fetalSize}</p>
        <p className="text-xs text-neutral-500">موعد الولادة المتوقع: <b>{fmtDate(info.dueDate)}</b> (حسب قاعدة نيغيلي)</p>
      </Card>
    </div>
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
        const info = cycleInfo(d.periods || [], settings.avg_cycle_length);
        setPhase(info?.phase || null);
      } catch { setPhase(null); }
    })();
  }, [mode, settings.avg_cycle_length]);

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
          <p className="font-medium mb-1">⚖️ ميزان احتباس السوائل</p>
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
          ⚠️ الانقباضات بقت متقاربة ومستمرة — قربي وقتها، كلمي الدكتور أو روحي المستشفى
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

// ─────────────────────────────── المواعيد ────────────────────────────────

function AppointmentsTab() {
  const [appts, setAppts] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = async () => { const d = await api("/api/laha/appointments"); setAppts(d.appointments || []); };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!title.trim() || !date) { alert("العنوان والتاريخ مطلوبين"); return; }
    try {
      await api("/api/laha/appointments", { method: "POST", body: JSON.stringify({ appt_date: date, title, notes, image }) });
      setTitle(""); setDate(""); setNotes(""); setImage(null); setShowForm(false);
      load();
    } catch (e: any) { alert(e.message); }
  };
  const del = async (id: string) => { await api(`/api/laha/appointments/${id}`, { method: "DELETE" }); load(); };

  return (
    <div className="space-y-3">
      {!showForm ? (
        <button onClick={() => setShowForm(true)} className="w-full bg-pink-500 text-white rounded-xl py-2.5 text-sm font-medium">+ موعد جديد</button>
      ) : (
        <Card className="space-y-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان الموعد" className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات (اختياري)" rows={2} className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm" />
          <label className="flex items-center gap-2 text-xs border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 cursor-pointer">
            {image ? "✅ صورة اتضافت" : "صورة سونار/روشتة (اختياري)"}
            <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImage(await shrinkImage(f)); }} />
          </label>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 py-2 text-sm">إلغاء</button>
            <button onClick={add} className="flex-1 bg-pink-500 text-white rounded-lg py-2 text-sm font-medium">حفظ</button>
          </div>
        </Card>
      )}
      {appts.map((a) => (
        <Card key={a.id} className="space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{a.title}</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-400">{fmtDate(a.appt_date)}</span>
              <button onClick={() => del(a.id)} className="text-neutral-400"><X size={12} /></button>
            </div>
          </div>
          {a.notes && <p className="text-xs text-neutral-500">{a.notes}</p>}
          {a.image && <img src={a.image} className="rounded-lg max-h-40" />}
        </Card>
      ))}
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
            {q.is_custom && <button onClick={() => del(q.id)} className="text-neutral-400"><X size={12} /></button>}
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

  const load = async () => { const d = await api("/api/laha/baby-names"); setNames(d.names || []); };
  useEffect(() => { load(); }, []);
  useEffect(() => { setFatherName(settings.father_name || ""); }, [settings.father_name]);

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
  const toggleSelect = async (id: string, selected: boolean) => { await api(`/api/laha/baby-names/${id}`, { method: "PATCH", body: JSON.stringify({ selected }) }); load(); };
  const del = async (id: string) => { await api(`/api/laha/baby-names/${id}`, { method: "DELETE" }); load(); };

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

  return (
    <div className="space-y-3">
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
          <button onClick={() => setGender("girl")} className={`flex-1 rounded-lg py-1.5 text-xs font-medium ${gender === "girl" ? "bg-pink-500 text-white" : "bg-neutral-100 dark:bg-neutral-800"}`}>بنت 💗</button>
          <button onClick={() => setGender("boy")} className={`flex-1 rounded-lg py-1.5 text-xs font-medium ${gender === "boy" ? "bg-sky-500 text-white" : "bg-neutral-100 dark:bg-neutral-800"}`}>ولد 💙</button>
        </div>
        <button onClick={suggest} disabled={busy} className="relative w-full overflow-hidden flex items-center justify-center gap-1.5 bg-purple-500 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-80">
          {busy ? (
            <>
              <span className="inline-block animate-baby-sway text-base">👶</span>
              <span>لحظة واحدة...</span>
            </>
          ) : (
            <>👶 اختارلي اسم</>
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
        <p className="text-xs font-semibold">أسماء محفوظة</p>
        {names.map((n) => (
          <div key={n.id} className="flex items-center justify-between gap-2 text-xs">
            <div className="flex-1">
              <p className="font-medium">{n.name} {n.gender === "girl" ? "💗" : "💙"}</p>
              {n.meaning && <p className="text-neutral-400">{n.meaning}</p>}
              {fatherName.trim() && <p className="text-neutral-400 mt-0.5">الاسم كامل: {fullName(n.name)}</p>}
            </div>
            <button onClick={() => toggleSelect(n.id, !n.selected)} className={n.selected ? "text-pink-500" : "text-neutral-300"}>
              <Heart size={16} fill={n.selected ? "currentColor" : "none"} />
            </button>
            <button onClick={() => del(n.id)} className="text-neutral-400"><X size={12} /></button>
          </div>
        ))}
        {!names.length && <p className="text-xs text-neutral-400 text-center py-2">مفيش أسماء محفوظة لسه</p>}
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
      const info = cycleInfo(d.periods || [], settings.avg_cycle_length);
      setPhase(info?.phase || "follicular");
    })();
  }, [settings.avg_cycle_length]);

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

function PartnerSyncTab() {
  const [link, setLink] = useState<{ token: string; expires_at: string } | null>(null);
  const [validity, setValidity] = useState("24h");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => { setOrigin(window.location.origin); }, []);
  const load = async () => {
    try { const d = await api("/api/laha/partner-link"); setLink(d.link); } catch {}
  };
  useEffect(() => { load(); }, []);

  const generate = async () => {
    setBusy(true);
    try {
      const d = await api("/api/laha/partner-link", { method: "POST", body: JSON.stringify({ validity }) });
      setLink(d.link);
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };

  const shareLink = link ? `${origin}/partner/${link.token}` : "";
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareLink); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };
  const expiresText = link ? new Date(link.expires_at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" }) : "";

  return (
    <div className="space-y-3">
      <Card className="space-y-3 text-center">
        <Users className="mx-auto text-pink-400" size={28} />
        <p className="text-sm text-neutral-500">ابعتي لينك لشريكك يشوف فيه ملخص بسيط عن مزاجك والمرحلة اللي فيها — من غير أي تفاصيل حساسة، وبمدة صلاحية تحددينها إنتي.</p>

        <div className="flex flex-wrap gap-1.5 justify-center">
          {VALIDITY_OPTIONS.map((o) => (
            <button key={o.key} onClick={() => setValidity(o.key)} className={`text-xs rounded-full px-3 py-1.5 font-medium ${validity === o.key ? "bg-pink-500 text-white" : "bg-neutral-100 dark:bg-neutral-800 text-neutral-500"}`}>{o.label}</button>
          ))}
        </div>

        <button onClick={generate} disabled={busy} className="w-full bg-pink-500 text-white rounded-xl py-2.5 text-sm font-medium">
          {busy ? "لحظة واحدة..." : link ? "توليد لينك جديد" : "توليد لينك"}
        </button>
      </Card>

      {link && (
        <Card className="space-y-2">
          <p className="text-[11px] text-neutral-400">صالح لحد: {expiresText}</p>
          <div className="flex items-center gap-2">
            <input readOnly value={shareLink} className="flex-1 text-xs rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 py-1.5 truncate" />
            <button onClick={copyLink} className="shrink-0 bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900 rounded-lg px-3 py-1.5"><Copy size={14} /></button>
          </div>
          {copied && <p className="text-[10px] text-emerald-500 text-center">اتنسخ! ✅</p>}
          <a href={`https://wa.me/?text=${encodeURIComponent(`تابع حالتي: ${shareLink}`)}`} target="_blank" rel="noopener noreferrer"
            className="block text-center text-xs bg-emerald-500 text-white rounded-lg py-2 font-medium">مشاركة على واتساب</a>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────── 🎈 تيم بينك ولا تيم بلو؟ ────────────────
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
    if (!party?.unlocked) return;
    const t = setInterval(load, 5000);
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
        <PartyPopper className="mx-auto text-pink-400" size={32} />
        <p className="text-sm text-neutral-500">ابدئي حفلة "تيم بينك ولا تيم بلو؟" — هتقدري تدّي الموبايل بعدها للدكتور أو صديقتك المقربة يسجلوا نوع الجنين برقم سري تحت إيديهم بس.</p>
        <button onClick={createParty} className="bg-pink-500 text-white rounded-xl py-2.5 px-6 text-sm font-medium">ابدئي الحفلة</button>
      </Card>
    );
  }

  if (party.status === "awaiting_setup") {
    return <GenderRevealSetupCard onDone={load} />;
  }

  if (!party.unlocked) {
    return (
      <Card className="text-center space-y-3 py-8">
        <Lock className="mx-auto text-neutral-400" size={28} />
        <p className="text-sm text-neutral-500">اتسجل نوع الجنين بالفعل — دخلي الرقم السري اللي معاكي (اللي أعطاكي إياه الدكتور/صديقتك) عشان تفتحي غرفة الأم.</p>
        <input value={pin} onChange={(e) => setPin(e.target.value)} type="password" inputMode="numeric" placeholder="الرقم السري" className="w-full text-center rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-lg tracking-widest" />
        {unlockError && <p className="text-xs text-red-500">{unlockError}</p>}
        <button onClick={unlock} className="w-full bg-pink-500 text-white rounded-xl py-2.5 text-sm font-medium flex items-center justify-center gap-1.5"><Unlock size={14} /> افتحي غرفة الأم</button>
      </Card>
    );
  }

  return <MotherRoom party={party} votes={votes} onRefresh={load} />;
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
        <p className="text-sm font-semibold">تم تسجيل البيانات بأمان ✅</p>
        <p className="text-xs text-neutral-400">دلوقتي رجّعي الموبايل لصاحبة البرنامج — الرقم السري متسجلش في أي مكان تاني، متقوليهولهاش إلا يوم الحفلة.</p>
      </Card>
    );
  }

  if (!showForm) {
    return (
      <Card className="text-center space-y-3 py-8">
        <p className="text-sm font-semibold">📱 دلوقتي دّي الموبايل للدكتور أو صديقتك المقربة</p>
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
        <button onClick={() => setGender("girl")} className={`flex-1 rounded-lg py-2 text-sm font-medium ${gender === "girl" ? "bg-pink-500 text-white" : "bg-neutral-100 dark:bg-neutral-800"}`}>بنت 💗</button>
        <button onClick={() => setGender("boy")} className={`flex-1 rounded-lg py-2 text-sm font-medium ${gender === "boy" ? "bg-sky-500 text-white" : "bg-neutral-100 dark:bg-neutral-800"}`}>ولد 💙</button>
      </div>
      <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} type="password" inputMode="numeric" placeholder="اختاري رقم سري (٤ أرقام على الأقل)" className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm text-center tracking-widest" />
      <input value={pinConfirm} onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ""))} type="password" inputMode="numeric" placeholder="أعيدي كتابة الرقم" className="w-full rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm text-center tracking-widest" />
      <label className="flex items-center gap-2 text-xs border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-2 cursor-pointer">
        {media ? "✅ صورة السونار اتضافت" : "صورة السونار (اختياري)"}
        <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setMedia(await shrinkImage(f)); }} />
      </label>
      <button onClick={submit} disabled={busy} className="w-full bg-pink-500 text-white rounded-xl py-2.5 text-sm font-medium">{busy ? "جاري الحفظ..." : "حفظ وإغلاق"}</button>
    </Card>
  );
}

function MotherRoom({ party, votes, onRefresh }: { party: any; votes: { boy: number; girl: number }; onRefresh: () => void }) {
  const [instapay, setInstapay] = useState("");
  const [confirmReveal, setConfirmReveal] = useState(false);
  const [entries, setEntries] = useState<any[]>([]);
  const [openEntry, setOpenEntry] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkOrigin, setLinkOrigin] = useState("");

  useEffect(() => { setLinkOrigin(window.location.origin); }, []);
  const loadGuestbook = async () => {
    try { const d = await api("/api/laha/gender-reveal/guestbook"); setEntries(d.entries || []); } catch {}
  };
  useEffect(() => { loadGuestbook(); }, [party?.id]);

  const shareLink = `${linkOrigin}/laha-reveal/${party.share_token}`;
  const totalVotes = votes.boy + votes.girl;
  const boyPct = totalVotes ? Math.round((votes.boy / totalVotes) * 100) : 50;
  const girlPct = totalVotes ? 100 - boyPct : 50;

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareLink); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  };

  const reveal = async () => {
    if (!confirmReveal) { setConfirmReveal(true); return; }
    try { await api("/api/laha/gender-reveal/reveal", { method: "POST" }); onRefresh(); }
    catch (e: any) { alert(e.message); }
    setConfirmReveal(false);
  };

  const saveInstapay = async () => {
    try { await api("/api/laha/gender-reveal/instapay", { method: "POST", body: JSON.stringify({ instapay_link: instapay }) }); alert("تم الحفظ"); }
    catch (e: any) { alert(e.message); }
  };

  return (
    <div className="space-y-3">
      <Card className="space-y-2">
        <p className="text-xs font-semibold">رابط الدعوة — ابعتيه لأهلك وصحابك يصوّتوا</p>
        <div className="flex gap-2">
          <input readOnly value={shareLink} className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-2 text-xs" />
          <button onClick={copyLink} className="bg-pink-500 text-white rounded-lg px-3"><Copy size={14} /></button>
        </div>
        {copied && <p className="text-[10px] text-emerald-500">اتنسخ! ✅</p>}
        <a href={`https://wa.me/?text=${encodeURIComponent(`صوّتوا معايا: تيم بينك ولا تيم بلو؟ 🎈 ${shareLink}`)}`} target="_blank" rel="noopener noreferrer"
          className="block text-center text-xs bg-emerald-500 text-white rounded-lg py-2 font-medium">مشاركة على واتساب</a>
      </Card>

      <Card className="space-y-2">
        <div className="flex justify-between text-xs font-medium">
          <span className="text-sky-600 dark:text-sky-400">ولد 💙 {votes.boy}</span>
          <span className="text-pink-600 dark:text-pink-400">{votes.girl} 💗 بنت</span>
        </div>
        <div className="h-4 rounded-full overflow-hidden flex bg-neutral-100 dark:bg-neutral-800">
          <div className="h-full bg-sky-400 transition-all" style={{ width: `${boyPct}%` }} />
          <div className="h-full bg-pink-400 transition-all" style={{ width: `${girlPct}%` }} />
        </div>
      </Card>

      {!party.popped ? (
        <Card className="text-center space-y-2">
          <button onClick={reveal} className={`w-full rounded-xl py-3 text-sm font-bold text-white ${confirmReveal ? "bg-red-500" : "bg-pink-500"}`}>
            {confirmReveal ? "دوسي تاني للتأكيد — هيتكشف النوع لكل اللي معاهم اللينك فورًا 🎈" : "دوسي علشان تكشفي النوع دلوقتي 🎈"}
          </button>
          {confirmReveal && <button onClick={() => setConfirmReveal(false)} className="text-xs text-neutral-400">إلغاء</button>}
        </Card>
      ) : (
        <Card className="text-center space-y-2 bg-gradient-to-b from-pink-50 to-sky-50 dark:from-pink-950 dark:to-sky-950 border-none">
          <PartyPopper className={`mx-auto ${party.gender === "boy" ? "text-sky-500" : "text-pink-500"}`} size={36} />
          <h2 className="text-xl font-bold">{party.gender === "boy" ? "🎉 إنه ولد! 💙" : "🎉 إنها بنت! 💗"}</h2>
        </Card>
      )}

      <Card className="space-y-2">
        <p className="text-xs font-semibold">رابط انستاباي (يظهر للضيوف يبعتولك عليه "نقطة البيبي")</p>
        <div className="flex gap-2">
          <input value={instapay} onChange={(e) => setInstapay(e.target.value)} placeholder="ipn.eg/S/..." className="flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-xs" />
          <button onClick={saveInstapay} className="bg-pink-500 text-white rounded-lg px-3 text-xs font-medium">حفظ</button>
        </div>
      </Card>

      <Card className="space-y-2">
        <p className="text-xs font-semibold">جيست بوك الضيوف ({entries.length})</p>
        <div className="grid grid-cols-2 gap-2">
          {entries.map((e) => (
            <button key={e.id} onClick={() => setOpenEntry(openEntry === e.id ? null : e.id)}
              className="text-right rounded-lg border border-neutral-200 dark:border-neutral-800 p-2.5 space-y-1">
              <p className="text-xs font-semibold truncate">{e.guest_name}</p>
              <p className="text-[10px] text-neutral-400 line-clamp-2">{e.message}</p>
              {e.sent_gift && <span className="text-[10px] text-emerald-500">💰 بعت نقطة</span>}
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
                      خمّنت: {e.guess_vote === "boy" ? "ولد 💙" : "بنت 💗"}
                      {e.guess_correct !== null && (e.guess_correct ? " — صح! ✅" : " — غلط ❌")}
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
