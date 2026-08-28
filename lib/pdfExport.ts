// CLIENT-SAFE — نقطة تجميع واحدة لكل تصديرات الـPDF/الصور في التطبيق، بدل ما
// كل صفحة تبني عنصر الالتقاط وتنده html2canvas بنفسها (Round 48).
//
// ============================ Round 49 ============================
// "لسه في مشكلة في التصدير في البرنامج بالكامل" — مرفق سكرين شوتين: تقرير
// متابعة الحمل بعنوان مقصوص من اليمين، وجدول أدوية ظاهر منه عمود واحد بس.
//
// المرة دي **اتأكد السبب بتجربة حقيقية** مش بتخمين: اتبنت نسخة من كود
// التصدير ده بالظبط واتشغّلت في متصفح Chromium فعلي (Playwright) على نفس
// الـHTML بتاع التصديرين، واتحوّل الناتج لصورة واتفحص — فطلعت نسخة مطابقة
// حرفيًا للسكرين شوتين اللي المستخدمة بعتتهم. السبب الحقيقي طلع اتنين:
//
// (١) **السبب الأساسي — jsPDF بيقلب أبعاد الصفحة.** `new jsPDF({format:[w,h]})`
//     من غير ما نحدد `orientation` بيستخدم "portrait" افتراضيًا، **وبيبدّل
//     العرض بالارتفاع** عشان يفرض إن العرض يبقى أصغر من الارتفاع. فأي تصدير
//     محتواه عريض وقصير (تقرير فيه كام حقل، جدول فيه كام دوا) كان بيتحوّل
//     لصفحة طويلة ورفيعة، والصورة بتترسم بعرضها الأصلي فوقها — فبيتقص منها
//     كل اللي زاد عن عرض الصفحة. وبما إن كل التصديرات RTL (بتبدأ من اليمين)،
//     اللي بيتقص هو **بداية المحتوى** نفسه: العنوان والأعمدة الأولى.
//     التأكيد بالأرقام: جدول الأدوية صفحته المفروض ٧٠٠×٢٦٧، طلعت فعليًا
//     ٣٥٦×٩٣٣ (مقلوبة). ده بيفسّر كمان ليه التصدير كان "بايظ أحيانًا وسليم
//     أحيانًا": المحتوى الطويل (أطول من عرضه) مكانش بيتقلب أصلًا فكان بيطلع
//     سليم — الباج بيضرب بس لما المحتوى يبقى عريض وقصير.
//     الإصلاح: تحديد `orientation` صراحةً حسب شكل المحتوى الحقيقي.
//
// (٢) **سبب ثانوي (رجعة مني في Round 48).** كنت مررت `width: widthPx` لـ
//     html2canvas، بينما العنصر عرضه الحقيقي كان `widthPx + 48` (الـpadding
//     مع `box-sizing` الافتراضي `content-box`) — فكان بيتقص ٤٨ بكسل من ناحية
//     اليمين (بداية المحتوى في RTL). لوج html2canvas أكّدها حرفيًا:
//     "element ... with size 748x267" لكن "renderer ... with size 700x267".
//     الإصلاح: `box-sizing:border-box` + قياس المقاس الفعلي للعنصر بعد الرسم
//     وتمريره زي ما هو (فلو المحتوى نفسه أعرض من الحاوية، بياخد مساحته كاملة
//     بدل ما يتقص).
//
// اللي اتعمل في Round 48 وفضل صح: العنصر بيتحط داخل حدود الشاشة (0,0) مخفي
// خلف كل حاجة بـz-index سالب (بدل left:-9999px اللي بعض الـwebviews مش
// بترسمه)، وانتظار فريمين + تحميل الخطوط قبل التصوير، وضغط JPEG بدل PNG
// الخام لتقليل حجم الملف.

/** معامل التكبير وقت الالتقاط — لازم يفضل مشترك بين الالتقاط وحساب مقاس الصفحة. */
const CAPTURE_SCALE = 2;

let zSeq = 0;

/**
 * يبني عنصر HTML مخفي (داخل حدود الشاشة، خلف كل حاجة تانية)، يملاه بالـ
 * html الممرر، وبعد ما يتأكد إن المتصفح رسمه فعليًا يصوّره بـhtml2canvas-pro
 * ويشيله من الصفحة. النتيجة: canvas جاهز يتحول لـPDF أو صورة.
 */
export async function renderHtmlToCanvas(html: string, widthPx = 700): Promise<HTMLCanvasElement> {
  const node = document.createElement("div");
  zSeq = (zSeq + 1) % 500;
  // Round 49 — box-sizing:border-box عشان `width` تبقى العرض الخارجي الحقيقي
  // للعنصر (شامل الـpadding)، مش عرض المحتوى بس — من غيرها العنصر بيطلع
  // أعرض من الرقم اللي بنمرره لـhtml2canvas فبيتقص الفرق.
  node.style.cssText =
    `position:fixed;top:0;left:0;box-sizing:border-box;width:${widthPx}px;` +
    `background:#ffffff;padding:24px;font-family:Cairo,sans-serif;direction:rtl;` +
    `color:#111827;z-index:${-(9000 + zSeq)};pointer-events:none;`;
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
    // Round 49 — نقيس المقاس الفعلي بعد الرسم ونمرره زي ما هو. لو أي محتوى
    // جوه (جدول عريض مثلًا) خرج عن حدود الحاوية، scrollWidth بياخده في
    // الحسبة فميتقصّش.
    const w = Math.ceil(Math.max(node.scrollWidth, node.offsetWidth, widthPx));
    const h = Math.ceil(Math.max(node.scrollHeight, node.offsetHeight));
    const html2canvas = (await import("html2canvas-pro")).default;
    return await html2canvas(node, {
      scale: CAPTURE_SCALE,
      backgroundColor: "#ffffff",
      width: w,
      height: h,
      windowWidth: w,
      windowHeight: h,
      scrollX: 0,
      scrollY: 0,
    });
  } finally {
    document.body.removeChild(node);
  }
}

/**
 * يلف canvas جوه jsPDF بمقاس مطابق لمحتواه (مش مكبّر بمقياس الالتقاط الخام)،
 * بصورة JPEG مضغوطة بدل PNG خام.
 *
 * Round 49 — `orientation` لازم تتحدد صراحةً: من غيرها jsPDF بيفترض "portrait"
 * **وبيبدّل العرض بالارتفاع** لو العرض أكبر — فالصفحة بتطلع مقلوبة والصورة
 * بتتقص. (اتأكد بتجربة فعلية في Chromium — راجع تعليق أول الملف.)
 */
export async function canvasToPdf(canvas: HTMLCanvasElement) {
  const { jsPDF } = await import("jspdf");
  const w = canvas.width / CAPTURE_SCALE;
  const h = canvas.height / CAPTURE_SCALE;
  const pdf = new jsPDF({
    unit: "px",
    format: [w, h],
    orientation: w >= h ? "landscape" : "portrait",
    compress: true,
  });
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.85), "JPEG", 0, 0, w, h);
  return pdf;
}

/** الاختصار الشائع: HTML string → data URL لملف PDF جاهز للمشاركة. */
export async function renderHtmlToPdfDataUrl(html: string, widthPx = 700): Promise<string> {
  const canvas = await renderHtmlToCanvas(html, widthPx);
  const pdf = await canvasToPdf(canvas);
  return pdf.output("dataurlstring");
}
