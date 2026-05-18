import type { Asset, Document, Page } from "@/types/document";
import type { FrameLayer, VisualLayer } from "@/types/layers";
import { DEFAULT_IMAGE_LAYER_EFFECTS } from "@/types/layers";
import type { BatchProductionDocMeta } from "@/types/batchProduction";

// ─── Page clone ───────────────────────────────────────────────────────────────

export interface ClonePageResult {
  page: Page;
  /** Maps every original layer ID → its new ID in the cloned page. */
  layerIdMap: Record<string, string>;
}

/**
 * Deep-clones a page and assigns brand-new UUIDs to the page and every layer.
 * Internal references (parentId, FrameLayer.textLayerId) are remapped to the
 * new IDs so the cloned page is fully self-contained.
 */
export function deepClonePageWithRemappedIds(page: Page): ClonePageResult {
  const layerIdMap: Record<string, string> = {};
  for (const layer of page.layers) {
    layerIdMap[layer.id] = crypto.randomUUID();
  }

  const newLayers: VisualLayer[] = page.layers.map((layer) => {
    const newId = layerIdMap[layer.id] ?? layer.id;
    const newParentId =
      layer.parentId !== undefined
        ? (layerIdMap[layer.parentId] ?? layer.parentId)
        : undefined;

    const base = { ...layer, id: newId, parentId: newParentId };

    // FrameLayer: remap the embedded text layer reference
    if (layer.type === "frame" && layer.textLayerId !== undefined) {
      const remappedTextId = layerIdMap[layer.textLayerId];
      if (remappedTextId !== undefined) {
        return { ...base, textLayerId: remappedTextId } as VisualLayer;
      }
    }

    return base as VisualLayer;
  });

  return {
    page: { ...page, id: crypto.randomUUID(), layers: newLayers },
    layerIdMap,
  };
}

// ─── Generate Engine ──────────────────────────────────────────────────────────

export interface BatchGenerationRecord {
  /** fieldId → value for every variable text field. */
  fields: Record<string, string>;
  imageAssetId?: string;
}

/**
 * Creates a new standalone SPP document from a batch template and a list of
 * records.  One page is generated per record.
 *
 * Rules (from spec):
 * - Variable image: replace imageAssetId on the FrameLayer; reset
 *   metadata.imageEditParams when applyImageAdjustmentsByDefault is false.
 * - Variable text: replace TextLayer.text; all styling is preserved.
 * - Generated document has metadata.mode = "free" and metadata.generatedBatch.
 * - Template metadata (batchProduction) is stripped from the generated doc.
 */
export function generateBatchProduction(
  templateDoc: Document,
  meta: BatchProductionDocMeta,
  records: BatchGenerationRecord[],
  importedAssets: Asset[],
): Document {
  const templatePage = templateDoc.pages[0];
  if (templatePage === undefined) throw new Error("Template has no pages");

  const imageField = meta.variableFields.find((f) => f.type === "image");

  const generatedPages: Page[] = records.map((record) => {
    const { page: cloned, layerIdMap } = deepClonePageWithRemappedIds(templatePage);
    let layers = cloned.layers;

    // ── Variable image ────────────────────────────────────────────────────
    if (imageField !== undefined && record.imageAssetId !== undefined) {
      const newLayerId = layerIdMap[imageField.layerId];
      const assetId = record.imageAssetId; // narrowed to string
      if (newLayerId !== undefined) {
        layers = layers.map((l): VisualLayer => {
          if (l.id !== newLayerId) return l;

          if (l.type === "frame") {
            const frame = l as FrameLayer;
            const updatedMeta = imageField.applyImageAdjustmentsByDefault
              ? frame.metadata
              : { ...frame.metadata, imageEditParams: {} };
            return { ...frame, imageAssetId: assetId, metadata: updatedMeta };
          }

          if (l.type === "image") {
            if (imageField.applyImageAdjustmentsByDefault) {
              return { ...l, assetId };
            }
            return { ...l, assetId, effects: { ...DEFAULT_IMAGE_LAYER_EFFECTS } };
          }

          return l;
        });
      }
    }

    // ── Variable text fields (one per BatchVariableField of type text) ────
    for (const field of meta.variableFields) {
      if (field.type !== "text") continue;
      const value = record.fields[field.id] ?? "";
      if (value.trim().length === 0) continue;
      const newLayerId = layerIdMap[field.layerId];
      if (newLayerId === undefined) continue;
      layers = layers.map((l): VisualLayer => {
        if (l.id !== newLayerId || l.type !== "text") return l;
        return { ...l, text: value };
      });
    }

    return { ...cloned, layers };
  });

  // Merge imported assets, skipping duplicates by ID
  const existingIds = new Set(templateDoc.assets.map((a) => a.id));
  const freshAssets = importedAssets.filter((a) => !existingIds.has(a.id));

  // Strip batchProduction template metadata; add generatedBatch marker
  const { batchProduction: _stripped, ...remainingMeta } = templateDoc.metadata;

  return {
    ...templateDoc,
    id: crypto.randomUUID(),
    name: `${meta.templateName} — ייצור`,
    pages: generatedPages,
    assets: [...templateDoc.assets, ...freshAssets],
    metadata: {
      ...remainingMeta,
      mode: "free",
      generatedBatch: {
        templateId: meta.templateId,
        templateName: meta.templateName,
        generatedAt: new Date().toISOString(),
        recordCount: records.length,
      },
    },
  };
}
