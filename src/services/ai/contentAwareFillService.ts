import type { Asset } from "@/types/document";
import type { ImageLayer } from "@/types/layers";
import type { SelectionMask } from "@/state/imageEditStore";
import {
  makeSmartSelectionInput,
  selectionMaskToPngBase64,
  type InpaintRemoveResult
} from "@/services/ai/smartSelectionService";

export type ContentFillEngine = "auto" | "quick_heal" | "lama" | "sd_inpaint" | "migan" | "texture_fill";

let lamaWarmPromise: Promise<void> | null = null;
let sdWarmPromise: Promise<{ ok: boolean; ready?: boolean; error?: string } | null> | null = null;

export interface ContentAwareFillParams {
  asset: Asset;
  layer: ImageLayer;
  /** Region to remove/fill (alpha = selection). */
  targetMask: SelectionMask;
  /** Pre-rendered layer pixels at targetMask resolution. Skips a sidecar load when provided. */
  renderedImageDataUrl?: string;
  /** Fill engine. Omit / "auto" lets the backend choose (spec §11). */
  engine?: ContentFillEngine;
  /** Fast low-res pass for live preview (no commit). */
  preview?: boolean;
  /** Texture Fill sampling regions — where pixels may / may not be borrowed from. */
  samplingInclude?: SelectionMask | null;
  samplingExclude?: SelectionMask | null;
  preserveLines?: boolean;
  colorAdaptation?: boolean;
  maxPatchPixels?: number;
  /** Stable-Diffusion engine controls (engine === "sd_inpaint"). */
  prompt?: string;
  negativePrompt?: string;
  sdSteps?: number;
  sdGuidance?: number;
  sdWorkingSize?: number;
}

/**
 * Content-Aware Fill / Smart Erase. Thin wrapper over the smart-selection sidecar's
 * `inpaintRemove`, adding engine selection + sampling masks + preview. Returns the same
 * patch+ROI result as the legacy AI Fill path, so callers reuse `composeInpaintPatch`.
 */
export async function runContentAwareFill(params: ContentAwareFillParams): Promise<InpaintRemoveResult | null> {
  const { asset, layer, targetMask, renderedImageDataUrl } = params;
  const input = makeSmartSelectionInput(asset, layer);
  const api = window.spp?.smartSelection;
  if (input === null || api === undefined || typeof api.inpaintRemove !== "function") return null;

  if (renderedImageDataUrl === undefined) {
    await api.loadImage(input.imageId, input.imagePath, input.sourceHash);
  }

  const result = await api.inpaintRemove(input.imageId, {
    ...(renderedImageDataUrl === undefined ? {} : { imagePngBase64: dataUrlToBase64(renderedImageDataUrl) }),
    maskPngBase64: selectionMaskToPngBase64(targetMask.data, targetMask.width, targetMask.height),
    targetWidth: Math.max(1, Math.round(targetMask.width)),
    targetHeight: Math.max(1, Math.round(targetMask.height)),
    maxPatchPixels: params.maxPatchPixels ?? 10_000_000,
    blend: "feather",
    engine: params.engine ?? "sd_inpaint",
    ...(params.preview === true ? { preview: true } : {}),
    ...(params.preserveLines === undefined ? {} : { preserveLines: params.preserveLines }),
    ...(params.colorAdaptation === undefined ? {} : { colorAdaptation: params.colorAdaptation }),
    ...(params.samplingInclude == null ? {} : { samplingIncludeMaskPngBase64: selectionMaskToPngBase64(params.samplingInclude.data, params.samplingInclude.width, params.samplingInclude.height) }),
    ...(params.samplingExclude == null ? {} : { samplingExcludeMaskPngBase64: selectionMaskToPngBase64(params.samplingExclude.data, params.samplingExclude.width, params.samplingExclude.height) }),
    ...(params.prompt === undefined ? {} : { prompt: params.prompt }),
    ...(params.negativePrompt === undefined ? {} : { negativePrompt: params.negativePrompt }),
    ...(params.sdSteps === undefined ? {} : { sdSteps: params.sdSteps }),
    ...(params.sdGuidance === undefined ? {} : { sdGuidance: params.sdGuidance }),
    ...(params.sdWorkingSize === undefined ? {} : { sdWorkingSize: params.sdWorkingSize })
  });

  return normalizeInpaintResult(result);
}

/** Warm the LaMa engine in the background so the first fill is fast. Never throws. */
export async function warmContentFillEngine(): Promise<void> {
  if (lamaWarmPromise !== null) return lamaWarmPromise;
  const api = window.spp?.smartSelection;
  if (api === undefined || typeof api.warmInpaint !== "function") return;
  lamaWarmPromise = api.warmInpaint()
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      lamaWarmPromise = null;
    });
  return lamaWarmPromise;
}

/** Pre-load the heavy Stable-Diffusion inpaint pipeline (≈2 GB first run). Never throws. */
export async function warmSdEngine(): Promise<{ ok: boolean; ready?: boolean; error?: string } | null> {
  if (sdWarmPromise !== null) return sdWarmPromise;
  const api = window.spp?.smartSelection;
  if (api === undefined || typeof api.warmSdInpaint !== "function") return null;
  sdWarmPromise = api.warmSdInpaint()
    .catch(() => null)
    .finally(() => {
      sdWarmPromise = null;
    });
  return sdWarmPromise;
}

function normalizeInpaintResult(
  result: InpaintRemoveResult | { ok?: boolean; message?: string; error?: string } | null | undefined
): InpaintRemoveResult | null {
  if (result === null || result === undefined) return null;
  if (!("patchPngBase64" in result) || typeof result.patchPngBase64 !== "string" || result.patchPngBase64.length === 0) {
    if ("error" in result && typeof result.error === "string" && result.error.length > 0) {
      throw new Error(result.error);
    }
    if ("message" in result && typeof result.message === "string" && result.message.length > 0) {
      throw new Error(result.message);
    }
    return null;
  }
  return result;
}

function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.replace(/^data:[^;]+;base64,/, "");
}
