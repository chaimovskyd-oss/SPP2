import { createId } from "@/core/ids";
import { createFrameLayer, defaultContentTransform } from "@/core/layers/factory";
import { mmToPx } from "@/core/units/conversion";
import { buildSplitTree } from "./collageSplitTree";
import { LAYOUT_REGISTRY, computeSlots } from "./collageLayoutEngine";
import { scoreLayout } from "./collageScoring";
import { createCollageImageAssignment, createCollageSlot } from "./collageFactory";
import { adaptContentTransform, IDENTITY_TRANSFORM } from "@/core/reconcile";
import type {
  CollageComplexityMode,
  CollageImageAssignment,
  CollageImageInput,
  CollageLayoutFamily,
  CollageLayoutParams,
  CollageRule,
  CollageSlot,
  CollageTemplate,
  ScoredLayoutSuggestion,
  CollageSplitNode,
} from "@/types/collage";
import type { Page } from "@/types/document";
import type { FrameLayer } from "@/types/layers";
import type { ID } from "@/types/primitives";

// ─── 1. Generate scored suggestions (in-memory only, never stored) ────────────

export function generateCollageSuggestions(
  imageInputs: CollageImageInput[],
  canvasW: number,
  canvasH: number,
  spacingPx: number,
  marginPx: number,
  mode: CollageComplexityMode,
  splitTree?: CollageSplitNode,
): ScoredLayoutSuggestion[] {
  const imageCount = imageInputs.length;
  if (imageCount === 0) return [];

  const params: CollageLayoutParams = { imageCount, canvasW, canvasH, spacingPx, marginPx, splitTree };

  const seen = new Set<string>();
  const candidates: ScoredLayoutSuggestion[] = [];

  for (const def of LAYOUT_REGISTRY) {
    if (imageCount < def.minImages || imageCount > def.maxImages) continue;
    if (mode === "simple" && def.mode === "creative") continue;

    const slots = def.generate(params);
    const key = slots.map(s => `${s.x.toFixed(3)},${s.y.toFixed(3)},${s.w.toFixed(3)},${s.h.toFixed(3)}`).join("|");
    if (seen.has(key)) continue;
    seen.add(key);

    const result = scoreLayout(slots, imageInputs);
    candidates.push({
      family: def.family,
      name: def.name,
      nameHe: def.nameHe,
      slots,
      score: result.score,
      scoreBreakdown: {
        aspectRatioScore: result.aspectRatioScore,
        faceSafetyScore: result.faceSafetyScore,
        balanceScore: result.balanceScore,
        diversityScore: result.diversityScore,
      },
    });
  }

  return candidates.sort((a, b) => b.score - a.score);
}

// ─── 2. Apply a layout family ─────────────────────────────────────────────────

export function applyLayoutFamily(
  rule: CollageRule,
  newFamily: CollageLayoutFamily,
  canvasW: number,
  canvasH: number,
  dpi = 300,
): CollageRule {
  const spacingPx = mmToPx(rule.spacingMM, dpi);
  const marginPx = mmToPx(rule.marginMM, dpi);
  const imageCount = rule.imagePool.length;

  const splitTree = newFamily === "splitTree"
    ? (rule.activeFamily === "splitTree" && rule.splitTree
        ? rule.splitTree
        : buildSplitTree(imageCount))
    : undefined;

  const params: CollageLayoutParams = { imageCount, canvasW, canvasH, spacingPx, marginPx, splitTree };
  const newSlots = computeSlots(newFamily, params);

  // Port of Python: cell.image_index = i — assign pool[0]→slot[0], pool[1]→slot[1]
  // This is always correct regardless of previous layout's hero/non-hero structure
  const newAssignments = assignByPoolOrder(rule.imagePool, newSlots, rule.id, rule.imageAssignments, rule.cachedSlots ?? []);

  return {
    ...rule,
    activeFamily: newFamily,
    splitTree,
    cachedSlots: newSlots,
    imageAssignments: newAssignments,
  };
}

// ─── 3. Reflow (same family, new canvas size or spacing) ─────────────────────

