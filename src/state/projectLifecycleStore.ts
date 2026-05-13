import { create } from "zustand";
import type { ProjectEnvelope, ProjectState } from "@/types/project";
import {
  createProjectEnvelope,
  recordProjectOpened,
  recordProjectSaved,
  upsertProjectIndexEntry,
  createProjectIndexEntry,
  validateProjectEnvelope
} from "@/core";
import type { Document } from "@/types/document";

export interface ProjectLifecycleSession {
  projectUuid: string | null;
  currentFilePath: string | null;
  originalFilePath: string | null;
  projectState: ProjectState;
  isDirty: boolean;
  lastSavedAt: string | null;
  lastAutosavedAt: string | null;
  lastError: string | null;
}

export interface ProjectLifecycleState extends ProjectLifecycleSession {
  beginProject: (project: ProjectEnvelope, filePath?: string | null) => ProjectEnvelope;
  markDirty: () => void;
  markAutosaving: () => void;
  markAutosaved: (project: ProjectEnvelope) => void;
  markSaved: (project: ProjectEnvelope, filePath?: string | null, thumbnailPath?: string | null) => ProjectEnvelope;
  markSaveFailed: (message: string) => void;
  setReadOnly: () => void;
  resetLifecycle: () => void;
}

const initialSession: ProjectLifecycleSession = {
  projectUuid: null,
  currentFilePath: null,
  originalFilePath: null,
  projectState: "clean",
  isDirty: false,
  lastSavedAt: null,
  lastAutosavedAt: null,
  lastError: null
};

export const useProjectLifecycleStore = create<ProjectLifecycleState>((set) => ({
  ...initialSession,
  beginProject: (project, filePath) => {
    const opened = recordProjectOpened(project, filePath ?? project.metadata.currentFilePath);
    const validation = validateProjectEnvelope(opened);
    set({
      projectUuid: opened.metadata.projectUuid,
      currentFilePath: opened.metadata.currentFilePath ?? filePath ?? null,
      originalFilePath: opened.metadata.originalFilePath ?? filePath ?? null,
      projectState: validation.projectState === "clean" ? "clean" : validation.projectState,
      isDirty: false,
      lastSavedAt: null,
      lastAutosavedAt: null,
      lastError: validation.errors[0] ?? null
    });
    upsertProjectIndexEntry(createProjectIndexEntry(opened, { filePath: filePath ?? undefined, projectState: validation.projectState }));
    return opened;
  },
  markDirty: () =>
    set((state) => ({
      isDirty: true,
      projectState: state.projectState === "read_only" ? "read_only" : "modified",
      lastError: null
    })),
  markAutosaving: () =>
    set((state) => ({
      projectState: state.isDirty ? "autosaving" : state.projectState
    })),
  markAutosaved: (project) =>
    set(() => ({
      projectUuid: project.metadata.projectUuid,
      projectState: "autosaved",
      lastAutosavedAt: new Date().toISOString(),
      lastError: null
    })),
  markSaved: (project, filePath, thumbnailPath) => {
    const saved = recordProjectSaved(project, filePath ?? project.metadata.currentFilePath, thumbnailPath ?? project.metadata.thumbnailPath);
    set({
      projectUuid: saved.metadata.projectUuid,
      currentFilePath: saved.metadata.currentFilePath ?? filePath ?? null,
      originalFilePath: saved.metadata.originalFilePath ?? filePath ?? null,
      projectState: "clean",
      isDirty: false,
      lastSavedAt: saved.metadata.updatedAt,
      lastError: null
    });
    return saved;
  },
  markSaveFailed: (message) =>
    set({
      projectState: "save_failed",
      isDirty: true,
      lastError: message
    }),
  setReadOnly: () => set({ projectState: "read_only" }),
  resetLifecycle: () => set(initialSession)
}));

export function createEnvelopeFromDocument(document: Document): ProjectEnvelope {
  return createProjectEnvelope({
    document,
    linkedGroups: [],
    batchJobs: []
  });
}
