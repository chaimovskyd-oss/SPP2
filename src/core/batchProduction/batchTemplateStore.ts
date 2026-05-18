import { parseProject, serializeProject, createProjectEnvelope } from "@/core/save/projectFormat";
import type { Asset, Document } from "@/types/document";
import type { ProjectEnvelope } from "@/types/project";
import { getBatchProductionMeta, setBatchProductionMeta } from "./batchProductionMeta";

const TEMPLATE_INDEX_KEY = "spp2-batch-templates";
const TEMPLATE_DOC_PREFIX = "spp2-batch-template-";

// Strip large base64 data URLs from assets before localStorage storage.
// We preserve thumbnailPath (small, ~20KB) for display; original/preview
// can be MB-sized and would exceed localStorage quota.
function stripAssetBinaryData(asset: Asset): Asset {
  const isDataUrl = (s: string | undefined): boolean =>
    typeof s === "string" && s.startsWith("data:");
  return {
    ...asset,
    originalPath: isDataUrl(asset.originalPath) ? undefined : asset.originalPath,
    previewPath: isDataUrl(asset.previewPath) ? undefined : asset.previewPath,
  };
}

function stripDocumentBinaryData(doc: Document): Document {
  return { ...doc, assets: doc.assets.map(stripAssetBinaryData) };
}

export interface BatchTemplateIndexItem {
  templateId: string;
  templateName: string;
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

export function loadTemplateIndex(): BatchTemplateIndexItem[] {
  try {
    const raw = localStorage.getItem(TEMPLATE_INDEX_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BatchTemplateIndexItem[];
  } catch {
    return [];
  }
}

function saveTemplateIndex(items: BatchTemplateIndexItem[]): void {
  localStorage.setItem(TEMPLATE_INDEX_KEY, JSON.stringify(items));
}

export function saveTemplateToStore(
  doc: Document,
  thumbnailDataUrl: string | undefined,
): BatchTemplateIndexItem {
  const meta = getBatchProductionMeta(doc);
  if (!meta) throw new Error("No batch production metadata found on document");

  const page = doc.pages[0];
  const widthPx = page?.width ?? 0;
  const heightPx = page?.height ?? 0;
  const ratio = heightPx > 0 ? widthPx / heightPx : 1;
  const orientation: "portrait" | "landscape" | "square" =
    Math.abs(ratio - 1) < 0.02 ? "square" : ratio < 1 ? "portrait" : "landscape";

  // Ensure meta.canvas reflects current page dimensions
  const updatedMeta = {
    ...meta,
    canvas: {
      ...meta.canvas,
      widthPx,
      heightPx,
      ratio,
      orientation,
    },
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

  // Strip large binary data before storage to stay within localStorage quota
  const docForStorage = stripDocumentBinaryData(updatedDoc);
  const envelope: ProjectEnvelope = createProjectEnvelope({
    document: docForStorage,
    linkedGroups: [],
    batchJobs: [],
  });
  localStorage.setItem(TEMPLATE_DOC_PREFIX + meta.templateId, serializeProject(envelope));

  // Update index
  const existing = loadTemplateIndex();
  const idx = existing.findIndex((t) => t.templateId === meta.templateId);
  const next = idx >= 0
    ? existing.map((t, i) => (i === idx ? indexItem : t))
    : [...existing, indexItem];
  saveTemplateIndex(next);

  return indexItem;
}

export function loadTemplateDocument(templateId: string): Document | null {
  try {
    const raw = localStorage.getItem(TEMPLATE_DOC_PREFIX + templateId);
    if (!raw) return null;
    const envelope = parseProject(raw);
    return envelope.document;
  } catch {
    return null;
  }
}

export function deleteTemplate(templateId: string): void {
  localStorage.removeItem(TEMPLATE_DOC_PREFIX + templateId);
  const next = loadTemplateIndex().filter((t) => t.templateId !== templateId);
  saveTemplateIndex(next);
}

export function duplicateTemplate(templateId: string): BatchTemplateIndexItem | null {
  const doc = loadTemplateDocument(templateId);
  if (!doc) return null;

  const meta = getBatchProductionMeta(doc);
  if (!meta) return null;

  const original = loadTemplateIndex().find((t) => t.templateId === templateId);

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
  return saveTemplateToStore(clonedDoc, original?.thumbnailDataUrl);
}
