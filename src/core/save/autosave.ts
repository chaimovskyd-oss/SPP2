import { captureError, writeLog } from "@/core/logging/logger";
import type { ProjectEnvelope, ProjectMetadata } from "@/types/project";
import { parseProject, serializeProject } from "./projectFormat";
import { recordProjectAutosaved, type ProjectLifecycleStorage } from "./projectLifecycle";

export interface AutosaveRecord {
  id: string;
  projectId: string;
  projectName: string;
  savedAt: string;
  metadata?: ProjectMetadata;
  kind: "unsaved" | "json" | "spp";
  payload: string;
}

export interface AutosaveOptions {
  intervalMs?: number;
  debounceMs?: number;
  actionThreshold?: number;
  storageKey?: string;
  maxRecords?: number;
  indexStorage?: ProjectLifecycleStorage;
  onResult?: (result: AutosaveResult) => void;
}

export interface RecoveryEntry {
  projectUuid: string;
  customerName: string;
  projectType: string;
  lastAutosavedAt: string;
  originalFilePath?: string;
  thumbnailPath?: string;
  recordId: string;
}

export type AutosaveFailureReason = "quota-exceeded" | "invalid-recovery" | "unknown";

export type AutosaveResult =
  | {
      ok: true;
      record: AutosaveRecord;
      estimatedSizeBytes: number;
      storageKey: string;
    }
  | {
      ok: false;
      reason: AutosaveFailureReason;
      estimatedSizeBytes: number;
      storageKey: string;
      message: string;
    };

const DEFAULT_STORAGE_KEY = "spp.v2.recovery";
const runtimeProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
const isAutosaveTestRuntime = runtimeProcess?.env?.VITEST === "true" || runtimeProcess?.env?.NODE_ENV === "test";
export const AUTOSAVE_TEMPORARILY_DISABLED = !isAutosaveTestRuntime;

export class AutosaveManager {
  private timer: number | null = null;
  private intervalTimer: number | null = null;
  private pending: ProjectEnvelope | null = null;
  private pendingKind: AutosaveRecord["kind"] = "unsaved";
  private changesSinceFlush = 0;
  private flushing = false;

  constructor(private readonly options: AutosaveOptions = {}) {}

  schedule(project: ProjectEnvelope, kind: AutosaveRecord["kind"] = "unsaved"): void {
    if (AUTOSAVE_TEMPORARILY_DISABLED) {
      this.stop();
      return;
    }
    this.pending = project;
    this.pendingKind = kind;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
    }
    const delay = this.options.debounceMs ?? this.options.intervalMs ?? 2500;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.flush(kind);
    }, delay);
  }

  recordMeaningfulChange(project: ProjectEnvelope, kind: AutosaveRecord["kind"] = "unsaved"): void {
    if (AUTOSAVE_TEMPORARILY_DISABLED) {
      this.stop();
      return;
    }
    this.pending = project;
    this.pendingKind = kind;
    this.changesSinceFlush += 1;
    this.ensureInterval();
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
    }
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.flush(this.pendingKind);
    }, this.options.debounceMs ?? 3000);
    if (this.changesSinceFlush >= (this.options.actionThreshold ?? 20)) {
      if (this.timer !== null) {
        window.clearTimeout(this.timer);
        this.timer = null;
      }
      void this.flush(kind);
    }
  }

  private ensureInterval(): void {
    if (AUTOSAVE_TEMPORARILY_DISABLED) {
      return;
    }
    if (this.intervalTimer !== null) {
      return;
    }
    this.intervalTimer = window.setInterval(() => {
      if (this.pending !== null) {
        void this.flush(this.pendingKind);
      }
    }, this.options.intervalMs ?? 1000 * 60 * 2);
  }

  async flush(kind: AutosaveRecord["kind"] = "unsaved"): Promise<AutosaveResult | null> {
    if (AUTOSAVE_TEMPORARILY_DISABLED) {
      this.stop();
      return null;
    }
    if (this.pending === null || this.flushing) {
      return null;
    }
    this.flushing = true;
    const project = this.pending;
    this.pending = null;
    try {
      const result = await saveRecoveryRecord(project, kind, this.options);
      if (result.ok) {
        this.changesSinceFlush = 0;
      }
      this.options.onResult?.(result);
      return result;
    } catch (error) {
      const result = autosaveErrorResult(error, project, this.options.storageKey);
      this.options.onResult?.(result);
      return result;
    } finally {
      this.flushing = false;
    }
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.intervalTimer !== null) {
      window.clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    this.pending = null;
  }
}

