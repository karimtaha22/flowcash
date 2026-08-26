// Round 38 — تكامل جيمناي لقسم "لها": (أ) اقتراح أسماء مواليد بالذكاء
// الاصطناعي (بدل القائمة الثابتة العشرة أسماء بس اللي كانت في البروتوتايب
// المرجعي وبتتكرر بلا تنوع حقيقي)، و(ب) نصايح بشرة/حمل عامة.
//
// طلب المستخدم صراحة: "لو محتاج نصايح للبشره او نصائح للحمل استخدم جيمناي
// وحط برومبت صارم ميالفش يجيب معلومه طبيه موثقه" — يعني القسم (ب) لازم
// يكون محكوم بنفس فلسفة الـ anti-hallucination الموجودة بالفعل في
// lib/groceryPricing.ts's fetchAiPrice ("ممنوع تخمين أي سعر تمامًا... لو
// مش لاقي سعر حقيقي رجّع فاضي") لكن مطبقة على معلومة طبية: ممنوع أي تشخيص،
// ممنوع أي جرعة دوا، ممنوع أي ادّعاء طبي مش عام/بديهي، وأي حاجة فيها شك
// المفروض ترد المستخدمة للدكتور بدل ما "تخمن" معلومة موثوقة.
//
// نفس بنية resolveGeminiConfig/responseSchema الموجودة في lib/gemini.ts —
// ملف منفصل بدل ما يتضاف هنا عشان lib/gemini.ts خاص بميزات التحقق
// بالصور (بطاقات/إيصالات/عدادات) والملف ده خاص بنصوص قسم "لها" بس.
import { resolveGeminiConfig } from "@/lib/gemini";

async function callGemini(prompt: string, schema: any, temperature = 0.6): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
  const { apiKey, model } = await resolveGeminiConfig();
  if (!apiKey) return { ok: false, error: "الميزة دي متوقفة مؤقتًا، حاولي تاني بعدين." };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature },
      }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.error?.message || `Gemini API error (${res.status})` };
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { ok: false, error: "معرفناش نجيب رد واضح دلوقتي، حاول تاني." };
    return { ok: true, data: JSON.parse(text) };
  } catch (e: any) {
    return { ok: false, error: "حصل خطأ ومقدرناش نكمل، حاول تاني." };
  }
}

// ─────────────────────────── اقتراح أسماء المواليد ───────────────────────

export interface SuggestedName {
  name: string;
  meaning: string;
}
export interface NameSuggestionResult {
  ok: boolean;
  names: SuggestedName[];
  error?: string;
}

const NAMES_SCHEMA = {
  type: "object",
  properties: {
    names: {
      type: "array",
      description: "قائمة أسماء مواليد عربية مقترحة",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "الاسم بالعربي فقط" },
          meaning: { type: "string", description: "معنى الاسم باختصار بالعربي" },
        },
        required: ["name", "meaning"],
      },
    },
  },
  required: ["names"],
};

