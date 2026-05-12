import type { Document } from "@/types/document";
import type { JsonValue } from "@/types/primitives";
import type { ProjectMetadata, ProjectMetadataInput } from "@/types/project";

export const DOCUMENT_PROJECT_METADATA_KEY = "projectMetadata";
const DEFAULT_PROJECT_TYPE = "Collage";
const GENERATED_FILENAME_REGISTRY_KEY = "spp.v2.generatedProjectFilenames";
const MAX_FILENAME_BASE_LENGTH = 96;

export interface ProjectFilenameOptions {
  extension?: string;
  existingNames?: Iterable<string>;
  reserve?: boolean;
  storageKey?: string;
}

export function createProjectMetadata(input: ProjectMetadataInput = {}, document?: Pick<Document, "id" | "createdAt" | "modifiedAt" | "metadata">): ProjectMetadata {
  const previous = document === undefined ? null : getProjectMetadata(document);
  const createdAt = input.createdAt ?? previous?.createdAt ?? document?.createdAt ?? new Date().toISOString();
  const updatedAt = input.updatedAt ?? document?.modifiedAt ?? previous?.updatedAt ?? createdAt;
  return {
    customerName: normalizeProjectText(input.customerName ?? previous?.customerName ?? ""),
    phoneNumber: normalizeProjectText(input.phoneNumber ?? previous?.phoneNumber ?? ""),
    email: normalizeOptionalProjectText(input.email ?? previous?.email),
    projectType: normalizeProjectText(input.projectType ?? previous?.projectType ?? inferProjectType(document) ?? DEFAULT_PROJECT_TYPE) || DEFAULT_PROJECT_TYPE,
    createdAt,
    updatedAt,
    internalUuid: normalizeProjectText(input.internalUuid ?? previous?.internalUuid ?? document?.id ?? crypto.randomUUID())
  };
}

export function withProjectMetadata<T extends Document>(document: T, input: ProjectMetadataInput = {}): T {
  const metadata = createProjectMetadata(input, document);
  return {
    ...document,
    metadata: {
      ...document.metadata,
      [DOCUMENT_PROJECT_METADATA_KEY]: metadata as unknown as JsonValue
    }
  };
}

export function getProjectMetadata(document: Pick<Document, "metadata">): ProjectMetadata | null {
  return coerceProjectMetadata(document.metadata[DOCUMENT_PROJECT_METADATA_KEY]);
}

export function getProjectMetadataForEnvelope(document: Document): ProjectMetadata {
  return createProjectMetadata({}, document);
}

export function touchProjectMetadata<T extends Document>(document: T, updatedAt = new Date().toISOString()): T {
  return withProjectMetadata(
    {
      ...document,
      modifiedAt: updatedAt
    },
    { updatedAt }
  );
}

export function createDefaultProjectFilename(metadata: ProjectMetadata, options: ProjectFilenameOptions = {}): string {
  const extension = normalizeExtension(options.extension ?? ".spp2");
  const date = datePart(metadata.createdAt);
  const baseParts = [
    sanitizeFilenameSegment(metadata.customerName || "Unknown", "Unknown"),
    phoneLast4(metadata.phoneNumber),
    sanitizeFilenameSegment(metadata.projectType || DEFAULT_PROJECT_TYPE, DEFAULT_PROJECT_TYPE),
    date
  ].filter((part) => part.length > 0);
  const base = truncateFilenameBase(baseParts.join("_"));
  const existing = new Set([...(options.existingNames ?? []), ...readFilenameRegistry(options.storageKey)]);
  const filename = uniqueFilename(`${base}${extension}`, existing);
  if (options.reserve !== false) {
    reserveGeneratedFilename(filename, options.storageKey);
  }
  return filename;
}

export function sanitizeFilenameSegment(value: string, fallback: string): string {
  const normalized = value
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s/g, "");
  const withoutTrailingDots = normalized.replace(/[. ]+$/g, "");
  const safe = withoutTrailingDots.length > 0 ? withoutTrailingDots : fallback;
  return isReservedWindowsName(safe) ? `${safe}_` : safe;
}

export function safeFilename(name: string, fallback = "spp-project"): string {
  const safe = name
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  const normalized = safe.length > 0 ? safe : fallback;
  return truncateFilenameBase(isReservedWindowsName(normalized) ? `${normalized}_` : normalized);
}

function coerceProjectMetadata(value: unknown): ProjectMetadata | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Partial<ProjectMetadata>;
  return {
    customerName: normalizeProjectText(candidate.customerName),
    phoneNumber: normalizeProjectText(candidate.phoneNumber),
    email: normalizeOptionalProjectText(candidate.email),
    projectType: normalizeProjectText(candidate.projectType) || DEFAULT_PROJECT_TYPE,
    createdAt: normalizeProjectText(candidate.createdAt) || new Date().toISOString(),
    updatedAt: normalizeProjectText(candidate.updatedAt) || new Date().toISOString(),
    internalUuid: normalizeProjectText(candidate.internalUuid) || crypto.randomUUID()
  };
}

function inferProjectType(document: Pick<Document, "metadata"> | undefined): string | undefined {
  const mode = document?.metadata["mode"];
  if (typeof mode !== "string" || mode.length === 0) {
    return undefined;
  }
  return mode.charAt(0).toUpperCase() + mode.slice(1);
}

function normalizeProjectText(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFC").replace(/\s+/g, " ").trim() : "";
}

function normalizeOptionalProjectText(value: unknown): string | undefined {
  const normalized = normalizeProjectText(value);
  return normalized.length > 0 ? normalized : undefined;
}

function phoneLast4(phoneNumber: string): string {
  return phoneNumber.replace(/\D/g, "").slice(-4);
}

function datePart(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return parsed.toISOString().slice(0, 10);
}

function truncateFilenameBase(base: string): string {
  return base.length > MAX_FILENAME_BASE_LENGTH ? base.slice(0, MAX_FILENAME_BASE_LENGTH).replace(/[._-]+$/g, "") : base;
}

function normalizeExtension(extension: string): string {
  const clean = extension.trim();
  return clean.startsWith(".") ? clean : `.${clean}`;
}

function uniqueFilename(filename: string, existingNames: Set<string>): string {
  if (!existingNames.has(filename)) {
    return filename;
  }
  const dot = filename.lastIndexOf(".");
  const base = dot >= 0 ? filename.slice(0, dot) : filename;
  const extension = dot >= 0 ? filename.slice(dot) : "";
  let index = 2;
  let candidate = `${base}(${index})${extension}`;
  while (existingNames.has(candidate)) {
    index += 1;
    candidate = `${base}(${index})${extension}`;
  }
  return candidate;
}

function readFilenameRegistry(storageKey = GENERATED_FILENAME_REGISTRY_KEY): string[] {
  if (typeof localStorage === "undefined") {
    return [];
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function reserveGeneratedFilename(filename: string, storageKey = GENERATED_FILENAME_REGISTRY_KEY): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  const names = [filename, ...readFilenameRegistry(storageKey).filter((item) => item !== filename)].slice(0, 250);
  localStorage.setItem(storageKey, JSON.stringify(names));
}

function isReservedWindowsName(value: string): boolean {
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value);
}
