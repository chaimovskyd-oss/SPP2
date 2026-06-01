import { createAssetPreviews, resolveExportAssetPath } from "@/core/assets/assetManager";
import { createId } from "@/core/ids";
import { callFalApi, imageUrlToDataUrl, toFalImageUrl } from "@/services/ai/falAiService";
import type { Asset } from "@/types/document";
import { DEFAULT_IMAGE_LAYER_EFFECTS, type ImageLayer } from "@/types/layers";
import type { Metadata } from "@/types/primitives";
import { getAiStylePreset } from "./catalog";
import {
  aiStyleRunMetaToJson,
  type AiStyleApplyInput,
  type AiStyleApplyResult,
  type AiStyleOptions,
  type AiStyleQualityStatus,
} from "./types";

interface PixelStats {
  alphaCoverage: number;
  darkCoverage: number;
  lightCoverage: number;
  meanLuma: number;
}

interface FalImagesOutput {
  images: Array<{ url: string; width?: number; height?: number }>;
}

interface FalImageOutput {
  image: { url: string; width?: number; height?: number };
}

const GLOBAL_PRINT_PROMPT =
  "Preserve the person's recognizable facial structure, pose, clothing, hairstyle, body shape, age, and expression. If a face is turned away, hidden, occluded, outside the frame, or not visible, do not invent eyes, mouth, or a frontal face; preserve the original hidden/back-view face state. Create a clean high-resolution print-ready result. No text, no watermark, no frame.";

const STYLE_PROMPTS: Record<string, string> = {
  cartoon_v1:
    `Transform this image into a vibrant friendly cartoon illustration. Clean outlines, smooth colors, expressive but natural face, gift product quality. ${GLOBAL_PRINT_PROMPT}`,
  watercolor_v1:
    `Transform this image into a soft watercolor illustration with gentle color bleeding, subtle paper texture, warm natural light, and clean print-ready details. ${GLOBAL_PRINT_PROMPT}`,
  oil_painting_v1:
    `Transform this image into a tasteful oil painting for canvas printing. Rich brush texture, natural colors, refined details, and elegant composition. ${GLOBAL_PRINT_PROMPT}`,
  childrens_book_v1:
    `Transform this image into a charming children's book illustration. Soft shapes, warm colors, gentle friendly atmosphere, magical but natural expression. If the child is photographed from behind or the face is not visible, keep the child from behind and do not create a new face. ${GLOBAL_PRINT_PROMPT}`,
  romantic_couple_v1:
    `Transform this couple photo into a soft romantic illustration for premium gift printing. Use warm gentle colors, delicate linework, tender atmosphere, subtle glow, and tasteful background simplification. Preserve both people's recognizable facial structure, pose, clothing, body shapes, and the emotional connection between them. Do not separate the couple, change their ages, change their relationship gesture, or make the faces generic. If one face is turned away or hidden, keep it turned away or hidden. ${GLOBAL_PRINT_PROMPT}`,
  soft_anime_storybook_v1:
    `Transform this image into a soft cinematic anime-inspired storybook illustration. Use hand-painted backgrounds, warm natural light, expressive but gentle shapes, clean readable silhouettes, and refined print-ready color. Keep the result original and not a copy of any specific film, studio, character, or copyrighted style. Preserve the subject's pose, clothing, hairstyle, age, and recognizable structure. If a face is not visible, do not invent one. ${GLOBAL_PRINT_PROMPT}`,
  elegant_glass_portrait_v1:
    `Transform this portrait into an elegant premium gift image for glass block or acrylic printing. Use clean luminous lighting, refined skin tones, soft depth, polished edges, subtle background simplification, and a luxury studio portrait feel. Preserve the person's recognizable facial structure, expression, hairstyle, age, clothing, and body shape. Avoid heavy cartooning, exaggerated eyes, fake jewelry, text, frames, or decorative clutter. ${GLOBAL_PRINT_PROMPT}`,
  warm_family_storybook_v1:
    `Transform this family photo into a warm mature storybook illustration for a sentimental gift. Use cozy colors, soft painterly texture, gentle outlines, natural expressions, and harmonious composition. Preserve every person's recognizable facial structure, relative age, body shape, clothing, pose, and the family grouping. Do not add or remove people. If a person is facing away or partially hidden, preserve that visibility exactly and do not invent a frontal face. ${GLOBAL_PRINT_PROMPT}`,
  pet_gift_cartoon_v1:
    `Transform this pet photo into a friendly charming gift cartoon. Preserve the pet's species, breed-like features, fur pattern, coat colors, ears, eyes, pose, and personality. Use clean outlines, smooth cheerful colors, and a cute but natural expression suitable for mugs, stickers, shirts, and prints. Do not add text, accessories, collars, props, or a frame unless already present. Keep the pet recognizable. ${GLOBAL_PRINT_PROMPT}`,
  memorial_pencil_portrait_v1:
    `Transform this image into a respectful black-and-white pencil portrait for a memorial or memory gift. Use delicate graphite texture, soft shading, clean facial details, calm dignity, and a light neutral background. Preserve the person's recognizable facial structure, expression, age, hairstyle, and pose. Do not beautify heavily, change emotion, add decorative symbols, add text, or make the result cartoonish. If the face is not visible, keep the original hidden or turned-away state and do not invent a face. ${GLOBAL_PRINT_PROMPT}`,
};

