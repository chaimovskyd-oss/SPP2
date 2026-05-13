import { captureError, writeLog } from "@/core/logging/logger";
import { createProjectMetadata, getProjectMetadata, withProjectMetadata } from "@/core/projectMetadata";
import type { Asset, Document } from "@/types/document";
import type { ProjectEnvelope, ProjectMetadata, ProjectState } from "@/types/project";
import { parseProject, serializeProject } from "./projectFormat";

export interface ProjectIndexEntry {
  projectUuid: string;
  displayName: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  projectType: string;
  filePath?: string;
  thumbnailPath?: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
  lastSavedAt?: string;
  lastAutosavedAt?: string;
  fileExists: boolean;
  isCorrupted: boolean;
  hasRecovery: boolean;
  projectState: ProjectState;
}

export interface ProjectIndex {
  version: 1;
  updatedAt: string;
  entries: ProjectIndexEntry[];
}

export interface ProjectValidationResult {
  ok: boolean;
  projectState: ProjectState;
  missingAssets: Asset[];
  errors: string[];
  warnings: string[];
}

export interface ProjectLifecycleStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
}

export interface ProjectIndexUpdateOptions {
  filePath?: string;
  thumbnailPath?: string;
  lastSavedAt?: string;
  lastAutosavedAt?: string;
  hasRecovery?: boolean;
  fileExists?: boolean;
  isCorrupted?: boolean;
  projectState?: ProjectState;
}

export const PROJECT_INDEX_STORAGE_KEY = "spp.v2.projectIndex";

function nowIso(): string {
  return new Date().toISOString();
}

function storageOrNull(storage?: ProjectLifecycleStorage): ProjectLifecycleStorage | null {
  if (storage !== undefined) return storage;
  return typeof localStorage === "undefined" ? null : localStorage;
}

export function readProjectIndex(storage?: ProjectLifecycleStorage, storageKey = PROJECT_INDEX_STORAGE_KEY): ProjectIndex {
  const target = storageOrNull(storage);
  if (target === null) {
    return { version: 1, updatedAt: nowIso(), entries: [] };
  }
  const raw = target.getItem(storageKey);
  if (raw === null) {
    return { version: 1, updatedAt: nowIso(), entries: [] };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ProjectIndex>;
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : nowIso(),
      entries: Array.isArray(parsed.entries) ? parsed.entries.flatMap(coerceIndexEntry) : []
    };
  } catch (error) {
    captureError("app", error);
    return { version: 1, updatedAt: nowIso(), entries: [] };
  }
}

export function writeProjectIndex(index: ProjectIndex, storage?: ProjectLifecycleStorage, storageKey = PROJECT_INDEX_STORAGE_KEY): void {
  const target = storageOrNull(storage);
  if (target === null) return;
  target.setItem(storageKey, JSON.stringify({ ...index, updatedAt: nowIso() }));
}

export function getProjectIndexEntries(storage?: ProjectLifecycleStorage, storageKey = PROJECT_INDEX_STORAGE_KEY): ProjectIndexEntry[] {
  return readProjectIndex(storage, storageKey).entries
    .slice()
    .sort((a, b) => new Date(b.lastOpenedAt ?? b.updatedAt).getTime() - new Date(a.lastOpenedAt ?? a.updatedAt).getTime());
}

export function createProjectIndexEntry(project: ProjectEnvelope, options: ProjectIndexUpdateOptions = {}): ProjectIndexEntry {
  const metadata = project.metadata;
  const filePath = options.filePath ?? metadata.currentFilePath;
  const projectState = options.projectState ?? metadata.projectState;
  return {
    projectUuid: metadata.projectUuid,
    displayName: project.document.name,
    customerName: metadata.customerName,
    customerPhone: metadata.customerPhone,
    customerEmail: metadata.customerEmail,
    projectType: metadata.projectType,
    filePath,
    thumbnailPath: options.thumbnailPath ?? metadata.thumbnailPath,
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
    lastOpenedAt: metadata.lastOpenedAt,
    lastSavedAt: options.lastSavedAt,
    lastAutosavedAt: options.lastAutosavedAt,
    fileExists: options.fileExists ?? filePath !== undefined,
    isCorrupted: options.isCorrupted ?? false,
    hasRecovery: options.hasRecovery ?? (projectState === "recovery_available" || projectState === "autosaved"),
    projectState
  };
}

