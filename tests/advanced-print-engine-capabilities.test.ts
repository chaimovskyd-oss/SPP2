import { describe, expect, it } from "vitest";

import { detectMixedSizes, type PageMeta } from "@/services/advancedPrintService";
import { selectEngine } from "@/core/advancedPrint/engineSelect";
import { classifyPrinter, suggestStarterProfiles } from "@/core/advancedPrint/capabilityDefaults";
import { recommendForProduct } from "@/core/advancedPrint/productProfileLink";
import { BUILT_IN_OUTPUT_PRESETS, createDefaultProfile } from "@/core/advancedPrint/builtInPresets";
import type { AdvancedPrinterProfile, DriverState, PrinterCapabilities } from "@/types/advancedPrint";

const okDriver: DriverState = { printerExists: true, devmodeApplied: true };

function profile(overrides: Partial<AdvancedPrinterProfile> = {}): AdvancedPrinterProfile {
  return { ...createDefaultProfile("P"), ...overrides };
}

describe("selectEngine fallback ladder", () => {
  it("uses native+devmode when a usable DEVMODE exists", () => {
    const sel = selectEngine({
      profile: profile({ engine: "windows-native", devmode: { base64: "AAA" } }),
      driver: okDriver, isWindows: true, workerAvailable: true
    });
    expect(sel.primary).toBe("windows-native-devmode");
    expect(sel.fallbacks[0]).toBe("windows-native-default");
  });

  it("downgrades to native-default when no DEVMODE saved", () => {
    const sel = selectEngine({ profile: profile({ engine: "windows-native" }), driver: okDriver, isWindows: true, workerAvailable: true });
    expect(sel.primary).toBe("windows-native-default");
  });

  it("falls back to PDF on non-Windows", () => {
    const sel = selectEngine({ profile: profile({ engine: "windows-native" }), driver: okDriver, isWindows: false, workerAvailable: true });
    expect(sel.primary).toBe("pdf");
    expect(sel.engine).toBe("pdf");
    expect(sel.note).toBeTruthy();
  });

  it("falls back to PDF when the worker is unavailable", () => {
    const sel = selectEngine({ profile: profile({ engine: "windows-native" }), driver: okDriver, isWindows: true, workerAvailable: false });
    expect(sel.primary).toBe("pdf");
  });

  it("opens driver dialog when the printer is missing", () => {
    const sel = selectEngine({ profile: profile({ engine: "windows-native", devmode: { base64: "AAA" } }), driver: { printerExists: false }, isWindows: true, workerAvailable: true });
    expect(sel.primary).toBe("driver-dialog-first");
  });
});

describe("classifyPrinter + suggestStarterProfiles", () => {
  const wideFormat: PrinterCapabilities = {
    windowsPrinterName: "Canon TM-200", paperSizes: [{ name: "A2", widthMm: 420, heightMm: 594, custom: false }],
    sources: ["Roll"], printableAreaByPaper: {}, duplex: false, color: true, resolutionsDpi: [600], isWideFormat: true, isRoll: true
  };
  const office: PrinterCapabilities = {
    windowsPrinterName: "Konica C458",
    paperSizes: [{ name: "A4", widthMm: 210, heightMm: 297, custom: false }, { name: "A3", widthMm: 297, heightMm: 420, custom: false }],
    sources: ["Tray 1", "Tray 2", "Bypass"], printableAreaByPaper: {}, duplex: true, color: true, resolutionsDpi: [600], isWideFormat: false, isRoll: false
  };
  const dyeSub: PrinterCapabilities = {
    windowsPrinterName: "Mitsubishi D80", paperSizes: [{ name: "10x15", widthMm: 102, heightMm: 152, custom: false }],
    sources: ["Roll"], printableAreaByPaper: {}, duplex: false, color: true, resolutionsDpi: [300], isWideFormat: false, isRoll: false
  };

  it("classifies wide-format/roll", () => {
    expect(classifyPrinter(wideFormat)).toBe("wide-format-roll");
    expect(suggestStarterProfiles(wideFormat)[0].profile.engine).toBe("windows-native");
  });

  it("classifies office multi-tray and suggests A4 + Bypass", () => {
    expect(classifyPrinter(office)).toBe("office-multi-tray");
    const s = suggestStarterProfiles(office);
    expect(s.length).toBeGreaterThanOrEqual(2);
    expect(s.some((x) => x.profile.traySource?.label === "Bypass")).toBe(true);
  });

  it("classifies dye-sub from small fixed photo sizes", () => {
    expect(classifyPrinter(dyeSub)).toBe("dye-sub");
    expect(suggestStarterProfiles(dyeSub)[0].profile.borderless?.status).toBe("requested-not-verified");
  });
});

describe("detectMixedSizes", () => {
  const meta = (index: number, w: number, h: number): PageMeta => ({
    index, name: `p${index}`, widthMm: w, heightMm: h, orientation: w >= h ? "landscape" : "portrait"
  });

  it("returns false for a single page", () => {
    expect(detectMixedSizes([meta(0, 210, 297)])).toBe(false);
  });

  it("returns false when all pages share a size", () => {
    expect(detectMixedSizes([meta(0, 210, 297), meta(1, 210, 297), meta(2, 210, 297)])).toBe(false);
  });

  it("returns true when a page differs in size", () => {
    expect(detectMixedSizes([meta(0, 210, 297), meta(1, 215.9, 355.6)])).toBe(true);
  });
});

describe("recommendForProduct", () => {
  it("recommends the Tool Library canvas print preset for a canvas product", () => {
    const rec = recommendForProduct("canvas", [], BUILT_IN_OUTPUT_PRESETS);
    expect(rec.outputUse).toBe("canvas");
    expect(rec.outputPresetId).toBe("canvas_punch");
  });

  it("matches a profile whose linked preset shares the use", () => {
    const prof = profile({ outputPresetId: "sublimation_boost" });
    const rec = recommendForProduct("sublimation", [prof], BUILT_IN_OUTPUT_PRESETS);
    expect(rec.profileId).toBe(prof.id);
  });
});
