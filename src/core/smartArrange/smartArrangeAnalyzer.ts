import type { Page } from "@/types/document";
import type { VisualLayer } from "@/types/layers";
import type { Margins, Rect } from "@/types/primitives";
import { mmToPx } from "@/core/units/conversion";
import { rectArea } from "./smartArrangeGeometry";
import type {
  SmartArrangeContext,
  SmartArrangeItem,
  SmartArrangeItemKind,
  SmartArrangeMode,
  SmartArrangeRole
} from "./smartArrangeTypes";

const IMPORTANCE: Record<SmartArrangeRole, number> = {
  title: 100,
  mainImage: 90,
  subtitle: 70,
  bodyText: 60,
  secondaryImage: 50,
  shortText: 40,
  logo: 30,
  decoration: 20,
  unknown: 10,
  background: 0
};

/** Layer types Smart Arrange will never touch. */
const NON_ARRANGEABLE = new Set(["background", "guide", "adjustment-layer", "mask", "group"]);

function marginsArePositive(m: Margins): boolean {
  return m.top > 0 || m.right > 0 || m.bottom > 0 || m.left > 0;
}

/** Compute the safe drawing area (page px). Margins/safeArea are stored in px. */
export function computeSafeBounds(page: Page): Rect {
  const canvas: Rect = { x: 0, y: 0, width: page.width, height: page.height };
  const dpi = page.setup?.dpi ?? 300;
  const safeArea = page.setup?.safeArea;
  const margins = page.margins;

  let m: Margins | null = null;
  if (safeArea !== undefined && marginsArePositive(safeArea)) m = safeArea;
  else if (margins !== undefined && marginsArePositive(margins)) m = margins;

  if (m === null) {
    const inset = Math.max(0.05 * Math.min(page.width, page.height), mmToPx(5, dpi));
    m = { top: inset, right: inset, bottom: inset, left: inset };
  }

  const width = Math.max(1, canvas.width - m.left - m.right);
  const height = Math.max(1, canvas.height - m.top - m.bottom);
  return { x: m.left, y: m.top, width, height };
}

