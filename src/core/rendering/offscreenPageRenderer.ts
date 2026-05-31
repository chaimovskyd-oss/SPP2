import { resolveExportAssetPath } from "@/core/assets/assetManager";
import { ENABLE_CLASSIC_ADJUSTMENT_LAYER_RENDERING, ENABLE_IMAGE_LEVEL_ADJUSTMENTS, ENABLE_PAGE_LOOK_LAYERS } from "@/core/features/adjustmentFlags";
import { applyAdjustmentImageData, hasActiveAdjustment } from "@/core/rendering/adjustmentPipeline";
import { applyImageAdjustmentStack, hasActiveImageAdjustments } from "@/core/rendering/imageAdjustmentPipeline";
import { renderPageLookEffect } from "@/core/rendering/pageLookEffects";
import { pageLookMaster } from "@/types/imageAdjustments";
import type { Asset, Page } from "@/types/document";
import type { BlendMode, ImageLayer } from "@/types/layers";

export interface OffscreenRenderedPage {
  dataUrl: string;
  mimeType: "image/png" | "image/jpeg";
  widthPx: number;
  heightPx: number;
  widthMm: number;
  heightMm: number;
  dpi: number;
  orientation: "portrait" | "landscape";
  warnings: string[];
}

export interface OffscreenRenderOptions {
  mimeType?: "image/png" | "image/jpeg";
  pixelRatio?: number;
  jpegQuality?: number;
}

type RenderSegment = {
  canvas: HTMLCanvasElement;
  layerId: string;
  opacity: number;
  blendMode: BlendMode;
};

export function getOffscreenRenderWarnings(page: Page): string[] {
  const warnings: string[] = [];
  for (const layer of page.layers) {
    if (layer.visible === false || layer.type === "adjustment-layer") continue;
    if (layer.type !== "image") {
      warnings.push(`Offscreen export does not yet support ${layer.type} layer "${layer.name}".`);
      continue;
    }
    if (Math.abs(layer.rotation) > 0.001) {
      warnings.push(`Offscreen export does not yet support rotated image layer "${layer.name}".`);
    }
    if (hasLocalImageEffects(layer)) {
      warnings.push(`Offscreen export does not yet support local image effects on "${layer.name}".`);
    }
  }
  return warnings;
}

export function canRenderPageOffscreen(page: Page): boolean {
  return getOffscreenRenderWarnings(page).length === 0;
}

export async function renderPageOffscreen(page: Page, assets: Asset[], options: OffscreenRenderOptions = {}): Promise<OffscreenRenderedPage> {
  const warnings = getOffscreenRenderWarnings(page);
  if (warnings.length > 0) {
    throw new Error(warnings.join("\n"));
  }

  const mimeType = options.mimeType ?? "image/png";
  const pixelRatio = Math.max(0.1, options.pixelRatio ?? 1);
  const widthPx = Math.max(1, Math.round(page.width * pixelRatio));
  const heightPx = Math.max(1, Math.round(page.height * pixelRatio));
  const segments: RenderSegment[] = [];
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));

  await renderBackground(page, assetById, segments, widthPx, heightPx, pixelRatio);

  const ordered = [...page.layers].sort((a, b) => a.zIndex - b.zIndex);
  for (const layer of ordered) {
    if (layer.visible === false) continue;
    if (layer.type === "image") {
      const segment = await renderImageLayerSegment(layer, assetById, widthPx, heightPx, pixelRatio);
      if (segment !== null) segments.push(segment);
      continue;
    }
    if (layer.type !== "adjustment-layer" || !hasActiveAdjustment(layer)) continue;
    // Safe Mode: legacy AdjustmentLayer export is disabled. Migration converts
    // these to image-level adjustments before they are missed.
    if (!ENABLE_CLASSIC_ADJUSTMENT_LAYER_RENDERING) continue;
    if (layer.targetMode === "clipped-to-layer") {
      const target = [...segments].reverse().find((segment) => segment.layerId !== "__background__");
      if (target !== undefined) applyAdjustmentToCanvas(target.canvas, layer.adjustments, layer.opacity);
    } else {
      for (const segment of segments) {
        applyAdjustmentToCanvas(segment.canvas, layer.adjustments, layer.opacity);
      }
    }
  }

  const finalCanvas = createCanvas(widthPx, heightPx);
  const context = finalCanvas.getContext("2d");
  if (context === null) throw new Error("Could not create offscreen export context.");
  for (const segment of segments) {
    context.save();
    context.globalAlpha = segment.opacity;
    context.globalCompositeOperation = mapBlendMode(segment.blendMode);
    context.drawImage(segment.canvas, 0, 0);
    context.restore();
  }

  // Page Looks: always-top atmospheric overlays (Phase 4). Same renderer as live.
  if (ENABLE_PAGE_LOOK_LAYERS && page.pageLooks !== undefined) {
    for (const look of page.pageLooks) {
      if (look.enabled === false) continue;
      const master = pageLookMaster(look);
      if (master <= 0) continue;
      renderPageLookEffect(context, look.effect, widthPx, heightPx, master);
    }
  }

  const dpi = page.setup.dpi || 300;
  return {
    dataUrl: finalCanvas.toDataURL(mimeType, mimeType === "image/jpeg" ? options.jpegQuality ?? 0.92 : undefined),
    mimeType,
    widthPx: page.width,
    heightPx: page.height,
    widthMm: (page.width / dpi) * 25.4,
    heightMm: (page.height / dpi) * 25.4,
    dpi,
    orientation: page.orientation ?? (page.width >= page.height ? "landscape" : "portrait"),
    warnings
  };
}

