import { describe, expect, it } from "vitest";

import { DEFAULT_PROFILES, resolveTargetFromProfiles, SIZE_MM } from "@/core/printHub/printerProfiles";
import { buildJobManifest } from "@/core/printHub/jobPackage";
import type { BorderMode, PrintFinish } from "@/types/printHub";

function manifest(size: string, finish: PrintFinish, borderMode: BorderMode, preferredDeviceId: string | null = null) {
  return {
    ...buildJobManifest({
      source: "spp2_editor", sourceComputer: "DESK-2", size, finish, borderMode, copies: 1,
      files: [{ path: "images/001.jpg", copies: 1 }], preferredDeviceId
    })
  };
}

describe("resolveTargetFromProfiles", () => {
  it("resolves an exact size/finish/border match", () => {
    const target = resolveTargetFromProfiles(DEFAULT_PROFILES, manifest("10x15", "glossy", "borderless"));
    expect(target).not.toBeNull();
    expect(target?.preset.widthMm).toBe(SIZE_MM["10x15"].widthMm);
    expect(target?.preset.finish).toBe("glossy");
  });

  it("honours a preferred device id", () => {
    const target = resolveTargetFromProfiles(DEFAULT_PROFILES, manifest("10x15", "glossy", "borderless", "mitsubishi_cpd80"));
    expect(target?.profile.deviceId).toBe("mitsubishi_cpd80");
  });

  it("returns null when nothing supports the request", () => {
    const target = resolveTargetFromProfiles(DEFAULT_PROFILES, manifest("99x99", "matte", "white_border"));
    expect(target).toBeNull();
  });

  it("falls back ignoring borderMode when no exact match", () => {
    // DS620 has only borderless presets; a white_border request should still resolve via fallback.
    const target = resolveTargetFromProfiles(DEFAULT_PROFILES, manifest("15x20", "glossy", "white_border"));
    expect(target).not.toBeNull();
    expect(target?.preset.finish).toBe("glossy");
  });
});
