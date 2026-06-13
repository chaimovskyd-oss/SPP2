import { composeInpaintPatch, loadHtmlImage } from "@/ui/contentFill/composePatch";
import {
  LOCAL_EXPAND_PROMPTS,
  buildNegativePrompt,
  type ExpandCreativity,
  type GenerativeExpandModel,
  type GenerativeExpandProvider,
} from "./types";

function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.replace(/^data:[^;]+;base64,/, "");
}

interface LocalTier {
  /** Sidecar model kind (sd_inpaint_service picks the pipeline by this). */
  sdModel: "sd15" | "sdxl";
  /** Generation resolution — SD 1.5 breaks above its 512px training size; SDXL is native at 1024. */
  sdWorkingSize: number;
  sdSteps: number;
  /** Continuation wants LOW guidance — high CFG pushes SDXL toward its own
   *  saturated palette instead of the photo's colors. Conservative needs CFG
   *  high enough for the negative prompt (no people/objects) to bite; creative
   *  raises it so the prompt may invent matching elements. */
  sdGuidance: Record<ExpandCreativity, number>;
}

const TIERS: Record<"fast" | "quality", LocalTier> = {
  fast: {
    sdModel: "sd15",
    sdWorkingSize: 576,
    sdSteps: 24,
    sdGuidance: { conservative: 7.5, balanced: 7.5, creative: 9 },
  },
  quality: {
    sdModel: "sdxl",
    sdWorkingSize: 1024,
    sdSteps: 28,
    // CFG 5 proved too weak to push real content into a large fill; hue drift
    // at higher CFG is corrected downstream by adapt_patch_colors.
    sdGuidance: { conservative: 7, balanced: 7, creative: 8.5 },
  },
};

/**
 * Local diffusion outpainting via the smart-selection sidecar's SD engine.
 * Two tiers share one pipeline slot Python-side (8 GB GPUs can't hold both):
 *   fast    — SD 1.5 inpainting @576 (the original "מהיר" tier).
 *   quality — SDXL inpainting @1024 (replaces the planned local FLUX: FLUX.1-Fill
 *             is 12B params, HF-gated, and needs heavy quantisation on an 8 GB
 *             card — impractical for an installed app. SDXL is ungated, fits via
 *             CPU offload, and uses the existing diffusers infra).
 * The empty canvas area is the mask; the returned ROI patch is composed back
 * over the input to produce the full canvas-sized result (the sidecar's
 * blend_patch already restores original pixels outside the mask).
 */
function makeLocalSdProvider(id: GenerativeExpandModel, tier: LocalTier): GenerativeExpandProvider {
  return {
    id,
    async isAvailable() {
      const api = window.spp?.smartSelection;
      return api !== undefined && typeof api.inpaintRemove === "function";
    },
    async generateExpand(req, onProgress) {
      const api = window.spp?.smartSelection;
      if (api === undefined || typeof api.inpaintRemove !== "function") {
        throw new Error("GEN_EXPAND_LOCAL_UNAVAILABLE");
      }

      onProgress(10);

      const syntheticId = `smart-expand-${Date.now()}`;
      const creativity = req.creativity ?? "balanced";
      const prompt = req.prompt.trim() !== "" ? req.prompt.trim() : LOCAL_EXPAND_PROMPTS[creativity];

      const result = await api.inpaintRemove(syntheticId, {
        imagePngBase64: dataUrlToBase64(req.inputImageDataUrl),
        // The sidecar's decode_mask reads the ALPHA channel — use the alpha-encoded variant.
        maskPngBase64: dataUrlToBase64(req.maskAlphaDataUrl ?? req.maskDataUrl),
        targetWidth: req.width,
        targetHeight: req.height,
        engine: "sd_inpaint",
        blend: "feather",
        prompt,
        negativePrompt: buildNegativePrompt(creativity, req.negativePrompt),
        sdModel: tier.sdModel,
        sdWorkingSize: tier.sdWorkingSize,
        sdSteps: tier.sdSteps,
        sdGuidance: req.guidance ?? tier.sdGuidance[creativity],
        // Pull the generated fill back to the photo's palette (fixes SDXL hue drift).
        colorAdaptation: true,
        // Outpainting masks cover most of the canvas — relax the removal-tool limits.
        maxSelectedRatio: 0.95,
        maxPatchPixels: 30_000_000,
        ...(req.seed === undefined ? {} : { sdSeed: req.seed }),
      });

      onProgress(85);

      if (
        result === null ||
        result === undefined ||
        !("patchPngBase64" in result) ||
        typeof result.patchPngBase64 !== "string" ||
        result.patchPngBase64.length === 0
      ) {
        const message =
          (result !== null && result !== undefined && "error" in result && typeof result.error === "string" && result.error) ||
          (result !== null && result !== undefined && "message" in result && typeof result.message === "string" && result.message) ||
          "GEN_EXPAND_LOCAL_FAILED";
        throw new Error(message);
      }

      const base = await loadHtmlImage(req.inputImageDataUrl);
      const baseCanvas = document.createElement("canvas");
      baseCanvas.width = req.width;
      baseCanvas.height = req.height;
      const ctx = baseCanvas.getContext("2d");
      if (ctx === null) throw new Error("GEN_EXPAND_COMPOSE_CONTEXT_MISSING");
      ctx.drawImage(base, 0, 0, req.width, req.height);

      const resultDataUrl = await composeInpaintPatch(baseCanvas, result.patchPngBase64, result.roi);
      onProgress(100);

      return {
        resultDataUrl,
        modelId: `${result.modelId ?? "sd_inpaint"}:${tier.sdModel}`,
        modelVersion: result.modelVersion,
        fallback: result.fallback,
      };
    },
  };
}

export const localSdFastProvider = makeLocalSdProvider("local-sd-fast", TIERS.fast);
export const localSdxlQualityProvider = makeLocalSdProvider("local-sdxl-quality", TIERS.quality);
