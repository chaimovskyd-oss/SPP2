// Pure printer/preset resolution (no Node deps) — shared by the server (job → printer) and the
// renderer editor (live "will this job find a printer?" check).

import { SIZE_MM } from "./sizes";
import type { BorderMode, PrintFinish, PrinterProfile, PrintJobManifest, PrintPreset } from "@/types/printHub";

export interface ResolvedTarget {
  profile: PrinterProfile;
  preset: PrintPreset;
}

export interface ResolveQuery {
  size: string;
  finish: PrintFinish;
  borderMode: BorderMode;
  preferredDeviceId?: string | null;
}

/** Derives the nominal size key (e.g. "10x15") from a preset's mm dims. */
export function sizeKey(p: PrintPreset): string {
  for (const [key, dims] of Object.entries(SIZE_MM)) {
    if (Math.abs(dims.widthMm - p.widthMm) <= 2 && Math.abs(dims.heightMm - p.heightMm) <= 2) {
      return key;
    }
  }
  return `${Math.round(p.widthMm / 10)}x${Math.round(p.heightMm / 10)}`;
}

/** Resolves a size/finish/border request to a printer + preset (exact, then border-agnostic). */
export function resolvePreset(profiles: PrinterProfile[], query: ResolveQuery): ResolvedTarget | null {
  const ordered = query.preferredDeviceId
    ? [...profiles].sort((a, b) => (a.deviceId === query.preferredDeviceId ? -1 : b.deviceId === query.preferredDeviceId ? 1 : 0))
    : profiles;

  for (const profile of ordered) {
    const match = profile.presets.find(
      (p) => sizeKey(p) === query.size && p.finish === query.finish && p.borderMode === query.borderMode
    );
    if (match) return { profile, preset: match };
  }
  for (const profile of ordered) {
    const match = profile.presets.find((p) => sizeKey(p) === query.size && p.finish === query.finish);
    if (match) return { profile, preset: match };
  }
  return null;
}

/** Server entry point: resolves a full manifest's requestedOutput. */
export function resolveTargetFromProfiles(profiles: PrinterProfile[], manifest: PrintJobManifest): ResolvedTarget | null {
  return resolvePreset(profiles, { ...manifest.requestedOutput, preferredDeviceId: manifest.routing.preferredDeviceId });
}

export interface AvailableOptions {
  sizes: string[];
  finishes: PrintFinish[];
  borderModes: BorderMode[];
}

/** Derives the size/finish/border options actually offered by the configured printers, so sender
 *  stations show exactly what the print server can produce (preset "sync" via the shared config). */
export function availableOptionsFromProfiles(profiles: PrinterProfile[]): AvailableOptions {
  const sizes = new Set<string>();
  const finishes = new Set<PrintFinish>();
  const borderModes = new Set<BorderMode>();
  for (const profile of profiles) {
    for (const p of profile.presets) {
      sizes.add(sizeKey(p));
      finishes.add(p.finish);
      borderModes.add(p.borderMode);
    }
  }
  return { sizes: [...sizes], finishes: [...finishes], borderModes: [...borderModes] };
}
