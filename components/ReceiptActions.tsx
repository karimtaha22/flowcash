"use client";
import { Share2, Download } from "lucide-react";
import { shareFile, downloadFile } from "@/lib/shareFile";

// Small share/download button pair for any receipt image shown in the app
// (transaction receipts, transfer proof, debt-payment receipts...).
export default function ReceiptActions({ url, filename = "الإيصال.jpg" }: { url: string; filename?: string }) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => shareFile(url, filename)}
        className="flex-1 flex items-center justify-center gap-1.5 text-xs border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 rounded-lg py-1.5"
      >
        <Share2 size={13} /> مشاركة
      </button>
      <button
        type="button"
        onClick={() => downloadFile(url, filename)}
        className="flex-1 flex items-center justify-center gap-1.5 text-xs border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 rounded-lg py-1.5"
      >
        <Download size={13} /> تنزيل
      </button>
    </div>
  );
}
