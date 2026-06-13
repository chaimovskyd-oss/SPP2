import type Konva from "konva";

import type { Page } from "@/types/document";
import { loadHtmlImage } from "@/ui/contentFill/composePatch";
import type { GenerativeExpandModel } from "@/services/ai/generativeExpand/types";

/** Longest edge of the generation buffer. Larger inputs are downscaled, then the
 *  result is placed back at full canvas resolution by the new full-page layer. */
export const MAX_GEN_LONG_SIDE = 2048;

/** Alpha at/above this counts as an image (keep) pixel. */
const ALPHA_THRESHOLD = 24;

/** Soft tekhelet tint for the on-canvas "this will be filled" highlight. */
const HIGHLIGHT_RGBA: [number, number, number, number] = [86, 182, 255, 84];

export type SmartExpandErrorCode = "ALREADY_FULL" | "NO_IMAGE" | "CONTEXT_MISSING";

export class SmartExpandError extends Error {
  code: SmartExpandErrorCode;
  constructor(code: SmartExpandErrorCode, message: string) {
    super(message);
    this.name = "SmartExpandError";
    this.code = code;
  }
}

export interface SmartExpandInputs {
  /** Canvas-sized PNG: rendered layer over white. */
  inputImageDataUrl: string;
  /** Canvas-sized PNG: white = empty (fill), black = image (keep). For mask-URL APIs (flux). */
  maskDataUrl: string;
  /** Canvas-sized PNG with the fill region in the ALPHA channel (alpha=255 → fill).
   *  The Python sidecar's decode_mask reads alpha, not luminance. */
  maskAlphaDataUrl: string;
  /** Just the visible image region (on white), cropped to `placement`. Feeds Bria Expand. */
  layerImageDataUrl: string;
  /** Visible image footprint inside the gen buffer, integer gen pixels. */
  placement: { x: number; y: number; width: number; height: number };
  /** True when the footprint is effectively a full rectangle (unrotated, no holes) —
   *  safe to send to the geometry-based Bria Expand API. */
  isRectangular: boolean;
  /** Page-sized tinted overlay PNG for on-canvas highlighting of the fill region. */
  highlightDataUrl: string;
  /** Fraction of the canvas that is empty and will be filled (0..1). */
  fillRatio: number;
  genWidth: number;
  genHeight: number;
  /** Visible image footprint, in page pixels. */
  layerBounds: { x: number; y: number; width: number; height: number };
}

interface IsolatedLayerRender {
  /** Transparent-background PNG of just the layer, cropped to its client rect. */
  dataUrl: string;
  /** Client rect in page pixels (may extend outside the page if the image is larger). */
  rect: { x: number; y: number; width: number; height: number };
}

/**
 * Renders ONLY the selected Konva node to a transparent PNG. Unlike
 * `rasterizeLayers`, this excludes the page background (a near-white Rect that
 * would otherwise make the whole canvas read as opaque), while still reflecting
 * the layer's true rotation, crop and alpha. The stage is normalised (scale 1,
 * layer offsets 0) so the node's client rect is in page pixels, then restored.
 */
function renderSelectedLayer(
  stage: Konva.Stage,
  layerId: string,
  pixelRatio: number,
): IsolatedLayerRender {
  const node = stage.findOne(`#${layerId}`);
  if (node === undefined) {
    throw new SmartExpandError("CONTEXT_MISSING", "לא נמצאה התמונה הנבחרת על הקנבס.");
  }

  const layers = stage.getLayers();
  const savedScale = { x: stage.scaleX(), y: stage.scaleY() };
  const savedOffsets = layers.map((l) => ({ layer: l, x: l.x(), y: l.y() }));

  try {
    layers.forEach((l) => {
      l.x(0);
      l.y(0);
    });
    stage.scale({ x: 1, y: 1 });

    const rect = node.getClientRect({ skipShadow: false, skipStroke: false });
    const dataUrl = node.toDataURL({
      mimeType: "image/png",
      x: rect.x,
      y: rect.y,
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height),
      pixelRatio,
    });
    return { dataUrl, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
  } finally {
    savedOffsets.forEach(({ layer, x, y }) => {
      layer.x(x);
      layer.y(y);
    });
    stage.scale(savedScale);
    stage.batchDraw();
  }
}

