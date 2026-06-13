// Printer profiles & presets (Phase 3, gaps G4/G5). Maps a job's requestedOutput (size/finish/
// borderMode) to a concrete Windows printer + print preset. Persisted as config/printers.json on
// the hub; ships with sensible built-ins for common dye-sub photo printers.
//
// NODE-ONLY (uses fs for load/save). Pure resolution helpers are exported for unit testing.

import fs from "node:fs";
import path from "node:path";

import type { PrinterProfile } from "@/types/printHub";
import { SIZE_MM } from "./sizes";
import { DEFAULT_PROFILES } from "./defaultProfiles";
import { resolveTargetFromProfiles, type ResolvedTarget } from "./resolveProfile";

export { SIZE_MM, DEFAULT_PROFILES, resolveTargetFromProfiles };
export type { ResolvedTarget };

function profilesConfigPath(hubRoot: string): string {
  return path.join(hubRoot, "config", "printers.json");
}

export function loadProfiles(hubRoot: string): PrinterProfile[] {
  const file = profilesConfigPath(hubRoot);
  if (!fs.existsSync(file)) {
    return DEFAULT_PROFILES;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as { profiles?: PrinterProfile[] };
    return Array.isArray(parsed.profiles) && parsed.profiles.length > 0 ? parsed.profiles : DEFAULT_PROFILES;
  } catch {
    return DEFAULT_PROFILES;
  }
}

export function saveProfiles(hubRoot: string, profiles: PrinterProfile[]): void {
  fs.mkdirSync(path.join(hubRoot, "config"), { recursive: true });
  fs.writeFileSync(profilesConfigPath(hubRoot), JSON.stringify({ profiles }, null, 2), "utf-8");
}
