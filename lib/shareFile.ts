// CLIENT-SAFE — share or download any receipt/export image from the
// browser. downloadFile() always saves; shareFile() prefers the native share
// sheet (WhatsApp, Telegram, Files...) when the browser supports sharing
// files, falling back to downloadFile() otherwise.

function clickAnchor(a: HTMLAnchorElement) {
  // Some mobile browsers and PWA-standalone webviews silently ignore
  // .click() on an anchor that was never attached to the DOM — always
  // append, click, then clean up.
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    a.remove();
  }, 0);
}

export async function downloadFile(url: string, filename: string) {
  let lastError: unknown = null;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    clickAnchor(a);
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    return;
  } catch (err) {
    lastError = err;
  }

  try {
    // last resort: a plain anchor against the original URL (works for
    // data: URLs even when fetch() above is blocked for some reason)
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    a.rel = "noopener";
    clickAnchor(a);
  } catch (err) {
    throw err ?? lastError ?? new Error("تعذر تنزيل الملف");
  }
}

export async function shareFile(url: string, filename: string, mime = "image/png") {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    const blob = await res.blob();
    const file = new File([blob], filename, { type: blob.type || mime });
    const nav = navigator as Navigator & { canShare?: (data: any) => boolean; share?: (data: any) => Promise<void> };
    if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
      await nav.share({ files: [file], title: filename });
      return;
    }
  } catch (err) {
    // AbortError = the user cancelled the share sheet on purpose; don't
    // fall back to a download in that case, and don't surface it as an error.
    if (err instanceof Error && err.name === "AbortError") return;
    // otherwise fall through to download
  }
  await downloadFile(url, filename);
}
