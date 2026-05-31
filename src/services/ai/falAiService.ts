import { fal, ApiError } from "@fal-ai/client";
import { MODEL_COST_ESTIMATE, COST_WARNING_THRESHOLD } from "./falModels.config";

// ─── API Key ──────────────────────────────────────────────────────────────────

const FAL_KEY_STORAGE = "fal_api_key";
const REPLICATE_KEY_STORAGE = "replicate_api_token";

/** env fallback: populated from .env.local VITE_FAL_KEY at build time */
const ENV_FAL_KEY = (import.meta.env?.VITE_FAL_KEY as string | undefined) ?? "";
const ENV_REPLICATE_TOKEN = (import.meta.env?.VITE_REPLICATE_TOKEN as string | undefined) ?? "";

export function getFalApiKey(): string | null {
  return localStorage.getItem(FAL_KEY_STORAGE) || ENV_FAL_KEY || null;
}

export function setFalApiKey(key: string): void {
  localStorage.setItem(FAL_KEY_STORAGE, key);
}

/**
 * Configures the singleton fal client with the current credentials.
 * Called before every API operation so a freshly-entered key takes effect
 * without a reload. `suppressLocalCredentialsWarning` is required because we
 * run in a browser/Electron-renderer context and intentionally use the key
 * client-side (the user supplies their own key).
 */
function ensureFalConfigured(): string {
  const apiKey = getFalApiKey();
  if (!apiKey) {
    console.error("[fal.ai] No API key configured");
    throw new Error("FAL_KEY_MISSING");
  }
  fal.config({
    credentials: apiKey,
    suppressLocalCredentialsWarning: true,
  });
  return apiKey;
}

export function getReplicateApiToken(): string | null {
  return localStorage.getItem(REPLICATE_KEY_STORAGE) || ENV_REPLICATE_TOKEN || null;
}

export function setReplicateApiToken(token: string): void {
  localStorage.setItem(REPLICATE_KEY_STORAGE, token);
}

export function isFalConfigured(): boolean {
  return !!getFalApiKey();
}

// ─── Cost ─────────────────────────────────────────────────────────────────────

export function estimateCost(modelId: string): number {
  return MODEL_COST_ESTIMATE[modelId] ?? 0.05;
}

export function shouldWarnCost(modelId: string): boolean {
  return estimateCost(modelId) > COST_WARNING_THRESHOLD;
}

// ─── Image Upload ─────────────────────────────────────────────────────────────

/** Convert a data URL to a Blob. */
function dataUrlToBlob(dataUrl: string): Blob {
  const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
  const mime = mimeMatch?.[1] ?? "image/png";
  const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

/**
 * Uploads a data URL to fal.ai storage via the SDK and returns a permanent URL.
 */
export async function uploadToFalStorage(dataUrl: string, _signal?: AbortSignal): Promise<string> {
  ensureFalConfigured();
  const blob = dataUrlToBlob(dataUrl);
  console.log("[fal.ai] Uploading image to storage:", {
    mime: blob.type,
    sizeKB: Math.round(blob.size / 1024),
  });
  const url = await fal.storage.upload(blob);
  console.log("[fal.ai] Upload complete:", url);
  return url;
}

/**
 * Returns a fal.ai-compatible image URL.
 * For small images (<2MB) uses the data URL directly; larger images are uploaded
 * to fal storage (the queue API rejects oversized inline payloads).
 */
export async function toFalImageUrl(dataUrl: string, signal?: AbortSignal): Promise<string> {
  const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
  const byteLength = Math.ceil((base64.length * 3) / 4);
  if (byteLength < 2 * 1024 * 1024) {
    console.log("[fal.ai] Image small enough for inline data URL:", Math.round(byteLength / 1024), "KB");
    return dataUrl;
  }
  console.log("[fal.ai] Image too large for inline, uploading:", Math.round(byteLength / 1024), "KB");
  return uploadToFalStorage(dataUrl, signal);
}

// ─── Queue API ────────────────────────────────────────────────────────────────

/**
 * Calls a fal.ai model via the SDK's queue `subscribe` API.
 * The SDK handles submit → poll → fetch-result, plus credentials and the
 * correct queue/storage hostnames. Returns the parsed result data object.
 */
export async function callFalApi<TInput, TOutput>(
  modelId: string,
  input: TInput,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal
): Promise<TOutput> {
  ensureFalConfigured();

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  console.log("[fal.ai] Subscribing to:", modelId);
  console.log("[fal.ai] Input keys:", Object.keys(input as object));

  onProgress?.(5);

  // Simulated progress: ramp to 85% while the job runs, then real updates
  // bump it forward. We can't get a true percentage from the queue, so this
  // keeps the UI moving.
  let simulatedPct = 5;
  const progressInterval = setInterval(() => {
    if (simulatedPct < 85) {
      simulatedPct = Math.min(85, simulatedPct + 6);
      onProgress?.(simulatedPct);
    }
  }, 700);

  try {
    const result = await fal.subscribe(modelId, {
      input: input as Record<string, unknown>,
      logs: true,
      abortSignal: signal,
      onQueueUpdate: (update) => {
        console.log("[fal.ai] Queue update:", update.status);
        if (update.status === "IN_PROGRESS") {
          // nudge progress past the queue-wait phase
          simulatedPct = Math.max(simulatedPct, 60);
          onProgress?.(simulatedPct);
        }
      },
    });

    console.log("[fal.ai] Job completed, requestId:", result.requestId);
    onProgress?.(100);
    return result.data as TOutput;
  } catch (err) {
    // The SDK throws a plain error on abort; normalize to AbortError so callers
    // can detect cancellation uniformly.
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    // Surface fal's validation/error body, which carries the real reason
    // (e.g. unsupported image dimensions, missing field) instead of a generic
    // "Failed to fetch".
    if (err instanceof ApiError) {
      const body = (err as ApiError<unknown>).body;
      let detail = "";
      try {
        detail = typeof body === "string" ? body : JSON.stringify(body);
      } catch {
        detail = String(body);
      }
      console.error("[fal.ai] API error:", err.status, detail);
      throw new Error(`FAL_API_${err.status}: ${detail.slice(0, 300)}`);
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[fal.ai] Subscribe failed:", msg);
    throw err;
  } finally {
    clearInterval(progressInterval);
  }
}

// ─── Result helpers ───────────────────────────────────────────────────────────

/** Fetch a remote image URL and return it as a data URL. */
export async function imageUrlToDataUrl(url: string, signal?: AbortSignal): Promise<string> {
  console.log("[fal.ai] Downloading result image:", url);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`FAL_DOWNLOAD_${res.status}`);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      console.log("[fal.ai] Downloaded image, size:", Math.round(dataUrl.length / 1024), "KB");
      resolve(dataUrl);
    };
    reader.onerror = () => reject(new Error("FAL_BLOB_READ_ERROR"));
    reader.readAsDataURL(blob);
  });
}
