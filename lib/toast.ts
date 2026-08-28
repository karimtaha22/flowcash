// Round 48 — توست عام لأي رسالة "بتظهر وتختفي لوحدها" في التطبيق (نجاح أو
// خطأ)، مبني على نفس فكرة lib/exportToast.ts (Round 47) بس معمم لأي حالة
// مش بس أخطاء التصدير — أول استخدام تاني ليه: "تم نقل الدين المسدد إلى
// الأرشيف" بعد تسوية دين بالكامل.
//
// ليه عنصر HTML فعلي بدل alert()/toast مكتبة خارجية: alert() ممكن يتمنع
// بصمت في متصفحات الـwebview المدمجة (تليجرام، PWA standalone)، وده بالظبط
// كان سبب بلاغات "صامت" في راوندات سابقة.

export type ToastType = "success" | "error" | "info";

const COLORS: Record<ToastType, string> = {
  success: "#059669", // emerald-600
  error: "#dc2626", // red-600
  info: "#2563eb", // blue-600
};

let toastEl: HTMLDivElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export function showToast(message: string, type: ToastType = "info", durationMs = 5000) {
  if (typeof document === "undefined") return;
  if (hideTimer) clearTimeout(hideTimer);
  if (!toastEl || !document.body.contains(toastEl)) {
    toastEl = document.createElement("div");
    document.body.appendChild(toastEl);
  }
  toastEl.style.cssText =
    `position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;max-width:90vw;` +
    `background:${COLORS[type]};color:#fff;padding:10px 16px;border-radius:12px;font-size:13px;` +
    `font-family:Cairo,sans-serif;direction:rtl;box-shadow:0 4px 16px rgba(0,0,0,.25);text-align:center;`;
  toastEl.textContent = message;
  toastEl.style.display = "block";
  hideTimer = setTimeout(() => {
    if (toastEl) toastEl.style.display = "none";
  }, durationMs);
}
