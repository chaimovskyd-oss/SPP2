import { APP_VERSION, PROJECT_FORMAT_VERSION, PROJECT_SCHEMA_VERSION, type ProjectEnvelope } from "@/types/project";
import { getProjectMetadataForEnvelope } from "@/core/projectMetadata";
import { normalizeProjectEnvelope } from "./migrations";

export function createProjectEnvelope(input: Omit<ProjectEnvelope, "format" | "version" | "projectVersion" | "appVersion" | "schemaVersion" | "metadata"> & Partial<Pick<ProjectEnvelope, "projectVersion" | "appVersion" | "schemaVersion" | "metadata">>): ProjectEnvelope {
  const metadata = input.metadata ?? getProjectMetadataForEnvelope(input.document);
  return {
    format: "SPP_PROJECT",
    version: PROJECT_FORMAT_VERSION,
    projectVersion: input.projectVersion ?? String(PROJECT_FORMAT_VERSION),
    appVersion: input.appVersion ?? APP_VERSION,
    schemaVersion: input.schemaVersion ?? PROJECT_SCHEMA_VERSION,
    ...input,
    metadata
  };
}

export function serializeProject(project: ProjectEnvelope): string {
  return JSON.stringify(project, null, 2);
}

export function parseProject(json: string): ProjectEnvelope {
  const parsed = JSON.parse(json) as unknown;
  return normalizeProjectEnvelope(parsed);
}
