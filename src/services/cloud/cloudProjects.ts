import { getValidCloudSession } from "./cloudAuth";
import { getCloudConfig } from "./cloudConfig";

const SUPABASE_PROJECTS_BUCKET = "spp2-projects-staging";
const SUPABASE_STORAGE_PROVIDER = "supabase";
export const SUPABASE_FREE_STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024;
export const B2_FREE_STORAGE_QUOTA_BYTES = 10 * 1024 * 1024 * 1024;
export const CLOUD_FREE_MAX_FILE_BYTES = 50 * 1024 * 1024;

export interface CloudProject {
  id: string;
  name: string;
  fileName: string;
  sizeBytes: number;
  updatedAt: string;
  createdAt: string;
  deviceName?: string;
  thumbnailUrl?: string;
}

export interface CloudStorageUsage {
  usedBytes: number;
  quotaBytes: number;
  remainingBytes: number;
}

export interface UploadCloudProjectOptions {
  projectUuid?: string;
}

interface CloudProjectRecord {
  id?: unknown;
  name?: unknown;
  file_name?: unknown;
  size_bytes?: unknown;
  updated_at?: unknown;
  created_at?: unknown;
  device_name?: unknown;
  thumbnail_url?: unknown;
  storage_path?: unknown;
  storage_provider?: unknown;
  project_uuid?: unknown;
}

interface SupabaseUserResponse {
  id?: unknown;
  email?: unknown;
}

function coerceProject(value: CloudProjectRecord): CloudProject | null {
  if (typeof value.id !== "string" || typeof value.name !== "string") return null;
  return {
    id: value.id,
    name: value.name,
    fileName: typeof value.file_name === "string" ? value.file_name : `${value.name}.spp2`,
    sizeBytes: typeof value.size_bytes === "number" ? value.size_bytes : 0,
    updatedAt: typeof value.updated_at === "string" ? value.updated_at : new Date().toISOString(),
    createdAt: typeof value.created_at === "string" ? value.created_at : new Date().toISOString(),
    deviceName: typeof value.device_name === "string" ? value.device_name : undefined,
    thumbnailUrl: typeof value.thumbnail_url === "string" ? value.thumbnail_url : undefined
  };
}