export async function saveRecoveryRecord(project: ProjectEnvelope, kind: AutosaveRecord["kind"], options: AutosaveOptions = {}): Promise<AutosaveResult> {
  const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
  if (AUTOSAVE_TEMPORARILY_DISABLED) {
    return {
      ok: false,
      reason: "unknown",
      estimatedSizeBytes: 0,
      storageKey,
      message: "Autosave is temporarily disabled for crash isolation."
    };
  }
  const payload = serializeProject(project);
  const estimatedSizeBytes = estimateStringBytes(payload);
  const record: AutosaveRecord = {
    id: crypto.randomUUID(),
    projectId: project.metadata.internalUuid,
    projectName: project.document.name,
    savedAt: new Date().toISOString(),
    metadata: project.metadata,
    kind,
    payload
  };

  if (!isValidRecoveryRecord(record)) {
    const result: AutosaveResult = {
      ok: false,
      reason: "invalid-recovery",
      estimatedSizeBytes,
      storageKey,
      message: "Autosave skipped because the recovery record is invalid."
    };
    logAutosaveDiagnostics(project, result);
    return result;
  }

  if (typeof localStorage === "undefined") {
    const result: AutosaveResult = {
      ok: false,
      reason: "unknown",
      estimatedSizeBytes,
      storageKey,
      message: "Autosave skipped because localStorage is unavailable."
    };
    logAutosaveDiagnostics(project, result);
    return result;
  }

  try {
    const records = getRecoveryRecords(storageKey);
    records.unshift(record);
    localStorage.setItem(storageKey, JSON.stringify(records.slice(0, options.maxRecords ?? 10)));
    recordProjectAutosaved(project, project.metadata.thumbnailPath, options.indexStorage);
    writeLog("recovery", "info", "נשמר autosave", { projectId: record.projectId, kind });
    const result: AutosaveResult = { ok: true, record, estimatedSizeBytes, storageKey };
    logAutosaveDiagnostics(project, result);
    return result;
  } catch (error) {
    captureError("recovery", error, { projectId: project.document.id });
    const result: AutosaveResult = {
      ok: false,
      reason: isQuotaExceededError(error) ? "quota-exceeded" : "unknown",
      estimatedSizeBytes,
      storageKey,
      message: error instanceof Error ? error.message : String(error)
    };
    writeLog("recovery", result.reason === "quota-exceeded" ? "warn" : "error", "Autosave failed", {
      projectId: record.projectId,
      kind,
      reason: result.reason,
      estimatedSizeBytes
    });
    logAutosaveDiagnostics(project, result);
    return result;
  }
}

export function getRecoveryRecords(storageKey = DEFAULT_STORAGE_KEY): AutosaveRecord[] {
  if (AUTOSAVE_TEMPORARILY_DISABLED) {
    return [];
  }
  if (typeof localStorage === "undefined") {
    return [];
  }
  const raw = localStorage.getItem(storageKey);
  if (raw === null) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as AutosaveRecord[];
    return Array.isArray(parsed) ? parsed.filter(isValidRecoveryRecord) : [];
  } catch {
    return [];
  }
}

export function getLatestRecoveryRecord(projectId?: string, storageKey = DEFAULT_STORAGE_KEY): AutosaveRecord | null {
  if (AUTOSAVE_TEMPORARILY_DISABLED) {
    return null;
  }
  const records = getRecoveryRecords(storageKey).filter((record) => projectId === undefined || record.projectId === projectId);
  return records[0] ?? null;
}

export function getRecoveryEntries(storageKey = DEFAULT_STORAGE_KEY): RecoveryEntry[] {
  if (AUTOSAVE_TEMPORARILY_DISABLED) {
    return [];
  }
  return getRecoveryRecords(storageKey).map((record) => ({
    projectUuid: record.metadata?.projectUuid ?? record.projectId,
    customerName: record.metadata?.customerName ?? "",
    projectType: record.metadata?.projectType ?? "Collage",
    lastAutosavedAt: record.savedAt,
    originalFilePath: record.metadata?.originalFilePath,
    thumbnailPath: record.metadata?.thumbnailPath,
    recordId: record.id
  }));
}

