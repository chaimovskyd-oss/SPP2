import type { Document } from "@/types/document";
import type { JsonValue } from "@/types/primitives";
import {
  BATCH_PRODUCTION_META_KEY,
  type BatchProductionDocMeta,
  type BatchVariableField,
} from "@/types/batchProduction";

export function getBatchProductionMeta(doc: Document): BatchProductionDocMeta | null {
  return (doc.metadata[BATCH_PRODUCTION_META_KEY] as unknown as BatchProductionDocMeta | undefined) ?? null;
}

export function setBatchProductionMeta(
  doc: Document,
  meta: BatchProductionDocMeta,
): Document {
  return {
    ...doc,
    metadata: {
      ...doc.metadata,
      [BATCH_PRODUCTION_META_KEY]: meta as unknown as JsonValue,
    },
  };
}

export function getVariableFieldForLayer(
  doc: Document,
  layerId: string,
): BatchVariableField | undefined {
  return getBatchProductionMeta(doc)?.variableFields.find((f) => f.layerId === layerId);
}

export function upsertVariableField(doc: Document, field: BatchVariableField): Document {
  const meta = getBatchProductionMeta(doc);
  const page = doc.pages[0];
  const base: BatchProductionDocMeta = meta ?? {
    isTemplate: true,
    templateId: crypto.randomUUID(),
    templateName: doc.name,
    variableFields: [],
    canvas: {
      widthPx: page?.width ?? 0,
      heightPx: page?.height ?? 0,
      dpi: doc.dpi,
      unit: "px",
      orientation: "portrait",
      ratio: page ? page.width / page.height : 1,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const existingIndex = base.variableFields.findIndex((f) => f.layerId === field.layerId);
  const nextFields =
    existingIndex >= 0
      ? base.variableFields.map((f, i) => (i === existingIndex ? field : f))
      : [...base.variableFields, field];
  return setBatchProductionMeta(doc, {
    ...base,
    variableFields: nextFields,
    updatedAt: new Date().toISOString(),
  });
}

export function removeVariableFieldForLayer(doc: Document, layerId: string): Document {
  const meta = getBatchProductionMeta(doc);
  if (!meta) return doc;
  return setBatchProductionMeta(doc, {
    ...meta,
    variableFields: meta.variableFields.filter((f) => f.layerId !== layerId),
    updatedAt: new Date().toISOString(),
  });
}
