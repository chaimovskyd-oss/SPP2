// Stations & approval policy (Phase 6, gaps G11/G15). The hub keeps a stations.json registry of
// known workstations and their trust. Trusted/admin stations may auto-print; everything else is
// held for admin approval before printing (spec §17 default).
//
// NODE-ONLY (fs load/save). The pure policy helper is exported for unit testing.

import fs from "node:fs";
import path from "node:path";

import type { PrintJobManifest, Station, StationRole } from "@/types/printHub";

function stationsConfigPath(hubRoot: string): string {
  return path.join(hubRoot, "config", "stations.json");
}

export function loadStations(hubRoot: string): Station[] {
  const file = stationsConfigPath(hubRoot);
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as { stations?: Station[] };
    return Array.isArray(parsed.stations) ? parsed.stations : [];
  } catch {
    return [];
  }
}

export function saveStations(hubRoot: string, stations: Station[]): void {
  fs.mkdirSync(path.join(hubRoot, "config"), { recursive: true });
  fs.writeFileSync(stationsConfigPath(hubRoot), JSON.stringify({ stations }, null, 2), "utf-8");
}

export function findStation(stations: Station[], computerName: string): Station | undefined {
  const name = computerName.trim().toLowerCase();
  return stations.find((s) => s.computerName.trim().toLowerCase() === name);
}

export function stationRole(stations: Station[], computerName: string): StationRole {
  return findStation(stations, computerName)?.role ?? "designer";
}

/**
 * Approval policy (spec §17):
 *  - already approved → no approval needed
 *  - trusted/admin station → may auto-print, but still honours an explicit require_approval
 *  - any other (unknown/untrusted) station → always held for approval
 */
export function requiresApprovalForJob(stations: Station[], manifest: PrintJobManifest): boolean {
  if (manifest.approval.state === "approved") return false;
  const station = findStation(stations, manifest.sourceComputer);
  const trusted = station?.trusted === true || station?.role === "admin";
  if (trusted) {
    return manifest.approval.mode === "require_approval";
  }
  return true;
}
