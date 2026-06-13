// computePrintLayout() — the single source of truth for Advanced Print geometry.
//
// Preview, preflight, the test page, PDF output, and the actual print job all consume
// the PrintLayout this produces. Nothing downstream re-derives orientation/size/placement,
// so preview and job can never disagree.
//
// Pure functions only (no DOM/canvas) so this is fully unit-testable.

import type {
  AdvancedPrinterProfile,
  CalibrationConfig,
  EdgeInsetsMm,
  PaperSize,
  PrintLayout,
  PrinterCapabilities,
  RectMm,
  ResolvedOrientation,
  SizeMm
} from "@/types/advancedPrint";

/** Minimal shape of the rendered output (mirrors PrintableStageImage without a UI dependency). */
export interface RenderedOutput {
  widthPx: number;
  heightPx: number;
  widthMm: number;
  heightMm: number;
  dpi: number;
  orientation: ResolvedOrientation;
}

const ZERO_INSETS: EdgeInsetsMm = { topMm: 0, rightMm: 0, bottomMm: 0, leftMm: 0 };

function orientationFromSize(widthMm: number, heightMm: number): ResolvedOrientation {
  return widthMm >= heightMm ? "landscape" : "portrait";
}

/** Resolves the effective orientation from the profile policy and the rendered output. */
export function resolveOrientation(
  policy: AdvancedPrinterProfile["orientationPolicy"],
  rendered: RenderedOutput
): ResolvedOrientation {
  switch (policy) {
    case "force-portrait":
      return "portrait";
    case "force-landscape":
      return "landscape";
    case "from-rendered-output":
    case "ask-before-print":
    default:
      return rendered.orientation;
  }
}

/** Returns a width/height pair oriented to match the requested orientation (long side follows orientation). */
function orientSize(size: SizeMm, orientation: ResolvedOrientation): SizeMm {
  const long = Math.max(size.widthMm, size.heightMm);
  const short = Math.min(size.widthMm, size.heightMm);
  return orientation === "landscape"
    ? { widthMm: long, heightMm: short }
    : { widthMm: short, heightMm: long };
}

/** Resolves margins (in mm) from the profile's margins policy and printer capabilities. */
function resolveMargins(
  profile: AdvancedPrinterProfile,
  paper: PaperSize,
  caps?: PrinterCapabilities
): EdgeInsetsMm {
  switch (profile.marginsPolicy) {
    case "force-none":
      return { ...ZERO_INSETS };
    case "custom-margins":
      return profile.customMarginsMm ?? { ...ZERO_INSETS };
    case "use-driver-printable-area":
    default: {
      const fromCaps = caps?.printableAreaByPaper?.[paper.name];
      return fromCaps ?? { ...ZERO_INSETS };
    }
  }
}

/** Computes the design's intrinsic physical size, honoring a profile override. */
function resolveDocumentSize(rendered: RenderedOutput, profile: AdvancedPrinterProfile): SizeMm {
  if (profile.documentSizeMm) return profile.documentSizeMm;
  return { widthMm: rendered.widthMm, heightMm: rendered.heightMm };
}

/** Computes the physical print size from the scaling config, oriented design, and target area. */
function resolvePrintSize(
  profile: AdvancedPrinterProfile,
  orientedDesign: SizeMm,
  targetArea: SizeMm
): SizeMm {
  const { scaling } = profile;
  switch (scaling.mode) {
    case "actual-size":
      return { ...orientedDesign };
    case "fit-to-page": {
      const scale = Math.min(
        targetArea.widthMm / orientedDesign.widthMm,
        targetArea.heightMm / orientedDesign.heightMm
      );
      return { widthMm: orientedDesign.widthMm * scale, heightMm: orientedDesign.heightMm * scale };
    }
    case "fill-page": {
      const scale = Math.max(
        targetArea.widthMm / orientedDesign.widthMm,
        targetArea.heightMm / orientedDesign.heightMm
      );
      return { widthMm: orientedDesign.widthMm * scale, heightMm: orientedDesign.heightMm * scale };
    }
    case "custom-percent": {
      const pct = (scaling.percent ?? 100) / 100;
      return { widthMm: orientedDesign.widthMm * pct, heightMm: orientedDesign.heightMm * pct };
    }
    case "custom-size":
      return {
        widthMm: scaling.widthMm ?? orientedDesign.widthMm,
        heightMm: scaling.heightMm ?? orientedDesign.heightMm
      };
    default:
      return { ...orientedDesign };
  }
}

