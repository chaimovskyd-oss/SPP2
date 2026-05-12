import type { Document } from "./document";
import type { LinkedGroup } from "./layers";
import type { BatchJob } from "./batch";

export const PROJECT_FORMAT_VERSION = 1;
export const PROJECT_SCHEMA_VERSION = 4;
export const APP_VERSION = "0.3.0-phase3-grid";

export interface ProjectCustomerInfo {
  customerName: string;
  phoneNumber: string;
  email?: string;
}

export interface ProjectMetadata extends ProjectCustomerInfo {
  projectType: string;
  createdAt: string;
  updatedAt: string;
  internalUuid: string;
}

export type ProjectMetadataInput = Partial<ProjectCustomerInfo> & {
  projectType?: string;
  createdAt?: string;
  updatedAt?: string;
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
