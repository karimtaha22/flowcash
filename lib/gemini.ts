// Gemini vision helper — used ONLY for the جمعيات (gam3eya) participant
// identity-verification step (ID card front photo vs. a live selfie).
// Deliberately NOT an OCR library (tesseract.js etc.) — the user explicitly
// rejected OCR as inaccurate; this instead asks a vision-capable LLM to make
// a judgement call, which is what "أقوى قد ما نقدر" (as strong as we can)
// means here given there's no real government-grade liveness detection
// available to a browser-photo flow like this.
//
// Requires GEMINI_API_KEY in Vercel (ask the user to create one at
// aistudio.google.com/apikey — free tier is enough for this use case), OR an
// override saved from /admin's "التحقق بالذكاء الاصطناعي" card (see
// resolveGeminiConfig below) — the DB override lets the admin change the key
// or model live without a Vercel redeploy. gemini-2.0-flash was retired by
// Google (confirmed via the API's own deprecation error — "no longer
// available... use models/gemini-3.6-flash") — round 22 moved the default to
// gemini-3.6-flash, its recommended replacement (balanced multimodal
// performance, a good fit for the ID-photo/selfie face-matching this does).
export const DEFAULT_MODEL = "gemini-3.6-flash";

// Resolves the effective API key/model: an admin-set DB override (app_settings,
// editable from /admin without a redeploy) takes priority over the Vercel env
// vars, which stay as the zero-config default/fallback.
export async function resolveGeminiConfig(): Promise<{ apiKey: string; model: string }> {
  let dbKey = "";
  let dbModel = "";
  try {
    const { supabaseAdmin } = await import("./supabaseAdmin");
    const { data } = await supabaseAdmin.from("app_settings").select("gemini_api_key,gemini_model").eq("id", "default").single();
    dbKey = (data?.gemini_api_key || "").trim();
    dbModel = (data?.gemini_model || "").trim();
  } catch {
    // app_settings row missing/unreachable — env vars still work as fallback
  }
  return {
    apiKey: dbKey || (process.env.GEMINI_API_KEY || "").trim(),
    model: dbModel || (process.env.GEMINI_MODEL || "").trim() || DEFAULT_MODEL,
  };
}

function dataUrlToInlinePart(dataUrl: string): { mime_type: string; data: string } | null {
  const m = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  return { mime_type: m[1], data: m[2] };
}

export interface IdVerificationResult {
  ok: boolean; // false only on a hard failure (bad input, API error) — see `error`
  is_id_legible: boolean;
  face_match: "match" | "no_match" | "uncertain";
  spoof_suspected: boolean;
  confidence: "low" | "medium" | "high";
  notes: string;
  verified: boolean; // final verdict: is_id_legible && face_match==="match" && !spoof_suspected
  error?: string;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    is_id_legible: { type: "boolean", description: "الصورة واضحة ومقروءة وفيها كارنيه/بطاقة هوية حقيقية" },
    face_match: { type: "string", enum: ["match", "no_match", "uncertain"], description: "هل الوش في السيلفي هو نفسه الوش في البطاقة" },
    spoof_suspected: { type: "boolean", description: "في علامات إن السيلفي أو صورة البطاقة اتصورت من شاشة/صورة تانية (screen glare, moiré, حواف مستطيلة)" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    notes: { type: "string", description: "شرح مختصر بالعربي لسبب القرار" },
  },
  required: ["is_id_legible", "face_match", "spoof_suspected", "confidence", "notes"],
};

const PROMPT = `أنت نظام مساعد للتحقق من هوية عملاء في تطبيق مالي شخصي (FlowCash). معاك صورتين:
1. الصورة الأولى: وش بطاقة الرقم القومي/الهوية بتاعة العميل.
2. الصورة التانية: سيلفي حي اتصور من كاميرا الموبايل الأمامية.

مهمتك: قارن الوش في الصورتين وقيّم:
- هل صورة البطاقة واضحة ومقروءة (مش تمويهة/مقطوعة/في ظل تغطي البيانات)؟
- هل الوش في السيلفي يطابق الوش في صورة البطاقة (ملامح، شكل الوش، لون البشرة العام)؟
- هل في أي علامة إن حد صوّر شاشة موبايل/تابلت أو صورة مطبوعة بدل ما يصور بطاقة حقيقية أو وشه الحقيقي؟ (انعكاس ضوء، حواف مستطيلة، نقط شاشة، جودة رقمية غريبة)

مهم جدًا: انت مش نظام تحقق هوية رسمي زي البنوك (مفيش liveness detection حقيقي هنا)، فلو مش متأكد قول uncertain/low confidence بدل ما تخمن. رجّع النتيجة بصيغة JSON بس زي الـ schema المحدد.`;