/**
 * Builds the outpaint input image + mask from the selected layer. The empty
 * canvas area (anywhere the layer has no opaque pixels) becomes the white fill
 * region; the layer footprint stays black (keep).
 */
export async function buildSmartExpandInputs(
  stage: Konva.Stage,
  page: Page,
  layerId: string,
  maxLongSide = MAX_GEN_LONG_SIDE,
): Promise<SmartExpandInputs> {
  const longSide = Math.max(page.width, page.height);
  const pixelRatio = Math.min(1, maxLongSide / longSide);

  const { dataUrl, rect } = renderSelectedLayer(stage, layerId, pixelRatio);
  const layerImg = await loadHtmlImage(dataUrl);

  const genWidth = Math.max(1, Math.round(page.width * pixelRatio));
  const genHeight = Math.max(1, Math.round(page.height * pixelRatio));
  const drawX = rect.x * pixelRatio;
  const drawY = rect.y * pixelRatio;

  // Alpha buffer: the layer on transparent, at its real canvas position.
  const alphaCanvas = document.createElement("canvas");
  alphaCanvas.width = genWidth;
  alphaCanvas.height = genHeight;
  const alphaCtx = alphaCanvas.getContext("2d");
  if (alphaCtx === null) throw new SmartExpandError("CONTEXT_MISSING", "Cannot read rendered image.");
  alphaCtx.drawImage(layerImg, drawX, drawY, layerImg.naturalWidth, layerImg.naturalHeight);
  const { data } = alphaCtx.getImageData(0, 0, genWidth, genHeight);

  const total = genWidth * genHeight;
  const keep = new Uint8Array(total);
  let keepCount = 0;
  for (let i = 0; i < total; i++) {
    if (data[i * 4 + 3] >= ALPHA_THRESHOLD) {
      keep[i] = 1;
      keepCount++;
    }
  }

  if (keepCount === 0) {
    throw new SmartExpandError("NO_IMAGE", "התמונה ריקה — אין מה להרחיב.");
  }
  const fillRatio = 1 - keepCount / total;
  if (fillRatio < 0.02) {
    throw new SmartExpandError("ALREADY_FULL", "התמונה כבר ממלאת את הקנבס. אין אזור ריק להשלמה.");
  }

  // Visible image footprint, clamped to the gen buffer (integer pixels).
  const px = Math.max(0, Math.round(drawX));
  const py = Math.max(0, Math.round(drawY));
  const px2 = Math.min(genWidth, Math.round(drawX + layerImg.naturalWidth));
  const py2 = Math.min(genHeight, Math.round(drawY + layerImg.naturalHeight));
  const placement = {
    x: px,
    y: py,
    width: Math.max(1, px2 - px),
    height: Math.max(1, py2 - py),
  };
  // Rectangularity: how much of the placement box is opaque. Rotated images or
  // PNGs with transparency fall below the threshold → geometry-based expand
  // (Bria) is unsafe and the mask-based path must be used instead.
  const isRectangular = keepCount / (placement.width * placement.height) >= 0.98;

  // Input: the layer at its canvas position over an UNDERLAY of itself,
  // stretched to cover the whole canvas and heavily blurred. A flat white
  // background biases diffusion models (SDXL especially, whose init latents
  // derive from the input) toward gray/white fills; a blurred continuation of
  // the photo's own colors anchors the fill in the right palette. Bria ignores
  // this (geometry path); flux/SD regenerate the masked area on top of it.
  const inputCanvas = document.createElement("canvas");
  inputCanvas.width = genWidth;
  inputCanvas.height = genHeight;
  const inputCtx = inputCanvas.getContext("2d");
  if (inputCtx === null) throw new SmartExpandError("CONTEXT_MISSING", "Cannot build input image.");
  inputCtx.fillStyle = "#ffffff";
  inputCtx.fillRect(0, 0, genWidth, genHeight);
  try {
    const blurPx = Math.max(16, Math.round(Math.max(genWidth, genHeight) / 24));
    inputCtx.filter = `blur(${blurPx}px)`;
    // Overscan past the edges so the blur doesn't bleed the white background in.
    inputCtx.drawImage(
      layerImg,
      -blurPx * 2, -blurPx * 2,
      genWidth + blurPx * 4, genHeight + blurPx * 4,
    );
  } finally {
    inputCtx.filter = "none";
  }
  inputCtx.drawImage(layerImg, drawX, drawY, layerImg.naturalWidth, layerImg.naturalHeight);
  const inputImageDataUrl = inputCanvas.toDataURL("image/png");

  // Crop of the visible image region (feeds the Bria Expand geometry API).
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = placement.width;
  cropCanvas.height = placement.height;
  const cropCtx = cropCanvas.getContext("2d");
  if (cropCtx === null) throw new SmartExpandError("CONTEXT_MISSING", "Cannot crop image.");
  cropCtx.drawImage(
    inputCanvas,
    placement.x, placement.y, placement.width, placement.height,
    0, 0, placement.width, placement.height,
  );
  const layerImageDataUrl = cropCanvas.toDataURL("image/png");

  // Mask: white where empty (fill), black where image (keep).
  // Highlight: soft tekhelet tint over the fill region, transparent over the image.
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = genWidth;
  maskCanvas.height = genHeight;
  const maskCtx = maskCanvas.getContext("2d");
  if (maskCtx === null) throw new SmartExpandError("CONTEXT_MISSING", "Cannot build mask.");
  const maskImage = maskCtx.createImageData(genWidth, genHeight);
  const maskAlphaCanvas = document.createElement("canvas");
  maskAlphaCanvas.width = genWidth;
  maskAlphaCanvas.height = genHeight;
  const maskAlphaCtx = maskAlphaCanvas.getContext("2d");
  if (maskAlphaCtx === null) throw new SmartExpandError("CONTEXT_MISSING", "Cannot build mask.");
  const maskAlphaImage = maskAlphaCtx.createImageData(genWidth, genHeight);
  const highlightCanvas = document.createElement("canvas");
  highlightCanvas.width = genWidth;
  highlightCanvas.height = genHeight;
  const highlightCtx = highlightCanvas.getContext("2d");
  if (highlightCtx === null) throw new SmartExpandError("CONTEXT_MISSING", "Cannot build highlight.");
  const highlightImage = highlightCtx.createImageData(genWidth, genHeight);
  const [hr, hg, hb, ha] = HIGHLIGHT_RGBA;
  for (let i = 0; i < total; i++) {
    const fill = keep[i] !== 1;
    const v = fill ? 255 : 0;
    maskImage.data[i * 4] = v;
    maskImage.data[i * 4 + 1] = v;
    maskImage.data[i * 4 + 2] = v;
    maskImage.data[i * 4 + 3] = 255;
    maskAlphaImage.data[i * 4] = 255;
    maskAlphaImage.data[i * 4 + 1] = 255;
    maskAlphaImage.data[i * 4 + 2] = 255;
    maskAlphaImage.data[i * 4 + 3] = v;
    if (fill) {
      highlightImage.data[i * 4] = hr;
      highlightImage.data[i * 4 + 1] = hg;
      highlightImage.data[i * 4 + 2] = hb;
      highlightImage.data[i * 4 + 3] = ha;
    }
  }
  maskCtx.putImageData(maskImage, 0, 0);
  const maskDataUrl = maskCanvas.toDataURL("image/png");
  maskAlphaCtx.putImageData(maskAlphaImage, 0, 0);
  const maskAlphaDataUrl = maskAlphaCanvas.toDataURL("image/png");
  highlightCtx.putImageData(highlightImage, 0, 0);
  const highlightDataUrl = highlightCanvas.toDataURL("image/png");

  const layerBounds = {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };

  return {
    inputImageDataUrl,
    maskDataUrl,
    maskAlphaDataUrl,
    layerImageDataUrl,
    placement,
    isRectangular,
    highlightDataUrl,
    fillRatio,
    genWidth,
    genHeight,
    layerBounds,
  };
}

