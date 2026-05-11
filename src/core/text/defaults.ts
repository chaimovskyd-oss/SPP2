import type { TextLayer, WarpSettings } from "@/types/layers";
import type { AutoContrastConfig } from "@/types/text";

export function createDefaultWarpSettings(): WarpSettings {
  return {
    version: 1,
    enabled: false,
    type: "none",
    intensity: 0,
    amount: 0,
    horizontalDistortion: 0,
    verticalDistortion: 0,
    bend: 0
  };
}

export function createDefaultAutoContrast(): AutoContrastConfig {
  return {
    version: 1,
    enabled: false,
    lightBgColor: "#111111",
    darkBgColor: "#ffffff",
    minContrastRatio: 4.5
  };
}

export function createDefaultTextModelFields(): Pick<
  TextLayer,
  | "layerType"
  | "parentFrameId"
  | "fillOpacity"
  | "overflowPolicy"
  | "anchorPoint"
  | "anchorOffsetX"
  | "anchorOffsetY"
  | "warpSettings"
  | "effects"
  | "autoContrast"
  | "autoContrastOverridden"
  | "isDynamic"
> {
  return {
    layerType: "text",
    parentFrameId: null,
    fillOpacity: 1,
    overflowPolicy: "clip",
    anchorPoint: "center",
    anchorOffsetX: 0,
    anchorOffsetY: 0,
    warpSettings: createDefaultWarpSettings(),
    effects: [],
    autoContrast: createDefaultAutoContrast(),
    autoContrastOverridden: false,
    isDynamic: false
  };
}
