// CLIENT-SAFE — Round 47: "تصدير متابعة الطبيب صامت... كل التصدير PDF بايظ
// في جميع البرنامج". فحص كل أماكن تصدير الـPDF في التطبيق طلع فيه أكتر من
// سبب حقيقي مختلف (باج مقاس الصفحة اتصلح في راوند سابق، كارت بدون catch
// خالص هنا)، لكن السبب المشترك اللي بيخلي أي فشل يبان "صامت" (زرار بيتضغط
// ومفيش أي رد فعل) هو الاعتماد على `alert()` لعرض الخطأ — كتير من متصفحات
// الـwebview المدمجة (تطبيقات PWA standalone، متصفح تليجرام الداخلي،
// إلخ) بتمنع `alert()`/`confirm()` بصمت، فلو حصل خطأ فعلي جوه try/catch
// وعرضناه بـalert() بس، المستخدمة هتحس إن الزرار "مايعملش حاجة" رغم إن
// الكود اتنفذ وحاول يعرّفها. `showExportError` هنا بديل مضمون الظهور —
// عنصر HTML فعلي بيتحط في الصفحة مباشرة (مش نافذة متصفح ممكن تتمنع).
let toastEl: HTMLDivElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export function showExportError(message: string) {
  if (typeof document === "undefined") return;
  if (hideTimer) clearTimeout(hideTimer);
  if (!toastEl || !document.body.contains(toastEl)) {
    toastEl = document.createElement("div");
    toastEl.style.cssText =
      "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;max-width:90vw;background:#dc2626;color:#fff;padding:10px 16px;border-radius:12px;font-size:13px;font-family:Cairo,sans-serif;direction:rtl;box-shadow:0 4px 16px rgba(0,0,0,.25);text-align:center;";
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.style.display = "block";
  hideTimer = setTimeout(() => {
    if (toastEl) toastEl.style.display = "none";
  }, 5000);
}
