// Lightweight fetch-based Resend helper — same style as lib/telegram.ts's
// tgCall (no SDK dependency, one small wrapper around the HTTP API).
//
// Used ONLY for the "forgot activation code" recovery flow (see
// app/api/license/forgot-code/route.ts). Normal login never uses email —
// it's always name+PIN via app_users, same as before.
//
// IMPORTANT / free-tier limitation: a brand-new Resend account, before you
// verify your own sending domain, can only actually deliver email to the
// address you signed up to Resend with — every other recipient gets
// silently rejected by Resend's API even though our code call succeeds.
// This is a Resend account-level restriction, not a bug here. To send to
// real customers you must verify a domain in the Resend dashboard and
// switch RESEND_FROM to an address on that domain (see the round notes).
export async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY مش متسجل في Vercel." };
  }
  const from = (process.env.RESEND_FROM || "").trim() || "FlowCash <onboarding@resend.dev>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: (data as any)?.message || `فشل إرسال الإيميل (${res.status})` };
    }
    return { ok: true, id: (data as any)?.id };
  } catch {
    return { ok: false, error: "مفيش اتصال بخدمة الإيميل، حاول تاني" };
  }
}

export function forgotCodeEmailHtml(name: string, code: string) {
  return `
    <div style="font-family:sans-serif;direction:rtl;text-align:right;max-width:480px;margin:0 auto">
      <h2 style="color:#c2410c">FlowCash</h2>
      <p>أهلاً ${escapeHtml(name)}،</p>
      <p>كود تفعيل حسابك هو:</p>
      <p style="font-size:22px;font-weight:bold;letter-spacing:2px;background:#fff7ed;color:#c2410c;padding:12px 16px;border-radius:8px;display:inline-block">${escapeHtml(code)}</p>
      <p>ادخل الكود ده في صفحة "تفعيل الحساب" واختار PIN خاص بيك للدخول بيه بعد كده.</p>
      <p style="color:#737373;font-size:12px">لو انت مطلبتش الإيميل ده، تقدر تتجاهله.</p>
    </div>
  `;
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