function layerBounds(layer: VisualLayer): Rect {
  return { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
}

function layerKind(layer: VisualLayer): SmartArrangeItemKind {
  if (layer.type === "text") return "text";
  if (layer.type === "image" || layer.type === "frame") return "image";
  if (layer.type === "shape") return "shape";
  return "unknown";
}

/** True if this image/frame reads as a full-canvas background. */
function looksLikeBackground(bounds: Rect, canvas: Rect, isLowest: boolean): boolean {
  const cover = rectArea(bounds) / Math.max(1, rectArea(canvas));
  return cover >= 0.95 && isLowest;
}

interface TextHints {
  fontSize: number;
  textLength: number;
  lineCount: number;
  alignment: "left" | "center" | "right" | "justify";
  direction: "auto" | "ltr" | "rtl";
}

function readTextHints(layer: Extract<VisualLayer, { type: "text" }>): TextHints {
  const text = layer.text ?? "";
  const explicitLines = text.split(/\r?\n/).length;
  return {
    fontSize: layer.fontSize,
    textLength: text.trim().length,
    lineCount: explicitLines,
    alignment: layer.alignment,
    direction: layer.direction
  };
}

function classifyText(h: TextHints, maxFont: number): SmartArrangeRole {
  const isLargest = h.fontSize >= maxFont - 0.5;
  if (isLargest && h.textLength <= 40 && h.lineCount <= 2) return "title";
  if (h.textLength > 120 || h.lineCount >= 4) return "bodyText";
  if (h.fontSize >= maxFont * 0.7 && h.textLength <= 60) return "subtitle";
  return "shortText";
}

function classifyImage(bounds: Rect, canvas: Rect, isLargest: boolean): SmartArrangeRole {
  const cover = rectArea(bounds) / Math.max(1, rectArea(canvas));
  if (cover < 0.03) {
    const ratio = bounds.width / Math.max(1, bounds.height);
    return ratio > 0.6 && ratio < 1.7 ? "logo" : "decoration";
  }
  if (isLargest) return "mainImage";
  return "secondaryImage";
}

function deriveGaps(page: Page): { small: number; normal: number; large: number } {
  const base = Math.min(page.width, page.height);
  return { small: base * 0.02, normal: base * 0.04, large: base * 0.06 };
}

/**
 * Build a SmartArrangeContext from the active page + current selection.
 * When a selection is present only those layers are eligible; skip rules
 * (locked / hidden / background / non-arrangeable) always apply.
 */
export function analyzeLayersForSmartArrange(args: {
  page: Page;
  selectedLayerIds: string[];
  mode: SmartArrangeMode;
  direction?: "rtl" | "ltr";
}): SmartArrangeContext {
  const { page, selectedLayerIds, mode } = args;
  const canvas: Rect = { x: 0, y: 0, width: page.width, height: page.height };
  const safeBounds = computeSafeBounds(page);
  const hasSelection = selectedLayerIds.length > 0;
  const selected = new Set(selectedLayerIds);

  // Lowest z-index among potentially-background layers, for the bg heuristic.
  const minZ = page.layers.reduce((min, l) => Math.min(min, l.zIndex), Infinity);

  const eligible = page.layers.filter((layer) => {
    if (hasSelection && !selected.has(layer.id)) return false;
    if (!layer.visible) return false;
    if (layer.locked) return false;
    if (layer.smartArrangeLocked === true || layer.metadata?.smartArrangeLocked === true) return false;
    if (NON_ARRANGEABLE.has(layer.type)) return false;
    if (layer.parentId !== undefined && layer.parentId !== null) return false; // grouped child
    return true;
  });

  // Largest image area (for mainImage) + max font size (for title).
  let maxImageArea = 0;
  let maxFont = 0;
  for (const layer of eligible) {
    if (layer.type === "image" || layer.type === "frame") {
      maxImageArea = Math.max(maxImageArea, rectArea(layerBounds(layer)));
    } else if (layer.type === "text") {
      maxFont = Math.max(maxFont, layer.fontSize);
    }
  }

  const items: SmartArrangeItem[] = [];
  for (const layer of eligible) {
    const bounds = layerBounds(layer);
    const kind = layerKind(layer);
    const isImageLike = layer.type === "image" || layer.type === "frame";

    // Background-image guard (only when no explicit selection forces it in).
    if (isImageLike && !hasSelection && looksLikeBackground(bounds, canvas, layer.zIndex === minZ)) {
      continue;
    }

    let role: SmartArrangeRole = "unknown";
    let fontSize: number | undefined;
    let alignment: TextHints["alignment"] | undefined;
    let direction: TextHints["direction"] | undefined;
    let textLength: number | undefined;
    let lineCount: number | undefined;

    if (layer.type === "text") {
      const h = readTextHints(layer);
      role = classifyText(h, maxFont);
      fontSize = h.fontSize;
      alignment = h.alignment;
      direction = h.direction;
      textLength = h.textLength;
      lineCount = h.lineCount;
    } else if (isImageLike) {
      const isLargest = rectArea(bounds) >= maxImageArea - 0.5;
      role = classifyImage(bounds, canvas, isLargest);
    }

    // Frames may move but never resize (resizing risks breaking fit/fill).
    const isFrame = layer.type === "frame";
    const rotated = Math.abs(layer.rotation ?? 0) > 0.01;

    items.push({
      layerId: layer.id,
      role,
      kind,
      bounds,
      originalBounds: { ...bounds },
      locked: layer.locked,
      visible: layer.visible,
      importance: IMPORTANCE[role],
      canMove: true,
      canResize: !isFrame && !rotated,
      layerType: layer.type,
      fontSize,
      originalFontSize: fontSize,
      alignment,
      direction,
      textLength,
      lineCount
    });
  }

  const direction: "rtl" | "ltr" =
    args.direction ??
    (items.some((it) => it.direction === "rtl") ? "rtl" : "rtl"); // Hebrew-first default

  return {
    pageId: page.id,
    canvasBounds: canvas,
    safeBounds,
    items,
    direction,
    mode,
    gaps: deriveGaps(page)
  };
}