export async function applyAIStyle(input: AiStyleApplyInput): Promise<AiStyleApplyResult> {
  const preset = getAiStylePreset(input.presetId);
  if (preset === undefined) throw new Error("AI_STYLE_PRESET_NOT_FOUND");

  const source = resolveExportAssetPath(input.asset);
  if (source === undefined) throw new Error("AI_STYLE_SOURCE_MISSING");

  const startedAt = new Date();
  const warnings: string[] = [];
  let resultDataUrl = source;
  let providerModel = "canvas-local";
  let modelVersion = preset.version;
  let provider: "local" | "direct-fal" = "local";

  for (const step of preset.pipeline) {
    if (step.type === "cloud-style") {
      const cloud = await runDirectFalStyle(resultDataUrl, step.modelId, step.promptKey, input.options);
      resultDataUrl = cloud.dataUrl;
      providerModel = cloud.modelId;
      modelVersion = preset.version;
      provider = "direct-fal";
    }

    if (step.type === "cloud-lineart") {
      const cloud = await runDirectFalLineArt(resultDataUrl, step.modelId);
      resultDataUrl = cloud.dataUrl;
      providerModel = cloud.modelId;
      modelVersion = preset.version;
      provider = "direct-fal";
    }

    if (step.type === "local-rmbg") {
      const localMaskResult = await tryLocalBackgroundRemoval(resultDataUrl, input.asset, input.layer);
      if (localMaskResult === null) {
        warnings.push("Local background model is unavailable; used transparent-white fallback.");
        resultDataUrl = await removeNearWhiteBackground(resultDataUrl);
        providerModel = "canvas-white-bg-fallback";
      } else {
        resultDataUrl = localMaskResult;
        providerModel = "birefnet-local";
      }
    }

    if (step.type === "local-effect") {
      if (step.effect === "line_art") resultDataUrl = await renderLineArt(resultDataUrl, input.options);
      if (step.effect === "sketch") resultDataUrl = await renderSketch(resultDataUrl, input.options);
      if (step.effect === "coloring_page") resultDataUrl = await renderLineArt(resultDataUrl, input.options);
      if (step.effect === "posterize") resultDataUrl = await renderPosterize(resultDataUrl, input.options);
      if (step.effect === "sticker_border") resultDataUrl = await renderStickerBorder(resultDataUrl, input.options);
    }

    if (step.type === "local-export" && input.options.backgroundMode === "transparent" && !hasAlphaDataUrl(resultDataUrl)) {
      resultDataUrl = await removeNearWhiteBackground(resultDataUrl);
    }
  }

  if (provider === "direct-fal" && input.options.backgroundMode === "transparent") {
    const localMaskResult = await tryLocalBackgroundRemoval(resultDataUrl, input.asset, input.layer);
    if (localMaskResult === null) {
      warnings.push("Transparent background requested, but local background removal was unavailable after cloud styling.");
    } else {
      resultDataUrl = localMaskResult;
    }
  }

  const completedAt = new Date();
  const stats = await analyzeDataUrl(resultDataUrl);
  const qualityStatus = qualityFromStats(stats, input.presetId, warnings);
  if (qualityStatus !== "success" && warnings.length === 0) warnings.push("The generated image should be reviewed before printing.");

  const previews = await createAssetPreviews(resultDataUrl, 1600, 280);
  const size = await loadImageSize(resultDataUrl);
  const runId = createId("aistyle_run");
  const runMeta = {
    runId,
    presetId: preset.id,
    presetVersion: preset.version,
    sourceAssetId: input.asset.id,
    sourceLayerId: input.layer.id,
    pipelineSteps: preset.pipeline.map((step) => step.id),
    options: input.options,
    provider,
    modelId: providerModel,
    modelVersion,
    estimatedCostUsd: provider === "direct-fal" ? preset.estimatedCostUsd : 0,
    creditsCharged: 0,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
    qualityStatus,
    warnings,
  };

  const asset: Asset = {
    version: 1,
    id: createId("asset"),
    name: `AI - ${preset.name}`,
    kind: "image",
    status: "ready",
    originalPath: resultDataUrl,
    previewPath: previews.previewPath,
    thumbnailPath: previews.thumbnailPath,
    mimeType: "image/png",
    width: size.width,
    height: size.height,
    fileSize: Math.round(resultDataUrl.length * 0.75),
    metadata: {
      generatedBy: "ai-style-pipeline",
      sourceAssetId: input.asset.id,
      sourceLayerId: input.layer.id,
      editBaseUrl: resultDataUrl,
      aiStyleRun: aiStyleRunMetaToJson(runMeta),
    } as Metadata,
  };

  const layer: ImageLayer = {
    ...input.layer,
    id: createId("layer"),
    name: `AI - ${preset.name}`,
    assetId: asset.id,
    zIndex: input.layer.zIndex + 1,
    selected: true,
    visible: true,
    locked: false,
    opacity: 1,
    crop: { x: 0, y: 0, width: 1, height: 1 },
    fitMode: input.layer.fitMode,
    transform: { ...input.layer.transform },
    filters: [],
    colorAdjustments: { ...input.layer.colorAdjustments },
    effects: { ...DEFAULT_IMAGE_LAYER_EFFECTS },
    imageAdjustments: undefined,
    pixelMask: undefined,
    metadata: {
      ...input.layer.metadata,
      aiStyleResult: {
        presetId: preset.id,
        runId,
        sourceLayerId: input.layer.id,
      },
    } as Metadata,
  };

  return { asset, layer, runMeta, warnings, resultDataUrl };
}