export function reflowCollage(
  rule: CollageRule,
  canvasW: number,
  canvasH: number,
  dpi = 300,
): CollageRule {
  const spacingPx = mmToPx(rule.spacingMM, dpi);
  const marginPx = mmToPx(rule.marginMM, dpi);
  const imageCount = rule.imagePool.length;
  const params: CollageLayoutParams = { imageCount, canvasW, canvasH, spacingPx, marginPx, splitTree: rule.splitTree };
  const newSlots = computeSlots(rule.activeFamily, params);
  // Reflow keeps same family — just re-assign by pool order to new slots
  const newAssignments = assignByPoolOrder(rule.imagePool, newSlots, rule.id, rule.imageAssignments, rule.cachedSlots ?? []);
  return { ...rule, cachedSlots: newSlots, imageAssignments: newAssignments };
}

// ─── 4. Add / remove images ───────────────────────────────────────────────────

export function applyNewImagePool(
  rule: CollageRule,
  newPool: ID[],
  canvasW: number,
  canvasH: number,
  dpi = 300,
): CollageRule {
  const spacingPx = mmToPx(rule.spacingMM, dpi);
  const marginPx = mmToPx(rule.marginMM, dpi);
  const imageCount = newPool.length;

  const splitTree = rule.activeFamily === "splitTree"
    ? buildSplitTree(imageCount) // rebuild tree for new count
    : undefined;

  const params: CollageLayoutParams = { imageCount, canvasW, canvasH, spacingPx, marginPx, splitTree };
  const newSlots = computeSlots(rule.activeFamily, params);
  // Simple pool-order assignment — always assigns ALL pool images, no gaps
  const newAssignments = assignByPoolOrder(newPool, newSlots, rule.id, rule.imageAssignments, rule.cachedSlots ?? []);

  return { ...rule, imagePool: newPool, cachedSlots: newSlots, imageAssignments: newAssignments, splitTree };
}

// ─── 5. Apply saved template ──────────────────────────────────────────────────

export function applyCollageTemplate(
  rule: CollageRule,
  template: CollageTemplate,
): CollageRule {
  const scaledSlots: CollageSlot[] = template.slots.map(slot => ({
    ...slot,
    id: createId("slot"),
    rotationDeg: slot.rotationDeg ?? 0,
    zIndex: slot.zIndex ?? 0,
  }));

  const imageSlots = scaledSlots.filter(s => s.type === "image");
  const availImages = rule.imagePool.slice(0, imageSlots.length);
  const newAssignments: CollageImageAssignment[] = availImages.map((assetId, i) =>
    createCollageImageAssignment(rule.id, assetId, imageSlots[i]!.id)
  );

  return {
    ...rule,
    activeFamily: "custom",
    splitTree: template.splitTree,
    cachedSlots: scaledSlots,
    imageAssignments: newAssignments,
  };
}

// ─── Pool-order assignment (port of Python cell.image_index = i) ─────────────

/**
 * Assign images from pool to slots in order: pool[0]→imageSlot[0], pool[1]→imageSlot[1], ...
 * This is the correct algorithm from the Python app — simple, always produces
 * exactly pool.length assignments (no gaps, no missing images).
 *
 * Keeps old contentTransform if the same assetId ends up in a slot with similar
 * aspect ratio (< 0.3 change), so manual crops are preserved when possible.
 */
const RESET_TRANSFORM = { ...IDENTITY_TRANSFORM };

/**
 * Pool-order assignment with state preservation.
 *
 * For each surviving image, we look up the previous slot it sat in (via
 * oldSlots) and adapt its ContentTransform to the new slot's geometry via
 * `adaptContentTransform`:
 *   - similar aspect ratio → scale offsets, keep manual crop
 *   - large aspect change  → identity (smart-crop can re-apply via faceAnchor)
 *
 * visualEffects, colorAdjustments, imageEditParams, edgeConfig are carried
 * through verbatim — they are slot-independent user work.
 */
