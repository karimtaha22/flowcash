// Round 34 — "اضغط الصور لاقصي درجه من غير فقدان جودة": the old version
// used one fixed size (1200px) + one fixed quality (0.72) for every photo,
// regardless of how big/heavy the source photo actually was. With many
// users each uploading several photos (receipts, meters, medications, IDs,
// lab results...), that flat setting either wastes storage on already-small
// photos or under-compresses huge modern phone-camera photos (12MP+).
// Now: resize once to a slightly larger cap (1280px — still plenty for
// Gemini vision extraction / on-screen viewing), then iteratively step the
// JPEG quality DOWN only as far as needed to land under a target byte
// budget, stopping at the first quality level that fits so we never
// over-compress a photo that was already small. Floor is 0.5 (visibly
// still readable/legible) so text-heavy photos (receipts, prescriptions,
// meter dials) stay OCR/Gemini-readable even at the smallest size.
const MAX_DIM = 1280;
const TARGET_BYTES = 380_000; // ~380KB — comfortably small at scale, still legible
const QUALITY_STEPS = [0.82, 0.72, 0.62, 0.5];

function dataUrlByteSize(dataUrl: string): number {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor((b64.length * 3) / 4);
}

// Shrinks an image file to a compact base64 JPEG data URL: resized to a
// max dimension, then compressed at the highest quality step that still
// lands under TARGET_BYTES (falls back to the smallest step if none fit).
export const shrinkImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(reader.result as string);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        let best = canvas.toDataURL("image/jpeg", QUALITY_STEPS[QUALITY_STEPS.length - 1]);
        for (const q of QUALITY_STEPS) {
          const candidate = canvas.toDataURL("image/jpeg", q);
          if (dataUrlByteSize(candidate) <= TARGET_BYTES) {
            best = candidate;
            break;
          }
          best = candidate; // keep the smallest-tried as fallback if nothing fits the budget
        }
        resolve(best);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
