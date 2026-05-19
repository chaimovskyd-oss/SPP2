import { resolveCanvasAssetPath } from "@/core/assets/assetManager";
import type { Asset } from "@/types/document";
import type { ImageLayer } from "@/types/layers";
import type { SelectionMask, SmartSelectionPrompt, SmartSelectionSoftness } from "@/state/imageEditStore";

export type SmartSelectionProfile = "quality" | "balanced" | "performance";

export interface SmartSelectionCapabilities {
  ok: boolean;
  profile: SmartSelectionProfile;
  recommendedProfile: SmartSelectionProfile;
  providers: string[];
  gpu: {
    cuda: boolean;
    mps: boolean;
    directml: boolean;
  };
  modelsDir?: string;
  fallback?: boolean;
  message?: string;
}

export interface SmartSelectionMaskResult {
  maskPngBase64: string;
  width: number;
  height: number;
  sourceWidth?: number;
  sourceHeight?: number;
  modelId: string;
  modelVersion: string;
  profile: SmartSelectionProfile;
  fallback?: boolean;
  message?: string;
}

export interface SmartSelectionModelStatus {
  ok: boolean;
  modelId: string;
  available: boolean;
  path?: string | null;
  status?: string;
  message?: string;
  manifestPath?: string;
  sha256?: string | null;
  expectedSha256?: string | null;
  sizeBytes?: number | null;
  version?: string | null;
}

export interface SmartSelectionModelList {
  ok: boolean;
  manifestPath: string;
  modelsDir: string;
  models: SmartSelectionModelStatus[];
}

export interface InpaintRemoveResult {
  ok: true;
  patchPngBase64: string;
  roi: { x: number; y: number; width: number; height: number };
  imageWidth: number;
  imageHeight: number;
  modelId: "lama" | "opencv_telea" | string;
  modelVersion: string;
  fallback: boolean;
  message: string;
  processingMs: number;
}

export interface SmartSelectionPromptInput {
  imageId: string;
  imagePath: string;
  sourceHash: string;
  layer: Pick<ImageLayer, "width" | "height" | "crop">;
  prompts: SmartSelectionPrompt[];
}

export function isSmartSelectionAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.spp?.smartSelection?.health === "function";
}

export async function getSmartSelectionCapabilities(): Promise<SmartSelectionCapabilities | null> {
  const api = window.spp?.smartSelection;
  if (api === undefined) return null;
  return api.health();
}

export async function listSmartSelectionModels(): Promise<SmartSelectionModelList | null> {
  const api = window.spp?.smartSelection;
  if (api === undefined || typeof api.listModels !== "function") return null;
  return api.listModels();
}

export async function ensureSmartSelectionModel(modelId: string): Promise<SmartSelectionModelStatus | null> {
  const api = window.spp?.smartSelection;
  if (api === undefined) return null;
  return api.ensureModel(modelId);
}

export async function runSmartAutoSegment(asset: Asset, layer: ImageLayer): Promise<SmartSelectionMaskResult | null> {
  const input = makeSmartSelectionInput(asset, layer);
  const api = window.spp?.smartSelection;
  if (input === null || api === undefined) return null;
  await api.loadImage(input.imageId, input.imagePath, input.sourceHash);
  return normalizeMaskResult(await api.autoSegment(input.imageId, {
    targetWidth: Math.max(1, Math.round(layer.width)),
    targetHeight: Math.max(1, Math.round(layer.height))
  }));
}

export async function runSmartPromptSelection(input: SmartSelectionPromptInput): Promise<SmartSelectionMaskResult | null> {
  const api = window.spp?.smartSelection;
  if (api === undefined) return null;
  await api.loadImage(input.imageId, input.imagePath, input.sourceHash);
  await api.encodeSam(input.imageId);
  return normalizeMaskResult(await api.predictMask(input.imageId, {
    prompts: input.prompts,
    targetWidth: Math.max(1, Math.round(input.layer.width)),
    targetHeight: Math.max(1, Math.round(input.layer.height))
  }));
}