export function assignByPoolOrder(
  imagePool: ID[],
  newSlots: CollageSlot[],
  ruleId: ID,
  oldAssignments: CollageImageAssignment[] = [],
  oldSlots: CollageSlot[] = [],
): CollageImageAssignment[] {
  const imageSlots = newSlots.filter(s => s.type === "image");
  const oldByAsset = new Map(oldAssignments.map(a => [a.assetId, a]));
  const oldSlotById = new Map(oldSlots.map(s => [s.id, s]));

  return imagePool.slice(0, imageSlots.length).map((assetId, i) => {
    const slot = imageSlots[i]!;
    const prev = oldByAsset.get(assetId);

    if (prev) {
      const oldSlot = oldSlotById.get(prev.slotId);
      // Normalized slot dims (0..1) — adapter only cares about ratio + scale.
      const adapted = oldSlot
        ? adaptContentTransform(
            prev.contentTransform,
            { w: oldSlot.w, h: oldSlot.h },
            { w: slot.w, h: slot.h },
            { hasManual: prev.hasManualTransform ?? false, faceAnchor: undefined },
          )
        : { transform: { ...RESET_TRANSFORM }, hasManual: false };

      return {
        ...prev,
        slotId: slot.id,
        contentTransform: adapted.transform,
        hasManualTransform: adapted.hasManual,
        // Explicitly carry user work that is independent of slot geometry.
        visualEffects: prev.visualEffects,
        colorAdjustments: prev.colorAdjustments,
        imageEditParams: prev.imageEditParams,
        edgeConfig: prev.edgeConfig,
      };
    }

    return createCollageImageAssignment(ruleId, assetId, slot.id);
  });
}

/**
 * @deprecated Use assignByPoolOrder directly.
 * Kept for compatibility — now delegates to pool-order assignment.
 */
export function reIndexAssignments(
  _oldAssignments: CollageImageAssignment[],
  _oldSlots: CollageSlot[],
  _newSlots: CollageSlot[],
): CollageImageAssignment[] {
  // This function no longer does complex re-indexing.
  // Callers should use assignByPoolOrder(imagePool, newSlots, ruleId, oldAssignments) instead.
  return _oldAssignments;
}


function collageGlobalMaskForRule(rule: CollageRule, canvasW: number, canvasH: number): import("@/types/primitives").JsonValue | null {
  if (rule.activeFamily === "shapedHeart") {
    return { enabled: true, shape: "heart", canvasW, canvasH, marginPx: Math.min(canvasW, canvasH) * 0.04 } as unknown as import("@/types/primitives").JsonValue;
  }
  if (rule.activeFamily === "shapedCircle") {
    return { enabled: true, shape: "circle", canvasW, canvasH, marginPx: Math.min(canvasW, canvasH) * 0.04 } as unknown as import("@/types/primitives").JsonValue;
  }
  return null;
}

// ─── Frame sync ───────────────────────────────────────────────────────────────

