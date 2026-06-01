import type { Asset } from "@/types/document";
import type { ImageLayer } from "@/types/layers";
import type { JsonValue } from "@/types/primitives";

export type AiStyleQualityStatus = "success" | "failed" | "low_confidence" | "needs_review";

export type AiStyleLocalCapability = "ready" | "partial" | "unavailable";
export type AiStyleCloudCapability = "required" | "optional" | "none";

export type AiStyleStrength = "soft" | "normal" | "strong";
export type AiStyleBackgroundMode = "keep" | "transparent" | "clean";
export type AiStyleFaceMode = "auto" | "high";

export interface AiStyleOptions {
  strength: AiStyleStrength;
  backgroundMode: AiStyleBackgroundMode;
  faceMode: AiStyleFaceMode;
}

export type AiStylePipelineStepType =
  | "local-effect"
  | "local-rmbg"
  | "local-inpaint"
  | "local-export"
  | "cloud-style"
  | "cloud-lineart"
  | "cloud-rmbg"
  | "quality-check";

export interface AiStylePipelineStep {
  type: AiStylePipelineStepType;
  id: string;
  label: string;
  local: boolean;
  effect?: "line_art" | "sketch" | "coloring_page" | "posterize" | "sticker_border";
  modelId?: string;
  promptKey?: string;
  optional?: boolean;
}

export interface AiStylePreset {
  id: string;
  version: string;
  name: string;
  category: string;
  previewAsset: string;
  description: string;
  pipeline: AiStylePipelineStep[];
  estimatedCredits: number;
  estimatedCostUsd: number;
  localCapability: AiStyleLocalCapability;
  cloudCapability: AiStyleCloudCapability;
  requiresCloud: boolean;
  defaultOptions: AiStyleOptions;
}

export interface AiStyleRunMeta {
  runId: string;
  presetId: string;
  presetVersion: string;
  sourceAssetId: string;
  sourceLayerId: string;
  pipelineSteps: string[];
  options: AiStyleOptions;
  provider: "local" | "direct-fal" | "proxy" | "mock";
  modelId: string;
  modelVersion: string;
  estimatedCostUsd: number;
  creditsCharged: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  qualityStatus: AiStyleQualityStatus;
  warnings: string[];
}

export interface AiStyleApplyInput {
  pageId: string;
  layer: ImageLayer;
  asset: Asset;
  presetId: string;
  options: AiStyleOptions;
}

export interface AiStyleApplyResult {
  asset: Asset;
  layer: ImageLayer;
  runMeta: AiStyleRunMeta;
  warnings: string[];
  resultDataUrl: string;
}

export function aiStyleRunMetaToJson(meta: AiStyleRunMeta): JsonValue {
  return meta as unknown as JsonValue;
}
