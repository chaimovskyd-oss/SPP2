import { captureError, writeLog } from "@/core/logging/logger";
import type { ProjectEnvelope } from "@/types/project";
import { parseProject, serializeProject } from "./projectFormat";

export interface AutosaveRecord {
  id: string;
  projectId: string;
  projectName: string;
  savedAt: string;
  kind: "unsaved" | "json" | "spp";
  payload: string;
}

export interface AutosaveOptions {
  intervalMs?: number;
  storageKey?: string;
  maxRecords?: number;
}

const DEFAULT_STORAGE_KEY = "spp.v2.recovery";

export class AutosaveManager {
  private timer: number | null = null;
  private pending: ProjectEnvelope | null = null;

  constructor(private readonly options: AutosaveOptions = {}) {}

  schedule(project: ProjectEnvelope, kind: AutosaveRecord["kind"] = "unsaved"): void {
    this.pending = project;
    if (this.timer !== null) {
      return;
    }
    const delay = this.options.intervalMs ?? 2500;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.flush(kind);
    }, delay);
  }

  async flush(kind: AutosaveRecord["kind"] = "unsaved"): Promise<void> {
    if (this.pending === null) {
      return;
    }
    const project = this.pending;
    this.pending = null;
    await saveRecoveryRecord(project, kind, this.options);
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending = null;
  }
}

export async function saveRecoveryRecord(project: ProjectEnvelope, kind: AutosaveRecord["kind"], options: AutosaveOptions = {}): Promise<AutosaveRecord> {
  const record: AutosaveRecord = {
    id: crypto.randomUUID(),
    projectId: project.document.id,
    projectName: project.document.name,
    savedAt: new Date().toISOString(),
    kind,
    payload: serializeProject(project)
  };
  try {
    const records = getRecoveryRecords(options.storageKey);
    records.unshift(record);
    localStorage.setItem(options.storageKey ?? DEFAULT_STORAGE_KEY, JSON.stringify(records.slice(0, options.maxRecords ?? 10)));
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

export function restoreRecoveryRecord(record: AutosaveRecord): ProjectEnvelope {
  return parseProject(record.payload);
}

export function cleanupRecovery(maxAgeMs = 1000 * 60 * 60 * 24 * 14, storageKey = DEFAULT_STORAGE_KEY): void {
  const cutoff = Date.now() - maxAgeMs;
  const records = getRecoveryRecords(storageKey).filter((record) => new Date(record.savedAt).getTime() >= cutoff);
  localStorage.setItem(storageKey, JSON.stringify(records));
}
