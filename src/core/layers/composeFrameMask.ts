import { resolveCanvasAssetPath } from "@/core/assets/assetManager";
import type { Asset } from "@/types/document";
import type { ImageLayer } from "@/types/layers";

export interface ComposedFrameMask {
  dataUrl: string;
  width: number;
  height: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Cannot load image: ${src}`));
    img.src = src;
  });
}

/**
 * Renders the *current visible alpha* of an ImageLayer to an offscreen canvas
 * matching the pipeline in KonvaLayerNode (image → crop → flip → internal
 * offset/scale → imageShape clip → pixelMask destination-in → library-mask
 * destination-in) and returns it as a PNG data URL.
 *
 * The resulting PNG has the layer's pixel dimensions (`layer.width × layer.height`)
 * and its alpha channel is the exact silhouette that will be used as the
 * Frame/Mask. Saving the RGBA (not just alpha) preserves debuggability — the
 * FrameLayer renderer only reads alpha during `destination-in` so the colour
 * channels are inconsequential.
 */
export async function composeFrameMaskFromImageLayer(
  layer: ImageLayer,
  assets: Asset[]
): Promise<ComposedFrameMask> {
  const W = Math.max(1, Math.round(layer.width));
  const H = Math.max(1, Math.round(layer.height));

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("Cannot create 2D context for mask composition");

  // ── Resolve assets ────────────────────────────────────────────────────────
  const imageAsset = assets.find((a) => a.id === layer.assetId);
  const imageSrc = resolveCanvasAssetPath(imageAsset);
  if (imageSrc === undefined) throw new Error("Image asset is missing");
  const image = await loadImage(imageSrc);

  const pixelMaskAsset = layer.pixelMask !== undefined
    ? assets.find((a) => a.id === layer.pixelMask?.assetId)
    : undefined;
  const pixelMaskSrc = pixelMaskAsset !== undefined ? resolveCanvasAssetPath(pixelMaskAsset) : undefined;
  const pixelMaskImage = pixelMaskSrc !== undefined ? await loadImage(pixelMaskSrc) : null;

  const imageShape = (layer.metadata["imageShape"] as string | undefined) ?? "rect";
  const cornerRadius = (layer.metadata["imageCornerRadius"] as number | undefined) ?? 0;
  const isLibMask = imageShape === "mask_lib";
  const libMaskDataUrl = isLibMask
    ? (layer.metadata["imageMaskDataUrl"] as string | undefined)
    : undefined;
  const libMaskImage = libMaskDataUrl !== undefined ? await loadImage(libMaskDataUrl) : null;

  const flipH = (layer.metadata["flipH"] as boolean | undefined) ?? false;
  const flipV = (layer.metadata["flipV"] as boolean | undefined) ?? false;

  // ── 1. Apply shape clip BEFORE drawing the image, so anything outside the
  //       clip is discarded. mask_lib does not use a vector clip (it composites
  //       via destination-in below).
  ctx.save();
  const hasClip = !isLibMask && (imageShape !== "rect" || cornerRadius > 0);
  if (hasClip) {
    ctx.beginPath();
    if (imageShape === "circle" || imageShape === "ellipse") {
      ctx.ellipse(W / 2, H / 2, W / 2, H / 2, 0, 0, Math.PI * 2);
    } else {
      const r = Math.min(cornerRadius, W / 2, H / 2);
      ctx.moveTo(r, 0);
      ctx.arcTo(W, 0, W, H, r);
      ctx.arcTo(W, H, 0, H, r);
      ctx.arcTo(0, H, 0, 0, r);
      ctx.arcTo(0, 0, W, 0, r);
      ctx.closePath();
    }
    ctx.clip();
  }

  // ── 2. Compute draw transform matching KonvaLayerNode ─────────────────────
  // The image is drawn at (imgX, imgY) with scaleX/scaleY (negative for flip).
  // imageOffsetX/Y and imageScale (legacy fields used by old image+mask path)
  // shift/scale within the bounds. Konva's `crop` prop maps to drawImage's
  // 9-arg form.
  const effectiveScale = Math.max(0.05, Math.min(20, layer.imageScale ?? 1.0));
  const imageOffsetX = layer.imageOffsetX ?? 0;
  const imageOffsetY = layer.imageOffsetY ?? 0;
  const scaleX = (flipH ? -1 : 1) * effectiveScale;
  const scaleY = (flipV ? -1 : 1) * effectiveScale;
  const baseX = (flipH ? W * (1 + effectiveScale) / 2 : W * (1 - effectiveScale) / 2) + imageOffsetX;
  const baseY = (flipV ? H * (1 + effectiveScale) / 2 : H * (1 - effectiveScale) / 2) + imageOffsetY;

  // Source crop (normalized → pixel coordinates on the image's natural size).
  const crop = layer.crop;
  const hasCrop = crop.x > 0.001 || crop.y > 0.001 || crop.width < 0.999 || crop.height < 0.999;
  const naturalW = image.naturalWidth;
  const naturalH = image.naturalHeight;
  const sx = hasCrop ? crop.x * naturalW : 0;
  const sy = hasCrop ? crop.y * naturalH : 0;
  const sw = hasCrop ? crop.width * naturalW : naturalW;
  const sh = hasCrop ? crop.height * naturalH : naturalH;

  // Apply transform and draw the image. Konva draws the image of size
  // `layer.width × layer.height` then multiplies by scaleX/scaleY around (imgX, imgY),
  // so the equivalent canvas transform is: translate to (baseX, baseY), then
  // scale, then drawImage(image, 0, 0, W, H).
  ctx.translate(baseX, baseY);
  ctx.scale(scaleX, scaleY);
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, W, H);
  ctx.restore();

  // ── 3. destination-in with the pixelMask (drawn at the same imgX/imgY/scale,
  //       per the renderer caching the masked group).
  if (pixelMaskImage !== null) {
    ctx.save();
    ctx.globalCompositeOperation = "destination-in";
    ctx.translate(baseX, baseY);
    ctx.scale(scaleX, scaleY);
    ctx.drawImage(pixelMaskImage, 0, 0, W, H);
    ctx.restore();
  }

  // ── 4. destination-in with the library mask (drawn at full layer bounds,
  //       not subject to internal offset/scale, matching KonvaLayerNode).
  if (libMaskImage !== null) {
    ctx.save();
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(libMaskImage, 0, 0, W, H);
    ctx.restore();
  }

  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: W,
    height: H
  };
}
