import { analyzeScreenshotCrop } from "@/core/image/screenshotCropDetector";
import { buildAutoEnhanceAdjustments } from "@/core/analysis/autoEnhance";
import { analyzeImageForFixes } from "@/services/ai/suggestedFixesService";
import { createImageAdjustment, type ImageAdjustment, type ImageAdjustmentTemplate } from "@/types/imageAdjustments";
import { getPreset, instantiatePresetAdjustments } from "@/core/presets/smartPresets";
import { analyzeEffectiveDpi, computeTargetCrop, groupFaceBoxes, orientedTargetAspectRatio } from "./geometry";
import type {
  BatchPrepareReport,
  PrepareCropRect,
  PrepareDesignPresetOptions,
  PrepareFaceBox,
  PrepareFocusPoint,
  PrepareImageAnalysis,
  PrepareOperationRecommendation,
  PrepareOptions,
  PrepareRecipe,
  PrepareResult,
  PrepareWarning
} from "./types";

interface HtmlImageInfo {
  image: HTMLImageElement;
  url: string;
  width: number;
  height: number;
}

interface PixelSceneRecipe {
  templates: ImageAdjustmentTemplate[];
  issues: string[];
}

interface ContentDetection {
  box: PrepareCropRect | null;
  focus: PrepareFocusPoint | null;
}

const PROFILE_THRESHOLDS: Record<PrepareOptions["profile"], { auto: number; review: number; colorScale: number; sharpen: number; cropAuto: boolean }> = {
  gentle: { auto: 0.94, review: 0.8, colorScale: 0.6, sharpen: 0, cropAuto: false },
  recommended: { auto: 0.9, review: 0.7, colorScale: 0.76, sharpen: 5, cropAuto: true },
  aggressive: { auto: 0.84, review: 0.64, colorScale: 0.92, sharpen: 9, cropAuto: true },
  photo_lab: { auto: 0.88, review: 0.68, colorScale: 0.88, sharpen: 7, cropAuto: true }
};

export const DEFAULT_PREPARE_OPTIONS: PrepareOptions = {
  removeScreenshotArtifacts: true,
  autoColorFix: true,
  sharpenSoftImages: true,
  qualityCheck: true,
  targetSize: { enabled: true, width: 100, height: 150, unit: "mm", dpi: 300, label: "10x15" },
  designPreset: { enabled: false, presetId: "hdr_pop", strength: 0.7 },
  profile: "recommended",
  mode: "manual-review"
};