async function runDirectFalStyle(
  dataUrl: string,
  modelId: string | undefined,
  promptKey: string | undefined,
  options: AiStyleOptions
): Promise<{ dataUrl: string; modelId: string }> {
  if (!modelId) throw new Error("AI_STYLE_MODEL_MISSING");
  const prompt = STYLE_PROMPTS[promptKey ?? ""] ?? STYLE_PROMPTS.cartoon_v1!;
  const imageUrl = await toFalImageUrl(await flattenForFal(dataUrl), undefined);
  const guidanceScale = options.strength === "soft" ? 2.6 : options.strength === "strong" ? 4.5 : 3.5;

  if (modelId.includes("qwen-image-2")) {
    const result = await callFalApi<
      {
        prompt: string;
        negative_prompt: string;
        image_urls: string[];
        enable_prompt_expansion: boolean;
        enable_safety_checker: boolean;
        num_images: 1;
        output_format: "png";
      },
      FalImagesOutput
    >(
      modelId,
      {
        prompt,
        negative_prompt: "low resolution, error, worst quality, low quality, deformed, watermark, text",
        image_urls: [imageUrl],
        enable_prompt_expansion: true,
        enable_safety_checker: true,
        num_images: 1,
        output_format: "png",
      },
    );
    const outputUrl = result.images?.[0]?.url;
    if (!outputUrl) throw new Error("AI_STYLE_FAL_NO_OUTPUT");
    return { dataUrl: await imageUrlToDataUrl(outputUrl), modelId };
  }

  const result = await callFalApi<
    {
      prompt: string;
      image_url: string;
      guidance_scale: number;
      num_images: 1;
      output_format: "png";
      safety_tolerance: "2";
      enhance_prompt: boolean;
    },
    FalImagesOutput
  >(
    modelId,
    {
      prompt,
      image_url: imageUrl,
      guidance_scale: guidanceScale,
      num_images: 1,
      output_format: "png",
      safety_tolerance: "2",
      enhance_prompt: true,
    },
  );
  const outputUrl = result.images?.[0]?.url;
  if (!outputUrl) throw new Error("AI_STYLE_FAL_NO_OUTPUT");
  return { dataUrl: await imageUrlToDataUrl(outputUrl), modelId };
}

async function runDirectFalLineArt(dataUrl: string, modelId = "fal-ai/image-preprocessors/lineart"): Promise<{ dataUrl: string; modelId: string }> {
  const imageUrl = await toFalImageUrl(await flattenForFal(dataUrl), undefined);
  const result = await callFalApi<
    { image_url: string; coarse: boolean },
    FalImageOutput
  >(
    modelId,
    {
      image_url: imageUrl,
      coarse: false,
    },
  );
  const outputUrl = result.image?.url;
  if (!outputUrl) throw new Error("AI_STYLE_FAL_NO_OUTPUT");
  return { dataUrl: await imageUrlToDataUrl(outputUrl), modelId };
}

