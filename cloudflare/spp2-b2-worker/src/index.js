const DEFAULT_MAX_PROJECT_BYTES = 2 * 1024 * 1024 * 1024;
const STORAGE_PROVIDER = "b2";

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return corsResponse(env);
    try {
      const url = new URL(request.url);
      const user = await requireUser(request, env);

      if (request.method === "GET" && url.pathname === "/projects") {
        return json({ projects: await listProjects(env, request) }, env);
      }

      if (request.method === "POST" && url.pathname === "/projects/upload") {
        const project = await uploadProject(request, env, user, url.searchParams.get("fileName"), url.searchParams.get("projectUuid"));
        return json({ project }, env, 201);
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
      return json({ error: message }, env, statusFromError(message));
    }
  }
};

async function requireUser(request, env) {
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw new Error("Unauthorized");
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: authorization,
      apikey: env.SUPABASE_PUBLISHABLE_KEY
    }
  });
  if (!response.ok) throw new Error("Unauthorized");
  const user = await response.json();
  if (typeof user.id !== "string") throw new Error("Unauthorized");
  return { id: user.id, email: typeof user.email === "string" ? user.email : undefined };
}

async function listProjects(env, request) {
  const response = await supabaseFetch(env, request, `/rest/v1/cloud_projects?select=*&storage_provider=eq.${STORAGE_PROVIDER}&deleted_at=is.null&order=updated_at.desc`);
  if (!response.ok) throw new Error(`Supabase list failed: ${response.status}`);
  return response.json();
}

async function uploadProject(request, env, user, requestedFileName, projectUuid) {
  const contentLength = Number(request.headers.get("X-SPP2-File-Size") ?? request.headers.get("Content-Length") ?? "0");
  const maxBytes = Number(env.MAX_PROJECT_BYTES ?? DEFAULT_MAX_PROJECT_BYTES);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error("Payload too large");
  if (request.body === null) throw new Error("Missing file body");

  const fileName = safeFileName(requestedFileName ?? "project.spp2");
  const existing = projectUuid === null ? null : await getProjectByProjectUuid(env, request, projectUuid);
  const id = existing?.id ?? crypto.randomUUID();
  const storagePath = `${user.id}/projects/${id}/${fileName}`;
  const contentType = request.headers.get("Content-Type") || "application/octet-stream";

  const putResponse = await b2Fetch(env, "PUT", storagePath, {
    body: request.body,
    headers: {
      "Content-Type": contentType
    }
  });
  if (!putResponse.ok) {
    throw new Error(`B2 upload failed: ${putResponse.status} ${await safeResponseText(putResponse)}`);
  }

  const body = {
    id,
    user_id: user.id,
    name: fileName.replace(/\.(spp2?|json)$/i, "") || fileName,
    file_name: fileName,
    size_bytes: Number.isFinite(contentLength) ? contentLength : 0,
    storage_path: storagePath,
    storage_provider: STORAGE_PROVIDER,
    project_uuid: projectUuid,
    device_name: request.headers.get("X-SPP2-Device-Name") ?? null
  };

  const dbResponse = await supabaseFetch(env, request, existing === null ? "/rest/v1/cloud_projects" : `/rest/v1/cloud_projects?id=eq.${encodeURIComponent(id)}`, {
    method: existing === null ? "POST" : "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(body)
  });

  if (!dbResponse.ok) {
    await b2Fetch(env, "DELETE", storagePath).catch(() => undefined);
    throw new Error(`Supabase save failed: ${dbResponse.status}`);
  }

  if (existing !== null && existing.storage_path !== storagePath) {
    await b2Fetch(env, "DELETE", existing.storage_path).catch(() => undefined);
  }

  const rows = await dbResponse.json();
  if (!Array.isArray(rows) || rows[0] === undefined) throw new Error("Supabase save returned no row");
  return rows[0];
}

