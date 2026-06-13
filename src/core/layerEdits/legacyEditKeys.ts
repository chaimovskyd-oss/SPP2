/**
 * Catalog of the legacy flat `ImageLayerEffects` edits, shared by the legacy-edit
 * adapter (projection + mutation) and `resolveEffectiveLayer` (render-time
 * neutralization). Each entry knows its synthetic id, label, whether it is
 * currently "applied" (non-neutral), a short summary, and how to reset itself to
 * the neutral default — so the panel, persistence and rendering stay in lockstep.
 *
 * Synthetic id convention: `legacy:<effectsKey>`.
 */

import { DEFAULT_IMAGE_LAYER_EFFECTS, type ImageLayerEffects } from "@/types/layers";

export const LEGACY_EDIT_PREFIX = "legacy:";

function signed(value: number, digits = 0): string {
  const rounded = digits > 0 ? Number(value.toFixed(digits)) : Math.round(value);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

export interface LegacyEditDef {
  /** Synthetic descriptor id, e.g. "legacy:contrast". */
  id: string;
  /** Key inside ImageLayerEffects. */
  key: keyof ImageLayerEffects;
  label: string;
  /** True when this edit currently changes the image (worth listing). */
  isActive: (fx: ImageLayerEffects) => boolean;
  /** Short value summary for the panel row ("" when not meaningful). */
  summary: (fx: ImageLayerEffects) => string;
  /** Patch that resets ONLY this edit back to neutral. */
  neutralPatch: () => Partial<ImageLayerEffects>;
}

const numeric = (
  key: keyof ImageLayerEffects,
  label: string,
  digits = 0
): LegacyEditDef => ({
  id: `${LEGACY_EDIT_PREFIX}${key}`,
  key,
  label,
  isActive: (fx) => ((fx[key] as number | undefined) ?? 0) !== 0,
  summary: (fx) => signed(((fx[key] as number | undefined) ?? 0), digits),
  neutralPatch: () => ({ [key]: DEFAULT_IMAGE_LAYER_EFFECTS[key] } as Partial<ImageLayerEffects>)
});

const boolean = (key: keyof ImageLayerEffects, label: string): LegacyEditDef => ({
  id: `${LEGACY_EDIT_PREFIX}${key}`,
  key,
  label,
  isActive: (fx) => (fx[key] as boolean | undefined) === true,
  summary: () => "",
  neutralPatch: () => ({ [key]: false } as Partial<ImageLayerEffects>)
});

export const LEGACY_EDIT_DEFS: LegacyEditDef[] = [
  numeric("brightness", "בהירות"),
  numeric("contrast", "קונטרסט"),
  numeric("saturation", "רוויה"),
  numeric("exposure", "חשיפה"),
  numeric("hue", "גוון"),
  numeric("luminance", "בהירות ערכית", 1),
  numeric("blur", "טשטוש"),
  numeric("threshold", "סף"),
  numeric("posterize", "פוסטריזציה"),
  boolean("grayscale", "שחור־לבן"),
  boolean("sepia", "ספיה"),
  boolean("invert", "היפוך"),
  boolean("remove_white", "הסרת לבן"),
  boolean("color_pop", "הדגשת צבע"),
  {
    id: `${LEGACY_EDIT_PREFIX}shadow`,
    key: "shadow",
    label: "צל",
    isActive: (fx) => fx.shadow !== null && fx.shadow.enabled !== false,
    summary: () => "",
    neutralPatch: () => ({ shadow: null })
  },
  {
    id: `${LEGACY_EDIT_PREFIX}outline`,
    key: "outline",
    label: "מתאר",
    isActive: (fx) => fx.outline !== null && fx.outline.enabled !== false,
    summary: () => "",
    neutralPatch: () => ({ outline: null })
  }
];

const DEF_BY_ID = new Map(LEGACY_EDIT_DEFS.map((def) => [def.id, def]));

export function getLegacyEditDef(id: string): LegacyEditDef | undefined {
  return DEF_BY_ID.get(id);
}
