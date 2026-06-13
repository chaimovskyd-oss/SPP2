import { describe, expect, it } from "vitest";

import { computePrintLayout, type RenderedOutput } from "@/core/advancedPrint/pageGeometry";
import { runPreflight } from "@/core/advancedPrint/preflight";
import { createDefaultProfile } from "@/core/advancedPrint/builtInPresets";
import type { AdvancedPrinterProfile, DriverState } from "@/types/advancedPrint";

const a4Portrait: RenderedOutput = {
  widthPx: 2480, heightPx: 3508, widthMm: 210, heightMm: 297, dpi: 300, orientation: "portrait"
};

const okDriver: DriverState = { printerExists: true, devmodeApplied: true, currentDriverName: "D", currentDriverVersion: "1.0" };

function profile(overrides: Partial<AdvancedPrinterProfile> = {}): AdvancedPrinterProfile {
  return { ...createDefaultProfile("Test Printer"), color: { mode: "printer-manages-color", renderingIntent: "relative-colorimetric", blackPointCompensation: true }, traySource: { label: "Tray 1", verified: true }, ...overrides };
}

function codes(profileOverrides: Partial<AdvancedPrinterProfile>, driver: DriverState = okDriver) {
  const p = profile(profileOverrides);
  const layout = computePrintLayout(a4Portrait, p);
  return runPreflight({ layout, profile: p, driver }).warnings.map((w) => w.code);
}

describe("runPreflight", () => {
  it("is clean for a well-formed printer-managed A4 fit-to-page profile", () => {
    const p = profile();
    const layout = computePrintLayout(a4Portrait, p);
    const report = runPreflight({ layout, profile: p, driver: okDriver });
    expect(report.clean).toBe(true);
    expect(report.hasBlocker).toBe(false);
  });

  it("blocks when the printer is missing", () => {
    const p = profile();
    const layout = computePrintLayout(a4Portrait, p);
    const report = runPreflight({ layout, profile: p, driver: { printerExists: false } });
    expect(report.hasBlocker).toBe(true);
    expect(report.warnings.map((w) => w.code)).toContain("printer-missing");
  });

  it("blocks on stale DEVMODE when the driver version changed", () => {
    const p = profile({ devmode: { base64: "AAA", driverName: "D", driverVersion: "1.0", capturedForPrinter: "Test Printer" } });
    const layout = computePrintLayout(a4Portrait, p);
    const report = runPreflight({
      layout, profile: p,
      driver: { printerExists: true, currentDriverName: "D", currentDriverVersion: "2.0", devmodeApplied: true }
    });
    expect(report.hasBlocker).toBe(true);
    expect(report.warnings.map((w) => w.code)).toContain("devmode-stale");
  });

  it("warns on borderless requested-but-not-verified and missing bleed", () => {
    const c = codes({ borderless: { status: "requested-not-verified" }, bleedMm: 0 });
    expect(c).toContain("borderless-not-verified");
    expect(c).toContain("missing-bleed");
  });

  it("warns on double color correction when app manages color", () => {
    const c = codes({ color: { mode: "app-manages-color", iccProfileId: "icc1", renderingIntent: "perceptual", blackPointCompensation: true } });
    expect(c).toContain("double-color-correction");
  });

  it("warns on forced orientation that differs from the design", () => {
    const c = codes({ orientationPolicy: "force-landscape" });
    expect(c).toContain("orientation-mismatch");
  });

  it("flags low effective DPI as a blocker when extreme", () => {
    const lowRes: RenderedOutput = { widthPx: 300, heightPx: 420, widthMm: 210, heightMm: 297, dpi: 36, orientation: "portrait" };
    const p = profile();
    const layout = computePrintLayout(lowRes, p);
    const report = runPreflight({ layout, profile: p, driver: okDriver });
    expect(report.warnings.map((w) => w.code)).toContain("dpi-too-low");
    expect(report.hasBlocker).toBe(true);
  });
});