export function restoreRecoveryRecord(record: AutosaveRecord): ProjectEnvelope {
  if (AUTOSAVE_TEMPORARILY_DISABLED) {
    throw new Error("Recovery is temporarily disabled for crash isolation.");
  }
  if (!isValidRecoveryRecord(record)) {
    throw new Error("Recovery record is invalid.");
  }
  return parseProject(record.payload);
}

export function discardRecoveryRecord(recordId: string, storageKey = DEFAULT_STORAGE_KEY): void {
  if (AUTOSAVE_TEMPORARILY_DISABLED) {
    return;
  }
  const records = getRecoveryRecords(storageKey).filter((record) => record.id !== recordId);
  localStorage.setItem(storageKey, JSON.stringify(records));
}

export function cleanupRecovery(maxAgeMs = 1000 * 60 * 60 * 24 * 14, storageKey = DEFAULT_STORAGE_KEY): void {
  if (AUTOSAVE_TEMPORARILY_DISABLED) {
    return;
  }
  if (typeof localStorage === "undefined") return;
  const cutoff = Date.now() - maxAgeMs;
  const records = getRecoveryRecords(storageKey);
  const fresh = records.filter((record) => {
    const ts = Date.parse(record.savedAt);
    return Number.isFinite(ts) && ts >= cutoff;
  });
  if (fresh.length === records.length) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(fresh));
  } catch (error) {
    captureError("recovery", error, { context: "cleanupRecovery" });
  }
}

export function estimateStringBytes(value: string): number {
  try {
    if (typeof Blob !== "undefined") {
      return new Blob([value]).size;
    }
  } catch {
    // Fall through to the conservative UTF-16 estimate.
  }
  return value.length * 2;
}

export function isQuotaExceededError(error: unknown): boolean {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return (
      error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      error.code === 22 ||
      error.code === 1014
    );
  }
  if (typeof error === "object" && error !== null) {
    const candidate = error as { name?: unknown; code?: unknown };
    return (
      candidate.name === "QuotaExceededError" ||
      candidate.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      candidate.code === 22 ||
      candidate.code === 1014
    );
  }
  return false;
}

export function isValidRecoveryRecord(record: unknown): record is AutosaveRecord {
  if (typeof record !== "object" || record === null) return false;
  const candidate = record as Partial<AutosaveRecord>;
  if (typeof candidate.id !== "string" || candidate.id.length === 0) return false;
  if (typeof candidate.projectId !== "string" || candidate.projectId.length === 0) return false;
  if (typeof candidate.projectName !== "string") return false;
  if (typeof candidate.savedAt !== "string" || Number.isNaN(Date.parse(candidate.savedAt))) return false;
  if (candidate.kind !== "unsaved" && candidate.kind !== "json" && candidate.kind !== "spp") return false;
  if (typeof candidate.payload !== "string" || candidate.payload.length === 0) return false;
  try {
    const envelope = parseProject(candidate.payload);
    return (
      envelope.format === "SPP_PROJECT" &&
      typeof envelope.metadata?.internalUuid === "string" &&
      envelope.metadata.internalUuid.length > 0 &&
      Array.isArray(envelope.document?.pages) &&
      envelope.document.pages.length > 0
    );
  } catch {
    return false;
  }
}

function autosaveErrorResult(error: unknown, project: ProjectEnvelope, storageKey = DEFAULT_STORAGE_KEY): AutosaveResult {
  let estimatedSizeBytes = 0;
  try {
    estimatedSizeBytes = estimateStringBytes(serializeProject(project));
  } catch {
    estimatedSizeBytes = 0;
  }
  const result: AutosaveResult = {
    ok: false,
    reason: isQuotaExceededError(error) ? "quota-exceeded" : "unknown",
    estimatedSizeBytes,
    storageKey,
    message: error instanceof Error ? error.message : String(error)
  };
  logAutosaveDiagnostics(project, result);
  return result;
}

function logAutosaveDiagnostics(project: ProjectEnvelope, result: AutosaveResult): void {
  if (!import.meta.env.DEV) return;
  const pagesCount = project.document.pages.length;
  const assetsCount = project.document.assets.length;
  const estimatedSizeMb = Number((result.estimatedSizeBytes / 1024 / 1024).toFixed(2));
  console.debug("[SPP autosave]", {
    ok: result.ok,
    pagesCount,
    assetsCount,
    estimatedSizeMb,
    storageTarget: result.storageKey,
    failureReason: result.ok ? undefined : result.reason
  });
}
