// Test print page generator. Produces a page that verifies — using the SAME PrintLayout as
// a real job — that tray, orientation, scaling, borderless/margins, and cropping are correct.
//
// buildTestPageDescriptor() is a pure function (unit-testable). renderTestPagePng() rasterizes
// the descriptor to a PNG using an offscreen canvas (browser/renderer only).

import type { AdvancedPrinterProfile, PrintLayout } from "@/types/advancedPrint";

const MM_PER_INCH = 25.4;

interface RectPx {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TestPageLabels {
  printerName: string;
  profileName: string;
  paper: string;
  orientation: string;
  scaling: string;
  timestamp: string;
}

export interface TestPageDescriptor {
  /** Pixel dimensions of the whole sheet at the layout DPI. */
  widthPx: number;
  heightPx: number;
  dpi: number;
  /** Printable area in px (where margins begin). */
  printableAreaPx: RectPx;
  /** Safe-area inset in px from the printable area. */
  safeInsetPx: number;
  /** Bleed line inset in px (0 when no bleed). */
  bleedInsetPx: number;
  labels: TestPageLabels;
}

function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / MM_PER_INCH) * dpi);
}

/** Builds the test-page descriptor at the layout's pixel resolution. */
export function buildTestPageDescriptor(layout: PrintLayout, profile: AdvancedPrinterProfile): TestPageDescriptor {
  const dpi = layout.dpi || 300;
  const widthPx = mmToPx(layout.printerPaperMm.widthMm, dpi);
  const heightPx = mmToPx(layout.printerPaperMm.heightMm, dpi);

  const printableAreaPx = {
    x: mmToPx(layout.printableAreaMm.xMm, dpi),
    y: mmToPx(layout.printableAreaMm.yMm, dpi),
    width: mmToPx(layout.printableAreaMm.widthMm, dpi),
    height: mmToPx(layout.printableAreaMm.heightMm, dpi)
  };

  return {
    widthPx,
    heightPx,
    dpi,
    printableAreaPx,
    safeInsetPx: mmToPx(5, dpi),
    bleedInsetPx: layout.bleedMm > 0 ? mmToPx(layout.bleedMm, dpi) : 0,
    labels: {
      printerName: profile.windowsPrinterName,
      profileName: profile.name,
      paper: `${Math.round(layout.printerPaperMm.widthMm)}×${Math.round(layout.printerPaperMm.heightMm)} מ"מ`,
      orientation: layout.resolvedOrientation === "landscape" ? "לרוחב" : "לאורך",
      scaling: `${Math.round(layout.scalePercent)}%`,
      timestamp: new Date().toLocaleString("he-IL")
    }
  };
}

/** Rasterizes a test page to a PNG data URL. Browser/renderer only (uses canvas). */
export function renderTestPagePng(descriptor: TestPageDescriptor): string {
  const canvas = document.createElement("canvas");
  canvas.width = descriptor.widthPx;
  canvas.height = descriptor.heightPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas.toDataURL("image/png");

  const { width, height } = canvas;
  const pa = descriptor.printableAreaPx;
  const lineW = Math.max(2, Math.round(descriptor.dpi / 150));

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // Outer sheet border.
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = lineW;
  ctx.strokeRect(lineW / 2, lineW / 2, width - lineW, height - lineW);

  // Printable area border (blue dashed).
  ctx.save();
  ctx.strokeStyle = "#1f6feb";
  ctx.setLineDash([lineW * 4, lineW * 3]);
  ctx.strokeRect(pa.x, pa.y, pa.width, pa.height);
  ctx.restore();

  // Safe area (green) inside the printable area.
  ctx.save();
  ctx.strokeStyle = "#2da44e";
  ctx.setLineDash([lineW * 2, lineW * 2]);
  ctx.strokeRect(
    pa.x + descriptor.safeInsetPx,
    pa.y + descriptor.safeInsetPx,
    pa.width - 2 * descriptor.safeInsetPx,
    pa.height - 2 * descriptor.safeInsetPx
  );
  ctx.restore();

  // Bleed line (red) just inside the sheet edge.
  if (descriptor.bleedInsetPx > 0) {
    ctx.save();
    ctx.strokeStyle = "#cf222e";
    ctx.strokeRect(
      descriptor.bleedInsetPx,
      descriptor.bleedInsetPx,
      width - 2 * descriptor.bleedInsetPx,
      height - 2 * descriptor.bleedInsetPx
    );
    ctx.restore();
  }

  // Corner markers.
  const m = Math.round(descriptor.dpi / 4);
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = lineW;
  const corners: Array<[number, number, number, number]> = [
    [0, 0, m, 0], [0, 0, 0, m],
    [width, 0, width - m, 0], [width, 0, width, m],
    [0, height, m, height], [0, height, 0, height - m],
    [width, height, width - m, height], [width, height, width, height - m]
  ];
  for (const [x1, y1, x2, y2] of corners) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Center cross.
  ctx.beginPath();
  ctx.moveTo(width / 2 - m, height / 2);
  ctx.lineTo(width / 2 + m, height / 2);
  ctx.moveTo(width / 2, height / 2 - m);
  ctx.lineTo(width / 2, height / 2 + m);
  ctx.stroke();

  // TOP marker + arrow.
  const fontPx = Math.round(descriptor.dpi / 6);
  ctx.fillStyle = "#000000";
  ctx.font = `bold ${fontPx}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("TOP ↑", width / 2, pa.y + descriptor.safeInsetPx + fontPx);

  // Info block (bottom-center).
  const lines = [
    descriptor.labels.printerName,
    descriptor.labels.profileName,
    `${descriptor.labels.paper} · ${descriptor.labels.orientation} · ${descriptor.labels.scaling}`,
    descriptor.labels.timestamp
  ];
  const infoFont = Math.round(descriptor.dpi / 10);
  ctx.font = `${infoFont}px sans-serif`;
  ctx.textBaseline = "bottom";
  let y = height - pa.y - descriptor.safeInsetPx;
  for (let i = lines.length - 1; i >= 0; i--) {
    ctx.fillText(lines[i], width / 2, y);
    y -= infoFont * 1.4;
  }

  return canvas.toDataURL("image/png");
}