export async function verifyIdAgainstSelfie(idFrontDataUrl: string, selfieDataUrl: string): Promise<IdVerificationResult> {
  const { apiKey, model } = await resolveGeminiConfig();
  const fallback = (over: Partial<IdVerificationResult>): IdVerificationResult => ({
    ok: false,
    is_id_legible: false,
    face_match: "uncertain",
    spoof_suspected: false,
    confidence: "low",
    notes: "",
    verified: false,
    ...over,
  });

  if (!apiKey) {
    return fallback({ error: "GEMINI_API_KEY مش متسجل — لا في Vercel ولا من إعدادات التوثيق في /admin. التوثيق التلقائي متوقف مؤقتًا." });
  }

  const idPart = dataUrlToInlinePart(idFrontDataUrl);
  const selfiePart = dataUrlToInlinePart(selfieDataUrl);
  if (!idPart || !selfiePart) {
    return fallback({ error: "صورة البطاقة أو السيلفي وصلت بصيغة غير متوقعة." });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: PROMPT },
              { inline_data: idPart },
              { inline_data: selfiePart },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.1,
        },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return fallback({ error: data?.error?.message || `Gemini API error (${res.status})` });
    }

    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return fallback({ error: "مفيش رد واضح من نظام التحقق، حاول تاني." });

    const parsed = JSON.parse(text);
    const verified = !!parsed.is_id_legible && parsed.face_match === "match" && !parsed.spoof_suspected;
    return {
      ok: true,
      is_id_legible: !!parsed.is_id_legible,
      face_match: parsed.face_match,
      spoof_suspected: !!parsed.spoof_suspected,
      confidence: parsed.confidence,
      notes: parsed.notes || "",
      verified,
    };
  } catch (e: any) {
    return fallback({ error: e?.message || "حصل خطأ ومقدرناش نتحقق من الصور، حاول تاني." });
  }
}

// Round 24 — دعم "تسجيل الدين المتقدم": بدل ما المستخدم يكتب اسم/رقم بطاقة
// المدين يدوي بالكامل، بنسمحله يرفع صورة البطاقة و"يستخرج البيانات" منها
// أوتوماتيك (بيرجعها كـ اقتراح يقدر يراجعه ويعدله قبل الحفظ — مش حفظ مباشر
// بدون مراجعة). دالة منفصلة عن verifyIdAgainstSelfie لأن هنا معندناش سيلفي
// نقارن بيه، الهدف بس قراءة البيانات المطبوعة على البطاقة.
export interface IdExtractionResult {
  ok: boolean;
  is_id_legible: boolean;
  name: string;
  id_number: string;
  error?: string;
}

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    is_id_legible: { type: "boolean", description: "الصورة واضحة ومقروءة وفيها كارنيه/بطاقة هوية حقيقية" },
    name: { type: "string", description: "الاسم بالكامل زي ما هو مكتوب على البطاقة، أو فاضي لو مش واضح" },
    id_number: { type: "string", description: "الرقم القومي/رقم البطاقة زي ما هو مكتوب، أو فاضي لو مش واضح" },
  },
  required: ["is_id_legible", "name", "id_number"],
};

export async function extractIdFields(idFrontDataUrl: string): Promise<IdExtractionResult> {
  const { apiKey, model } = await resolveGeminiConfig();
  const fallback = (over: Partial<IdExtractionResult>): IdExtractionResult => ({
    ok: false, is_id_legible: false, name: "", id_number: "", ...over,
  });
  if (!apiKey) return fallback({ error: "GEMINI_API_KEY مش متسجل — لا في Vercel ولا من إعدادات التوثيق في /admin." });

  const idPart = dataUrlToInlinePart(idFrontDataUrl);
  if (!idPart) return fallback({ error: "صورة البطاقة وصلت بصيغة غير متوقعة." });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: "دي صورة وش بطاقة رقم قومي/هوية. استخرج الاسم بالكامل ورقم البطاقة زي ما هما مكتوبين بالظبط. لو الصورة مش واضحة أو مش بطاقة هوية أصلاً، قول is_id_legible=false وسيب الحقول فاضية. رجّع JSON بس زي الـ schema." },
              { inline_data: idPart },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json", responseSchema: EXTRACT_SCHEMA, temperature: 0.1 },
      }),
    });
    const data = await res.json();
    if (!res.ok) return fallback({ error: data?.error?.message || `Gemini API error (${res.status})` });
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return fallback({ error: "مفيش رد واضح من نظام الاستخراج، حاول تاني." });
    const parsed = JSON.parse(text);
    return { ok: true, is_id_legible: !!parsed.is_id_legible, name: parsed.name || "", id_number: parsed.id_number || "" };
  } catch (e: any) {
    return fallback({ error: e?.message || "حصل خطأ ومقدرناش نقرأ الصورة، حاول تاني." });
  }
}

