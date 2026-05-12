import type { Document } from "./document";
import type { LinkedGroup } from "./layers";
import type { BatchJob } from "./batch";

export const PROJECT_FORMAT_VERSION = 1;
export const PROJECT_SCHEMA_VERSION = 4;
export const APP_VERSION = "0.3.0-phase3-grid";

export interface ProjectEnvelope {
  format: "SPP_PROJECT";
  version: typeof PROJECT_FORMAT_VERSION;
  projectVersion: string;
  appVersion: string;
  schemaVersion: number;
  document: Document;
  linkedGroups: LinkedGroup[];
  batchJobs: BatchJob[];
}
