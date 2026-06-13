import type { ReactElement } from "react";

import type { PrintLayout } from "@/types/advancedPrint";

interface AdvancedPrintPreviewProps {
  layout: PrintLayout;
  /** Optional rendered page thumbnail to show inside the placement rect. */
  thumbnailUrl?: string;
  /** Max pixel size of the preview box. */
  maxPx?: number;
}

/**
 * Photoshop-like print preview. Consumes the authoritative PrintLayout (never re-derives
 * geometry), so what the user sees is exactly what will print: the sheet, the driver printable
 * area, margins, bleed, the placed design, and any crop-risk regions.
 */
export function AdvancedPrintPreview({ layout, thumbnailUrl, maxPx = 360 }: AdvancedPrintPreviewProps): ReactElement {
  const paperW = layout.printerPaperMm.widthMm;
  const paperH = layout.printerPaperMm.heightMm;
  const scale = maxPx / Math.max(paperW, paperH);
  const w = paperW * scale;
  const h = paperH * scale;

  const pa = layout.printableAreaMm;
  const pl = layout.placementRectMm;

  return (
    <div className="ape-preview" style={{ width: w, height: h }}>
      <svg width={w} height={h} viewBox={`0 0 ${paperW} ${paperH}`} className="ape-preview-svg">
        {/* Sheet */}
        <rect x={0} y={0} width={paperW} height={paperH} fill="#ffffff" stroke="#222" strokeWidth={0.4} />

        {/* Printable area (driver-owned) */}
        {layout.borderlessStatus === "not-requested" && (
          <rect
            x={pa.xMm}
            y={pa.yMm}
            width={pa.widthMm}
            height={pa.heightMm}
            fill="none"
            stroke="#1f6feb"
            strokeWidth={0.3}
            strokeDasharray="2 1.5"
          />
        )}

        {/* Placed design */}
        {thumbnailUrl ? (
          <image href={thumbnailUrl} x={pl.xMm} y={pl.yMm} width={pl.widthMm} height={pl.heightMm} preserveAspectRatio="none" />
        ) : (
          <rect x={pl.xMm} y={pl.yMm} width={pl.widthMm} height={pl.heightMm} fill="#cfd8ff" stroke="#5566cc" strokeWidth={0.3} />
        )}

        {/* Crop-risk regions (clipped content) */}
        {layout.cropRiskRectsMm.map((r, i) => (
          <rect key={i} x={r.xMm} y={r.yMm} width={r.widthMm} height={r.heightMm} fill="rgba(207,34,46,0.35)" />
        ))}

        {/* Bleed line */}
        {layout.bleedMm > 0 && (
          <rect
            x={layout.bleedMm}
            y={layout.bleedMm}
            width={paperW - 2 * layout.bleedMm}
            height={paperH - 2 * layout.bleedMm}
            fill="none"
            stroke="#cf222e"
            strokeWidth={0.25}
          />
        )}
      </svg>
    </div>
  );
}