async function cloudFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const config = getCloudConfig();
  if (!config.configured) throw new Error("CLOUD_NOT_CONFIGURED");
  if (config.apiUrl.length === 0) throw new Error("CLOUD_WORKER_NOT_CONFIGURED");
  const session = await getValidCloudSession();
  if (session === null) throw new Error("CLOUD_NOT_SIGNED_IN");
  return fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${session.accessToken}`
    }
  });
}

async function getSupabaseSessionHeaders(): Promise<Record<string, string>> {
  const config = getCloudConfig();
  if (!config.configured) throw new Error("CLOUD_NOT_CONFIGURED");
  const session = await getValidCloudSession();
  if (session === null) throw new Error("CLOUD_NOT_SIGNED_IN");
  return {
    apikey: config.supabasePublishableKey,
    Authorization: `Bearer ${session.accessToken}`
  };
}

async function supabaseFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const config = getCloudConfig();
  const sessionHeaders = await getSupabaseSessionHeaders();
  return fetch(`${config.supabaseUrl}${path}`, {
    ...init,
    headers: {
      ...sessionHeaders,
      ...(init.headers ?? {})
    }
  });
}

async function getSupabaseUserId(): Promise<string> {
  const response = await supabaseFetch("/auth/v1/user");
  if (!response.ok) throw new Error(`CLOUD_AUTH_USER_${response.status}`);
  const user = await response.json() as SupabaseUserResponse;
  if (typeof user.id !== "string") throw new Error("CLOUD_AUTH_USER_INVALID");
  return user.id;
}

function encodeStoragePath(path: string): string {
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function safeFileName(value: string): string {
  return value
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .slice(0, 140)
    .trim() || "project.spp2";
}

function storageObjectPath(storagePath: string): string {
  return `/storage/v1/object/${SUPABASE_PROJECTS_BUCKET}/${encodeStoragePath(storagePath)}`;
}

function authenticatedStorageObjectPath(storagePath: string): string {
  return `/storage/v1/object/authenticated/${SUPABASE_PROJECTS_BUCKET}/${encodeStoragePath(storagePath)}`;
}

async function listSupabaseProjects(): Promise<CloudProject[]> {
  const response = await supabaseFetch(`/rest/v1/cloud_projects?select=*&storage_provider=eq.${SUPABASE_STORAGE_PROVIDER}&deleted_at=is.null&order=updated_at.desc`);
  if (!response.ok) throw new Error(`CLOUD_PROJECTS_LIST_${response.status}`);
  const rows = await response.json() as CloudProjectRecord[];
  return (Array.isArray(rows) ? rows : []).flatMap((item) => {
    const project = coerceProject(item);
    return project === null ? [] : [project];
  });
}

async function findExistingSupabaseProject(projectUuid: string): Promise<CloudProjectRecord | null> {
  const response = await supabaseFetch(`/rest/v1/cloud_projects?project_uuid=eq.${encodeURIComponent(projectUuid)}&storage_provider=eq.${SUPABASE_STORAGE_PROVIDER}&deleted_at=is.null&select=*&limit=1`);
  if (!response.ok) throw new Error(`CLOUD_PROJECT_LOOKUP_${response.status}`);
  const rows = await response.json() as CloudProjectRecord[];
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function uploadSupabaseProjectFile(file: File, options: UploadCloudProjectOptions = {}): Promise<CloudProject> {
  const config = getCloudConfig();
  if (!config.configured) throw new Error("CLOUD_NOT_CONFIGURED");
  if (file.size > CLOUD_FREE_MAX_FILE_BYTES) throw new Error("CLOUD_PROJECT_FILE_TOO_LARGE_FREE");
  const userId = await getSupabaseUserId();
  const existing = options.projectUuid === undefined ? null : await findExistingSupabaseProject(options.projectUuid);
  const id = typeof existing?.id === "string" ? existing.id : crypto.randomUUID();
  const fileName = safeFileName(file.name);
  const storagePath = `${userId}/projects/${id}/${fileName}`;
  const storageResponse = await supabaseFetch(storageObjectPath(storagePath), {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "true"
    },
    body: file
  });
  if (!storageResponse.ok) throw new Error(`CLOUD_STORAGE_UPLOAD_${storageResponse.status}`);

  const record = {
    id,
    user_id: userId,
    name: fileName.replace(/\.(spp2?|json)$/i, "") || fileName,
    file_name: fileName,
    size_bytes: file.size,
    storage_path: storagePath,
    storage_provider: SUPABASE_STORAGE_PROVIDER,
    project_uuid: options.projectUuid ?? null,
    device_name: navigator.userAgent.slice(0, 120)
  };

  const dbResponse = await supabaseFetch(existing === null ? "/rest/v1/cloud_projects" : `/rest/v1/cloud_projects?id=eq.${encodeURIComponent(id)}`, {
    method: existing === null ? "POST" : "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(record)
  });

  if (!dbResponse.ok) {
    await supabaseFetch(storageObjectPath(storagePath), { method: "DELETE" }).catch(() => undefined);
    throw new Error(`CLOUD_PROJECT_UPLOAD_${dbResponse.status}`);
  }

  const rows = await dbResponse.json() as CloudProjectRecord[];
  const project = Array.isArray(rows) && rows[0] !== undefined ? coerceProject(rows[0]) : null;
  if (project === null) throw new Error("CLOUD_PROJECT_UPLOAD_INVALID_RESPONSE");
  return project;
}

async function downloadSupabaseProjectFile(project: CloudProject): Promise<File> {
  const recordResponse = await supabaseFetch(`/rest/v1/cloud_projects?id=eq.${encodeURIComponent(project.id)}&storage_provider=eq.${SUPABASE_STORAGE_PROVIDER}&select=*&limit=1`);
  if (!recordResponse.ok) throw new Error(`CLOUD_PROJECT_LOOKUP_${recordResponse.status}`);
  const rows = await recordResponse.json() as CloudProjectRecord[];
  const record = Array.isArray(rows) ? rows[0] : undefined;
  if (record === undefined || typeof record.storage_path !== "string") throw new Error("CLOUD_PROJECT_NOT_FOUND");

  const fileResponse = await supabaseFetch(authenticatedStorageObjectPath(record.storage_path));
  if (!fileResponse.ok) throw new Error(`CLOUD_PROJECT_DOWNLOAD_${fileResponse.status}`);
  const blob = await fileResponse.blob();
  return new File([blob], project.fileName, { type: blob.type || "application/octet-stream" });
}

async function deleteSupabaseProject(projectId: string): Promise<void> {
  const recordResponse = await supabaseFetch(`/rest/v1/cloud_projects?id=eq.${encodeURIComponent(projectId)}&storage_provider=eq.${SUPABASE_STORAGE_PROVIDER}&select=storage_path&limit=1`);
  if (!recordResponse.ok) throw new Error(`CLOUD_PROJECT_LOOKUP_${recordResponse.status}`);
  const rows = await recordResponse.json() as CloudProjectRecord[];
  const storagePath = Array.isArray(rows) && typeof rows[0]?.storage_path === "string" ? rows[0].storage_path : null;
  if (storagePath !== null) {
    await supabaseFetch(storageObjectPath(storagePath), { method: "DELETE" }).catch(() => undefined);
  }
  const deleteResponse = await supabaseFetch(`/rest/v1/cloud_projects?id=eq.${encodeURIComponent(projectId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ deleted_at: new Date().toISOString() })
  });
  if (!deleteResponse.ok) throw new Error(`CLOUD_PROJECT_DELETE_${deleteResponse.status}`);
}

