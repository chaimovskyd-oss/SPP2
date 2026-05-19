import { parseProject, serializeProject, createProjectEnvelope } from "@/core/save/projectFormat";
import {
  createPortableSppPackage,
  readPortableSppPackage,
  type PortableAssetPayload,
} from "@/core/save/sppPackage";
import type { Asset, Document } from "@/types/document";
import type { ProjectEnvelope } from "@/types/project";
import { getBatchProductionMeta, setBatchProductionMeta } from "./batchProductionMeta";

// ─── Storage backend selection ────────────────────────────────────────────────
// Templates are persisted as full SPP packages (zip with original/preview/
// thumbnail asset buckets) on disk via Electron IPC, so background images and
// decorative assets keep full quality. The localStorage path remains only as a
// non-Electron fallback for templates that have no large binary assets.

const TEMPLATE_INDEX_KEY = "spp2-batch-templates";
const TEMPLATE_DOC_PREFIX = "spp2-batch-template-";
const LOCALSTORAGE_ASSET_LIMIT_BYTES = 1.5 * 1024 * 1024;

function getElectronBatchAPI() {
  if (typeof window === "undefined") return null;
  return window.spp?.batchTemplates ?? null;
}

// ─── DataURL ↔ bytes helpers ──────────────────────────────────────────────────