/** Returns the strips of `inner` that fall outside `clip` (up to 4 overflow rects). */
function overflowRects(inner: RectMm, clip: RectMm): RectMm[] {
  const rects: RectMm[] = [];
  const innerRight = inner.xMm + inner.widthMm;
  const innerBottom = inner.yMm + inner.heightMm;
  const clipRight = clip.xMm + clip.widthMm;
  const clipBottom = clip.yMm + clip.heightMm;
  const EPS = 0.01;

  if (inner.xMm < clip.xMm - EPS) {
    rects.push({ xMm: inner.xMm, yMm: inner.yMm, widthMm: clip.xMm - inner.xMm, heightMm: inner.heightMm });
  }
  if (innerRight > clipRight + EPS) {
    rects.push({ xMm: clipRight, yMm: inner.yMm, widthMm: innerRight - clipRight, heightMm: inner.heightMm });
  }
  if (inner.yMm < clip.yMm - EPS) {
    rects.push({ xMm: inner.xMm, yMm: inner.yMm, widthMm: inner.widthMm, heightMm: clip.yMm - inner.yMm });
  }
  if (innerBottom > clipBottom + EPS) {
    rects.push({ xMm: inner.xMm, yMm: clipBottom, widthMm: inner.widthMm, heightMm: innerBottom - clipBottom });
  }
  return rects;
}

/**
 * Builds the authoritative PrintLayout. This is the only place orientation, paper, scaling,
 * placement, margins, bleed, borderless, and calibration are decided.
 */
export function computePrintLayout(
  rendered: RenderedOutput,
  profile: AdvancedPrinterProfile,
  caps?: PrinterCapabilities,
  calibrationOverride?: CalibrationConfig
): PrintLayout {
  const orientation = resolveOrientation(profile.orientationPolicy, rendered);
  const calibration = calibrationOverride ?? profile.calibration;

  // Paper, oriented to the resolved orientation.
  const orientedPaper = orientSize(profile.printerPaper, orientation);
  const printerPaperMm: PaperSize = {
    name: profile.printerPaper.name,
    custom: profile.printerPaper.custom,
    widthMm: orientedPaper.widthMm,
    heightMm: orientedPaper.heightMm
  };

  const margins = resolveMargins(profile, profile.printerPaper, caps);
  const borderless = profile.borderless.status !== "not-requested";

  // Printable area within the paper (driver-owned region). Borderless prints onto the full sheet.
  const printableAreaMm: RectMm = borderless
    ? { xMm: 0, yMm: 0, widthMm: printerPaperMm.widthMm, heightMm: printerPaperMm.heightMm }
    : {
        xMm: margins.leftMm,
        yMm: margins.topMm,
        widthMm: printerPaperMm.widthMm - margins.leftMm - margins.rightMm,
        heightMm: printerPaperMm.heightMm - margins.topMm - margins.bottomMm
      };

  const documentSizeMm = resolveDocumentSize(rendered, profile);
  const orientedDesign = orientSize(documentSizeMm, orientation);
  const targetArea: SizeMm = { widthMm: printableAreaMm.widthMm, heightMm: printableAreaMm.heightMm };

  // Print size from scaling, then mechanical calibration scale correction.
  const baseSize = resolvePrintSize(profile, orientedDesign, targetArea);
  const printSizeMm: SizeMm = {
    widthMm: baseSize.widthMm * (calibration.scaleXPercent / 100),
    heightMm: baseSize.heightMm * (calibration.scaleYPercent / 100)
  };

  // Placement on the paper.
  let xMm: number;
  let yMm: number;
  switch (profile.position.mode) {
    case "top-left":
      xMm = printableAreaMm.xMm;
      yMm = printableAreaMm.yMm;
      break;
    case "custom":
      xMm = printableAreaMm.xMm + (profile.position.xMm ?? 0);
      yMm = printableAreaMm.yMm + (profile.position.yMm ?? 0);
      break;
    case "center":
    default:
      xMm = (printerPaperMm.widthMm - printSizeMm.widthMm) / 2;
      yMm = (printerPaperMm.heightMm - printSizeMm.heightMm) / 2;
      break;
  }
  // Calibration offset (mechanical X/Y correction).
  xMm += calibration.offsetXmm;
  yMm += calibration.offsetYmm;

  const placementRectMm: RectMm = { xMm, yMm, widthMm: printSizeMm.widthMm, heightMm: printSizeMm.heightMm };

  // Crop risk: parts of the placed print outside the clip region.
  const clip: RectMm = borderless
    ? { xMm: 0, yMm: 0, widthMm: printerPaperMm.widthMm, heightMm: printerPaperMm.heightMm }
    : printableAreaMm;
  const cropRiskRectsMm = overflowRects(placementRectMm, clip);

  const scalePercent = (printSizeMm.widthMm / orientedDesign.widthMm) * 100;

  return {
    documentSizeMm,
    printerPaperMm,
    printSizeMm,
    resolvedOrientation: orientation,
    printableAreaMm,
    marginsMm: borderless ? { ...ZERO_INSETS } : margins,
    bleedMm: profile.bleedMm,
    safeAreaMm: ZERO_INSETS,
    placementRectMm,
    scalePercent,
    borderlessStatus: profile.borderless.status,
    calibrationApplied: calibration,
    cropRiskRectsMm,
    dpi: rendered.dpi,
    renderedPx: { width: rendered.widthPx, height: rendered.heightPx }
  };
}

export { orientationFromSize };
