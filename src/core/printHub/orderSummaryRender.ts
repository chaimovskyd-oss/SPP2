// Renders an order summary slip to a print-ready JPEG (Phase 8, spec §20). Renderer-only (canvas
// + qrcode). The slip can be appended to a job as an extra image so it prints alongside the photos,
// or printed on its own.

import QRCode from "qrcode";

import { summaryLines, summaryQrPayload, type OrderSummaryData } from "./orderSummary";
import { SIZE_MM } from "./sizes";

const MM_PER_INCH = 25.4;

/** Renders the slip at the given print size (portrait), returning a JPEG data URL. */
export async function renderOrderSummaryImage(data: OrderSummaryData, size: string, dpi = 300): Promise<string> {
  const dims = SIZE_MM[size] ?? SIZE_MM["10x15"];
  const shortPx = Math.round((Math.min(dims.widthMm, dims.heightMm) / MM_PER_INCH) * dpi);
  const longPx = Math.round((Math.max(dims.widthMm, dims.heightMm) / MM_PER_INCH) * dpi);
  const width = shortPx;
  const height = longPx;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return canvas.toDataURL("image/jpeg", 0.95);

  const margin = Math.round(width * 0.08);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "#111827";

  const right = width - margin;
  let y = margin + Math.round(width * 0.06);

  ctx.font = `bold ${Math.round(width * 0.07)}px Arial`;
  ctx.fillText("סיכום הזמנה", right, y);
  y += Math.round(width * 0.02);
  ctx.strokeStyle = "#d1d5db";
  ctx.beginPath();
  ctx.moveTo(margin, y);
  ctx.lineTo(right, y);
  ctx.stroke();
  y += Math.round(width * 0.06);

  const labelFont = Math.round(width * 0.034);
  for (const line of summaryLines(data)) {
    ctx.font = `${labelFont}px Arial`;
    ctx.fillStyle = "#6b7280";
    ctx.fillText(line.label, right, y);
    y += Math.round(labelFont * 1.15);
    ctx.font = `bold ${Math.round(labelFont * 1.15)}px Arial`;
    ctx.fillStyle = "#111827";
    ctx.fillText(line.value, right, y);
    y += Math.round(labelFont * 1.9);
  }

  // QR at the bottom-center.
  try {
    const qrUrl = await QRCode.toDataURL(summaryQrPayload(data), { margin: 1, width: Math.round(width * 0.36) });
    const qr = await loadImage(qrUrl);
    const qrSize = Math.round(width * 0.36);
    ctx.drawImage(qr, Math.round((width - qrSize) / 2), height - margin - qrSize, qrSize, qrSize);
  } catch {
    // QR is best-effort; the slip is still useful without it.
  }

  return canvas.toDataURL("image/jpeg", 0.95);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Cannot load QR image"));
    image.src = src;
  });
}
