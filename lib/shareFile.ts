// CLIENT-SAFE — share or download any receipt/export image from the
// browser. downloadFile() always saves; shareFile() prefers the native share
// sheet (WhatsApp, Telegram, Files...) when the browser supports sharing
// files, falling back to downloadFile() otherwise.

export async function downloadFile(url: string, filename: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(blobUrl);
  } catch {
    // last resort: a plain anchor against the original URL (works for
    // data: URLs even when fetch() above is blocked for some reason)
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    a.click();
  }
}

export async function shareFile(url: string, filename: string, mime = "image/png") {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const file = new File([blob], filename, { type: blob.type || mime });
    const nav = navigator as Navigator & { canShare?: (data: any) => boolean; share?: (data: any) => Promise<void> };
    if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
      await nav.share({ files: [file], title: filename });
      return;
    }
  } catch {
    // fall through to download
  }
  await downloadFile(url, filename);
}
