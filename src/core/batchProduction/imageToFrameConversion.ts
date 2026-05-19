import type { Document } from "@/types/document";
import type { FrameLayer, ImageLayer, ImageLayerEffects, VisualLayer } from "@/types/layers";
import { createFrameLayer } from "@/core/layers/factory";
import { DEFAULT_IMAGE_LAYER_EFFECTS } from "@/types/layers";

export interface ImageToFrameConversionResult {
  doc: Document;
  /** True if the source had non-default effects/filters that did NOT survive
   *  the conversion — callers can surface a toast. */
  effectsDropped: boolean;
}

function hasNonDefaultEffects(effects: ImageLayerEffects | undefined): boolean {
  if (effects === undefined) return false;
  const d = DEFAULT_IMAGE_LAYER_EFFECTS;
  return (
    effects.brightness !== d.brightness
    || effects.contrast !== d.contrast
    || effects.saturation !== d.saturation
    || effects.exposure !== d.exposure
    || effects.hue !== d.hue
    || effects.grayscale !== d.grayscale
    || effects.blur !== d.blur
    || effects.shadow !== null
    || effects.outline !== null
    || (effects.sepia ?? false)
    || (effects.invert ?? false)
    || (effects.threshold ?? 0) !== 0
    || (effects.posterize ?? 0) !== 0
    || (effects.color_pop ?? false)
    || (effects.remove_white ?? false)
  );
}

/**
 * Converts a plain ImageLayer into a FrameLayer occupying the same visible
 * bounds, with the image moved inside as the placeholder (`imageAssetId`) and
 * `fitMode: "fill"` (cover) + clipping enabled.
 *
 * The new FrameLayer reuses the original layer id so external references
 * (selection, Variable field `layerId`, history) keep working.
 *
 * No-op (returns doc unchanged) if the layer is not an ImageLayer.
 */
export function convertImageLayerToVariableFrame(
  doc: Document,
  layerId: string,
): ImageToFrameConversionResult {
  let effectsDropped = false;
  const nextPages = doc.pages.map((page) => {
    let didConvert = false;
    const nextLayers: VisualLayer[] = page.layers.map((layer): VisualLayer => {
      if (layer.id !== layerId) return layer;
      if (layer.type !== "image") return layer;
      const image = layer as ImageLayer;
      effectsDropped = hasNonDefaultEffects(image.effects)
        || (image.filters?.length ?? 0) > 0;

      // Translate the ImageLayer's mask/shape metadata into FrameLayer.shape so
      // the clipping the user designed (circle, ellipse, rounded corners,
      // library mask) is preserved on the resulting Variable slot.
      const imageShapeMeta = (image.metadata["imageShape"] as string | undefined) ?? "rect";
      let frameShape: FrameLayer["shape"] = "rect";
      let cornerRadius: number | undefined;
      if (imageShapeMeta === "circle") frameShape = "circle";
      else if (imageShapeMeta === "ellipse") frameShape = "ellipse";
      else if (imageShapeMeta === "rounded") {
        frameShape = "rect";
        const metaRadius = image.metadata["imageMaskCornerRadius"] as number | undefined;
        cornerRadius = metaRadius ?? Math.min(image.width, image.height) * 0.12;
      } else if (imageShapeMeta === "mask_lib") {
        // Custom library masks rely on a data URL — keep it on frame metadata
        // (rendered as a customMask) so the same clip applies post-conversion.
        frameShape = "customMask";
      }

      const frame: FrameLayer = createFrameLayer({
        id: image.id,
        name: image.name,
        rect: { x: image.x, y: image.y, width: image.width, height: image.height },
        shape: frameShape,
        cornerRadius,
        contentType: "image",
        imageAssetId: image.assetId,
        fitMode: "fill",
        padding: 0,
        zIndex: image.zIndex,
        // Carry over imageShape/mask metadata verbatim so any renderer paths
        // that still look at metadata (library masks, flipH/V, etc.) keep
        // working.
        metadata: image.metadata,
      });
      // Preserve cross-cutting visual fields that createFrameLayer doesn't set.
      const preserved: FrameLayer = {
        ...frame,
        rotation: image.rotation,
        opacity: image.opacity,
        blendMode: image.blendMode,
        visible: image.visible,
        locked: image.locked,
        parentId: image.parentId,
      };
      didConvert = true;
      return preserved;
    });
    return didConvert ? { ...page, layers: nextLayers } : page;
  });
  return { doc: { ...doc, pages: nextPages }, effectsDropped };
}