export function upsertProjectIndexEntry(
  entry: ProjectIndexEntry,
  storage?: ProjectLifecycleStorage,
  storageKey = PROJECT_INDEX_STORAGE_KEY
): ProjectIndexEntry {
  const index = readProjectIndex(storage, storageKey);
  const existing = index.entries.find((item) => item.projectUuid === entry.projectUuid);
  const nextEntry = existing === undefined
    ? entry
    : {
        ...existing,
        ...entry,
        hasRecovery: entry.hasRecovery,
        lastAutosavedAt: entry.lastAutosavedAt ?? existing.lastAutosavedAt,
        lastSavedAt: entry.lastSavedAt ?? existing.lastSavedAt
      };
  const entries = [nextEntry, ...index.entries.filter((item) => item.projectUuid !== entry.projectUuid)];
  writeProjectIndex({ version: 1, updatedAt: nowIso(), entries }, storage, storageKey);
  return nextEntry;
}

export function recordProjectOpened(project: ProjectEnvelope, filePath?: string, storage?: ProjectLifecycleStorage): ProjectEnvelope {
  const openedAt = nowIso();
  const metadata = createProjectMetadata(
    {
      ...project.metadata,
      lastOpenedAt: openedAt,
      currentFilePath: filePath ?? project.metadata.currentFilePath,
      originalFilePath: project.metadata.originalFilePath ?? filePath ?? project.metadata.currentFilePath,
      projectState: "clean"
    },
    project.document
  );
  const next = { ...project, metadata, document: withProjectMetadata(project.document, metadata) };
  upsertProjectIndexEntry(createProjectIndexEntry(next, { filePath, fileExists: true, projectState: "clean" }), storage);
  return next;
}

export function recordProjectSaved(project: ProjectEnvelope, filePath?: string, thumbnailPath?: string, storage?: ProjectLifecycleStorage): ProjectEnvelope {
  const savedAt = nowIso();
  const metadata = createProjectMetadata(
    {
      ...project.metadata,
      updatedAt: savedAt,
      currentFilePath: filePath ?? project.metadata.currentFilePath,
      originalFilePath: project.metadata.originalFilePath ?? filePath ?? project.metadata.currentFilePath,
      thumbnailPath: thumbnailPath ?? project.metadata.thumbnailPath,
      projectState: "clean"
    },
    project.document
  );
  const next = { ...project, metadata, document: withProjectMetadata({ ...project.document, modifiedAt: savedAt }, metadata) };
  upsertProjectIndexEntry(createProjectIndexEntry(next, { filePath, thumbnailPath, lastSavedAt: savedAt, fileExists: true, hasRecovery: false, projectState: "clean" }), storage);
  return next;
}

export function recordProjectAutosaved(project: ProjectEnvelope, thumbnailPath?: string, storage?: ProjectLifecycleStorage): ProjectIndexEntry {
  const autosavedAt = nowIso();
  const entry = createProjectIndexEntry(project, {
    thumbnailPath: thumbnailPath ?? project.metadata.thumbnailPath,
    lastAutosavedAt: autosavedAt,
    hasRecovery: true,
    projectState: "autosaved",
    fileExists: project.metadata.currentFilePath !== undefined
  });
  return upsertProjectIndexEntry(entry, storage);
}

export function cloneProjectForSaveAs(project: ProjectEnvelope, filePath?: string): ProjectEnvelope {
  const createdAt = nowIso();
  const projectUuid = crypto.randomUUID();
  const metadata = createProjectMetadata(
    {
      ...project.metadata,
      projectUuid,
      internalUuid: projectUuid,
      createdAt,
      updatedAt: createdAt,
      lastOpenedAt: createdAt,
      originalFilePath: filePath,
      currentFilePath: filePath,
      projectState: "clean"
    },
    project.document
  );
  return {
    ...project,
    metadata,
    document: withProjectMetadata({ ...project.document, id: projectUuid, createdAt, modifiedAt: createdAt }, metadata)
  };
}