export async function analyzeSmartPrintImage(file: File, options: PrepareOptions): Promise<PrepareResult> {
  const info = await loadFileImage(file);
  const screenshot = options.removeScreenshotArtifacts ? await analyzeScreenshotCrop(info.image) : null;
  const screenshotRect = screenshot?.cropRect ?? null;
  const screenshotCropSafe = screenshotRect !== null && screenshot !== null && isSafeScreenshotCrop(screenshotRect, info.width, info.height, screenshot.confidence);
  const baseRect = screenshotCropSafe ? screenshotRect : { x: 0, y: 0, width: info.width, height: info.height };
  const faces = await detectFaces(info.url, info.width, info.height);
  const adjustedFaces = adjustFacesToBaseRect(faces.boxes, baseRect);
  const groupBox = groupFaceBoxes(adjustedFaces);
  const content = detectContentFeatures(info.image, baseRect);
  const colorAnalysis = options.autoColorFix ? await analyzeImageForFixes(info.url) : null;
  const pixelScene = options.autoColorFix ? analyzePixelScene(info.image, baseRect, options) : { templates: [], issues: [] };
  const targetRatio = orientedTargetAspectRatio(options.targetSize, baseRect.width, baseRect.height);
  const targetCrop = targetRatio !== null
    ? computeTargetCrop(baseRect.width, baseRect.height, targetRatio, adjustedFaces, content.box, content.focus)
    : null;
  const quality = options.qualityCheck
    ? analyzeEffectiveDpi(targetCrop?.rect.width ?? baseRect.width, targetCrop?.rect.height ?? baseRect.height, options.targetSize)
    : { tier: "unknown" as const, message: "בדיקת איכות כבויה." };

  const technicalTemplates = buildTechnicalTemplates(colorAnalysis, options, pixelScene.templates);
  const technicalAdjustments = technicalTemplates.map(createImageAdjustment);
  const recipe: PrepareRecipe = {
    ...(screenshotRect !== null && screenshot !== null ? {
      screenshotCrop: {
        enabled: screenshot.isSuspicious && screenshotCropSafe,
        rect: screenshotRect,
        confidence: screenshotCropSafe ? screenshot.confidence : Math.min(screenshot.confidence, 0.68)
      }
    } : {}),
    ...(targetCrop !== null ? {
      targetCrop: {
        enabled: options.targetSize.enabled && targetCrop.safe && shouldAutoEnable(targetCrop.confidence, options),
        rect: targetCrop.rect,
        confidence: targetCrop.confidence,
        source: targetCrop.source
      }
    } : {}),
    technicalAdjustments,
    technicalTemplates,
    ...(options.designPreset.enabled ? buildDesignPresetRecipe(options) : {})
  };

  const recommendedOperations = buildRecommendations({
    screenshotConfidence: screenshot?.confidence ?? 0,
    hasScreenshotCrop: screenshotRect !== null && Boolean(screenshot?.isSuspicious) && screenshotCropSafe,
    targetConfidence: targetCrop?.confidence ?? 0,
    targetSafe: targetCrop?.safe ?? false,
    hasColor: technicalAdjustments.length > 0,
    qualityTier: quality.tier,
    options
  });
  const warnings = buildWarnings(recommendedOperations, quality, targetCrop?.safe ?? true);
  const confidence = recommendedOperations.length === 0
    ? 1
    : Math.min(...recommendedOperations.filter((op) => op.enabled).map((op) => op.confidence), 1);

  const analysis: PrepareImageAnalysis = {
    width: info.width,
    height: info.height,
    aspectRatio: info.width / Math.max(1, info.height),
    screenshot: screenshot === null ? undefined : {
      isLikely: screenshot.isSuspicious,
      confidence: screenshot.confidence,
      cropRect: screenshotRect,
      reasons: screenshot.reasons
    },
    faces: {
      boxes: adjustedFaces,
      backend: faces.backend,
      groupBox
    },
    contentBox: content.box,
    contentFocus: content.focus,
    colorIssues: [...(colorAnalysis?.issues?.map((issue) => issue.type) ?? []), ...pixelScene.issues],
    quality
  };

  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    filePath: resolveFilePath(file),
    sourceUrl: info.url,
    sourceFile: file,
    analysis,
    recommendedOperations,
    recipe,
    warnings,
    confidence,
    approved: warnings.every((warning) => warning.type !== "manual_review_required"),
    keepOriginal: false
  };
}

export async function analyzeSmartPrintBatch(files: File[], options: PrepareOptions): Promise<BatchPrepareReport> {
  const results: PrepareResult[] = [];
  for (const file of files) {
    results.push(await analyzeSmartPrintImage(file, options));
  }
  return buildBatchReport(results);
}

export function buildBatchReport(results: PrepareResult[]): BatchPrepareReport {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    total: results.length,
    summary: {
      screenshotsCleaned: results.filter((r) => r.recipe.screenshotCrop?.enabled).length,
      colorCorrected: results.filter((r) => r.recipe.technicalAdjustments.length > 0).length,
      croppedToTarget: results.filter((r) => r.recipe.targetCrop?.enabled).length,
      designPresetApplied: results.filter((r) => r.recipe.designPreset?.enabled).length,
      lowResolutionWarnings: results.filter((r) => r.analysis.quality.tier !== "ok" && r.analysis.quality.tier !== "unknown").length,
      manualReviewRequired: results.filter((r) => r.warnings.some((w) => w.type === "manual_review_required")).length
    },
    results
  };
}

export function updateRecipeAdjustment(
  result: PrepareResult,
  patch: Partial<{ brightness: number; contrast: number; temperature: number; saturation: number; sharpness: number }>
): PrepareResult {
  const technicalAdjustments = mergeSliderPatch(result.recipe.technicalAdjustments, patch);
  return {
    ...result,
    recipe: {
      ...result.recipe,
      technicalAdjustments
    }
  };
}

export function applyDesignPresetToResult(result: PrepareResult, designPreset: PrepareDesignPresetOptions): PrepareResult {
  return {
    ...result,
    recipe: applyDesignPresetToRecipe(result.recipe, designPreset)
  };
}

