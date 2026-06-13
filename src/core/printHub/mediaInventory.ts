// Media inventory (Phase 7, gap G14). ADVISORY ONLY in V1 — counts are maintained manually, not
// synced from printer hardware. Used to warn before a job exceeds remaining media and to drive
// smart-split decisions (spec §19).
//
// NODE-ONLY (fs load/save). The pure check helper is exported for unit testing.

import fs from "node:fs";
import path from "node:path";

import type { MediaItem } from "@/types/printHub";

function mediaConfigPath(hubRoot: string): string {
  return path.join(hubRoot, "config", "media.json");
}

export function loadMedia(hubRoot: string): MediaItem[] {
  const file = mediaConfigPath(hubRoot);
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as { items?: MediaItem[] };
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

export function saveMedia(hubRoot: string, items: MediaItem[]): void {
  fs.mkdirSync(path.join(hubRoot, "config"), { recursive: true });
  fs.writeFileSync(mediaConfigPath(hubRoot), JSON.stringify({ items }, null, 2), "utf-8");
}

export function remainingForPreset(items: MediaItem[], presetId: string): number {
  return items.find((m) => m.presetId === presetId)?.remainingUnits ?? Infinity;
}

export interface MediaCheckResult {
  /** True when there is no tracked media for this preset (advisory unknown) or enough remains. */
  sufficient: boolean;
  remaining: number;
  shortfall: number;
  tracked: boolean;
}

/** Checks whether requiredUnits fit in the remaining media for a preset. Untracked presets pass. */
export function checkMedia(items: MediaItem[], presetId: string, requiredUnits: number): MediaCheckResult {
  const entry = items.find((m) => m.presetId === presetId);
  if (entry === undefined) {
    return { sufficient: true, remaining: Infinity, shortfall: 0, tracked: false };
  }
  const remaining = Math.max(0, entry.remainingUnits);
  const shortfall = Math.max(0, requiredUnits - remaining);
  return { sufficient: shortfall === 0, remaining, shortfall, tracked: true };
}

/** Decrements remaining media for a preset after a successful print. No-op for untracked presets. */
export function consumeMedia(hubRoot: string, presetId: string, units: number): void {
  const items = loadMedia(hubRoot);
  const entry = items.find((m) => m.presetId === presetId);
  if (entry === undefined) return;
  entry.remainingUnits = Math.max(0, entry.remainingUnits - Math.max(0, units));
  saveMedia(hubRoot, items);
}