async function renderLineArt(dataUrl: string, options: AiStyleOptions): Promise<string> {
  const { canvas, context, imageData } = await getCanvasImageData(dataUrl);
  const src = imageData.data;
  const out = context.createImageData(canvas.width, canvas.height);
  const dst = out.data;
  const threshold = options.strength === "soft" ? 42 : options.strength === "strong" ? 22 : 30;
  const localContrast = options.strength === "strong" ? 1.35 : options.strength === "soft" ? 1.05 : 1.18;
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const i = (y * canvas.width + x) * 4;
      const l = luma(src[i]!, src[i + 1]!, src[i + 2]!);
      const left = x > 0 ? i - 4 : i;
      const right = x < canvas.width - 1 ? i + 4 : i;
      const up = y > 0 ? i - canvas.width * 4 : i;
      const down = y < canvas.height - 1 ? i + canvas.width * 4 : i;
      const ul = x > 0 && y > 0 ? up - 4 : i;
      const ur = x < canvas.width - 1 && y > 0 ? up + 4 : i;
      const dl = x > 0 && y < canvas.height - 1 ? down - 4 : i;
      const dr = x < canvas.width - 1 && y < canvas.height - 1 ? down + 4 : i;
      const lum = (idx: number): number => luma(src[idx]!, src[idx + 1]!, src[idx + 2]!);
      const gx = -lum(ul) - 2 * lum(left) - lum(dl) + lum(ur) + 2 * lum(right) + lum(dr);
      const gy = -lum(ul) - 2 * lum(up) - lum(ur) + lum(dl) + 2 * lum(down) + lum(dr);
      const gradient = Math.sqrt(gx * gx + gy * gy) * localContrast;
      const shadowLine = l < 85 && gradient > threshold * 0.58;
      const isLine = gradient > threshold || shadowLine;
      dst[i] = 0;
      dst[i + 1] = 0;
      dst[i + 2] = 0;
      dst[i + 3] = isLine ? 255 : options.backgroundMode === "transparent" ? 0 : 255;
      if (!isLine && options.backgroundMode !== "transparent") {
        dst[i] = 255; dst[i + 1] = 255; dst[i + 2] = 255;
      }
    }
  }
  context.putImageData(out, 0, 0);
  return canvas.toDataURL("image/png");
}

async function renderSketch(dataUrl: string, options: AiStyleOptions): Promise<string> {
  const { canvas, context, imageData } = await getCanvasImageData(dataUrl);
  const src = imageData.data;
  const out = context.createImageData(canvas.width, canvas.height);
  const dst = out.data;
  const contrast = options.strength === "soft" ? 0.8 : options.strength === "strong" ? 1.45 : 1.1;
  for (let i = 0; i < src.length; i += 4) {
    const gray = luma(src[i]!, src[i + 1]!, src[i + 2]!);
    const paper = Math.max(0, Math.min(255, 255 - (255 - gray) * contrast));
    dst[i] = paper;
    dst[i + 1] = paper;
    dst[i + 2] = paper;
    dst[i + 3] = src[i + 3]!;
  }
  context.putImageData(out, 0, 0);
  return canvas.toDataURL("image/png");
}