export function applyDesignPresetToRecipe(recipe: PrepareRecipe, designPreset: PrepareDesignPresetOptions): PrepareRecipe {
  if (!designPreset.enabled) {
    const { designPreset: _removed, ...rest } = recipe;
    return rest;
  }
  return {
    ...recipe,
    ...buildDesignPresetRecipe({ designPreset } as PrepareOptions)
  };
}

function buildTechnicalTemplates(
  analysis: Awaited<ReturnType<typeof analyzeImageForFixes>>,
  options: PrepareOptions,
  pixelTemplates: ImageAdjustmentTemplate[] = []
): ImageAdjustmentTemplate[] {
  if (!options.autoColorFix) return [];
  const profile = PROFILE_THRESHOLDS[options.profile];
  const pixelHasWhiteBalance = pixelTemplates.some((template) =>
    template.type === "color" && (Math.abs(template.temperature ?? 0) > 0.001 || Math.abs(template.tint ?? 0) > 0.001)
  );
  const autoTemplates = analysis === null ? [] : buildAutoEnhanceAdjustments(analysis, "autoEnhance")
    .map((template) => scaleTemplateNumbers(template, profile.colorScale))
    .map((template) => pixelHasWhiteBalance ? suppressWhiteBalance(template) : template)
    .map(applyGuardrails);
  const templates = [
    ...pixelTemplates.map(applyGuardrails),
    ...autoTemplates
  ];
  const hasDetail = templates.some((template) => template.type === "detail");
  if (options.sharpenSoftImages && profile.sharpen > 0 && !hasDetail && analysis !== null && analysis.exposure.contrast < 0.14) {
    templates.push({ type: "detail", sharpness: profile.sharpen, clarity: Math.round(profile.sharpen / 2) });
  }
  return templates.map(removeUndefinedTemplateFields).filter((template) => hasNonNeutralTemplate(template));
}

function suppressWhiteBalance(template: ImageAdjustmentTemplate): ImageAdjustmentTemplate {
  if (template.type !== "color") return template;
  return { ...template, temperature: 0, tint: 0 };
}

function buildDesignPresetRecipe(options: PrepareOptions): Pick<PrepareRecipe, "designPreset"> {
  const preset = getPreset(options.designPreset.presetId);
  if (preset === undefined) return {};
  const strength = clamp01(options.designPreset.strength);
  const adjustments = applyDesignGuardrails(instantiatePresetAdjustments(preset, strength));
  return {
    designPreset: {
      enabled: true,
      presetId: preset.id,
      strength,
      adjustments
    }
  };
}

function buildRecommendations(input: {
  screenshotConfidence: number;
  hasScreenshotCrop: boolean;
  targetConfidence: number;
  targetSafe: boolean;
  hasColor: boolean;
  qualityTier: PrepareImageAnalysis["quality"]["tier"];
  options: PrepareOptions;
}): PrepareOperationRecommendation[] {
  const profile = PROFILE_THRESHOLDS[input.options.profile];
  const out: PrepareOperationRecommendation[] = [];
  if (input.hasScreenshotCrop) {
    out.push(operation("screenshot_crop", input.screenshotConfidence, profile, "זוהו שוליים/פסי מערכת בטוחים."));
  }
  if (input.options.targetSize.enabled) {
    out.push({
      ...operation("target_crop", input.targetConfidence, profile, input.targetSafe ? "נמצא crop מתאים למידת היעד." : "לא נמצא crop בטוח שמכיל את כל הפנים."),
      enabled: input.targetSafe && profile.cropAuto && input.targetConfidence >= profile.review
    });
  }
  if (input.hasColor) {
    out.push(operation("technical_color", 0.82, profile, "נמצאה חשיפה/צבע שדורשים תיקון עדין."));
  }
  if (input.options.designPreset.enabled) {
    out.push(operation("design_preset", 0.9, profile, "המשתמש ביקש לוק עיצובי אחיד."));
  }
  if (input.qualityTier !== "unknown") {
    const confidence = input.qualityTier === "ok" ? 0.95 : input.qualityTier === "soft_warning" ? 0.78 : input.qualityTier === "strong_warning" ? 0.62 : 0.45;
    out.push(operation("quality_check", confidence, profile, "בדיקת DPI לפי מידת היעד."));
  }
  return out;
}

function operation(
  operationType: PrepareOperationRecommendation["operation"],
  confidence: number,
  profile: { auto: number; review: number },
  reason: string
): PrepareOperationRecommendation {
  return {
    operation: operationType,
    enabled: confidence >= profile.review,
    autoApproved: confidence >= profile.auto,
    confidence,
    reason
  };
}

