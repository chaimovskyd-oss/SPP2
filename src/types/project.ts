import type { Document } from "./document";
import type { LinkedGroup } from "./layers";
import type { BatchJob } from "./batch";

export const PROJECT_FORMAT_VERSION = 1;

export interface ProjectEnvelope {
  format: "SPP_PROJECT";
  version: typeof PROJECT_FORMAT_VERSION;
  document: Document;
  linkedGroups: LinkedGroup[];
  batchJobs: BatchJob[];
}