async function renderBackground(
  page: Page,
  assetById: Map<string, Asset>,
  segments: RenderSegment[],
  widthPx: number,
  heightPx: number,
  pixelRatio: number
): Promise<void> {
  if (page.background.type === "transparent") return;
  const canvas = createCanvas(widthPx, heightPx);
  const context = canvas.getContext("2d");
  if (context === null) return;
  if (page.background.type === "color") {
    context.fillStyle = page.background.color ?? "#ffffff";
    context.fillRect(0, 0, widthPx, heightPx);
  } else if (page.background.assetId !== undefined) {
    const asset = assetById.get(page.background.assetId);
    const src = resolveExportAssetPath(asset);
    if (src !== undefined) {
      const image = await loadImage(src);
      context.drawImage(image, 0, 0, page.width * pixelRatio, page.height * pixelRatio);
    }
  }
  segments.push({ canvas, layerId: "__background__", opacity: 1, blendMode: "normal" });
}

async function renderImageLayerSegment(
  layer: ImageLayer,
  assetById: Map<string, Asset>,
  widthPx: number,
  heightPx: number,
  pixelRatio: number
): Promise<RenderSegment | null> {
  const asset = assetById.get(layer.assetId);
  const src = resolveExportAssetPath(asset);
  if (src === undefined) return null;
  const image = await loadImage(src);
  const canvas = createCanvas(widthPx, heightPx);
  const context = canvas.getContext("2d");
  if (context === null) return null;

  const crop = layer.crop;
  const sx = Math.max(0, crop.x * image.naturalWidth);
  const sy = Math.max(0, crop.y * image.naturalHeight);
  const sw = Math.max(1, crop.width * image.naturalWidth);
  const sh = Math.max(1, crop.height * image.naturalHeight);
  const dx = layer.x * pixelRatio;
  const dy = layer.y * pixelRatio;
  const dw = layer.width * pixelRatio;
  const dh = layer.height * pixelRatio;

  const stack = ENABLE_IMAGE_LEVEL_ADJUSTMENTS ? layer.imageAdjustments : undefined;
  const adjustmentsActive = stack !== undefined && stack.enabled !== false && hasActiveImageAdjustments(stack.stack);

  if (adjustmentsActive) {
    // Apply the stack to an image-sized bitmap (matching the live Konva node cache),
    // then composite onto the page — guarantees live === export parity.
    const iw = Math.max(1, Math.round(dw));
    const ih = Math.max(1, Math.round(dh));
    const imageCanvas = createCanvas(iw, ih);
    const imageContext = imageCanvas.getContext("2d");
    if (imageContext === null) return null;
    imageContext.drawImage(image, sx, sy, sw, sh, 0, 0, iw, ih);
    const imageData = imageContext.getImageData(0, 0, iw, ih);
    applyImageAdjustmentStack(imageData, stack!.stack, 1);
    imageContext.putImageData(imageData, 0, 0);
    context.drawImage(imageCanvas, dx, dy);
  } else {
    context.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
  }
  return { canvas, layerId: layer.id, opacity: Math.max(0, Math.min(1, layer.opacity)), blendMode: layer.blendMode };
}

function applyAdjustmentToCanvas(canvas: HTMLCanvasElement, adjustments: import("@/types/layers").AdjustmentOperation[], opacity: number): void;
function applyAdjustmentToCanvas(canvas: HTMLCanvasElement, adjustments: import("@/types/layers").AdjustmentOperation[], opacity: number): void {
  const context = canvas.getContext("2d");
  if (context === null) return;
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  applyAdjustmentImageData(imageData, adjustments, Math.max(0, Math.min(1, opacity)));
  context.putImageData(imageData, 0, 0);
}

function hasLocalImageEffects(layer: ImageLayer): boolean {
  const effects = layer.effects;
  return effects.brightness !== 0 ||
    effects.contrast !== 0 ||
    effects.saturation !== 0 ||
    effects.exposure !== 0 ||
    effects.hue !== 0 ||
    effects.grayscale ||
    effects.blur !== 0 ||
    effects.shadow !== null ||
    effects.outline !== null ||
    (effects.luminance ?? 0) !== 0 ||
    effects.sepia === true ||
    effects.invert === true ||
    (effects.threshold ?? 0) !== 0 ||
    (effects.posterize ?? 0) !== 0 ||
    effects.remove_white === true ||
    effects.color_pop === true ||
    layer.visualEffects?.enabled === true ||
    layer.pixelMask !== undefined ||
    layer.perspective !== undefined;
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image for offscreen export: ${src}`));
    image.src = src;
  });
}

function mapBlendMode(mode: BlendMode): GlobalCompositeOperation {
  const table: Record<BlendMode, GlobalCompositeOperation> = {
    normal: "source-over",
    multiply: "multiply",
    screen: "screen",
    overlay: "overlay",
    darken: "darken",
    lighten: "lighten"
  };
  return table[mode] ?? "source-over";
}