function buildWarnings(
  operations: PrepareOperationRecommendation[],
  quality: PrepareImageAnalysis["quality"],
  cropSafe: boolean
): PrepareWarning[] {
  const warnings: PrepareWarning[] = [];
  for (const op of operations) {
    if (op.enabled && !op.autoApproved && op.operation !== "quality_check") {
      warnings.push({ type: "manual_review_required", operation: op.operation, confidence: op.confidence, message: "מומלץ לבדוק ידנית לפני שמירה." });
    }
    if (!op.enabled && op.confidence < 0.7) {
      warnings.push({ type: "low_confidence", operation: op.operation, confidence: op.confidence, message: "רמת הביטחון נמוכה, הפעולה לא תאושר אוטומטית." });
    }
  }
  if (!cropSafe) warnings.push({ type: "crop_not_safe", operation: "target_crop", message: "ה-crop עלול לחתוך פנים או שיער, נדרשת בדיקה ידנית." });
  if (quality.tier === "soft_warning") warnings.push({ type: "low_resolution", operation: "quality_check", message: quality.message });
  if (quality.tier === "strong_warning" || quality.tier === "manual_review") {
    warnings.push({ type: "manual_review_required", operation: "quality_check", message: quality.message });
  }
  return warnings;
}

function shouldAutoEnable(confidence: number, options: PrepareOptions): boolean {
  const profile = PROFILE_THRESHOLDS[options.profile];
  return confidence >= profile.review;
}

async function loadFileImage(file: File): Promise<HtmlImageInfo> {
  const url = URL.createObjectURL(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Cannot load image: ${file.name}`));
    img.src = url;
  });
  return { image, url, width: image.naturalWidth, height: image.naturalHeight };
}

async function detectFaces(sourceUrl: string, width: number, height: number): Promise<{ boxes: PrepareFaceBox[]; backend: string }> {
  const spp = typeof window !== "undefined" ? window.spp : undefined;
  if (spp?.smartSelection?.loadImage === undefined || spp.smartSelection.detectFaces === undefined) {
    return { boxes: [], backend: "none" };
  }
  try {
    const imagePath = sourceUrl.startsWith("blob:") || sourceUrl.startsWith("data:")
      ? await blobUrlToTempImage(sourceUrl)
      : sourceUrl;
    if (imagePath === null) return { boxes: [], backend: "none" };
    const imageId = `spp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const loaded = await spp.smartSelection.loadImage(imageId, imagePath, imageId);
    if (!loaded?.ok) return { boxes: [], backend: "none" };
    try {
      const detected = await spp.smartSelection.detectFaces(imageId);
      return {
        backend: detected?.backend ?? "none",
        boxes: (detected?.faces ?? []).map((face) => ({
          x: face.x,
          y: face.y,
          width: face.width,
          height: face.height,
          score: face.score ?? 0.5
        }))
      };
    } finally {
      await spp.smartSelection.unloadImage?.(imageId).catch(() => undefined);
    }
  } catch {
    return { boxes: [], backend: "none" };
  }
}

async function blobUrlToTempImage(url: string): Promise<string | null> {
  const spp = typeof window !== "undefined" ? window.spp : undefined;
  if (spp?.writeTempImage === undefined) return null;
  const response = await fetch(url);
  const blob = await response.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Cannot read image"));
    reader.readAsDataURL(blob);
  });
  const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
  return spp.writeTempImage(dataUrl, ext);
}

function isSafeScreenshotCrop(rect: PrepareCropRect, width: number, height: number, confidence: number): boolean {
  if (confidence < 0.82 || width <= 0 || height <= 0) return false;
  const removedX = width - rect.width;
  const removedY = height - rect.height;
  if (removedX < 0 || removedY < 0) return false;
  const removedXRatio = removedX / width;
  const removedYRatio = removedY / height;
  return removedXRatio <= 0.08 && removedYRatio <= 0.12;
}

function analyzePixelScene(image: HTMLImageElement, baseRect: PrepareCropRect, options: PrepareOptions): PixelSceneRecipe {
  const tonal = analyzePixelToneRecipe(image, baseRect, options);
  const color = analyzePixelColorCast(image, baseRect);
  return {
    templates: [...tonal.templates, ...color.templates],
    issues: [...tonal.issues, ...color.issues]
  };
}

