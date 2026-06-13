import type { ImageAdjustment, ImageAdjustmentTemplate } from "@/types/imageAdjustments";

export type PrepareProfileId = "gentle" | "recommended" | "aggressive" | "photo_lab";

export type PrepareOperationType =
  | "screenshot_crop"
  | "target_crop"
  | "technical_color"
  | "sharpen"
  | "design_preset"
  | "quality_check";

export type PrepareWarningType =
  | "manual_review_required"
  | "low_resolution"
  | "crop_not_safe"
  | "face_near_edge"
  | "low_confidence"
  | "render_failed";

export interface PrepareCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PrepareFaceBox extends PrepareCropRect {
  score: number;
}

export interface PrepareFocusPoint {
  x: number;
  y: number;
  confidence: number;
}

export interface PrepareTargetSize {
  enabled: boolean;
  width: number;
  height: number;
  unit: "mm" | "cm" | "inch" | "px";
  dpi: number;
  label?: string;
}

export interface PrepareDesignPresetOptions {
  enabled: boolean;
  presetId: string;
  strength: number;
}

export interface PrepareOptions {
  removeScreenshotArtifacts: boolean;
  autoColorFix: boolean;
  sharpenSoftImages: boolean;
  qualityCheck: boolean;
  targetSize: PrepareTargetSize;
  designPreset: PrepareDesignPresetOptions;
  profile: PrepareProfileId;
  mode: "auto" | "manual-review";
}

export interface PrepareOperationRecommendation {
  operation: PrepareOperationType;
  enabled: boolean;
  autoApproved: boolean;
  confidence: number;
  reason: string;
}

export interface PrepareWarning {
  type: PrepareWarningType;
  message: string;
  operation?: PrepareOperationType;
  confidence?: number;
}

export interface PrepareQualityAnalysis {
  effectiveDpi?: number;
  tier: "ok" | "soft_warning" | "strong_warning" | "manual_review" | "unknown";
  message: string;
}

export interface PrepareImageAnalysis {
  width: number;
  height: number;
  aspectRatio: number;
  screenshot?: {
    isLikely: boolean;
    confidence: number;
    cropRect: PrepareCropRect | null;
    reasons: string[];
  };
  faces: {
    boxes: PrepareFaceBox[];
    backend: string;
    groupBox: PrepareCropRect | null;
  };
  contentBox?: PrepareCropRect | null;
  contentFocus?: PrepareFocusPoint | null;
  colorIssues: string[];
  quality: PrepareQualityAnalysis;
}

export interface PrepareRecipe {
  screenshotCrop?: {
    enabled: boolean;
    rect: PrepareCropRect;
    confidence: number;
  };
  targetCrop?: {
    enabled: boolean;
    rect: PrepareCropRect;
    confidence: number;
    source: "faces" | "content" | "center";
  };
  technicalAdjustments: ImageAdjustment[];
  technicalTemplates: ImageAdjustmentTemplate[];
  designPreset?: {
    enabled: boolean;
    presetId: string;
    strength: number;
    adjustments: ImageAdjustment[];
  };
}

export interface PrepareResult {
  id: string;
  fileName: string;
  filePath?: string;
  sourceUrl: string;
  sourceFile?: File;
  analysis: PrepareImageAnalysis;
  recommendedOperations: PrepareOperationRecommendation[];
  recipe: PrepareRecipe;
  warnings: PrepareWarning[];
  confidence: number;
  approved: boolean;
  keepOriginal: boolean;
}

export interface BatchPrepareReport {
  version: 1;
  createdAt: string;
  total: number;
  summary: {
    screenshotsCleaned: number;
    colorCorrected: number;
    croppedToTarget: number;
    designPresetApplied: number;
    lowResolutionWarnings: number;
    manualReviewRequired: number;
  };
  results: PrepareResult[];
}

export interface PreparedRenderResult {
  dataUrl: string;
  width: number;
  height: number;
}
