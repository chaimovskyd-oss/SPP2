import type { AppSettings } from "./types";
import { DEFAULT_APP_SETTINGS } from "./defaults";

export interface SettingsMigration {
  fromVersion: number;
  toVersion: number;
  migrate: (settings: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Add new migrations here when the schema changes.
 * Additive-only changes (new fields with defaults) do NOT need a migration —
 * deepMerge handles them automatically.
 */
export const SETTINGS_MIGRATIONS: SettingsMigration[] = [
  // Example for future use:
  // {
  //   fromVersion: 1,
  //   toVersion: 2,
  //   migrate: (s) => ({
  //     ...s,
  //     general: { ...(s.general as object), newField: "defaultValue" }
  //   })
  // }
];

export const CURRENT_SETTINGS_VERSION = 1;

type PlainObj = Record<string, unknown>;

function isPlainObject(v: unknown): v is PlainObj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Recursively merges `stored` onto `defaults`.
 * - Plain objects are merged recursively (so new keys from defaults appear).
 * - Arrays replace wholesale (stored wins over defaults).
 * - Primitive values: stored wins.
 */
function deepMerge(defaults: PlainObj, stored: PlainObj): PlainObj {
  const result: PlainObj = { ...defaults };
  for (const key of Object.keys(stored)) {
    const storedVal = stored[key];
    const defaultVal = defaults[key];
    if (isPlainObject(storedVal) && isPlainObject(defaultVal)) {
      result[key] = deepMerge(defaultVal, storedVal);
    } else {
      result[key] = storedVal;
    }
  }
  return result;
}

/**
 * Takes any unknown persisted blob and returns a fully-typed, fully-populated
 * AppSettings by:
 *   1. Running sequential version migrations (if needed)
 *   2. Deep-merging with DEFAULT_APP_SETTINGS (fills in any missing/new fields)
 */
export function migrateSettings(stored: unknown): AppSettings {
  if (!isPlainObject(stored)) {
    return { ...DEFAULT_APP_SETTINGS };
  }

  let raw = stored;
  let version = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 0;

  while (version < CURRENT_SETTINGS_VERSION) {
    const migration = SETTINGS_MIGRATIONS.find((m) => m.fromVersion === version);
    if (!migration) break;
    raw = migration.migrate(raw);
    version = migration.toVersion;
  }

  return deepMerge(DEFAULT_APP_SETTINGS as unknown as PlainObj, raw) as unknown as AppSettings;
}
