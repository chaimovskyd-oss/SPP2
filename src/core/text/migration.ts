import type { Document } from "@/types/document";
import type { TextLayer, VisualLayer, WarpSettings } from "@/types/layers";
import type { ProjectEnvelope } from "@/types/project";
import type { AutoContrastConfig, TextEffect } from "@/types/text";
import { createDefaultAutoContrast, createDefaultTextModelFields, createDefaultWarpSettings } from "./defaults";

export function migrateProjectTextLayers(project: ProjectEnvelope): ProjectEnvelope {
  return {
    ...project,
    document: migrateDocumentTextLayers(project.document)
  };
}

function migrateDocumentTextLayers(document: Document): Document {
  return {
    ...document,
    pages: document.pages.map((page) => ({
      ...page,
      layers: page.layers.map((layer) => (layer.type === "text" ? migrateTextLayer(layer) : layer))
    }))
  };
}

export function migrateTextLayer(layer: VisualLayer): TextLayer {
  if (layer.type !== "text") {
    throw new Error("Cannot migrate a non-text layer");
  }
  const legacy = layer as TextLayer & Partial<Record<string, unknown>>;
  const defaults = createDefaultTextModelFields();
  const effects = normalizeEffects(legacy.effects ?? legacy.textEffects);
  const migrated: TextLayer = {
    ...defaults,
    ...layer,
    layerType: "text",
    parentFrameId: typeof legacy.parentFrameId === "string" ? legacy.parentFrameId : null,
    fillOpacity: numberOr(legacy.fillOpacity, defaults.fillOpacity),
    overflowPolicy:
      legacy.overflowPolicy === "auto_shrink" || legacy.overflowPolicy === "warn" || legacy.overflowPolicy === "clip"
        ? legacy.overflowPolicy
        : defaults.overflowPolicy,
    anchorPoint: typeof legacy.anchorPoint === "string" ? defaults.anchorPoint : defaults.anchorPoint,
    anchorOffsetX: numberOr(legacy.anchorOffsetX, 0),
    anchorOffsetY: numberOr(legacy.anchorOffsetY, 0),
    warpSettings: normalizeWarpSettings(legacy.warpSettings),
    effects,
    autoContrast: normalizeAutoContrast(legacy.autoContrast),
    autoContrastOverridden: Boolean(legacy.autoContrastOverridden),
    isDynamic: Boolean(legacy.isDynamic)
  };
  if (legacy.textEffects !== undefined) {
    migrated.textEffects = effects;
  }
  if (typeof legacy.dynamicTemplate === "string") {
    migrated.dynamicTemplate = legacy.dynamicTemplate;
  }
  return migrated;
}

function normalizeWarpSettings(value: unknown): WarpSettings {
  const defaults = createDefaultWarpSettings();
  if (typeof value !== "object" || value === null) {
    return defaults;
  }
  const candidate = value as Partial<WarpSettings>;
  return {
    ...defaults,
    ...candidate,
    enabled: Boolean(candidate.enabled),
    intensity: numberOr(candidate.intensity, numberOr(candidate.amount, defaults.intensity)),
    amount: numberOr(candidate.amount, numberOr(candidate.intensity, defaults.amount)),
    horizontalDistortion: numberOr(candidate.horizontalDistortion, defaults.horizontalDistortion),
    verticalDistortion: numberOr(candidate.verticalDistortion, defaults.verticalDistortion),
    bend: numberOr(candidate.bend, defaults.bend)
  };
}

function normalizeAutoContrast(value: unknown): AutoContrastConfig {
  const defaults = createDefaultAutoContrast();
  if (typeof value !== "object" || value === null) {
    return defaults;
  }
  const candidate = value as Partial<AutoContrastConfig>;
  return {
    ...defaults,
    ...candidate,
    enabled: Boolean(candidate.enabled),
    lightBgColor: stringOr(candidate.lightBgColor, defaults.lightBgColor),
    darkBgColor: stringOr(candidate.darkBgColor, defaults.darkBgColor),
    minContrastRatio: numberOr(candidate.minContrastRatio, defaults.minContrastRatio)
  };
}

function normalizeEffects(value: unknown): TextEffect[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item, index) => {
    if (typeof item !== "object" || item === null) {
      return [];
    }
    const candidate = item as Partial<TextEffect> & { type?: string };
    const effectId = stringOr(candidate.effectId, stringOr(candidate.id, `text_effect_${index}`));
    const effectType = candidate.effectType ?? legacyEffectType(candidate.type);
    return [
      {
        version: 1,
        id: effectId,
        effectId,
        effectType,
        enabled: candidate.enabled ?? true,
        opacity: numberOr(candidate.opacity, 1),
        blendMode: candidate.blendMode ?? "normal",
        params: candidate.params ?? {}
      }
    ];
  });
}

function legacyEffectType(type: string | undefined): TextEffect["effectType"] {
  // Legacy "stroke" TextEffect was never wired up — text strokes live on layer.stroke.
  // Treat it as a no-op "fill" effect during migration.
  if (type === "gradient") {
    return "fill";
  }
  if (type === "shadow") {
    return "drop_shadow";
  }
  return "fill";
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}