export async function runSmartRefineMask(
  imageId: string,
  mask: Uint8Array,
  width: number,
  height: number,
  softness: SmartSelectionSoftness
): Promise<SmartSelectionMaskResult | null> {
  const api = window.spp?.smartSelection;
  if (api === undefined) return null;
  return normalizeMaskResult(await api.refineMask(imageId, {
    maskPngBase64: selectionMaskToPngBase64(mask, width, height),
    width,
    height,
    softness
  }));
}

export async function runSmartInpaintRemove(asset: Asset, layer: ImageLayer, selectionMask: SelectionMask): Promise<InpaintRemoveResult | null> {
  const input = makeSmartSelectionInput(asset, layer);
  const api = window.spp?.smartSelection;
  if (input === null || api === undefined || typeof api.inpaintRemove !== "function") return null;
  await api.loadImage(input.imageId, input.imagePath, input.sourceHash);
  const result = await api.inpaintRemove(input.imageId, {
    maskPngBase64: selectionMaskToPngBase64(selectionMask.data, selectionMask.width, selectionMask.height),
    targetWidth: Math.max(1, Math.round(selectionMask.width)),
    targetHeight: Math.max(1, Math.round(selectionMask.height)),
    maxPatchPixels: 6_000_000,
    blend: "feather"
  });
  return normalizeInpaintResult(result);
}

export function makeSmartSelectionInput(asset: Asset, layer: ImageLayer): SmartSelectionPromptInput | null {
  const imagePath = resolveCanvasAssetPath(asset);
  if (imagePath === undefined) return null;
  return {
    imageId: asset.id,
    imagePath,
    sourceHash: asset.hash ?? asset.checksum ?? asset.id,
    layer,
    prompts: []
  };
}

export function maskResultToSelectionMask(
  result: SmartSelectionMaskResult,
  sourceHash?: string
): Promise<SelectionMask> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = result.width;
      canvas.height = result.height;
      const context = canvas.getContext("2d");
      if (context === null) {
        reject(new Error("Cannot decode smart selection mask"));
        return;
      }
      context.drawImage(image, 0, 0, result.width, result.height);
      const imageData = context.getImageData(0, 0, result.width, result.height);
      const mask = new Uint8Array(result.width * result.height);
      for (let i = 0; i < mask.length; i += 1) {
        mask[i] = imageData.data[i * 4 + 3];
      }
      resolve({
        data: mask,
        width: result.width,
        height: result.height,
        metadata: {
          sourceImageHash: sourceHash,
          modelId: result.modelId,
          modelVersion: result.modelVersion,
          profile: result.profile,
          createdAt: new Date().toISOString(),
          sourceWidth: result.sourceWidth,
          sourceHeight: result.sourceHeight
        }
      });
    };
    image.onerror = () => reject(new Error("Cannot load smart selection mask"));
    image.src = `data:image/png;base64,${result.maskPngBase64}`;
  });
}

export function selectionMaskToPngBase64(mask: Uint8Array, width: number, height: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) return "";
  const imageData = context.createImageData(width, height);
  for (let i = 0; i < mask.length; i += 1) {
    imageData.data[i * 4] = 255;
    imageData.data[i * 4 + 1] = 255;
    imageData.data[i * 4 + 2] = 255;
    imageData.data[i * 4 + 3] = mask[i];
  }
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
}

function normalizeMaskResult(result: SmartSelectionMaskResult | { ok?: boolean; message?: string; error?: string } | null | undefined): SmartSelectionMaskResult | null {
  if (result === null || result === undefined) return null;
  if (!("maskPngBase64" in result) || typeof result.maskPngBase64 !== "string" || result.maskPngBase64.length === 0) {
    return null;
  }
  return result;
}

function normalizeInpaintResult(result: InpaintRemoveResult | { ok?: boolean; message?: string; error?: string } | null | undefined): InpaintRemoveResult | null {
  if (result === null || result === undefined) return null;
  if (!("patchPngBase64" in result) || typeof result.patchPngBase64 !== "string" || result.patchPngBase64.length === 0) {
    return null;
  }
  return result;
}