async function renderPosterize(dataUrl: string, options: AiStyleOptions): Promise<string> {
  const { canvas, context, imageData } = await getCanvasImageData(dataUrl);
  const src = imageData.data;
  const levels = options.strength === "soft" ? 7 : options.strength === "strong" ? 4 : 5;
  const step = 255 / Math.max(1, levels - 1);
  for (let i = 0; i < src.length; i += 4) {
    src[i] = Math.round(Math.round(src[i]! / step) * step);
    src[i + 1] = Math.round(Math.round(src[i + 1]! / step) * step);
    src[i + 2] = Math.round(Math.round(src[i + 2]! / step) * step);
  }
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

async function renderStickerBorder(dataUrl: string, options: AiStyleOptions): Promise<string> {
  const source = await loadImage(dataUrl);
  const pad = Math.max(12, Math.round(Math.min(source.width, source.height) * (options.strength === "strong" ? 0.055 : 0.04)));
  const canvas = document.createElement("canvas");
  canvas.width = source.width + pad * 2;
  canvas.height = source.height + pad * 2;
  const context = mustContext(canvas);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.shadowColor = "rgba(255,255,255,0.98)";
  context.shadowBlur = pad;
  context.drawImage(source, pad, pad);
  context.shadowBlur = 0;
  context.drawImage(source, pad, pad);
  return canvas.toDataURL("image/png");
}

async function removeNearWhiteBackground(dataUrl: string): Promise<string> {
  const { canvas, context, imageData } = await getCanvasImageData(dataUrl);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const whiteness = (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
    if (whiteness > 235 && Math.abs(data[i]! - data[i + 1]!) < 18 && Math.abs(data[i + 1]! - data[i + 2]!) < 18) {
      data[i + 3] = 0;
    }
  }
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

async function flattenForFal(dataUrl: string): Promise<string> {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = mustContext(canvas);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

async function tryLocalBackgroundRemoval(dataUrl: string, asset: Asset, layer: ImageLayer): Promise<string | null> {
  if (typeof window === "undefined" || window.spp?.smartSelection === undefined || window.spp.writeTempImage === undefined) return null;
  try {
    const ext = dataUrl.startsWith("data:image/png") ? "png" : "jpg";
    const imagePath = await window.spp.writeTempImage(dataUrl, ext);
    const imageId = createId("aistyle_img");
    const hash = String(asset.hash ?? asset.checksum ?? `${asset.id}:${Date.now()}`);
    await window.spp.smartSelection.loadImage(imageId, imagePath, hash);
    const mask = await window.spp.smartSelection.autoSegment(imageId, {
      targetWidth: asset.width ?? Math.round(layer.width),
      targetHeight: asset.height ?? Math.round(layer.height),
    });
    const result = await applyAlphaMask(dataUrl, `data:image/png;base64,${mask.maskPngBase64}`);
    await window.spp.smartSelection.unloadImage(imageId);
    return result;
  } catch {
    return null;
  }
}

async function applyAlphaMask(dataUrl: string, maskDataUrl: string): Promise<string> {
  const source = await loadImage(dataUrl);
  const mask = await loadImage(maskDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = source.naturalWidth || source.width;
  canvas.height = source.naturalHeight || source.height;
  const context = mustContext(canvas);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = canvas.width;
  maskCanvas.height = canvas.height;
  const maskContext = mustContext(maskCanvas);
  maskContext.drawImage(mask, 0, 0, canvas.width, canvas.height);
  const maskData = maskContext.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 0; i < imageData.data.length; i += 4) {
    imageData.data[i + 3] = Math.min(imageData.data[i + 3]!, maskData[i] ?? 0);
  }
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
}

async function analyzeDataUrl(dataUrl: string): Promise<PixelStats> {
  const { imageData } = await getCanvasImageData(dataUrl, 320);
  const data = imageData.data;
  let alpha = 0;
  let dark = 0;
  let light = 0;
  let lumaSum = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]!;
    const y = luma(data[i]!, data[i + 1]!, data[i + 2]!);
    if (a > 16) alpha += 1;
    if (a > 16 && y < 18) dark += 1;
    if (a > 16 && y > 242) light += 1;
    lumaSum += y;
  }
  return {
    alphaCoverage: alpha / Math.max(1, pixels),
    darkCoverage: dark / Math.max(1, pixels),
    lightCoverage: light / Math.max(1, pixels),
    meanLuma: lumaSum / Math.max(1, pixels),
  };
}

function qualityFromStats(stats: PixelStats, presetId: string, warnings: string[]): AiStyleQualityStatus {
  if (stats.alphaCoverage < 0.002) return "failed";
  if (stats.meanLuma < 4 || stats.meanLuma > 251) return "failed";
  if (presetId === "line_engraving" && stats.darkCoverage < 0.002) return "low_confidence";
  if (presetId === "cute_sticker" && stats.alphaCoverage > 0.985) {
    warnings.push("Background removal may not have isolated the subject.");
    return "needs_review";
  }
  return warnings.length > 0 ? "needs_review" : "success";
}

async function getCanvasImageData(dataUrl: string, maxSize?: number): Promise<{ canvas: HTMLCanvasElement; context: CanvasRenderingContext2D; imageData: ImageData }> {
  const image = await loadImage(dataUrl);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const scale = maxSize === undefined ? 1 : Math.min(1, maxSize / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = mustContext(canvas);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { canvas, context, imageData: context.getImageData(0, 0, canvas.width, canvas.height) };
}

function mustContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) throw new Error("AI_STYLE_CANVAS_UNAVAILABLE");
  return context;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("AI_STYLE_IMAGE_LOAD_FAILED"));
    image.src = src;
  });
}

function loadImageSize(src: string): Promise<{ width: number; height: number }> {
  return loadImage(src).then((image) => ({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height }));
}

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hasAlphaDataUrl(dataUrl: string): boolean {
  return dataUrl.startsWith("data:image/png") || dataUrl.startsWith("data:image/webp");
}
