import { createId } from "@/core/ids";
import { createFrameLayer, createShapeLayer, defaultContentTransform } from "@/core/layers/factory";
import { mmToPx } from "@/core/units/conversion";
import { buildSplitTree } from "./collageSplitTree";
import { LAYOUT_REGISTRY, computeSlots } from "./collageLayoutEngine";
import { scoreLayout } from "./collageScoring";
import { createCollageImageAssignment, createCollageSlot } from "./collageFactory";
import { adaptContentTransform, IDENTITY_TRANSFORM } from "@/core/reconcile";
import { buildMaskAwareSlotsFromAnalysis, readCollageMaskSnapshot } from "./collageMaskShape";
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
import type { FrameLayer, ShapeLayer } from "@/types/layers";
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
    if (slots.filter((slot) => slot.type === "image").length < imageCount) continue;
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
  imageInputs: CollageImageInput[] = [],
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
  const newSlots = computeRuleSlots(rule, newFamily, params);

  // Port of Python: cell.image_index = i — assign pool[0]→slot[0], pool[1]→slot[1]
  // This is always correct regardless of previous layout's hero/non-hero structure
  const newAssignments = assignByPoolOrder(rule.imagePool, newSlots, rule.id, rule.imageAssignments, rule.cachedSlots ?? [], imageInputs);

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
  imageInputs: CollageImageInput[] = [],
): CollageRule {
  const spacingPx = mmToPx(rule.spacingMM, dpi);
  const marginPx = mmToPx(rule.marginMM, dpi);
  const imageCount = rule.imagePool.length;
  const params: CollageLayoutParams = { imageCount, canvasW, canvasH, spacingPx, marginPx, splitTree: rule.splitTree };
  const newSlots = computeRuleSlots(rule, rule.activeFamily, params);
  // Reflow keeps same family — just re-assign by pool order to new slots
  const newAssignments = assignByPoolOrder(rule.imagePool, newSlots, rule.id, rule.imageAssignments, rule.cachedSlots ?? [], imageInputs);
  return { ...rule, cachedSlots: newSlots, imageAssignments: newAssignments };
}

// ─── 4. Add / remove images ───────────────────────────────────────────────────

export function applyNewImagePool(
  rule: CollageRule,
  newPool: ID[],
  canvasW: number,
  canvasH: number,
  dpi = 300,
  imageInputs: CollageImageInput[] = [],
): CollageRule {
  const spacingPx = mmToPx(rule.spacingMM, dpi);
  const marginPx = mmToPx(rule.marginMM, dpi);
  const imageCount = newPool.length;

  const splitTree = rule.activeFamily === "splitTree"
    ? buildSplitTree(imageCount) // rebuild tree for new count
    : undefined;

  const params: CollageLayoutParams = { imageCount, canvasW, canvasH, spacingPx, marginPx, splitTree };
  const newSlots = computeRuleSlots(rule, rule.activeFamily, params);
  // Simple pool-order assignment — always assigns ALL pool images, no gaps
  const newAssignments = assignByPoolOrder(newPool, newSlots, rule.id, rule.imageAssignments, rule.cachedSlots ?? [], imageInputs);

  return { ...rule, imagePool: newPool, cachedSlots: newSlots, imageAssignments: newAssignments, splitTree };
}

