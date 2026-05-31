import type { ContentTransform, FaceAnchorData, FrameLayer } from "@/types/layers";
import type { ImageAdjustmentStack } from "@/types/imageAdjustments";
import type { CropRect, FitMode, ID, JsonValue, Metadata } from "@/types/primitives";
import type { VisualEffectStack } from "@/types/visualEffects";
import { adaptContentTransform, type SlotDims } from "./transformAdapt";

/**
 * Snapshot of user-editable FrameLayer state. Captured before a destructive
 * sync so the new FrameLayer can re-receive these values via restoreFrameState.
 */
export interface PreservedFrameState {
  layerId: ID;
  assetId?: ID;
  contentTransform: ContentTransform;
  hasManualTransform: boolean;
  crop?: CropRect;
  fitMode: FitMode;
  smartCropMode?: FrameLayer["smartCropMode"];
  faceAnchor?: FaceAnchorData;
  visualEffects?: VisualEffectStack;
  imageAdjustments?: ImageAdjustmentStack;
  /** Free-form metadata fields that carry user work (variable bindings, color adjustments, etc.). */
  preservedMetadata: Metadata;
  prevSlot: SlotDims;
}

/**
 * Metadata keys that are derived from the rule/slot and should NOT be carried
 * over from the previous frame (the sync will rewrite them).
 */
const VOLATILE_META_KEYS = new Set([
  "collageFrame",
  "collageColorAdj",
  "collageImageEditParams",
  "collageEdgeConfig",
  "classPhotoFrame",
  "maskFrame",
]);

function extractPreservedMetadata(meta: Metadata | undefined): Metadata {
  if (!meta) return {};
  const out: Metadata = {};
  for (const [k, v] of Object.entries(meta)) {
    if (VOLATILE_META_KEYS.has(k)) continue;
    out[k] = v as JsonValue;
  }
  return out;
}

export function snapshotFrameState(frame: FrameLayer, slotW: number, slotH: number): PreservedFrameState {
  const hasManual = (frame.metadata?.hasManualTransform as boolean | undefined) ??
    !isIdentityTransform(frame.contentTransform);
  return {
    layerId: frame.id,
    assetId: frame.imageAssetId,
    contentTransform: { ...frame.contentTransform },
    hasManualTransform: hasManual,
    crop: frame.crop ? { ...frame.crop } : undefined,
    fitMode: frame.fitMode,
    smartCropMode: frame.smartCropMode,
    faceAnchor: frame.faceAnchor,
    visualEffects: frame.visualEffects,
    imageAdjustments: frame.imageAdjustments,
    preservedMetadata: extractPreservedMetadata(frame.metadata),
    prevSlot: { w: slotW, h: slotH },
  };
}

/**
 * Merge preserved state into a freshly-built FrameLayer. Adapts the
 * ContentTransform to the new slot dimensions and re-applies preserved
 * metadata that isn't owned by the sync pipeline.
 */
export function restoreFrameState(
  fresh: FrameLayer,
  preserved: PreservedFrameState,
  newSlot: SlotDims,
): FrameLayer {
  const adapted = adaptContentTransform(
    preserved.contentTransform,
    preserved.prevSlot,
    newSlot,
    { hasManual: preserved.hasManualTransform, faceAnchor: preserved.faceAnchor },
  );

  const mergedMetadata: Metadata = { ...fresh.metadata };
  for (const [k, v] of Object.entries(preserved.preservedMetadata)) {
    if (mergedMetadata[k] === undefined) mergedMetadata[k] = v as JsonValue;
  }
  if (adapted.hasManual) {
    mergedMetadata.hasManualTransform = true as unknown as JsonValue;
  }

  return {
    ...fresh,
    id: preserved.layerId,
    contentTransform: adapted.transform,
    // Prefer caller-provided visualEffects (if the sync explicitly set them);
    // otherwise restore from snapshot.
    visualEffects: fresh.visualEffects ?? preserved.visualEffects,
    imageAdjustments: fresh.imageAdjustments ?? preserved.imageAdjustments,
    smartCropMode: fresh.smartCropMode ?? preserved.smartCropMode,
    faceAnchor: fresh.faceAnchor ?? preserved.faceAnchor,
    metadata: mergedMetadata,
  };
}

function isIdentityTransform(t: ContentTransform | undefined): boolean {
  if (!t) return true;
  return t.offsetX === 0 && t.offsetY === 0 && t.scale === 1 && t.rotation === 0;
}
