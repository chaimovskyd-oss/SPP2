import { getCloudConfig } from "./cloudConfig";

export interface CloudSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email?: string;
}

const STORAGE_KEY = "spp2.cloud.session";

interface SupabaseSessionResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: {
    email?: string;
  };
}

function isSupabaseSessionResponse(value: unknown): value is SupabaseSessionResponse {
  return typeof value === "object" && value !== null;
}

function sessionFromResponse(value: unknown): CloudSession {
  if (!isSupabaseSessionResponse(value) || typeof value.access_token !== "string" || typeof value.refresh_token !== "string") {
    throw new Error("CLOUD_AUTH_INVALID_SESSION");
  }
  const expiresIn = typeof value.expires_in === "number" ? value.expires_in : 3600;
  return {
    accessToken: value.access_token,
    refreshToken: value.refresh_token,
    expiresAt: Date.now() + expiresIn * 1000,
    email: value.user?.email
  };
}

function readStoredSession(): CloudSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CloudSession>;
    if (typeof parsed.accessToken !== "string" || typeof parsed.refreshToken !== "string") return null;
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresAt: typeof parsed.expiresAt === "number" ? parsed.expiresAt : 0,
      email: typeof parsed.email === "string" ? parsed.email : undefined
    };
  } catch {
    return null;
  }
}

function writeStoredSession(session: CloudSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function getCloudSession(): CloudSession | null {
  return readStoredSession();
}

export function clearCloudSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export async function requestCloudMagicLink(email: string): Promise<void> {
  const config = getCloudConfig();
  if (!config.configured) throw new Error("CLOUD_NOT_CONFIGURED");
  const response = await fetch(`${config.supabaseUrl}/auth/v1/otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.supabasePublishableKey
    },
    body: JSON.stringify({
      email,
      create_user: true,
      email_redirect_to: config.redirectUrl,
      options: {
        email_redirect_to: config.redirectUrl
      }
    })
  });
  if (!response.ok) throw new Error(`CLOUD_AUTH_OTP_${response.status}`);
}

export async function verifyCloudEmailOtp(email: string, token: string): Promise<CloudSession> {
  const config = getCloudConfig();
  if (!config.configured) throw new Error("CLOUD_NOT_CONFIGURED");
  const response = await fetch(`${config.supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.supabasePublishableKey
    },
    body: JSON.stringify({
      email,
      token,
      type: "email"
    })
  });
  if (!response.ok) throw new Error(`CLOUD_AUTH_VERIFY_${response.status}`);
  const session = sessionFromResponse(await response.json());
  writeStoredSession(session);
  return session;
}

function sessionFromParams(params: URLSearchParams): CloudSession | null {
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (accessToken === null || refreshToken === null) return null;
  const expiresIn = Number(params.get("expires_in") ?? "3600");
  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000
  };
}

export function captureCloudSessionFromHash(hash = window.location.hash): CloudSession | null {
  if (!hash.includes("access_token=")) return null;
  const paramsText = hash.startsWith("#/cloud-auth?") ? hash.slice("#/cloud-auth?".length) : hash.replace(/^#\/?/, "");
  const session = sessionFromParams(new URLSearchParams(paramsText));
  if (session === null) return null;
  writeStoredSession(session);
  return session;
}

export function captureCloudSessionFromCallbackUrl(callbackUrl: string): CloudSession {
  let parsed: URL;
  try {
    parsed = new URL(callbackUrl.trim());
  } catch {
    throw new Error("CLOUD_AUTH_CALLBACK_INVALID_URL");
  }
  const hash = parsed.hash.replace(/^#\/?/, "");
  const session = sessionFromParams(new URLSearchParams(hash));
  if (session === null) throw new Error("CLOUD_AUTH_CALLBACK_MISSING_SESSION");
  writeStoredSession(session);
  return session;
}

export async function captureCloudSessionFromConfirmUrl(location = window.location): Promise<CloudSession | null> {
  if (!location.pathname.endsWith("/auth/confirm")) return null;
  const params = new URLSearchParams(location.search);
  const tokenHash = params.get("token_hash");
  const type = params.get("type") ?? "email";
  if (tokenHash === null) return null;

  const config = getCloudConfig();
  if (!config.configured) throw new Error("CLOUD_NOT_CONFIGURED");
  const response = await fetch(`${config.supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.supabasePublishableKey
    },
    body: JSON.stringify({
      token_hash: tokenHash,
      type
    })
  });
  if (!response.ok) throw new Error(`CLOUD_AUTH_CONFIRM_${response.status}`);
  const session = sessionFromResponse(await response.json());
  writeStoredSession(session);
  return session;
}

export async function getValidCloudSession(): Promise<CloudSession | null> {
  const session = readStoredSession();
  if (session === null) return null;
  if (session.expiresAt > Date.now() + 60_000) return session;
  const config = getCloudConfig();
  if (!config.configured) return session;
  const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.supabasePublishableKey
    },
    body: JSON.stringify({ refresh_token: session.refreshToken })
  });
  if (!response.ok) {
    clearCloudSession();
    return null;
  }
  const refreshed = sessionFromResponse(await response.json());
  writeStoredSession(refreshed);
  return refreshed;
}