// Round 32 — "استخراج اسم الدكتور و التخصص و العنوان بالذكاء الاصطناعي" من
// صورة روشتة/كشف طبي. زي extractIdFields بالظبط بس على حقول مختلفة، وبترجع
// حقول فاضية (مش تخمين) لو الصورة مش واضحة أو مفيهاش البيانات دي أصلاً.
export interface DoctorExtractionResult {
  ok: boolean;
  doctor_name: string;
  doctor_specialty: string;
  doctor_address: string;
  error?: string;
}

const DOCTOR_EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    doctor_name: { type: "string", description: "اسم الطبيب المعالج زي ما هو مكتوب، أو فاضي لو مش موجود/مش واضح" },
    doctor_specialty: { type: "string", description: "تخصص الطبيب (مثلاً: باطنة، عظام، أطفال)، أو فاضي لو مش موجود" },
    doctor_address: { type: "string", description: "عنوان العيادة/المستشفى زي ما هو مكتوب، أو فاضي لو مش موجود" },
  },
  required: ["doctor_name", "doctor_specialty", "doctor_address"],
};

export async function extractDoctorFields(imageDataUrl: string): Promise<DoctorExtractionResult> {
  const { apiKey, model } = await resolveGeminiConfig();
  const fallback = (over: Partial<DoctorExtractionResult>): DoctorExtractionResult => ({
    ok: false, doctor_name: "", doctor_specialty: "", doctor_address: "", ...over,
  });
  if (!apiKey) return fallback({ error: "GEMINI_API_KEY مش متسجل — لا في Vercel ولا من إعدادات التوثيق في /admin." });

  const part = dataUrlToInlinePart(imageDataUrl);
  if (!part) return fallback({ error: "الصورة وصلت بصيغة غير متوقعة." });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: "دي صورة روشتة أو ورقة كشف طبي. استخرج اسم الطبيب المعالج، تخصصه، وعنوان العيادة/المستشفى زي ما هما مكتوبين بالظبط. لو أي حقل مش موجود أو مش واضح، سيبه فاضي — ممنوع تخمين. رجّع JSON بس زي الـ schema." },
              { inline_data: part },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json", responseSchema: DOCTOR_EXTRACT_SCHEMA, temperature: 0.1 },
      }),
    });
    const data = await res.json();
    if (!res.ok) return fallback({ error: data?.error?.message || `Gemini API error (${res.status})` });
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return fallback({ error: "مفيش رد واضح من نظام الاستخراج، حاول تاني." });
    const parsed = JSON.parse(text);
    return { ok: true, doctor_name: parsed.doctor_name || "", doctor_specialty: parsed.doctor_specialty || "", doctor_address: parsed.doctor_address || "" };
  } catch (e: any) {
    return fallback({ error: e?.message || "حصل خطأ ومقدرناش نقرأ الصورة، حاول تاني." });
  }
}

// Round 32 — "استخراج القراءة بالذكاء الاصطناعي" من صورة عداد كهرباء/غاز/مياه.
// برضو بترجع فاضي (مش تخمين) لو الرقم مش واضح في الصورة.
export interface MeterExtractionResult {
  ok: boolean;
  reading_value: number | null;
  is_legible: boolean;
  error?: string;
}

const METER_EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    is_legible: { type: "boolean", description: "أرقام العداد واضحة ومقروءة في الصورة" },
    reading_value: { type: "number", description: "قراءة العداد الحالية كرقم فقط (من غير وحدة)، أو 0 لو مش واضحة" },
  },
  required: ["is_legible", "reading_value"],
};

const METER_TYPE_LABEL: Record<string, string> = { electricity: "كهرباء", gas: "غاز", water: "مياه" };

