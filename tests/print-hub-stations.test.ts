import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findStation, loadStations, requiresApprovalForJob, saveStations, stationRole } from "@/core/printHub/stations";
import { buildJobManifest } from "@/core/printHub/jobPackage";
import type { Station } from "@/types/printHub";

const stations: Station[] = [
  { computerName: "ADMIN-PC", displayName: "תחנת מנהל", role: "admin", trusted: true },
  { computerName: "DESK-2", displayName: "עיצוב 2", role: "designer", trusted: true },
  { computerName: "KIOSK-1", displayName: "קיוסק", role: "designer", trusted: false }
];

function manifest(sourceComputer: string, mode: "auto" | "require_approval" = "auto") {
  return buildJobManifest({
    source: "spp2_editor", sourceComputer, size: "10x15", finish: "glossy", borderMode: "borderless",
    copies: 1, files: [{ path: "images/001.jpg", copies: 1 }], approvalMode: mode
  });
}

describe("stations resolution", () => {
  it("finds stations case-insensitively and reads roles", () => {
    expect(findStation(stations, "admin-pc")?.role).toBe("admin");
    expect(stationRole(stations, "DESK-2")).toBe("designer");
    expect(stationRole(stations, "UNKNOWN")).toBe("designer"); // default
  });
});

describe("requiresApprovalForJob (spec §17)", () => {
  it("trusted station with auto job → no approval", () => {
    expect(requiresApprovalForJob(stations, manifest("DESK-2", "auto"))).toBe(false);
  });

  it("trusted station can still opt into approval", () => {
    expect(requiresApprovalForJob(stations, manifest("ADMIN-PC", "require_approval"))).toBe(true);
  });

  it("untrusted/unknown station always requires approval", () => {
    expect(requiresApprovalForJob(stations, manifest("KIOSK-1", "auto"))).toBe(true);
    expect(requiresApprovalForJob(stations, manifest("RANDOM-PC", "auto"))).toBe(true);
  });

  it("already-approved job never needs approval again", () => {
    const m = manifest("KIOSK-1", "require_approval");
    m.approval.state = "approved";
    expect(requiresApprovalForJob(stations, m)).toBe(false);
  });
});

describe("stations persistence", () => {
  let hubRoot: string;
  beforeEach(() => { hubRoot = fs.mkdtempSync(path.join(os.tmpdir(), "spp-stations-")); });
  afterEach(() => { fs.rmSync(hubRoot, { recursive: true, force: true }); });

  it("round-trips and defaults to empty when missing", () => {
    expect(loadStations(hubRoot)).toEqual([]);
    saveStations(hubRoot, stations);
    expect(loadStations(hubRoot)).toEqual(stations);
  });
});