function detectContentFeatures(image: HTMLImageElement, baseRect: PrepareCropRect): ContentDetection {
  const maxEdge = 180;
  const scale = Math.min(1, maxEdge / Math.max(baseRect.width, baseRect.height));
  const width = Math.max(24, Math.round(baseRect.width * scale));
  const height = Math.max(24, Math.round(baseRect.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx === null) return { box: null, focus: null };
  ctx.drawImage(image, baseRect.x, baseRect.y, baseRect.width, baseRect.height, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  const bg = estimateCornerBackground(data, width, height);
  const marked = new Uint8Array(width * height);
  const rowCounts = new Uint16Array(height);
  const colCounts = new Uint16Array(width);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = (y * width + x) * 4;
      const right = idx + 4;
      const down = idx + width * 4;
      const colorDistance = rgbDistance(data[idx]!, data[idx + 1]!, data[idx + 2]!, bg.r, bg.g, bg.b);
      const edgeDistance = Math.max(
        rgbDistance(data[idx]!, data[idx + 1]!, data[idx + 2]!, data[right]!, data[right + 1]!, data[right + 2]!),
        rgbDistance(data[idx]!, data[idx + 1]!, data[idx + 2]!, data[down]!, data[down + 1]!, data[down + 2]!)
      );
      if (edgeDistance > 20 || colorDistance > 48) {
        marked[y * width + x] = 1;
        rowCounts[y] += 1;
        colCounts[x] += 1;
      }
    }
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  let focusX = 0;
  let focusY = 0;
  let focusWeight = 0;
  for (let y = 1; y < height - 1; y += 1) {
    if (rowCounts[y]! > width * 0.72) continue;
    for (let x = 1; x < width - 1; x += 1) {
      if (marked[y * width + x] === 0 || colCounts[x]! > height * 0.84) continue;
      const idx = (y * width + x) * 4;
      const r = data[idx]!;
      const g = data[idx + 1]!;
      const b = data[idx + 2]!;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
      const saturation = max === 0 ? 0 : (max - min) / max;
      const skinLike = r > 82 && g > 46 && b > 34 && r > b * 1.06 && r < g * 1.85 && luma > 52 && luma < 224 ? 1 : 0;
      const warmClothing = r > 115 && r > g * 1.03 && r > b * 1.03 && saturation > 0.14 ? 1 : 0;
      const nonNeutral = saturation > 0.2 ? 1 : 0;
      const verticalSubjectBias = y > height * 0.12 && y < height * 0.9 ? 1 : 0.6;
      const weight = (1 + saturation * 2.4 + skinLike * 5.5 + warmClothing * 2.4 + nonNeutral * 1.2) * verticalSubjectBias;
      focusX += x * weight;
      focusY += y * weight;
      focusWeight += weight;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      count += 1;
    }
  }
  if (count < Math.max(24, width * height * 0.002) || maxX <= minX || maxY <= minY) return { box: null, focus: null };
  const inv = 1 / scale;
  const box = {
    x: Math.max(0, Math.round(minX * inv)),
    y: Math.max(0, Math.round(minY * inv)),
    width: Math.min(baseRect.width, Math.round((maxX - minX + 1) * inv)),
    height: Math.min(baseRect.height, Math.round((maxY - minY + 1) * inv))
  };
  const focus = focusWeight > 0
    ? {
      x: Math.round((focusX / focusWeight) * inv),
      y: Math.round((focusY / focusWeight) * inv),
      confidence: clampValue((focusWeight / Math.max(1, count) - 1) / 6, 0.22, 0.82)
    }
    : null;
  return { box, focus };
}

function analyzePixelToneRecipe(image: HTMLImageElement, baseRect: PrepareCropRect, options: PrepareOptions): PixelSceneRecipe {
  const edge = 128;
  const scale = Math.min(1, edge / Math.max(baseRect.width, baseRect.height));
  const width = Math.max(24, Math.round(baseRect.width * scale));
  const height = Math.max(24, Math.round(baseRect.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx === null) return { templates: [], issues: [] };
  ctx.drawImage(image, baseRect.x, baseRect.y, baseRect.width, baseRect.height, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  let lumaSum = 0;
  let lumaSq = 0;
  let satSum = 0;
  let shadows = 0;
  let highlights = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
    lumaSum += luma;
    lumaSq += luma * luma;
    satSum += max === 0 ? 0 : (max - min) / max;
    if (luma < 36) shadows += 1;
    if (luma > 228) highlights += 1;
    count += 1;
  }
  if (count === 0) return { templates: [], issues: [] };
  const mean = lumaSum / count;
  const contrast = Math.sqrt(Math.max(0, lumaSq / count - mean * mean)) / 255;
  const shadowClip = shadows / count;
  const highlightClip = highlights / count;
  const saturation = satSum / count;
  const profile = PROFILE_THRESHOLDS[options.profile];
  const strength = options.profile === "gentle" ? 0.62 : options.profile === "aggressive" ? 1 : options.profile === "photo_lab" ? 0.92 : 0.85;
  const templates: ImageAdjustmentTemplate[] = [];
  const issues: string[] = [];
  const tone: Extract<ImageAdjustmentTemplate, { type: "basicTone" }> = { type: "basicTone" };
  const hs: Extract<ImageAdjustmentTemplate, { type: "highlightsShadows" }> = { type: "highlightsShadows" };

  if (mean < 104) {
    tone.exposure = clampValue(((118 - mean) / 210) * strength, 0.06, 0.4);
    tone.brightness = clampValue(((112 - mean) / 6.2) * strength, 3, 20);
    hs.shadows = clampValue((16 + shadowClip * 118) * strength, 10, 46);
    issues.push("pixel_underexposed");
  } else if (mean > 178 || highlightClip > 0.08) {
    tone.exposure = -clampValue(((mean - 168) / 240 + highlightClip * 0.7) * strength, 0.06, 0.34);
    hs.highlights = -clampValue((14 + highlightClip * 145) * strength, 10, 44);
    hs.whites = -clampValue((highlightClip * 78) * strength, 3, 18);
    issues.push("pixel_highlights");
  }

  if (contrast < 0.15) {
    tone.contrast = clampValue(((0.18 - contrast) * 155) * strength, 4, 20);
    hs.blacks = -clampValue(((0.15 - contrast) * 72) * strength, 3, 14);
    templates.push({ type: "curves", preset: contrast < 0.105 ? "levelsApprox" : "softSCurve" });
    issues.push("pixel_low_contrast");
  } else if (contrast > 0.31 && highlightClip > 0.035) {
    templates.push({ type: "curves", preset: "softHighlightCompression" });
    issues.push("pixel_high_contrast_highlights");
  }

  if (saturation < 0.18 && mean > 58) {
    templates.push({ type: "color", vibrance: clampValue((17 - saturation * 36) * profile.colorScale, 4, 14), saturation: 2 });
    issues.push("pixel_low_saturation");
  } else if (saturation > 0.58) {
    templates.push({ type: "color", saturation: -clampValue((saturation - 0.52) * 46, 4, 16), vibrance: -3 });
    issues.push("pixel_oversaturated");
  }

  if (hasNonNeutralTemplate(tone)) templates.unshift(tone);
  if (hasNonNeutralTemplate(hs)) templates.splice(Math.min(1, templates.length), 0, hs);
  return { templates, issues };
}

function analyzePixelColorCast(image: HTMLImageElement, baseRect: PrepareCropRect): PixelSceneRecipe {
  const edge = 96;
  const scale = Math.min(1, edge / Math.max(baseRect.width, baseRect.height));
  const width = Math.max(16, Math.round(baseRect.width * scale));
  const height = Math.max(16, Math.round(baseRect.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx === null) return { templates: [], issues: [] };
  ctx.drawImage(image, baseRect.x, baseRect.y, baseRect.width, baseRect.height, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    const rr = data[i]!;
    const gg = data[i + 1]!;
    const bb = data[i + 2]!;
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    if (max < 24 || min > 246) continue;
    r += rr;
    g += gg;
    b += bb;
    count += 1;
  }
  if (count < 20) return { templates: [], issues: [] };
  r /= count;
  g /= count;
  b /= count;
  const blueExcess = b - (r + g) / 2;
  const warmExcess = r - (g + b) / 2;
  const greenExcess = g - (r + b) / 2;
  const color: Extract<ImageAdjustmentTemplate, { type: "color" }> = { type: "color" };
  const templates: ImageAdjustmentTemplate[] = [];
  const issues: string[] = [];
  if (blueExcess > 14) {
    color.temperature = clampValue(blueExcess * 0.72, 10, 56);
    color.saturation = blueExcess > 32 ? -4 : -2;
    color.vibrance = blueExcess > 32 ? 4 : 2;
    if (blueExcess > 26) {
      templates.push(
        { type: "curves", channel: "b", points: [{ x: 0, y: 0 }, { x: 96, y: 91 }, { x: 184, y: 172 }, { x: 255, y: 244 }] },
        { type: "curves", channel: "r", points: [{ x: 0, y: 2 }, { x: 96, y: 101 }, { x: 190, y: 201 }, { x: 255, y: 255 }] }
      );
    }
    issues.push("pixel_blue_cast");
  } else if (warmExcess > 16) {
    color.temperature = -clampValue(warmExcess * 0.6, 8, 42);
    if (warmExcess > 26) {
      templates.push({ type: "curves", channel: "r", points: [{ x: 0, y: 0 }, { x: 96, y: 92 }, { x: 184, y: 174 }, { x: 255, y: 248 }] });
    }
    issues.push("pixel_warm_cast");
  }
  if (greenExcess > 12) {
    color.tint = clampValue(greenExcess * 0.64, 7, 36);
    if (greenExcess > 24) {
      templates.push({ type: "curves", channel: "g", points: [{ x: 0, y: 0 }, { x: 96, y: 92 }, { x: 184, y: 174 }, { x: 255, y: 248 }] });
    }
    issues.push("pixel_green_cast");
  } else if (greenExcess < -14 && Math.abs(r - b) < 22) {
    color.tint = -clampValue(Math.abs(greenExcess) * 0.56, 7, 30);
    issues.push("pixel_magenta_cast");
  }
  if (hasNonNeutralTemplate(color)) templates.unshift(color);
  return templates.length > 0 ? { templates, issues } : { templates: [], issues: [] };
}

function estimateCornerBackground(data: Uint8ClampedArray, width: number, height: number): { r: number; g: number; b: number } {
  const block = Math.max(4, Math.round(Math.min(width, height) * 0.08));
  const samples = [
    { x0: 0, y0: 0 },
    { x0: width - block, y0: 0 },
    { x0: 0, y0: height - block },
    { x0: width - block, y0: height - block }
  ];
  let best = { r: 0, g: 0, b: 0, variance: Number.POSITIVE_INFINITY };
  for (const sample of samples) {
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let y = Math.max(0, sample.y0); y < Math.min(height, sample.y0 + block); y += 1) {
      for (let x = Math.max(0, sample.x0); x < Math.min(width, sample.x0 + block); x += 1) {
        const idx = (y * width + x) * 4;
        r += data[idx]!;
        g += data[idx + 1]!;
        b += data[idx + 2]!;
        count += 1;
      }
    }
    if (count === 0) continue;
    r /= count;
    g /= count;
    b /= count;
    let variance = 0;
    for (let y = Math.max(0, sample.y0); y < Math.min(height, sample.y0 + block); y += 1) {
      for (let x = Math.max(0, sample.x0); x < Math.min(width, sample.x0 + block); x += 1) {
        const idx = (y * width + x) * 4;
        variance += rgbDistance(data[idx]!, data[idx + 1]!, data[idx + 2]!, r, g, b);
      }
    }
    variance /= count;
    if (variance < best.variance) best = { r, g, b, variance };
  }
  return best;
}

function rgbDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return Math.abs(r1 - r2) * 0.32 + Math.abs(g1 - g2) * 0.42 + Math.abs(b1 - b2) * 0.26;
}

function adjustFacesToBaseRect(faces: PrepareFaceBox[], baseRect: PrepareCropRect): PrepareFaceBox[] {
  return faces.flatMap((face) => {
    const left = Math.max(face.x, baseRect.x);
    const top = Math.max(face.y, baseRect.y);
    const right = Math.min(face.x + face.width, baseRect.x + baseRect.width);
    const bottom = Math.min(face.y + face.height, baseRect.y + baseRect.height);
    if (right <= left || bottom <= top) return [];
    return [{
      x: left - baseRect.x,
      y: top - baseRect.y,
      width: right - left,
      height: bottom - top,
      score: face.score
    }];
  });
}

function resolveFilePath(file: File): string | undefined {
  try {
    return window.spp?.getFilePath?.(file) || undefined;
  } catch {
    return undefined;
  }
}

function scaleTemplateNumbers(template: ImageAdjustmentTemplate, scale: number): ImageAdjustmentTemplate {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(template)) {
    out[key] = typeof value === "number" && key !== "sharpnessRadius" ? value * scale : value;
  }
  return out as ImageAdjustmentTemplate;
}