export async function extractMeterReading(imageDataUrl: string, meterType?: string | null): Promise<MeterExtractionResult> {
  const { apiKey, model } = await resolveGeminiConfig();
  const fallback = (over: Partial<MeterExtractionResult>): MeterExtractionResult => ({
    ok: false, reading_value: null, is_legible: false, ...over,
  });
  if (!apiKey) return fallback({ error: "GEMINI_API_KEY مش متسجل — لا في Vercel ولا من إعدادات التوثيق في /admin." });

  const part = dataUrlToInlinePart(imageDataUrl);
  if (!part) return fallback({ error: "الصورة وصلت بصيغة غير متوقعة." });

  const typeLabel = (meterType && METER_TYPE_LABEL[meterType]) || "";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: `دي صورة عداد ${typeLabel || "(كهرباء/غاز/مياه)"}. اقرأ الرقم الحالي المعروض على العداد بالظبط (الأرقام الرئيسية بس، من غير أي وحدة أو فاصلة عشرية زايدة لو مش موجودة في الصورة). لو الرقم مش واضح خالص، رجّع is_legible=false وreading_value=0. رجّع JSON بس زي الـ schema.` },
              { inline_data: part },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json", responseSchema: METER_EXTRACT_SCHEMA, temperature: 0.1 },
      }),
    });
    const data = await res.json();
    if (!res.ok) return fallback({ error: data?.error?.message || `Gemini API error (${res.status})` });
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return fallback({ error: "مفيش رد واضح من نظام الاستخراج، حاول تاني." });
    const parsed = JSON.parse(text);
    if (!parsed.is_legible) return fallback({ is_legible: false, error: "مقدرناش نقرأ رقم العداد بوضوح من الصورة — اكتبه يدويًا." });
    return { ok: true, is_legible: true, reading_value: typeof parsed.reading_value === "number" ? parsed.reading_value : null };
  } catch (e: any) {
    return fallback({ error: e?.message || "حصل خطأ ومقدرناش نقرأ الصورة، حاول تاني." });
  }
}

// "AI يتأكد إنها صورة بطاقة فعلا مش أي صورة ويطابق الاسم" — يتفرق عن
// verifyIdAgainstSelfie: هنا مفيش سيلفي، بس بنتأكد (أ) إن الصورة فعلاً بطاقة
// هوية واضحة و(ب) إن الاسم المكتوب على البطاقة يطابق الاسم اللي المستخدم
// كتبه في الفورم (مثلاً اسم الشاهد أو المدين).
export interface IdNameMatchResult {
  ok: boolean;
  is_id_legible: boolean;
  name_matches: boolean;
  confidence: "low" | "medium" | "high";
  notes: string;
  error?: string;
}

const NAME_MATCH_SCHEMA = {
  type: "object",
  properties: {
    is_id_legible: { type: "boolean" },
    name_matches: { type: "boolean", description: "الاسم المكتوب على البطاقة يطابق (أو قريب جدًا من) الاسم المطلوب مطابقته" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    notes: { type: "string", description: "شرح مختصر بالعربي" },
  },
  required: ["is_id_legible", "name_matches", "confidence", "notes"],
};

export async function verifyIdMatchesName(idFrontDataUrl: string, claimedName: string): Promise<IdNameMatchResult> {
  const { apiKey, model } = await resolveGeminiConfig();
  const fallback = (over: Partial<IdNameMatchResult>): IdNameMatchResult => ({
    ok: false, is_id_legible: false, name_matches: false, confidence: "low", notes: "", ...over,
  });
  if (!apiKey) return fallback({ error: "GEMINI_API_KEY مش متسجل." });

  const idPart = dataUrlToInlinePart(idFrontDataUrl);
  if (!idPart) return fallback({ error: "صورة البطاقة وصلت بصيغة غير متوقعة." });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: `دي صورة وش بطاقة رقم قومي/هوية. تأكد إنها فعلاً صورة بطاقة هوية حقيقية واضحة (مش أي صورة تانية)، وقارن الاسم المكتوب عليها مع الاسم ده: "${claimedName}". قول name_matches=true لو نفس الاسم أو قريب جدًا منه (فروق بسيطة في الكتابة/الألقاب مقبولة)، وfalse لو مختلف بوضوح. رجّع JSON بس زي الـ schema.` },
              { inline_data: idPart },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json", responseSchema: NAME_MATCH_SCHEMA, temperature: 0.1 },
      }),
    });
    const data = await res.json();
    if (!res.ok) return fallback({ error: data?.error?.message || `Gemini API error (${res.status})` });
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return fallback({ error: "مفيش رد واضح، حاول تاني." });
    const parsed = JSON.parse(text);
    return {
      ok: true,
      is_id_legible: !!parsed.is_id_legible,
      name_matches: !!parsed.name_matches,
      confidence: parsed.confidence,
      notes: parsed.notes || "",
    };
  } catch (e: any) {
    return fallback({ error: e?.message || "حصل خطأ، حاول تاني." });
  }
}
