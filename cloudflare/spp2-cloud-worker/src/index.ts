export interface Env {
  SPP2_PROJECTS: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  MAX_PROJECT_BYTES?: string;
  ALLOWED_ORIGIN?: string;
}

interface SupabaseUser {
  id: string;
  email?: string;
}

interface CloudProjectRecord {
  id: string;
  user_id: string;
  name: string;
  file_name: string;
  size_bytes: number;
  storage_path: string;
  project_uuid?: string | null;
  device_name?: string | null;
  thumbnail_url?: string | null;
  created_at: string;
  updated_at: string;
}

const DEFAULT_MAX_PROJECT_BYTES = 500 * 1024 * 1024;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return corsResponse(env);
    try {
      const url = new URL(request.url);
      const user = await requireUser(request, env);

      if (request.method === "GET" && url.pathname === "/projects") {
        return json({ projects: await listProjects(env, request, user) }, env);
      }

      if (request.method === "POST" && url.pathname === "/projects/upload") {
        return json({ project: await uploadProject(request, env, user, url.searchParams.get("fileName"), url.searchParams.get("projectUuid")) }, env, 201);
      }

      const downloadMatch = /^\/projects\/([^/]+)\/download$/.exec(url.pathname);
      if (request.method === "GET" && downloadMatch !== null) {
        return downloadProject(env, request, downloadMatch[1]);
      }

      const deleteMatch = /^\/projects\/([^/]+)$/.exec(url.pathname);
      if (request.method === "DELETE" && deleteMatch !== null) {
        await deleteProject(env, request, deleteMatch[1]);
        return json({ ok: true }, env);
      }

      return json({ error: "Not found" }, env, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = statusFromError(message);
      return json({ error: message }, env, status);
    }
  }
};

async function requireUser(request: Request, env: Env): Promise<SupabaseUser> {
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw new Error("Unauthorized");
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: authorization,
      apikey: env.SUPABASE_PUBLISHABLE_KEY
    }
  });
  if (!response.ok) throw new Error("Unauthorized");
  const user = await response.json() as Partial<SupabaseUser>;
  if (typeof user.id !== "string") throw new Error("Unauthorized");
  return { id: user.id, email: typeof user.email === "string" ? user.email : undefined };
}

async function listProjects(env: Env, request: Request, _user: SupabaseUser): Promise<CloudProjectRecord[]> {
  const response = await supabaseFetch(env, request, "/rest/v1/cloud_projects?select=*&order=updated_at.desc");
  if (!response.ok) throw new Error(`Supabase list failed: ${response.status}`);
  return response.json();
}

async function uploadProject(request: Request, env: Env, user: SupabaseUser, requestedFileName: string | null, projectUuid: string | null): Promise<CloudProjectRecord> {
  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  const maxBytes = Number(env.MAX_PROJECT_BYTES ?? DEFAULT_MAX_PROJECT_BYTES);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error("Payload too large");
  if (request.body === null) throw new Error("Missing file body");

  const fileName = safeFileName(requestedFileName ?? "project.spp2");
  const existing = projectUuid === null ? null : await getProjectByProjectUuid(env, request, projectUuid);
  const id = existing?.id ?? crypto.randomUUID();
  const storagePath = `${user.id}/projects/${id}/${fileName}`;
  const contentType = request.headers.get("Content-Type") || "application/octet-stream";
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > maxBytes) throw new Error("Payload too large");

  await env.SPP2_PROJECTS.put(storagePath, bytes, {
    httpMetadata: { contentType },
    customMetadata: {
      userId: user.id,
      fileName
    }
  });

  const body = {
    id,
    user_id: user.id,
    name: fileName.replace(/\.(spp2?|json)$/i, "") || fileName,
    file_name: fileName,
    size_bytes: bytes.byteLength,
    storage_path: storagePath,
    project_uuid: projectUuid,
    device_name: request.headers.get("X-SPP2-Device-Name") ?? null
  };

  const response = await supabaseFetch(env, request, existing === null ? "/rest/v1/cloud_projects" : `/rest/v1/cloud_projects?id=eq.${encodeURIComponent(id)}`, {
    method: existing === null ? "POST" : "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    await env.SPP2_PROJECTS.delete(storagePath);
    throw new Error(`Supabase save failed: ${response.status}`);
  }

  if (existing !== null && existing.storage_path !== storagePath) {
    await env.SPP2_PROJECTS.delete(existing.storage_path);
  }

  const rows = await response.json() as CloudProjectRecord[];
  if (!Array.isArray(rows) || rows[0] === undefined) throw new Error("Supabase insert returned no row");
  return rows[0];
}

async function getProjectByProjectUuid(env: Env, request: Request, projectUuid: string): Promise<CloudProjectRecord | null> {
  const response = await supabaseFetch(env, request, `/rest/v1/cloud_projects?project_uuid=eq.${encodeURIComponent(projectUuid)}&deleted_at=is.null&select=*&limit=1`);
  if (!response.ok) throw new Error(`Supabase project lookup failed: ${response.status}`);
  const rows = await response.json() as CloudProjectRecord[];
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

async function downloadProject(env: Env, request: Request, id: string): Promise<Response> {
  const record = await getProject(env, request, id);
  const object = await env.SPP2_PROJECTS.get(record.storage_path);
  if (object === null) throw new Error("Project object not found");
  return new Response(object.body, {
    headers: withCors(env, {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${record.file_name.replace(/"/g, "")}"`
    })
  });
}

async function deleteProject(env: Env, request: Request, id: string): Promise<void> {
  const record = await getProject(env, request, id);
  await env.SPP2_PROJECTS.delete(record.storage_path);
  const response = await supabaseFetch(env, request, `/rest/v1/cloud_projects?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ deleted_at: new Date().toISOString() })
  });
  if (!response.ok) throw new Error(`Supabase delete failed: ${response.status}`);
}

async function getProject(env: Env, request: Request, id: string): Promise<CloudProjectRecord> {
  const response = await supabaseFetch(env, request, `/rest/v1/cloud_projects?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  if (!response.ok) throw new Error(`Supabase project lookup failed: ${response.status}`);
  const rows = await response.json() as CloudProjectRecord[];
  if (!Array.isArray(rows) || rows[0] === undefined) throw new Error("Project not found");
  return rows[0];
}

function supabaseFetch(env: Env, request: Request, path: string, init: RequestInit = {}): Promise<Response> {
  const authorization = request.headers.get("Authorization") ?? "";
  return fetch(`${env.SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: authorization,
      apikey: env.SUPABASE_PUBLISHABLE_KEY
    }
  });
}

function safeFileName(value: string): string {
  const cleaned = value
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .slice(0, 140)
    .trim();
  return cleaned || "project.spp2";
}

function corsResponse(env: Env): Response {
  return new Response(null, { status: 204, headers: withCors(env) });
}

function json(value: unknown, env: Env, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: withCors(env, { "Content-Type": "application/json" })
  });
}

function withCors(env: Env, headers: Record<string, string> = {}): Headers {
  const output = new Headers(headers);
  output.set("Access-Control-Allow-Origin", env.ALLOWED_ORIGIN ?? "*");
  output.set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  output.set("Access-Control-Allow-Headers", "Authorization,Content-Type,X-SPP2-Device-Name");
  output.set("Access-Control-Max-Age", "86400");
  return output;
}

function statusFromError(message: string): number {
  if (message === "Unauthorized") return 401;
  if (message === "Project not found") return 404;
  if (message === "Payload too large") return 413;
  return 500;
}