function applyGuardrails(template: ImageAdjustmentTemplate): ImageAdjustmentTemplate {
  if (template.type === "color") {
    return {
      ...template,
      saturation: clampNumber(template.saturation, -18, 18),
      vibrance: clampNumber(template.vibrance, -4, 16),
      temperature: clampNumber(template.temperature, -62, 62),
      tint: clampNumber(template.tint, -42, 42)
    };
  }
  if (template.type === "basicTone") {
    return {
      ...template,
      brightness: clampNumber(template.brightness, -24, 28),
      contrast: clampNumber(template.contrast, -18, 24),
      exposure: clampNumber(template.exposure, -0.45, 0.45)
    };
  }
  if (template.type === "highlightsShadows") {
    return {
      ...template,
      highlights: clampNumber(template.highlights, -54, 34),
      shadows: clampNumber(template.shadows, -20, 58),
      whites: clampNumber(template.whites, -24, 24),
      blacks: clampNumber(template.blacks, -24, 18)
    };
  }
  if (template.type === "detail") {
    return {
      ...template,
      sharpness: clampNumber(template.sharpness, -8, 14),
      clarity: clampNumber(template.clarity, -8, 14)
    };
  }
  return template;
}

function removeUndefinedTemplateFields(template: ImageAdjustmentTemplate): ImageAdjustmentTemplate {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(template)) {
    if (value !== undefined) out[key] = value;
  }
  return out as ImageAdjustmentTemplate;
}

