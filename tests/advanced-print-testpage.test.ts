import { describe, expect, it } from "vitest";

import { computePrintLayout, type RenderedOutput } from "@/core/advancedPrint/pageGeometry";
import { buildTestPageDescriptor } from "@/core/advancedPrint/testPage";
import { createDefaultProfile } from "@/core/advancedPrint/builtInPresets";

const a4Portrait: RenderedOutput = {
  widthPx: 2480, heightPx: 3508, widthMm: 210, heightMm: 297, dpi: 300, orientation: "portrait"
};

describe("buildTestPageDescriptor", () => {
  it("matches the layout paper dimensions at the layout DPI", () => {
    const profile = createDefaultProfile("Test Printer");
    const layout = computePrintLayout(a4Portrait, profile);
    const d = buildTestPageDescriptor(layout, profile);
    // 210mm @300dpi = 2480px, 297mm = 3508px
    expect(d.widthPx).toBe(2480);
    expect(d.heightPx).toBe(3508);
    expect(d.dpi).toBe(300);
  });

  it("places the printable area inside the sheet when driver margins exist", () => {
    const profile = { ...createDefaultProfile("P"), marginsPolicy: "custom-margins" as const, customMarginsMm: { topMm: 10, rightMm: 10, bottomMm: 10, leftMm: 10 } };
    const layout = computePrintLayout(a4Portrait, profile);
    const d = buildTestPageDescriptor(layout, profile);
    expect(d.printableAreaPx.x).toBe(Math.round((10 / 25.4) * 300));
    expect(d.printableAreaPx.width).toBeLessThan(d.widthPx);
  });

  it("carries human-readable labels", () => {
    const profile = createDefaultProfile("Canon TM-200");
    const layout = computePrintLayout(a4Portrait, profile);
    const d = buildTestPageDescriptor(layout, profile);
    expect(d.labels.printerName).toBe("Canon TM-200");
    expect(d.labels.orientation).toBe("לאורך");
  });
});