export async function listCloudProjects(): Promise<CloudProject[]> {
  if (getCloudConfig().backend === "supabase") return listSupabaseProjects();
  const response = await cloudFetch("/projects");
  if (!response.ok) throw new Error(`CLOUD_PROJECTS_LIST_${response.status}`);
  const json = await response.json() as { projects?: CloudProjectRecord[] };
  return (Array.isArray(json.projects) ? json.projects : []).flatMap((item) => {
    const project = coerceProject(item);
    return project === null ? [] : [project];
  });
}

export async function uploadCloudProjectFile(file: File, options: UploadCloudProjectOptions = {}): Promise<CloudProject> {
  if (getCloudConfig().backend === "supabase") return uploadSupabaseProjectFile(file, options);
  const params = new URLSearchParams({ fileName: file.name });
  if (options.projectUuid !== undefined) params.set("projectUuid", options.projectUuid);
  const response = await cloudFetch(`/projects/upload?${params.toString()}`, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-SPP2-Device-Name": navigator.userAgent.slice(0, 120),
      "X-SPP2-File-Size": String(file.size)
    },
    body: file
  });
  if (!response.ok) throw new Error(`CLOUD_PROJECT_UPLOAD_${response.status}`);
  const json = await response.json() as { project?: CloudProjectRecord };
  const project = json.project === undefined ? null : coerceProject(json.project);
  if (project === null) throw new Error("CLOUD_PROJECT_UPLOAD_INVALID_RESPONSE");
  return project;
}

export async function downloadCloudProjectFile(project: CloudProject): Promise<File> {
  if (getCloudConfig().backend === "supabase") return downloadSupabaseProjectFile(project);
  const response = await cloudFetch(`/projects/${encodeURIComponent(project.id)}/download`);
  if (!response.ok) throw new Error(`CLOUD_PROJECT_DOWNLOAD_${response.status}`);
  const blob = await response.blob();
  return new File([blob], project.fileName, { type: blob.type || "application/octet-stream" });
}

export async function deleteCloudProject(projectId: string): Promise<void> {
  if (getCloudConfig().backend === "supabase") return deleteSupabaseProject(projectId);
  const response = await cloudFetch(`/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" });
  if (!response.ok) throw new Error(`CLOUD_PROJECT_DELETE_${response.status}`);
}

export function getCloudStorageQuotaBytes(): number {
  return getCloudConfig().backend === "worker" ? B2_FREE_STORAGE_QUOTA_BYTES : SUPABASE_FREE_STORAGE_QUOTA_BYTES;
}

export async function getCloudStorageUsage(): Promise<CloudStorageUsage> {
  const projects = await listCloudProjects();
  const usedBytes = projects.reduce((total, project) => total + project.sizeBytes, 0);
  const quotaBytes = getCloudStorageQuotaBytes();
  return {
    usedBytes,
    quotaBytes,
    remainingBytes: Math.max(0, quotaBytes - usedBytes)
  };
}