function applyDesignGuardrails(adjustments: ImageAdjustment[]): ImageAdjustment[] {
  return adjustments.map((adjustment) => {
    if (adjustment.type === "color") {
      return { ...adjustment, saturation: clampValue(adjustment.saturation, -25, 25), vibrance: clampValue(adjustment.vibrance, -6, 18) };
    }
    if (adjustment.type === "detail") {
      return { ...adjustment, sharpness: clampValue(adjustment.sharpness, -10, 16), clarity: clampValue(adjustment.clarity, -10, 20) };
    }
    if (adjustment.type === "basicTone") {
      return { ...adjustment, contrast: clampValue(adjustment.contrast, -22, 24) };
    }
    return adjustment;
  });
}

function hasNonNeutralTemplate(template: ImageAdjustmentTemplate): boolean {
  if (template.type === "curves") {
    return template.points !== undefined || (template.preset !== undefined && template.preset !== "linear");
  }
  if (template.type === "gradientMap") {
    return template.stops !== undefined && template.stops.length > 1;
  }
  return Object.entries(template).some(([key, value]) => key !== "type" && key !== "enabled" && typeof value === "number" && Math.abs(value) > 0.001);
}

function mergeSliderPatch(
  stack: ImageAdjustment[],
  patch: Partial<{ brightness: number; contrast: number; temperature: number; saturation: number; sharpness: number }>
): ImageAdjustment[] {
  const next = [...stack];
  const ensure = <T extends ImageAdjustment["type"]>(type: T): Extract<ImageAdjustment, { type: T }> => {
    const found = next.find((item): item is Extract<ImageAdjustment, { type: T }> => item.type === type);
    if (found !== undefined) return found;
    const created = createImageAdjustment({ type } as ImageAdjustmentTemplate) as Extract<ImageAdjustment, { type: T }>;
    next.push(created);
    return created;
  };
  if (patch.brightness !== undefined || patch.contrast !== undefined) {
    const tone = ensure("basicTone");
    if (patch.brightness !== undefined) tone.brightness = patch.brightness;
    if (patch.contrast !== undefined) tone.contrast = patch.contrast;
  }
  if (patch.temperature !== undefined || patch.saturation !== undefined) {
    const color = ensure("color");
    if (patch.temperature !== undefined) color.temperature = patch.temperature;
    if (patch.saturation !== undefined) color.saturation = patch.saturation;
  }
  if (patch.sharpness !== undefined) {
    const detail = ensure("detail");
    detail.sharpness = patch.sharpness;
  }
  return next;
}

function clampNumber(value: number | undefined, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  return clampValue(value, min, max);
}

function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
