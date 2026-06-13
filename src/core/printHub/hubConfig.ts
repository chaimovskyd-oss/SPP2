// Hub-level config stored in <hubRoot>/config/hub.json — the Print Hub server's own settings
// (retention, LAN port, pairing token). Shared with `serverMain.ts` readRetentionDays(), so this
// module reads/merges the SAME file rather than introducing a second config.
//
// NODE-ONLY — runs in the Print Hub Server / Electron main, never the renderer.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_LAN_PORT = 8788;

export interface HubConfig {
  /** Days to keep jobs in Done/Archive before auto-purge. 0 = keep forever. */
  retentionDays?: number;
  /** TCP port the LAN ingest server listens on. */
  lanPort?: number;
  /** Shared secret a design station must present (X-SPP-Token) to submit jobs over LAN. */
  pairingToken?: string;
}

function hubConfigPath(hubRoot: string): string {
  return path.join(hubRoot, "config", "hub.json");
}

export function loadHubConfig(hubRoot: string): HubConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(hubConfigPath(hubRoot), "utf-8")) as unknown;
    return raw && typeof raw === "object" ? (raw as HubConfig) : {};
  } catch {
    return {};
  }
}

/** Merges `patch` into the existing hub.json (never clobbering unrelated keys like retentionDays). */
export function saveHubConfig(hubRoot: string, patch: Partial<HubConfig>): HubConfig {
  const merged = { ...loadHubConfig(hubRoot), ...patch };
  const file = hubConfigPath(hubRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(merged, null, 2), "utf-8");
  fs.renameSync(tmp, file);
  return merged;
}

export function getLanPort(hubRoot: string): number {
  const p = loadHubConfig(hubRoot).lanPort;
  return typeof p === "number" && p > 0 && p < 65536 ? p : DEFAULT_LAN_PORT;
}

// Crockford-ish base32 without ambiguous chars (no I/L/O/U/0/1) → easy to read aloud / retype.
const TOKEN_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

function randomToken(): string {
  const bytes = crypto.randomBytes(8);
  let raw = "";
  for (let i = 0; i < 8; i += 1) raw += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  return `${raw.slice(0, 4)}-${raw.slice(4)}`; // XXXX-XXXX
}

/** Returns the hub's pairing token, generating + persisting one on first use. Idempotent. */
export function getOrCreatePairingToken(hubRoot: string): string {
  const cfg = loadHubConfig(hubRoot);
  if (typeof cfg.pairingToken === "string" && cfg.pairingToken.length > 0) return cfg.pairingToken;
  const token = randomToken();
  saveHubConfig(hubRoot, { pairingToken: token });
  return token;
}

/** Rotates the pairing token (operator "generate new code"). Returns the new token. */
export function rotatePairingToken(hubRoot: string): string {
  const token = randomToken();
  saveHubConfig(hubRoot, { pairingToken: token });
  return token;
}

/** Constant-time token comparison (avoids timing leaks). Normalizes case + hyphen. */
export function tokensMatch(a: string, b: string): boolean {
  const norm = (s: string): string => s.replace(/[-\s]/g, "").toUpperCase();
  const na = Buffer.from(norm(a));
  const nb = Buffer.from(norm(b));
  if (na.length === 0 || na.length !== nb.length) return false;
  return crypto.timingSafeEqual(na, nb);
}