export async function suggestBabyNames(opts: {
  gender: "boy" | "girl";
  fatherName?: string | null;
  familyName?: string | null;
  theme?: string | null; // مثلاً "أسماء قرآنية"، "أسماء خفيفة النطق"
  exclude?: string[]; // أسماء اتقالت قبل كده، عشان مايكررش
  count?: number;
}): Promise<NameSuggestionResult> {
  const count = Math.max(3, Math.min(10, opts.count || 5));
  const genderLabel = opts.gender === "boy" ? "ولد" : "بنت";
  const excludeList = (opts.exclude || []).slice(0, 40);

  const prompt = `اقترح ${count} أسماء مواليد عربية (${genderLabel}) حلوة ومستخدمة فعلاً في الوطن العربي، مع معنى مختصر وصحيح لكل اسم.
${opts.fatherName ? `اسم الأب/العيلة: "${opts.fatherName}" — حاول تقترح أسماء بتنسجم معاه في الإيقاع لو ده منطقي، من غير ما ده يبقى شرط أساسي.` : ""}
${opts.theme ? `تفضيل إضافي من الأم: "${opts.theme}".` : ""}
${excludeList.length ? `متقترحش أي اسم من دول (اتقالوا قبل كده): ${excludeList.join("، ")}.` : ""}
مهم: الأسماء ومعانيها لازم تكون صحيحة فعلاً ومعروفة، ممنوع تخترع معنى غير حقيقي لاسم. رجّع JSON بس زي الـ schema.`;

  const result = await callGemini(prompt, NAMES_SCHEMA, 0.9);
  if (!result.ok) return { ok: false, names: [], error: result.error };
  const names = Array.isArray(result.data?.names)
    ? result.data.names
        .filter((n: any) => n && typeof n.name === "string" && n.name.trim())
        .map((n: any) => ({ name: String(n.name).trim(), meaning: String(n.meaning || "").trim() }))
    : [];
  if (!names.length) return { ok: false, names: [], error: "معرفناش نقترح أسماء دلوقتي، حاول تاني." };
  return { ok: true, names };
}

// ────────────────── نصايح بشرة/حمل — برومبت صارم ضد التخمين ──────────────

export interface WellnessAdviceResult {
  ok: boolean;
  advice: string;
  disclaimer: string;
  error?: string;
}

const ADVICE_SCHEMA = {
  type: "object",
  properties: {
    has_reliable_advice: {
      type: "boolean",
      description: "true لو فيه نصيحة عامة موثوقة وآمنة تتقال هنا، false لو الموضوع محتاج تقييم دكتور مباشر ومفيش نصيحة عامة كفاية تتقال",
    },
    advice: {
      type: "string",
      description: "نصيحة عامة قصيرة (٢-٤ جمل بالعربي)، من غير أي تشخيص أو جرعة دوا أو ادّعاء طبي غير موثق — فاضي لو has_reliable_advice=false",
    },
  },
  required: ["has_reliable_advice", "advice"],
};

const STRICT_MEDICAL_SAFETY_RULES = `قواعد صارمة لازم تتبعها بالحرف:
- ممنوع تمامًا أي تشخيص طبي، أي جرعة دوا، أي ادّعاء طبي غير عام ومعروف بشكل موثق وواسع.
- ممنوع تخترع أو "تخمن" أي معلومة طبية مش متأكد منها تمامًا — لو في شك، قول has_reliable_advice=false واسيب advice فاضي بدل ما تخمن.
- النصيحة المسموحة بس: نصايح عناية عامة/نمط حياة معروفة وآمنة للجميع تقريبًا (ترطيب، نوم، شرب مياه، حركة خفيفة، تغذية عامة) — مش حاجة تخص حالة طبية معينة.
- لو الموضوع فيه أي احتمال خطورة أو محتاج تقييم فردي (ألم، نزيف، أعراض غريبة، حساسية جلد شديدة، أي حاجة خارج المعتاد) قول has_reliable_advice=false فورًا.
- في آخر كل نصيحة اتقالت، لازم يكون واضح إنها نصيحة عامة مش بديلة عن دكتور.`;