/**
 * Builds outpaint inputs for a collage CELL: instead of filling the empty canvas
 * around a free image, it expands the image ALONG ITS SHORT AXIS — the dimension
 * that `fit` leaves with gaps — until the image aspect matches the cell aspect.
 * After generation the result fills the cell with `fit` (== `fill`, no cropping),
 * so heads near the edge are no longer cut off.
 *
 * Works in the image's own pixel space (not the canvas). The image is centered;
 * the new pixels are symmetric strips on the short axis. `highlightDataUrl` is
 * empty (no on-canvas highlight for the cell flow).
 */
export async function buildCellExpandInputs(
  src: string,
  cellAspect: number,
  maxLongSide = MAX_GEN_LONG_SIDE,
): Promise<SmartExpandInputs> {
  if (!Number.isFinite(cellAspect) || cellAspect <= 0) {
    throw new SmartExpandError("CONTEXT_MISSING", "לא ניתן לקרוא את מידות התא.");
  }
  const img = await loadHtmlImage(src);
  const imgW = img.naturalWidth;
  const imgH = img.naturalHeight;
  if (imgW <= 0 || imgH <= 0) {
    throw new SmartExpandError("NO_IMAGE", "לא ניתן לטעון את התמונה להרחבה.");
  }

  const imgAspect = imgW / imgH;
  // Already matches the cell aspect → nothing to expand.
  if (Math.abs(imgAspect - cellAspect) / cellAspect < 0.02) {
    throw new SmartExpandError("ALREADY_FULL", "התמונה כבר מתאימה לתא — אין צורך בהרחבה.");
  }

  // Gen-buffer dims: keep the long matching axis, grow the short axis so the
  // whole buffer matches the cell aspect.
  let genFullW: number;
  let genFullH: number;
  if (imgAspect > cellAspect) {
    // Image wider than the cell → fit leaves vertical gaps → grow height.
    genFullW = imgW;
    genFullH = Math.round(imgW / cellAspect);
  } else {
    // Image narrower than the cell → fit leaves horizontal gaps → grow width.
    genFullH = imgH;
    genFullW = Math.round(imgH * cellAspect);
  }

  // Downscale the whole buffer so its long side fits the generation budget.
  const scale = Math.min(1, maxLongSide / Math.max(genFullW, genFullH));
  const genWidth = Math.max(1, Math.round(genFullW * scale));
  const genHeight = Math.max(1, Math.round(genFullH * scale));
  const drawW = Math.max(1, Math.round(imgW * scale));
  const drawH = Math.max(1, Math.round(imgH * scale));
  const drawX = Math.round((genWidth - drawW) / 2);
  const drawY = Math.round((genHeight - drawH) / 2);

  const placement = { x: drawX, y: drawY, width: drawW, height: drawH };
  const fillRatio = 1 - (drawW * drawH) / (genWidth * genHeight);

  // Input image: blurred self-underlay across the whole buffer (anchors diffusion
  // in the photo's palette — same fix used for canvas expand), then the sharp
  // image centered at its placement.
  const inputCanvas = document.createElement("canvas");
  inputCanvas.width = genWidth;
  inputCanvas.height = genHeight;
  const inputCtx = inputCanvas.getContext("2d");
  if (inputCtx === null) throw new SmartExpandError("CONTEXT_MISSING", "Cannot build input image.");
  inputCtx.fillStyle = "#ffffff";
  inputCtx.fillRect(0, 0, genWidth, genHeight);
  try {
    const blurPx = Math.max(16, Math.round(Math.max(genWidth, genHeight) / 24));
    inputCtx.filter = `blur(${blurPx}px)`;
    inputCtx.drawImage(
      img,
      -blurPx * 2, -blurPx * 2,
      genWidth + blurPx * 4, genHeight + blurPx * 4,
    );
  } finally {
    inputCtx.filter = "none";
  }
  inputCtx.drawImage(img, drawX, drawY, drawW, drawH);
  const inputImageDataUrl = inputCanvas.toDataURL("image/png");

  // Crop of the centered image (feeds the Bria Expand geometry API).
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = drawW;
  cropCanvas.height = drawH;
  const cropCtx = cropCanvas.getContext("2d");
  if (cropCtx === null) throw new SmartExpandError("CONTEXT_MISSING", "Cannot crop image.");
  cropCtx.drawImage(img, 0, 0, drawW, drawH);
  const layerImageDataUrl = cropCanvas.toDataURL("image/png");

  // Mask (white = fill strips, black = centered image keep).
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = genWidth;
  maskCanvas.height = genHeight;
  const maskCtx = maskCanvas.getContext("2d");
  if (maskCtx === null) throw new SmartExpandError("CONTEXT_MISSING", "Cannot build mask.");
  maskCtx.fillStyle = "#ffffff";
  maskCtx.fillRect(0, 0, genWidth, genHeight);
  maskCtx.fillStyle = "#000000";
  maskCtx.fillRect(drawX, drawY, drawW, drawH);
  const maskDataUrl = maskCanvas.toDataURL("image/png");

  // Alpha mask for the Python sidecar (alpha=255 → fill). Fill everywhere, then
  // clear the keep rect to alpha 0.
  const maskAlphaCanvas = document.createElement("canvas");
  maskAlphaCanvas.width = genWidth;
  maskAlphaCanvas.height = genHeight;
  const maskAlphaCtx = maskAlphaCanvas.getContext("2d");
  if (maskAlphaCtx === null) throw new SmartExpandError("CONTEXT_MISSING", "Cannot build mask.");
  maskAlphaCtx.fillStyle = "rgba(255,255,255,1)";
  maskAlphaCtx.fillRect(0, 0, genWidth, genHeight);
  maskAlphaCtx.clearRect(drawX, drawY, drawW, drawH);
  const maskAlphaDataUrl = maskAlphaCanvas.toDataURL("image/png");

  return {
    inputImageDataUrl,
    maskDataUrl,
    maskAlphaDataUrl,
    layerImageDataUrl,
    placement,
    isRectangular: true,
    highlightDataUrl: "",
    fillRatio,
    genWidth,
    genHeight,
    layerBounds: { x: drawX, y: drawY, width: drawW, height: drawH },
  };
}

export interface ModelRecommendation {
  model: GenerativeExpandModel;
  /** Hebrew hint shown to the user; empty when the default (SDXL) is fine. */
  reason: string;
}

/** Size-based recommendation (spec §"חישוב הרחבה"). The reason string nudges the
 *  user toward a stronger model for large fills. */
export function recommendModel(fillRatio: number): ModelRecommendation {
  if (fillRatio < 0.2) {
    return { model: "local-sd-fast", reason: "" };
  }
  if (fillRatio < 0.5) {
    return {
      model: "local-sdxl-quality",
      reason: "ההרחבה יחסית גדולה. מומלץ להשתמש ב'איכות גבוהה' (SDXL) או במודל אונליין.",
    };
  }
  return {
    model: "fal-ai-expand",
    reason: "ההרחבה גדולה מאוד. מומלץ להשתמש במודל אונליין (Fal.ai) לתוצאה הטובה ביותר.",
  };
}
