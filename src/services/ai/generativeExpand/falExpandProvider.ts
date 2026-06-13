import { callFalApi, toFalImageUrl, imageUrlToDataUrl, isFalConfigured } from "@/services/ai/falAiService";
import { FAL_MODELS, MODEL_COST_ESTIMATE } from "@/services/ai/falModels.config";
import { loadHtmlImage } from "@/ui/contentFill/composePatch";
import { FLUX_EXPAND_PROMPTS, type GenerativeExpandProvider, type GenerativeExpandRequest } from "./types";

interface BriaExpandInput {
  image_url: string;
  canvas_size: [number, number];
  original_image_size: [number, number];
  original_image_location: [number, number];
}

interface BriaExpandOutput {
  image: { url: string };
}

interface FluxFillOutput {
  images: Array<{ url: string }>;
}

async function resizeToCanvas(dataUrl: string, width: number, height: number): Promise<string> {
  const img = await loadHtmlImage(dataUrl);
  if (img.naturalWidth === width && img.naturalHeight === height) return dataUrl;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("GEN_EXPAND_FAL_RESIZE_FAILED");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}

function logUsage(modelId: string, req: GenerativeExpandRequest): void {
  console.info("[SmartExpand] fal.ai usage", {
    model: modelId,
    estimatedCostUsd: MODEL_COST_ESTIMATE[modelId] ?? null,
    size: `${req.width}x${req.height}`,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Cloud "Ultra" — fal.ai. Primary path is **Bria Expand**, the purpose-built
 * outpainting API: it receives the image alone plus its placement inside the
 * target canvas, so the generated areas genuinely continue the photo (same
 * path the legacy "הרחבת תמונה" tool uses by default). The generic flux-fill
 * image+mask path is kept only for non-rectangular footprints (rotated images,
 * PNGs with transparency), where geometry can't describe the fill region.
 */
export const falExpandProvider: GenerativeExpandProvider = {
  id: "fal-ai-expand",
  async isAvailable() {
    return isFalConfigured();
  },
  async generateExpand(req, onProgress, signal) {
    if (!isFalConfigured()) throw new Error("GEN_EXPAND_FAL_NOT_CONFIGURED");

    onProgress(5);

    if (req.layerImageDataUrl !== undefined && req.placement !== undefined) {
      const modelId = FAL_MODELS.expand.default;
      logUsage(modelId, req);

      const imageUrl = await toFalImageUrl(req.layerImageDataUrl, signal);
      onProgress(15);

      const input: BriaExpandInput = {
        image_url: imageUrl,
        canvas_size: [req.width, req.height],
        original_image_size: [req.placement.width, req.placement.height],
        original_image_location: [req.placement.x, req.placement.y],
      };
      const result = await callFalApi<BriaExpandInput, BriaExpandOutput>(
        modelId,
        input,
        (pct) => onProgress(15 + Math.round(pct * 0.8)),
        signal,
      );
      const outputUrl = result.image?.url;
      if (outputUrl === undefined || outputUrl === "") throw new Error("GEN_EXPAND_FAL_NO_OUTPUT");
      const resultDataUrl = await resizeToCanvas(await imageUrlToDataUrl(outputUrl, signal), req.width, req.height);
      onProgress(100);
      return { resultDataUrl, modelId };
    }

    // Non-rectangular footprint → mask-based flux fill.
    const modelId = FAL_MODELS.expand.creative;
    logUsage(modelId, req);

    const [imageUrl, maskUrl] = await Promise.all([
      toFalImageUrl(req.inputImageDataUrl, signal),
      toFalImageUrl(req.maskDataUrl, signal),
    ]);

    onProgress(15);

    const result = await callFalApi<{ image_url: string; mask_url: string; prompt?: string }, FluxFillOutput>(
      modelId,
      {
        image_url: imageUrl,
        mask_url: maskUrl,
        prompt: req.prompt.trim() !== "" ? req.prompt.trim() : FLUX_EXPAND_PROMPTS[req.creativity ?? "balanced"],
      },
      (pct) => onProgress(15 + Math.round(pct * 0.8)),
      signal,
    );

    const outputUrl = result.images?.[0]?.url;
    if (outputUrl === undefined || outputUrl === "") throw new Error("GEN_EXPAND_FAL_NO_OUTPUT");

    const resultDataUrl = await resizeToCanvas(await imageUrlToDataUrl(outputUrl, signal), req.width, req.height);
    onProgress(100);

    return { resultDataUrl, modelId };
  },
};
