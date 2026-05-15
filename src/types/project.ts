import type { Document } from "./document";
import type { LinkedGroup } from "./layers";
import type { BatchJob } from "./batch";

export const PROJECT_FORMAT_VERSION = 1;
export const PROJECT_SCHEMA_VERSION = 7;
export const APP_VERSION = "0.5.0-phase5-collage";

export type ProjectState =
  | "clean"
  | "modified"
  | "autosaving"
  | "autosaved"
  | "save_failed"
  | "recovery_available"
  | "missing_assets"
  | "relink_required"
  | "corrupted"
  | "read_only";

export interface ProjectCustomerInfo {
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  phoneNumber: string;
  email?: string;
}

export interface ProjectMetadata extends ProjectCustomerInfo {
  customerPhone: string;
  projectUuid: string;
  projectType: string;
  fileFormatVersion: number;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
  originalFilePath?: string;
  currentFilePath?: string;
  thumbnailPath?: string;
  projectState: ProjectState;
  internalUuid: string;
}

export type ProjectMetadataInput = Partial<ProjectCustomerInfo> & {
  projectUuid?: string;
  projectType?: string;
  fileFormatVersion?: number;
  createdAt?: string;
  updatedAt?: string;
  lastOpenedAt?: string;
  originalFilePath?: string;
  currentFilePath?: string;
  thumbnailPath?: string;
  projectState?: ProjectState;
  internalUuid?: string;
};

export interface ProjectEnvelope {
  format: "SPP_PROJECT";
  version: typeof PROJECT_FORMAT_VERSION;
  projectVersion: string;
  appVersion: string;
  schemaVersion: number;
  metadata: ProjectMetadata;
  document: Document;
  linkedGroups: LinkedGroup[];
  batchJobs: BatchJob[];
}