export function syncFrameLayersToPage(
  page: Page,
  rule: CollageRule,
  canvasW: number,
  canvasH: number,
): { page: Page; frameIds: ID[] } {
  // Index existing collage frames by slotId so we can reuse layer IDs +
  // preserved per-frame state across the sync.
  const existingBySlotId = new Map<string, FrameLayer>();
  for (const l of page.layers) {
    if (l.type !== "frame") continue;
    const meta = (l.metadata as Record<string, unknown>).collageFrame as
      | { collageRuleId?: string; slotId?: string }
      | undefined;
    if (meta?.collageRuleId !== rule.id || !meta.slotId) continue;
    existingBySlotId.set(meta.slotId, l as FrameLayer);
  }

  const otherLayers = page.layers.filter(l => {
    const meta = (l.metadata as Record<string, unknown>).collageFrame as { collageRuleId?: string } | undefined;
    return meta?.collageRuleId !== rule.id;
  });

  const sortedSlots = [...rule.cachedSlots].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  const globalMask = collageGlobalMaskForRule(rule, canvasW, canvasH);

  const newFrameLayers: FrameLayer[] = sortedSlots.map((slot, i) => {
    const assignment = rule.imageAssignments.find(a => a.slotId === slot.id);
    const existing = existingBySlotId.get(slot.id);

    const fresh = createFrameLayer({
      id: existing?.id,
      name: slot.label || (slot.type === "empty" ? "תא ריק" : `תא ${i + 1}`),
      rect: {
        x: slot.x * canvasW,
        y: slot.y * canvasH,
        width: slot.w * canvasW,
        height: slot.h * canvasH,
      },
      behaviorMode: "layoutLocked",
      shape: mapSlotShape(slot.shape),
      contentType: slot.type === "empty" ? "empty" : (assignment?.assetId ? "image" : "empty"),
      imageAssetId: assignment?.assetId,
      contentTransform: assignment?.contentTransform,
      fitMode: assignment?.fitMode ?? "fill",
      cornerRadius: slot.shapeParams.cornerRadius,
      lockedFrame: false,
      lockedContent: false,
      zIndex: (otherLayers.length + i),
      metadata: {
        collageFrame: {
          collageRuleId: rule.id,
          slotId: slot.id,
          slotType: slot.type,
          isCollageFrame: true,
          layoutManaged: true,
          slotShape: slot.shape,
          vertices: slot.shapeParams.vertices,
          pathData: slot.shapeParams.pathData,
          edgeConfig: slot.edgeConfig,
          globalMask,
          zIndex: slot.zIndex ?? 0,
          ...(slot.shape === "puzzle" && slot.shapeParams.puzzleTabs
            ? { puzzleTabs: slot.shapeParams.puzzleTabs }
            : {}),
        } as unknown as import("@/types/primitives").JsonValue,
        // Mirror color adjustments, extras, and edge config so FrameNode can apply them
        // without looking up the collage rule at render time.
        collageColorAdj: assignment?.colorAdjustments != null
          ? assignment.colorAdjustments as unknown as import("@/types/primitives").JsonValue
          : null,
        collageImageEditParams: (assignment?.imageEditParams != null && Object.keys(assignment.imageEditParams).length > 0)
          ? assignment.imageEditParams as unknown as import("@/types/primitives").JsonValue
          : null,
        collageEdgeConfig: assignment?.edgeConfig != null
          ? assignment.edgeConfig as unknown as import("@/types/primitives").JsonValue
          : null
      }
    });

    // Carry user-owned state across the destructive rebuild:
    //   - visualEffects from the assignment (slot-independent user work)
    //   - faceAnchor + smartCropMode from the previous frame if not overridden
    //   - any non-volatile metadata the user attached to the frame
    const withPreserved: FrameLayer = {
      ...fresh,
      visualEffects: assignment?.visualEffects ?? existing?.visualEffects,
      smartCropMode: existing?.smartCropMode ?? fresh.smartCropMode,
      faceAnchor: existing?.faceAnchor,
    };
    if (existing) {
      const preservedMeta: Record<string, unknown> = { ...withPreserved.metadata };
      for (const [k, v] of Object.entries(existing.metadata ?? {})) {
        if (preservedMeta[k] !== undefined) continue;
        if (k === "collageFrame" || k === "collageColorAdj"
          || k === "collageImageEditParams" || k === "collageEdgeConfig") continue;
        preservedMeta[k] = v;
      }
      withPreserved.metadata = preservedMeta as typeof withPreserved.metadata;
    }
    return withPreserved;
  });

  const frameIds = newFrameLayers.map(f => f.id);
  return {
    page: { ...page, layers: [...otherLayers, ...newFrameLayers] },
    frameIds,
  };
}

function mapSlotShape(shape: CollageSlot["shape"]): FrameLayer["shape"] {
  switch (shape) {
    case "circle": return "circle";
    case "ellipse": return "ellipse";
    case "heart": return "svgPath";
    case "rounded": return "rect";
    case "puzzle": return "puzzle";
    default: return "rect";
  }
}

// ─── Legacy compat: kept so old imports still compile ────────────────────────

export interface CollageSuggestionsResult {
  layouts: ScoredLayoutSuggestion[];
  bestLayoutId: string | null;
}

/** @deprecated Use generateCollageSuggestions instead */
export function generateScoredLayoutSuggestions(
  images: CollageImageInput[],
  canvasW: number,
  canvasH: number,
  options: { imageCount: number; canvasAspectW: number; canvasAspectH: number; spacingPx: number; marginPx: number; complexityMode: CollageComplexityMode }
): CollageSuggestionsResult {
  const suggestions = generateCollageSuggestions(
    images, canvasW, canvasH,
    options.spacingPx, options.marginPx,
    options.complexityMode
  );
  return {
    layouts: suggestions,
    bestLayoutId: suggestions[0]?.family ?? null,
  };
}