function computeRuleSlots(rule: CollageRule, family: CollageLayoutFamily, params: CollageLayoutParams): CollageSlot[] {
  if (family === "customMaskShape") {
    const snapshot = readCollageMaskSnapshot(rule.metadata["collageShapeTemplate"]);
    return buildMaskAwareSlotsFromAnalysis(snapshot?.analysis, params.imageCount, params.canvasW, params.canvasH, params.spacingPx, params.marginPx);
  }
  return computeSlots(family, params);
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
  imageInputs: CollageImageInput[] = [],
): CollageImageAssignment[] {
  const imageSlots = newSlots.filter(s => s.type === "image");
  const oldByAsset = new Map(oldAssignments.map(a => [a.assetId, a]));
  const oldSlotById = new Map(oldSlots.map(s => [s.id, s]));
  const slotAssetPairs = pairImagesToSlots(imagePool, imageSlots, imageInputs);

  return slotAssetPairs.map(({ assetId, slot }) => {
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

function pairImagesToSlots(
  imagePool: ID[],
  imageSlots: CollageSlot[],
  imageInputs: CollageImageInput[]
): Array<{ assetId: ID; slot: CollageSlot }> {
  const pool = imagePool.slice(0, imageSlots.length);
  if (imageInputs.length === 0 || pool.length <= 1) {
    return pool.map((assetId, index) => ({ assetId, slot: imageSlots[index]! }));
  }

  const inputById = new Map(imageInputs.map((input) => [input.assetId, input]));
  const maxArea = Math.max(0.0001, ...imageSlots.map((slot) => slot.w * slot.h));
  const sortedSlots = [...imageSlots].sort((a, b) => {
    const roleA = slotRoleWeight(a);
    const roleB = slotRoleWeight(b);
    if (roleA !== roleB) return roleB - roleA;
    return b.w * b.h - a.w * a.h;
  });
  const unused = new Set(pool);
  const result = new Map<ID, ID>();

  for (const slot of sortedSlots) {
    let bestAsset: ID | null = null;
    let bestScore = -Infinity;
    for (const assetId of unused) {
      const input = inputById.get(assetId);
      const score = scoreImageSlotPair(input, slot, maxArea);
      if (score > bestScore) {
        bestScore = score;
        bestAsset = assetId;
      }
    }
    if (bestAsset === null) break;
    unused.delete(bestAsset);
    result.set(slot.id, bestAsset);
  }

  return imageSlots.flatMap((slot, index) => {
    const assetId = result.get(slot.id) ?? pool[index];
    return assetId ? [{ assetId, slot }] : [];
  });
}

function scoreImageSlotPair(input: CollageImageInput | undefined, slot: CollageSlot, maxSlotArea: number): number {
  if (!input || input.width <= 0 || input.height <= 0) return 0;
  const imageAspect = input.width / input.height;
  const slotAspect = slot.w / Math.max(0.0001, slot.h);
  const aspectScore = Math.min(imageAspect, slotAspect) / Math.max(imageAspect, slotAspect);
  const slotAreaNorm = Math.min(1, (slot.w * slot.h) / maxSlotArea);
  const faceCount = input.faceRegions?.length ?? 0;
  const faceImportance = Math.min(1, faceCount / 3);
  const imagePixels = Math.max(1, input.width * input.height);
  const resolutionImportance = Math.min(1, Math.log10(imagePixels) / 7);
  const importance = Math.max(input.analysisScore ?? 0, faceImportance, resolutionImportance * 0.35);
  const roleBoost = slot.role === "hero" ? 0.12 : slot.role === "standard" ? 0.04 : 0;
  const largeSlotFit = importance * slotAreaNorm;
  const smallSlotPenalty = faceImportance * Math.max(0, 1 - slotAreaNorm) * 0.28;
  return aspectScore * 0.7 + largeSlotFit * 0.22 + roleBoost - smallSlotPenalty;
}

function slotRoleWeight(slot: CollageSlot): number {
  if (slot.role === "hero") return 3;
  if (slot.role === "standard") return 2;
  return 1;
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

function isManagedCollageLayer(layer: { metadata?: Record<string, unknown> }, ruleId: ID): boolean {
  const frameMeta = layer.metadata?.collageFrame as { collageRuleId?: string } | undefined;
  const backgroundMeta = layer.metadata?.collageBackground as { collageRuleId?: string } | undefined;
  return frameMeta?.collageRuleId === ruleId || backgroundMeta?.collageRuleId === ruleId;
}

function asNumberRecord(value: unknown): Record<string, number> | undefined {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v));
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries) as Record<string, number>;
}

function sameContentTransform(a: CollageImageAssignment["contentTransform"], b: CollageImageAssignment["contentTransform"]): boolean {
  return a.offsetX === b.offsetX && a.offsetY === b.offsetY && a.scale === b.scale && a.rotation === b.rotation;
}

export function mergeLiveFrameEditsIntoCollageRule(rule: CollageRule, page: Page): CollageRule {
  const framesBySlot = new Map<ID, FrameLayer>();
  for (const layer of page.layers) {
    if (layer.type !== "frame") continue;
    const meta = layer.metadata["collageFrame"] as { collageRuleId?: string; slotId?: ID } | undefined;
    if (meta?.collageRuleId === rule.id && meta.slotId) {
      framesBySlot.set(meta.slotId, layer);
    }
  }
  if (framesBySlot.size === 0) return rule;

  let changed = false;
  const imageAssignments = rule.imageAssignments.map((assignment) => {
    const frame = framesBySlot.get(assignment.slotId);
    if (!frame) return assignment;

    const quickEditParams =
      asNumberRecord(frame.metadata["imageEditParams"]) ??
      asNumberRecord(frame.metadata["collageImageEditParams"]);
    const collageColorAdj = frame.metadata["collageColorAdj"] as CollageImageAssignment["colorAdjustments"] | null | undefined;
    const edgeConfig = frame.metadata["collageEdgeConfig"] as CollageImageAssignment["edgeConfig"] | null | undefined;

    const next: CollageImageAssignment = {
      ...assignment,
      contentTransform: frame.contentTransform ?? assignment.contentTransform,
      fitMode: frame.fitMode ?? assignment.fitMode,
      visualEffects: frame.visualEffects ?? assignment.visualEffects,
      colorAdjustments: collageColorAdj ?? assignment.colorAdjustments,
      imageEditParams: quickEditParams ?? assignment.imageEditParams,
      edgeConfig: edgeConfig ?? assignment.edgeConfig
    };
    next.hasManualTransform = assignment.hasManualTransform || !sameContentTransform(assignment.contentTransform, next.contentTransform);

    if (next !== assignment) changed = true;
    return next;
  });

  return changed ? { ...rule, imageAssignments } : rule;
}

function createCollageSpacingBackgroundLayer(
  rule: CollageRule,
  canvasW: number,
  canvasH: number,
  marginPx: number,
  zIndex: number
): ShapeLayer | null {
  const w = Math.max(0, canvasW - marginPx * 2);
  const h = Math.max(0, canvasH - marginPx * 2);
  if (w <= 0 || h <= 0) return null;
  const spacingColor = rule.canvasSettings.spacingColor ?? rule.canvasSettings.backgroundColor ?? "#ffffff";
  return {
    ...createShapeLayer({
      name: "Collage spacing background",
      rect: { x: marginPx, y: marginPx, width: w, height: h },
      shape: "rect",
      locked: true,
      zIndex,
      metadata: {
        collageBackground: {
          collageRuleId: rule.id,
          kind: "spacing",
          layoutManaged: true
        } as unknown as import("@/types/primitives").JsonValue
      }
    }),
    fill: { version: 1, color: spacingColor, opacity: 1 }
  };
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

  const otherLayers = page.layers.filter((layer) => !isManagedCollageLayer(layer, rule.id));

  const sortedSlots = [...rule.cachedSlots].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  const globalMask = collageGlobalMaskForRule(rule, canvasW, canvasH);
  const rasterMask = readCollageMaskSnapshot(rule.metadata["collageShapeTemplate"]);
  const dpi = page.setup?.dpi ?? 300;
  const marginPx = mmToPx(rule.marginMM, dpi);
  const spacingBackground = createCollageSpacingBackgroundLayer(rule, canvasW, canvasH, marginPx, otherLayers.length);

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
      maskSource: rasterMask?.maskAssetId
        ? {
            version: 1,
            type: "alphaAsset",
            assetId: rasterMask.maskAssetId,
            width: rasterMask.width,
            height: rasterMask.height
          }
        : undefined,
      zIndex: (otherLayers.length + (spacingBackground ? 1 : 0) + i),
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
          globalRasterMask: rasterMask?.maskAssetId
            ? {
                enabled: true,
                canvasW,
                canvasH,
                maskAssetId: rasterMask.maskAssetId,
                maskWidth: rasterMask.width,
                maskHeight: rasterMask.height
              }
            : undefined,
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
  const marginColor = rule.canvasSettings.marginColor ?? rule.canvasSettings.backgroundColor ?? page.background.color ?? "#ffffff";
  return {
    page: {
      ...page,
      background: { ...page.background, type: "color", color: marginColor },
      layers: spacingBackground ? [...otherLayers, spacingBackground, ...newFrameLayers] : [...otherLayers, ...newFrameLayers]
    },
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
