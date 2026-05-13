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

const DEFAULT_STORAGE_KEY = "spp.v2.recovery";

export class AutosaveManager {
  private timer: number | null = null;
  private intervalTimer: number | null = null;
  private pending: ProjectEnvelope | null = null;
  private pendingKind: AutosaveRecord["kind"] = "unsaved";
  private changesSinceFlush = 0;
  private flushing = false;

  constructor(private readonly options: AutosaveOptions = {}) {}

  schedule(project: ProjectEnvelope, kind: AutosaveRecord["kind"] = "unsaved"): void {
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
    if (this.intervalTimer !== null) {
      return;
    }
    this.intervalTimer = window.setInterval(() => {
      if (this.pending !== null) {
        void this.flush(this.pendingKind);
      }
    }, this.options.intervalMs ?? 1000 * 60 * 2);
  }

  async flush(kind: AutosaveRecord["kind"] = "unsaved"): Promise<void> {
    if (this.pending === null || this.flushing) {
      return;
    }
    this.flushing = true;
    const project = this.pending;
    this.pending = null;
    try {
      await saveRecoveryRecord(project, kind, this.options);
      this.changesSinceFlush = 0;
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

export async function saveRecoveryRecord(project: ProjectEnvelope, kind: AutosaveRecord["kind"], options: AutosaveOptions = {}): Promise<AutosaveRecord> {
  const record: AutosaveRecord = {
    id: crypto.randomUUID(),
    projectId: project.metadata.internalUuid,
    projectName: project.document.name,
    savedAt: new Date().toISOString(),
    metadata: project.metadata,
    kind,
    payload: serializeProject(project)
  };
  try {
    const records = getRecoveryRecords(options.storageKey);
    records.unshift(record);
    localStorage.setItem(options.storageKey ?? DEFAULT_STORAGE_KEY, JSON.stringify(records.slice(0, options.maxRecords ?? 10)));
    recordProjectAutosaved(project, project.metadata.thumbnailPath, options.indexStorage);
    writeLog("recovery", "info", "נשמר autosave", { projectId: record.projectId, kind });
    return record;
  } catch (error) {
    captureError("recovery", error, { projectId: project.document.id });
    throw error;
  }
}

export function getRecoveryRecords(storageKey = DEFAULT_STORAGE_KEY): AutosaveRecord[] {
  if (typeof localStorage === "undefined") {
    return [];
  }
  const raw = localStorage.getItem(storageKey);
  if (raw === null) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as AutosaveRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getLatestRecoveryRecord(projectId?: string, storageKey = DEFAULT_STORAGE_KEY): AutosaveRecord | null {
  const records = getRecoveryRecords(storageKey).filter((record) => projectId === undefined || record.projectId === projectId);
  return records[0] ?? null;
}

export function getRecoveryEntries(storageKey = DEFAULT_STORAGE_KEY): RecoveryEntry[] {
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
  return parseProject(record.payload);
}

export function discardRecoveryRecord(recordId: string, storageKey = DEFAULT_STORAGE_KEY): void {
  const records = getRecoveryRecords(storageKey).filter((record) => record.id !== recordId);
  localStorage.setItem(storageKey, JSON.stringify(records));
}

export function cleanupRecovery(maxAgeMs = 1000 * 60 * 60 * 24 * 14, storageKey = DEFAULT_STORAGE_KEY): void {
  void maxAgeMs;
  void storageKey;
}
