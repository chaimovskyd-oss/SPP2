import { PROJECT_FORMAT_VERSION, type ProjectEnvelope } from "@/types/project";
import { migrateProjectTextLayers } from "../text/migration";

export function createProjectEnvelope(input: Omit<ProjectEnvelope, "format" | "version">): ProjectEnvelope {
  return {
    format: "SPP_PROJECT",
    version: PROJECT_FORMAT_VERSION,
    ...input
  };
}

export function serializeProject(project: ProjectEnvelope): string {
  return JSON.stringify(project, null, 2);
}

export function parseProject(json: string): ProjectEnvelope {
  const parsed = JSON.parse(json) as unknown;
  if (!isProjectEnvelope(parsed)) {
    throw new Error("Invalid SPP project envelope");
  }
  if (parsed.version !== PROJECT_FORMAT_VERSION) {
    throw new Error(`Unsupported SPP project version: ${parsed.version}`);
  }
  return migrateProjectTextLayers(parsed);
}

function isProjectEnvelope(value: unknown): value is ProjectEnvelope {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<ProjectEnvelope>;
  return (
    candidate.format === "SPP_PROJECT" &&
    candidate.version === PROJECT_FORMAT_VERSION &&
    typeof candidate.document === "object" &&
    Array.isArray(candidate.linkedGroups) &&
    Array.isArray(candidate.batchJobs)
  );
}
