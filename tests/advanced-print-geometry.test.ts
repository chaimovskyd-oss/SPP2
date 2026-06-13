import { describe, expect, it } from "vitest";

import { computePrintLayout, resolveOrientation, type RenderedOutput } from "@/core/advancedPrint/pageGeometry";
import { createDefaultProfile } from "@/core/advancedPrint/builtInPresets";
import type { AdvancedPrinterProfile, PrinterCapabilities } from "@/types/advancedPrint";

// A4 portrait design at 300dpi: 210x297mm.
const a4Portrait: RenderedOutput = {
  widthPx: 2480,
  heightPx: 3508,
  widthMm: 210,
  heightMm: 297,
  dpi: 300,
  orientation: "portrait"
};

// A landscape photo: 297x210mm.
const a4Landscape: RenderedOutput = {
  widthPx: 3508,
  heightPx: 2480,
  widthMm: 297,
  heightMm: 210,
  dpi: 300,
  orientation: "landscape"
};

function profile(overrides: Partial<AdvancedPrinterProfile> = {}): AdvancedPrinterProfile {
  return { ...createDefaultProfile("Test Printer"), ...overrides };
}

describe("resolveOrientation", () => {
  it("follows the rendered output by default", () => {
    expect(resolveOrientation("from-rendered-output", a4Portrait)).toBe("portrait");
    expect(resolveOrientation("from-rendered-output", a4Landscape)).toBe("landscape");
  });

  it("honors forced policies regardless of rendered output", () => {
    expect(resolveOrientation("force-landscape", a4Portrait)).toBe("landscape");
    expect(resolveOrientation("force-portrait", a4Landscape)).toBe("portrait");
  });
});

describe("computePrintLayout", () => {
  it("orients the paper to match the resolved orientation", () => {
    const landscape = computePrintLayout(a4Landscape, profile({ orientationPolicy: "from-rendered-output" }));
    expect(landscape.resolvedOrientation).toBe("landscape");
    expect(landscape.printerPaperMm.widthMm).toBe(297);
    expect(landscape.printerPaperMm.heightMm).toBe(210);

    const portrait = computePrintLayout(a4Portrait, profile());
    expect(portrait.printerPaperMm.widthMm).toBe(210);
    expect(portrait.printerPaperMm.heightMm).toBe(297);
  });

  it("fit-to-page fills one axis exactly and stays within the other", () => {
    const layout = computePrintLayout(a4Portrait, profile({ scaling: { mode: "fit-to-page", lockRatio: true } }));
    // Same aspect as A4 → fits exactly.
    expect(layout.printSizeMm.widthMm).toBeCloseTo(210, 1);
    expect(layout.printSizeMm.heightMm).toBeCloseTo(297, 1);
    expect(layout.cropRiskRectsMm).toHaveLength(0);
  });

  it("fill-page can overflow the paper, producing crop risk", () => {
    // Square-ish design forced into A4 portrait → fill overflows height.
    const square: RenderedOutput = { ...a4Portrait, widthMm: 200, heightMm: 200, widthPx: 2362, heightPx: 2362 };
    const layout = computePrintLayout(square, profile({ scaling: { mode: "fill-page", lockRatio: true } }));
    expect(layout.cropRiskRectsMm.length).toBeGreaterThan(0);
  });

  it("custom-percent scales relative to the design size", () => {
    const layout = computePrintLayout(
      a4Portrait,
      profile({ scaling: { mode: "custom-percent", percent: 50, lockRatio: true } })
    );
    expect(layout.printSizeMm.widthMm).toBeCloseTo(105, 1);
    expect(layout.printSizeMm.heightMm).toBeCloseTo(148.5, 1);
    expect(layout.scalePercent).toBeCloseTo(50, 1);
  });

  it("custom-size uses explicit dimensions", () => {
    const layout = computePrintLayout(
      a4Portrait,
      profile({ scaling: { mode: "custom-size", widthMm: 100, heightMm: 150, lockRatio: false } })
    );
    expect(layout.printSizeMm.widthMm).toBeCloseTo(100, 1);
    expect(layout.printSizeMm.heightMm).toBeCloseTo(150, 1);
  });

  it("centers the print on the paper by default", () => {
    const layout = computePrintLayout(
      a4Portrait,
      profile({ scaling: { mode: "custom-size", widthMm: 100, heightMm: 150, lockRatio: false }, position: { mode: "center" } })
    );
    expect(layout.placementRectMm.xMm).toBeCloseTo((210 - 100) / 2, 1);
    expect(layout.placementRectMm.yMm).toBeCloseTo((297 - 150) / 2, 1);
  });

  it("applies calibration offset and scale", () => {
    const layout = computePrintLayout(
      a4Portrait,
      profile({
        scaling: { mode: "custom-size", widthMm: 100, heightMm: 100, lockRatio: false },
        position: { mode: "top-left" },
        calibration: { offsetXmm: 2, offsetYmm: -1, scaleXPercent: 101, scaleYPercent: 99 }
      })
    );
    expect(layout.placementRectMm.xMm).toBeCloseTo(2, 1);
    expect(layout.placementRectMm.yMm).toBeCloseTo(-1, 1);
    expect(layout.printSizeMm.widthMm).toBeCloseTo(101, 1);
    expect(layout.printSizeMm.heightMm).toBeCloseTo(99, 1);
  });

  it("uses driver printable area for margins when available", () => {
    const caps: PrinterCapabilities = {
      windowsPrinterName: "Test Printer",
      paperSizes: [{ name: "A4", widthMm: 210, heightMm: 297, custom: false }],
      sources: ["Tray 1"],
      printableAreaByPaper: { A4: { topMm: 5, rightMm: 5, bottomMm: 5, leftMm: 5 } },
      duplex: false,
      color: true,
      resolutionsDpi: [600],
      isWideFormat: false,
      isRoll: false
    };
    const layout = computePrintLayout(a4Portrait, profile({ marginsPolicy: "use-driver-printable-area" }), caps);
    expect(layout.printableAreaMm.xMm).toBeCloseTo(5, 1);
    expect(layout.printableAreaMm.widthMm).toBeCloseTo(200, 1);
  });

  it("borderless ignores margins and prints on the full sheet", () => {
    const layout = computePrintLayout(
      a4Portrait,
      profile({ borderless: { status: "test-print-verified" }, marginsPolicy: "custom-margins", customMarginsMm: { topMm: 10, rightMm: 10, bottomMm: 10, leftMm: 10 } })
    );
    expect(layout.printableAreaMm.widthMm).toBeCloseTo(210, 1);
    expect(layout.marginsMm.leftMm).toBe(0);
  });
});
