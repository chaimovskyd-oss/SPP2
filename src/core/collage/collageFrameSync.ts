/**
 * Converts CollageRule slot geometry into managed FrameLayer objects on the page.
 * Called after wizard completion and after any layout reflow.
 */
import { createId } from "@/core/ids";
import { computeFaceCenteredTransformForFrame } from "@/core/frameSmartCrop";
import type { Document, Page } from "@/types/document";
import type { Asset } from "@/types/document";
import type { FrameLayer } from "@/types/layers";
import type { CollageFrameMetadata, CollageImageAssignment, CollageRule, CollageSlot } from "@/types/collage";
import type { ContentTransform } from "@/types/layers";
import type { ID } from "@/types/primitives";

function slotShapeToFrameShape(shape: CollageSlot["shape"]): FrameLayer["shape"] {
  switch (shape) {
    case "circle": return "circle";
    case "ellipse": return "ellipse";
    case "heart": return "svgPath";
    case "rounded": return "rect";
    case "puzzle": return "puzzle" as FrameLayer["shape"];
    // Polygon clips are handled by KonvaLayerNode through collage metadata.
    case "polygon":
    case "diagonalPolygon":
    default: return "rect";
  }
}

function collageGlobalMaskForRule(rule: CollageRule, pageW: number, pageH: number): import("@/types/primitives").JsonValue | null {
  if (rule.activeFamily === "shapedHeart") {
    return { enabled: true, shape: "heart", canvasW: pageW, canvasH: pageH, marginPx: Math.min(pageW, pageH) * 0.04 } as unknown as import("@/types/primitives").JsonValue;
  }
  if (rule.activeFamily === "shapedCircle") {
    return { enabled: true, shape: "circle", canvasW: pageW, canvasH: pageH, marginPx: Math.min(pageW, pageH) * 0.04 } as unknown as import("@/types/primitives").JsonValue;
  }
  return null;
}

function createCollageFrameLayer(
  slot: CollageSlot,
  pageW: number,
  pageH: number,
  rule: CollageRule,
  assignment: CollageImageAssignment | undefined,
  zIndex: number
): FrameLayer {
  const x = slot.x * pageW;
  const y = slot.y * pageH;
  const w = slot.w * pageW;
  const h = slot.h * pageH;

  const collageFrameMeta: CollageFrameMetadata = {
    collageRuleId: rule.id,
    slotId: slot.id,
    slotType: slot.type,
    isCollageFrame: true,
    layoutManaged: true,
    slotShape: slot.shape,
    vertices: slot.shapeParams.vertices,
    pathData: slot.shapeParams.pathData,
    puzzleTabs: slot.shapeParams.puzzleTabs,
    edgeConfig: slot.edgeConfig,
    rotationDeg: slot.rotationDeg,
    zIndex: slot.zIndex,
    globalMask: collageGlobalMaskForRule(rule, pageW, pageH) as unknown as never
  } as CollageFrameMetadata & { globalMask?: import("@/types/primitives").JsonValue };

  return {
    version: 1,
    id: createId("cframe"),
    type: "frame",
    name: slot.label || (slot.type === "empty" ? "תא ריק" : `תא ${slot.role || "רגיל"}`),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    x,
    y,
    width: w,
    height: h,
    rotation: slot.shape === "polygon" || slot.shape === "diagonalPolygon" ? 0 : slot.rotationDeg,
    zIndex,
    selected: false,
    behaviorMode: "layoutLocked",
    shape: slotShapeToFrameShape(slot.shape),
    contentType: slot.type === "empty" ? "empty" : "image",
    imageAssetId: assignment?.assetId,
    fitMode: assignment?.fitMode ?? "fill",
    contentTransform: assignment?.contentTransform ?? { version: 1, offsetX: 0, offsetY: 0, scale: 1, rotation: 0 },
    crop: { x: 0, y: 0, width: w, height: h },
    padding: 0,
    cornerRadius: slot.shape === "rounded" ? Math.min(w, h) * (slot.shapeParams.cornerRadius ?? 0.08) : 0,
    lockedFrame: true,
    lockedContent: false,
    metadata: {
      collageFrame: collageFrameMeta as unknown as import("@/types/primitives").JsonValue,
      collageEdgeConfig: slot.edgeConfig as unknown as import("@/types/primitives").JsonValue
    }
  };
}

/** Build FrameLayers from a CollageRule's cachedSlots */
export function buildCollageFrameLayers(rule: CollageRule, page: Page): FrameLayer[] {
  const slots = rule.cachedSlots ?? [];
  if (slots.length === 0) return [];

  const assignmentMap = new Map(rule.imageAssignments.map((a) => [a.slotId, a]));
  const existingZMax = page.layers.length;

  return slots.map((slot, i) =>
    createCollageFrameLayer(slot, page.width, page.height, rule, assignmentMap.get(slot.id), existingZMax + i)
  );
}

/**
 * @deprecated Use reIndexAssignments from collageModeEngine instead.
 * Kept for backward compatibility — delegates to index-based matching on cachedSlots.
 */
export function remapAssignmentsForLayoutSwitch(
  rule: CollageRule,
  _newLayoutId: ID
): CollageImageAssignment[] {
  // New architecture: cachedSlots is already the current layout slots
  // This function is a no-op shim for old call sites — actual remapping happens in applyLayoutFamily
  return rule.imageAssignments;
}

/**
 * Run smart crop / face detection for a collage assignment.
 * Updates the ContentTransform so the image is well-framed in the slot.
 * Called asynchronously after initial frame creation — does not block render.
 */
export async function applySmartCropToAssignment(
  assignment: CollageImageAssignment,
  asset: Asset,
  frameW: number,
  frameH: number
): Promise<ContentTransform> {
  return computeFaceCenteredTransformForFrame(asset, {
    width: frameW,
    height: frameH,
    fitMode: assignment.fitMode,
    padding: 0,
    contentTransform: assignment.contentTransform
  });
}

/** Sync collage FrameLayers onto the page — replaces old collage frames, keeps free layers */
export function syncCollageFramesToPage(document: Document, ruleId: ID): Document {
  const rule = document.collageRules.find((r) => r.id === ruleId);
  if (!rule) return document;

  const page = document.pages.find((p) => p.id === rule.pageId);
  if (!page) return document;

  // Remove all existing collage frames for this rule
  const freeLayers = page.layers.filter((l) => {
    const meta = (l.metadata as Record<string, unknown>).collageFrame as CollageFrameMetadata | undefined;
    return !(meta?.collageRuleId === ruleId);
  });

  const newFrames = buildCollageFrameLayers(rule, { ...page, layers: freeLayers });
  const frameIds = newFrames.map((f) => f.id);

  const updatedPage: Page = {
    ...page,
    layers: [...freeLayers, ...newFrames]
  };

  const updatedRule: CollageRule = { ...rule, frameIds };

  return {
    ...document,
    collageRules: document.collageRules.map((r) => (r.id === ruleId ? updatedRule : r)),
    pages: document.pages.map((p) => (p.id === rule.pageId ? updatedPage : p))
  };
}