function dataUrlToBytes(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  if (!dataUrl.startsWith("data:")) return null;
  const match = dataUrl.match(/^data:([^;,]+)(;base64)?,(.*)$/);
  if (match === null) return null;
  const [, mime, b64Flag, body] = match;
  if (b64Flag !== undefined) {
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return { mime, bytes };
  }
  return { mime, bytes: new TextEncoder().encode(decodeURIComponent(body)) };
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = "";
  // chunk to avoid call-stack overflow for large arrays
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${mime || "application/octet-stream"};base64,${btoa(binary)}`;
}

function isDataUrl(s: string | undefined): s is string {
  return typeof s === "string" && s.startsWith("data:");
}

// ─── Index item ───────────────────────────────────────────────────────────────

export interface BatchTemplateIndexItem {
  templateId: string;
  templateName: string;
  /** Inline thumbnail data URL for in-memory rendering (kept on web fallback);
   *  on Electron, the thumbnail is loaded lazily from disk. */
  thumbnailDataUrl?: string;
  canvasWidthPx: number;
  canvasHeightPx: number;
  orientation: "portrait" | "landscape" | "square";
  ratio: number;
  fieldCount: number;
  variableFieldTypes: Array<"image" | "text">;
  compatibleProductIds: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── Package build / unpack ───────────────────────────────────────────────────

interface BuiltPackage {
  packageBytes: Uint8Array;
  /** Document with asset paths rewritten to bucket references (no data URLs). */
  storedEnvelope: ProjectEnvelope;
}

async function buildPortablePackage(doc: Document): Promise<BuiltPackage> {
  const payloads: PortableAssetPayload[] = [];
  const rewrittenAssets: Asset[] = doc.assets.map((asset) => {
    const payload: PortableAssetPayload = { assetId: asset.id };
    const next: Asset = { ...asset };

    const original = isDataUrl(asset.originalPath) ? dataUrlToBytes(asset.originalPath) : null;
    if (original !== null) {
      payload.original = original.bytes;
      next.originalPath = `assets/originals/${asset.id}`;
    }
    const preview = isDataUrl(asset.previewPath) ? dataUrlToBytes(asset.previewPath) : null;
    if (preview !== null) {
      payload.preview = preview.bytes;
      next.previewPath = `assets/previews/${asset.id}`;
    }
    const thumb = isDataUrl(asset.thumbnailPath) ? dataUrlToBytes(asset.thumbnailPath) : null;
    if (thumb !== null) {
      payload.thumbnail = thumb.bytes;
      next.thumbnailPath = `assets/thumbnails/${asset.id}`;
    }
    payloads.push(payload);
    return next;
  });

  const storedEnvelope = createProjectEnvelope({
    document: { ...doc, assets: rewrittenAssets },
    linkedGroups: [],
    batchJobs: [],
  });

  const packageBytes = await createPortableSppPackage({
    project: storedEnvelope,
    metadata: { kind: "batch-template" },
    assets: payloads,
  });
  return { packageBytes, storedEnvelope };
}

function rehydrateDocumentFromPackage(bytes: Uint8Array): Document {
  const pkg = readPortableSppPackage(bytes);
  const payloadById = new Map(pkg.assets.map((p) => [p.assetId, p]));
  const assets: Asset[] = pkg.project.document.assets.map((asset) => {
    const payload = payloadById.get(asset.id);
    if (payload === undefined) return asset;
    return {
      ...asset,
      originalPath: payload.original !== undefined
        ? bytesToDataUrl(payload.original, asset.mimeType ?? "image/jpeg")
        : asset.originalPath,
      previewPath: payload.preview !== undefined
        ? bytesToDataUrl(payload.preview, asset.mimeType ?? "image/jpeg")
        : asset.previewPath,
      thumbnailPath: payload.thumbnail !== undefined
        ? bytesToDataUrl(payload.thumbnail, asset.mimeType ?? "image/jpeg")
        : asset.thumbnailPath,
    };
  });
  return { ...pkg.project.document, assets };
}

// ─── Save / load / list / delete ──────────────────────────────────────────────

export async function saveTemplateToStore(
  doc: Document,
  thumbnailDataUrl: string | undefined,
): Promise<BatchTemplateIndexItem> {
  const meta = getBatchProductionMeta(doc);
  if (!meta) throw new Error("No batch production metadata found on document");

  const page = doc.pages[0];
  const widthPx = page?.width ?? 0;
  const heightPx = page?.height ?? 0;
  const ratio = heightPx > 0 ? widthPx / heightPx : 1;
  const orientation: "portrait" | "landscape" | "square" =
    Math.abs(ratio - 1) < 0.02 ? "square" : ratio < 1 ? "portrait" : "landscape";

  const updatedMeta = {
    ...meta,
    canvas: { ...meta.canvas, widthPx, heightPx, ratio, orientation },
    updatedAt: new Date().toISOString(),
  };
  const updatedDoc = setBatchProductionMeta(doc, updatedMeta);

  const indexItem: BatchTemplateIndexItem = {
    templateId: meta.templateId,
    templateName: meta.templateName,
    thumbnailDataUrl,
    canvasWidthPx: widthPx,
    canvasHeightPx: heightPx,
    orientation,
    ratio,
    fieldCount: meta.variableFields.length,
    variableFieldTypes: meta.variableFields.map((f) => f.type),
    compatibleProductIds: meta.compatibleProductIds ?? [],
    createdAt: meta.createdAt,
    updatedAt: updatedMeta.updatedAt,
  };

  const api = getElectronBatchAPI();
  if (api !== null) {
    const { packageBytes } = await buildPortablePackage(updatedDoc);
    const thumbBytes = thumbnailDataUrl !== undefined
      ? dataUrlToBytes(thumbnailDataUrl)?.bytes ?? null
      : null;
    // Index item stored on disk doesn't need the inline thumbnail.
    const diskIndexItem: BatchTemplateIndexItem = { ...indexItem, thumbnailDataUrl: undefined };
    const res = await api.save({
      templateId: meta.templateId,
      packageBytes,
      thumbnailPngBytes: thumbBytes,
      indexItem: diskIndexItem,
    });
    if (!res.success) throw new Error(res.error ?? "Failed to save batch template");
    return indexItem;
  }

  // ── Web fallback (no Electron) — gate on asset size ────────────────────────
  const totalAssetBytes = updatedDoc.assets.reduce((sum, a) => {
    const o = isDataUrl(a.originalPath) ? a.originalPath.length : 0;
    const p = isDataUrl(a.previewPath) ? a.previewPath.length : 0;
    return sum + o + p;
  }, 0);
  if (totalAssetBytes > LOCALSTORAGE_ASSET_LIMIT_BYTES) {
    throw new Error(
      "התבנית מכילה תמונות גדולות מדי לשמירה בדפדפן. הפעל את האפליקציה בגרסת השולחן (Electron) לשמירה איכותית.",
    );
  }
  const envelope: ProjectEnvelope = createProjectEnvelope({
    document: updatedDoc,
    linkedGroups: [],
    batchJobs: [],
  });
  localStorage.setItem(TEMPLATE_DOC_PREFIX + meta.templateId, serializeProject(envelope));
  const existing = await loadTemplateIndex();
  const idx = existing.findIndex((t) => t.templateId === meta.templateId);
  const next = idx >= 0
    ? existing.map((t, i) => (i === idx ? indexItem : t))
    : [...existing, indexItem];
  localStorage.setItem(TEMPLATE_INDEX_KEY, JSON.stringify(next));
  return indexItem;
}

export async function loadTemplateIndex(): Promise<BatchTemplateIndexItem[]> {
  const api = getElectronBatchAPI();
  if (api !== null) {
    const res = await api.list();
    if (!res.success) return [];
    return (res.items as BatchTemplateIndexItem[] | undefined) ?? [];
  }
  try {
    const raw = localStorage.getItem(TEMPLATE_INDEX_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BatchTemplateIndexItem[];
  } catch {
    return [];
  }
}

export async function loadTemplateThumbnail(templateId: string): Promise<string | undefined> {
  const api = getElectronBatchAPI();
  if (api !== null) {
    const res = await api.loadThumbnail(templateId);
    if (!res.success || !res.thumbnailBytes) return undefined;
    return bytesToDataUrl(new Uint8Array(res.thumbnailBytes), "image/png");
  }
  const items = await loadTemplateIndex();
  return items.find((t) => t.templateId === templateId)?.thumbnailDataUrl;
}

export async function loadTemplateDocument(templateId: string): Promise<Document | null> {
  const api = getElectronBatchAPI();
  if (api !== null) {
    const res = await api.load(templateId);
    if (!res.success || !res.packageBytes) return null;
    try {
      return rehydrateDocumentFromPackage(new Uint8Array(res.packageBytes));
    } catch (err) {
      console.error("Failed to read batch template package:", err);
      return null;
    }
  }
  try {
    const raw = localStorage.getItem(TEMPLATE_DOC_PREFIX + templateId);
    if (!raw) return null;
    return parseProject(raw).document;
  } catch {
    return null;
  }
}

export async function deleteTemplate(templateId: string): Promise<void> {
  const api = getElectronBatchAPI();
  if (api !== null) {
    await api.delete(templateId);
    return;
  }
  localStorage.removeItem(TEMPLATE_DOC_PREFIX + templateId);
  const next = (await loadTemplateIndex()).filter((t) => t.templateId !== templateId);
  localStorage.setItem(TEMPLATE_INDEX_KEY, JSON.stringify(next));
}

export async function duplicateTemplate(templateId: string): Promise<BatchTemplateIndexItem | null> {
  const doc = await loadTemplateDocument(templateId);
  if (!doc) return null;

  const meta = getBatchProductionMeta(doc);
  if (!meta) return null;

  const newId = crypto.randomUUID();
  const now = new Date().toISOString();
  const newMeta = {
    ...meta,
    templateId: newId,
    templateName: `${meta.templateName} — עותק`,
    createdAt: now,
    updatedAt: now,
  };
  const clonedDoc = setBatchProductionMeta(doc, newMeta);
  const thumb = await loadTemplateThumbnail(templateId);
  return saveTemplateToStore(clonedDoc, thumb);
}
