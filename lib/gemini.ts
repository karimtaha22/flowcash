// Gemini vision helper — used ONLY for the جمعيات (gam3eya) participant
// identity-verification step (ID card front photo vs. a live selfie).
// Deliberately NOT an OCR library (tesseract.js etc.) — the user explicitly
// rejected OCR as inaccurate; this instead asks a vision-capable LLM to make
// a judgement call, which is what "أقوى قد ما نقدر" (as strong as we can)
// means here given there's no real government-grade liveness detection
// available to a browser-photo flow like this.
//
// Requires GEMINI_API_KEY in Vercel (ask the user to create one at
// aistudio.google.com/apikey — free tier is enough for this use case).
// Model name is overridable via GEMINI_MODEL in case Google renames/retires
// the default one; falls back to a fast, vision-capable model.

const DEFAULT_MODEL = "gemini-2.0-flash";

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
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
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
    return fallback({ error: "GEMINI_API_KEY مش متسجل في Vercel — التوثيق التلقائي متوقف مؤقتًا." });
  }

  const idPart = dataUrlToInlinePart(idFrontDataUrl);
  const selfiePart = dataUrlToInlinePart(selfieDataUrl);
  if (!idPart || !selfiePart) {
    return fallback({ error: "صورة البطاقة أو السيلفي وصلت بصيغة غير متوقعة." });
  }

  const model = (process.env.GEMINI_MODEL || DEFAULT_MODEL).trim();
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