async function downloadProject(env, request, id) {
  const record = await getProject(env, request, id);
  const response = await b2Fetch(env, "GET", record.storage_path);
  if (!response.ok) throw new Error(response.status === 404 ? "Project object not found" : `B2 download failed: ${response.status}`);
  return new Response(response.body, {
    headers: withCors(env, {
      "Content-Type": response.headers.get("Content-Type") ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${record.file_name.replace(/"/g, "")}"`
    })
  });
}

async function deleteProject(env, request, id) {
  const record = await getProject(env, request, id);
  const deleteResponse = await b2Fetch(env, "DELETE", record.storage_path);
  if (!deleteResponse.ok && deleteResponse.status !== 404) {
    throw new Error(`B2 delete failed: ${deleteResponse.status} ${await safeResponseText(deleteResponse)}`);
  }
  const response = await supabaseFetch(env, request, `/rest/v1/cloud_projects?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ deleted_at: new Date().toISOString() })
  });
  if (!response.ok) throw new Error(`Supabase delete failed: ${response.status}`);
}

async function getProject(env, request, id) {
  const response = await supabaseFetch(env, request, `/rest/v1/cloud_projects?id=eq.${encodeURIComponent(id)}&storage_provider=eq.${STORAGE_PROVIDER}&deleted_at=is.null&select=*&limit=1`);
  if (!response.ok) throw new Error(`Supabase project lookup failed: ${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows[0] === undefined) throw new Error("Project not found");
  return rows[0];
}

async function getProjectByProjectUuid(env, request, projectUuid) {
  const response = await supabaseFetch(env, request, `/rest/v1/cloud_projects?project_uuid=eq.${encodeURIComponent(projectUuid)}&storage_provider=eq.${STORAGE_PROVIDER}&deleted_at=is.null&select=*&limit=1`);
  if (!response.ok) throw new Error(`Supabase project lookup failed: ${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

function supabaseFetch(env, request, path, init = {}) {
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

async function b2Fetch(env, method, storagePath, init = {}) {
  const endpoint = normalizeEndpoint(env.B2_ENDPOINT);
  const bucket = env.B2_BUCKET_NAME;
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  const url = new URL(`/${bucket}/${encodedPath}`, endpoint);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const region = env.B2_REGION || endpoint.hostname.split(".")[1] || "us-east-005";
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const payloadHash = "UNSIGNED-PAYLOAD";
  const canonicalHeaders = `host:${url.hostname}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const canonicalRequest = [
    method,
    url.pathname,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest)
  ].join("\n");
  const signingKey = await getSignatureKey(env.B2_APPLICATION_KEY, dateStamp, region, "s3");
  const signature = await hmacHex(signingKey, stringToSign);
  const authorization = `AWS4-HMAC-SHA256 Credential=${env.B2_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(url, {
    method,
    body: init.body,
    headers: {
      ...(init.headers ?? {}),
      Authorization: authorization,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate
    }
  });
}

function normalizeEndpoint(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

async function hmacBytes(key, value) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, typeof value === "string" ? new TextEncoder().encode(value) : value);
  return new Uint8Array(signature);
}

async function hmacHex(key, value) {
  return bytesToHex(await hmacBytes(key, value));
}

async function getSignatureKey(secret, dateStamp, region, service) {
  const encoder = new TextEncoder();
  const kDate = await hmacBytes(encoder.encode(`AWS4${secret}`), dateStamp);
  const kRegion = await hmacBytes(kDate, region);
  const kService = await hmacBytes(kRegion, service);
  return hmacBytes(kService, "aws4_request");
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function safeResponseText(response) {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return "";
  }
}

function safeFileName(value) {
  return value
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .slice(0, 140)
    .trim() || "project.spp2";
}

function corsResponse(env) {
  return new Response(null, { status: 204, headers: withCors(env) });
}

function json(value, env, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: withCors(env, { "Content-Type": "application/json" })
  });
}

function withCors(env, headers = {}) {
  const output = new Headers(headers);
  output.set("Access-Control-Allow-Origin", env.ALLOWED_ORIGIN ?? "*");
  output.set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  output.set("Access-Control-Allow-Headers", "Authorization,Content-Type,X-SPP2-Device-Name,X-SPP2-File-Size");
  output.set("Access-Control-Max-Age", "86400");
  return output;
}

function statusFromError(message) {
  if (message === "Unauthorized") return 401;
  if (message === "Project not found" || message === "Project object not found") return 404;
  if (message === "Payload too large") return 413;
  return 500;
}