export async function getSkincareAdvice(phase: "menstrual" | "follicular" | "ovulation" | "luteal"): Promise<WellnessAdviceResult> {
  const phaseLabel: Record<string, string> = {
    menstrual: "فترة الدورة الشهرية",
    follicular: "بعد الدورة مباشرة",
    ovulation: "فترة التبويض",
    luteal: "قبل الدورة (ما قبل الطمث)",
  };
  const prompt = `مستخدمة في تطبيق متابعة صحة نسائية، دلوقتي في "${phaseLabel[phase] || phase}" من دورتها الشهرية.
اديها نصيحة عناية بالبشرة عامة (مش علاج) مناسبة للمرحلة الهرمونية دي، لو فيه نصيحة عامة آمنة فعلاً.
${STRICT_MEDICAL_SAFETY_RULES}
رجّع JSON بس زي الـ schema.`;

  const result = await callGemini(prompt, ADVICE_SCHEMA, 0.4);
  if (!result.ok) return { ok: false, advice: "", disclaimer: "", error: result.error };
  const hasAdvice = !!result.data?.has_reliable_advice && typeof result.data?.advice === "string" && result.data.advice.trim();
  if (!hasAdvice) {
    return { ok: true, advice: "", disclaimer: "مفيش نصيحة عامة موثوقة كفاية تتقال هنا — لو عندك أي استفسار عن بشرتك، الأفضل تسألي دكتورة جلدية." };
  }
  return {
    ok: true,
    advice: String(result.data.advice).trim(),
    disclaimer: "نصيحة عامة مش بديلة عن استشارة طبيب/طبيبة جلدية.",
  };
}

// ─────────────────────────── معنى اسم (بحث حر) ───────────────────────────
// Round 39 — "حط خانه اسال علي معني اسم": المستخدمة تكتب أي اسم وتسأل عن
// معناه. نفس مبدأ "ممنوع تخمين" — لو الاسم مش معروف بمعنى موثق، بيرجع
// found=false بدل ما "يخترع" معنى يبان مقنع.
export interface NameMeaningResult {
  ok: boolean;
  found: boolean;
  meaning: string;
  error?: string;
}

const MEANING_SCHEMA = {
  type: "object",
  properties: {
    found: { type: "boolean", description: "true لو الاسم ده معروف فعلاً ومعناه موثق ومعروف بشكل واسع" },
    meaning: { type: "string", description: "معنى الاسم باختصار بالعربي — فاضي لو found=false" },
  },
  required: ["found", "meaning"],
};

export async function lookupNameMeaning(name: string): Promise<NameMeaningResult> {
  const prompt = `ايه معنى الاسم العربي "${name}"؟ لو الاسم ده معروف فعلاً ومعناه موثق ومعروف بشكل واسع، رجّعي found=true ومعناه باختصار (جملة واحدة). لو مش متأكد، أو الاسم مش شائع، أو مالقيتش معنى موثوق له، رجّعي found=false ومعناه فاضي — ممنوع تخترعي معنى يبان مقنع. رجّعي JSON بس زي الـ schema.`;
  const result = await callGemini(prompt, MEANING_SCHEMA, 0.2);
  if (!result.ok) return { ok: false, found: false, meaning: "", error: result.error };
  const found = !!result.data?.found;
  return { ok: true, found, meaning: found ? String(result.data?.meaning || "").trim() : "" };
}

export async function getPregnancyAdvice(week: number, topic?: string | null): Promise<WellnessAdviceResult> {
  const prompt = `مستخدمة حامل في الأسبوع رقم ${week} من الحمل، في تطبيق متابعة حمل.
${topic ? `سؤالها/موضوعها: "${topic}".` : "اديها نصيحة عامة عن نمط الحياة مناسبة للأسبوع ده من الحمل."}
${STRICT_MEDICAL_SAFETY_RULES}
رجّع JSON بس زي الـ schema.`;

  const result = await callGemini(prompt, ADVICE_SCHEMA, 0.4);
  if (!result.ok) return { ok: false, advice: "", disclaimer: "", error: result.error };
  const hasAdvice = !!result.data?.has_reliable_advice && typeof result.data?.advice === "string" && result.data.advice.trim();
  if (!hasAdvice) {
    return { ok: true, advice: "", disclaimer: "مفيش نصيحة عامة موثوقة كفاية تتقال هنا — الموضوع ده يستاهل تسألي فيه دكتور المتابعة مباشرة." };
  }
  return {
    ok: true,
    advice: String(result.data.advice).trim(),
    disclaimer: "نصيحة عامة مش بديلة عن استشارة طبيب المتابعة — أي عرض غير معتاد كلمي دكتورك فورًا.",
  };
}