export function validateProjectEnvelope(project: ProjectEnvelope): ProjectValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (project.format !== "SPP_PROJECT") errors.push("Unsupported project format");
  if (project.metadata.projectUuid.length === 0) errors.push("Missing projectUuid");
  if (project.metadata.projectType.length === 0) errors.push("Missing projectType");
  if (project.document.pages.length === 0) errors.push("Project has no pages");
  const missingAssets = findMissingProjectAssets(project.document);
  if (missingAssets.length > 0) warnings.push("Some project assets are missing");
  return {
    ok: errors.length === 0,
    projectState: errors.length > 0 ? "corrupted" : missingAssets.length > 0 ? "missing_assets" : project.metadata.projectState,
    missingAssets,
    errors,
    warnings
  };
}

export function validateSerializedProject(payload: string): { project: ProjectEnvelope | null; validation: ProjectValidationResult } {
  try {
    const project = parseProject(payload);
    return { project, validation: validateProjectEnvelope(project) };
  } catch (error) {
    return {
      project: null,
      validation: {
        ok: false,
        projectState: "corrupted",
        missingAssets: [],
        errors: [error instanceof Error ? error.message : "Project could not be read"],
        warnings: []
      }
    };
  }
}

export function serializeProjectForLifecycle(project: ProjectEnvelope): string {
  return serializeProject(project);
}

export function markIndexEntryMissing(projectUuid: string, storage?: ProjectLifecycleStorage): ProjectIndexEntry | null {
  const index = readProjectIndex(storage);
  const entry = index.entries.find((item) => item.projectUuid === projectUuid);
  if (entry === undefined) return null;
  const next = { ...entry, fileExists: false, projectState: "relink_required" as const };
  upsertProjectIndexEntry(next, storage);
  return next;
}

export function markIndexEntryCorrupted(projectUuid: string, storage?: ProjectLifecycleStorage): ProjectIndexEntry | null {
  const index = readProjectIndex(storage);
  const entry = index.entries.find((item) => item.projectUuid === projectUuid);
  if (entry === undefined) return null;
  const next = { ...entry, isCorrupted: true, projectState: "corrupted" as const };
  upsertProjectIndexEntry(next, storage);
  return next;
}

function findMissingProjectAssets(document: Document): Asset[] {
  return document.assets.filter((asset) => asset.status === "missing" || (asset.kind === "image" && asset.originalPath === undefined && asset.previewPath === undefined));
}

function coerceIndexEntry(value: unknown): ProjectIndexEntry[] {
  if (typeof value !== "object" || value === null) return [];
  const candidate = value as Partial<ProjectIndexEntry>;
  if (typeof candidate.projectUuid !== "string" || candidate.projectUuid.length === 0) return [];
  return [{
    projectUuid: candidate.projectUuid,
    displayName: typeof candidate.displayName === "string" ? candidate.displayName : "Untitled project",
    customerName: typeof candidate.customerName === "string" ? candidate.customerName : "",
    customerPhone: typeof candidate.customerPhone === "string" ? candidate.customerPhone : "",
    customerEmail: typeof candidate.customerEmail === "string" ? candidate.customerEmail : undefined,
    projectType: typeof candidate.projectType === "string" ? candidate.projectType : "Collage",
    filePath: typeof candidate.filePath === "string" ? candidate.filePath : undefined,
    thumbnailPath: typeof candidate.thumbnailPath === "string" ? candidate.thumbnailPath : undefined,
    createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : nowIso(),
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : nowIso(),
    lastOpenedAt: typeof candidate.lastOpenedAt === "string" ? candidate.lastOpenedAt : undefined,
    lastSavedAt: typeof candidate.lastSavedAt === "string" ? candidate.lastSavedAt : undefined,
    lastAutosavedAt: typeof candidate.lastAutosavedAt === "string" ? candidate.lastAutosavedAt : undefined,
    fileExists: candidate.fileExists !== false,
    isCorrupted: candidate.isCorrupted === true,
    hasRecovery: candidate.hasRecovery === true,
    projectState: candidate.projectState ?? "clean"
  }];
}

export function logLifecycleFailure(area: string, error: unknown, context?: Record<string, unknown>): void {
  captureError("app", error, { area, ...context });
}

export function logLifecycleInfo(area: string, message: string, context?: Record<string, unknown>): void {
  writeLog("app", "info", message, { area, ...context });
}
