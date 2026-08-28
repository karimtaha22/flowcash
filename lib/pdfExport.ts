// CLIENT-SAFE — Round 48: "حل نهائي لتصدير PDF بيطلع بايظ في أي مكان في
// البرنامج" + "ملف الـPDF بيطلع حجمه فوق ٢ ميجا، اضغطي الصور".
//
// نقطة تجميع واحدة لكل تصديرات الـPDF/الصور في التطبيق، بدل ما كل صفحة
// تبني عنصر الالتقاط وتنده html2canvas بنفسها (زي ما كان قبل الراوند ده —
// 8 نسخ متكررة من نفس الكود تقريبًا في 5 ملفات).
//
// السبب الجذري المرجّح لـ"صندوق فاضي" في التصدير: كل مكان كان بيحط عنصر
// الالتقاط على `position:fixed;left:-9999px` — بعيد تمامًا عن حدود الشاشة
// المرئية. بعض المتصفحات المدمجة (webview تليجرام، بعض إصدارات أندرويد في
// وضع PWA standalone) بتتجاهل "رسم" (paint) أي عنصر بعيد عن حدود الشاشة
// فعليًا حتى لو موضعه "fixed" — فبيتصوّر فاضي أو ببعض المحتوى بس، من غير
// أي خطأ (ولا حتى catch يمسكه، عشان مفيش استثناء أصلًا — الكود "نجح" لكن
// الصورة الناتجة فاضية). الحل هنا: العنصر بقى داخل حدود الشاشة فعليًا
// (0,0) لكن خلف كل حاجة تانية بـz-index سالب جدًا، فيتضمن رسمه بالكامل من
// غير ما يبان للمستخدمة نهائيًا. وبعد إضافته للصفحة بننتظر فريمين كاملين
// (requestAnimationFrame مرتين) فوق انتظار تحميل الخطوط، عشان نضمن إن
// المتصفح خلص "رسم" فعلي (مش بس "موجود في الـDOM") قبل ما html2canvas
// ياخد الصورة.
//
// وبخصوص حجم الملف: الصورة كانت بتتحفظ PNG (بلا فقدان — حجم كبير جدًا لأي
// صفحة نص/جداول طويلة). بقت JPEG بجودة ٠.٨٥ (فرق شبه معدوم عينيًا على
// خلفية بيضاء ونصوص عادية) + تفعيل ضغط jsPDF الداخلي (compress: true) —
// بيقلل حجم ملف الـPDF المُصدَّر بشكل كبير من غير فرق يُذكر في الوضوح.

let zSeq = 0;

/**
 * يبني عنصر HTML مخفي (داخل حدود الشاشة، خلف كل حاجة تانية)، يملاه بالـ
 * html الممرر، وبعد ما يتأكد إن المتصفح رسمه فعليًا يصوّره بـhtml2canvas-pro
 * ويشيله من الصفحة. النتيجة: canvas جاهز يتحول لـPDF أو صورة.
 */
export async function renderHtmlToCanvas(html: string, widthPx = 700): Promise<HTMLCanvasElement> {
  const node = document.createElement("div");
  zSeq = (zSeq + 1) % 500;
  node.style.cssText =
    `position:fixed;top:0;left:0;width:${widthPx}px;background:#ffffff;padding:24px;` +
    `font-family:Cairo,sans-serif;direction:rtl;color:#111827;z-index:${-(9000 + zSeq)};pointer-events:none;`;
  node.innerHTML = html;
  document.body.appendChild(node);
  try {
    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch {
        // best-effort — لو تحميل الخطوط فشل نكمل بالخط الاحتياطي بدل ما نوقف التصدير
      }
    }
    void node.offsetHeight; // اضمن إن المتصفح عمل layout فعلي قبل أي حاجة تانية
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const html2canvas = (await import("html2canvas-pro")).default;
    return await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", width: widthPx, windowWidth: widthPx });
  } finally {
    document.body.removeChild(node);
  }
}

/** يلف canvas جوه jsPDF بمقاس مطابق لمحتواه (مش مكبّر بمقياس الـ2x الخام) — JPEG مضغوطة بدل PNG خام. */
export async function canvasToPdf(canvas: HTMLCanvasElement) {
  const { jsPDF } = await import("jspdf");
  const w = canvas.width / 2;
  const h = canvas.height / 2;
  const pdf = new jsPDF({ unit: "px", format: [w, h], compress: true });
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.85), "JPEG", 0, 0, w, h);
  return pdf;
}

/** الاختصار الشائع: HTML string → data URL لملف PDF جاهز للمشاركة. */
export async function renderHtmlToPdfDataUrl(html: string, widthPx = 700): Promise<string> {
  const canvas = await renderHtmlToCanvas(html, widthPx);
  const pdf = await canvasToPdf(canvas);
  return pdf.output("dataurlstring");
}
