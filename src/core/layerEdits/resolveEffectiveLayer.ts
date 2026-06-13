/**
 * Render-time projection of a layer with a set of edits muted, WITHOUT mutating
 * the document. Both render paths call this so live preview and export agree:
 *  - live  (KonvaLayerNode): muted = persisted disabled ∪ transient before/after.
 *  - export (offscreenPageRenderer): muted = persisted disabled only.
 *
 * Muting is non-destructive: modern stack entries are flipped to `enabled:false`
 * and legacy/text fields are reset to neutral on a SHALLOW CLONE only. Stored
 * values are never lost, so un-muting restores the exact prior result.
 *
 * Returns the SAME reference when nothing is muted (keeps render identity stable).
 */

import { LEGACY_EDIT_DEFS } from "@/core/layerEdits/legacyEditKeys";
import { TEXT_EDIT_DEFS } from "@/core/layerEdits/textEffectAdapter";
import type { ImageAdjustmentStack } from "@/types/imageAdjustments";
import type { VisualEffectStack } from "@/types/visualEffects";
import type { ImageLayer, ImageLayerEffects, TextLayer, VisualLayer } from "@/types/layers";

export function resolveEffectiveLayer<T extends VisualLayer>(layer: T, muted: ReadonlySet<string>): T {
  if (muted.size === 0) return layer;
  let next = layer as VisualLayer;

  // ── Modern image-adjustment stack (entries + preset groups) ──────────────
  const stack = (next as { imageAdjustments?: ImageAdjustmentStack }).imageAdjustments;
  if (stack !== undefined && stack.stack.length > 0) {
    const presetGeneratedMuted = new Set<string>();
    for (const preset of stack.presetInstances ?? []) {
      if (muted.has(preset.id)) for (const id of preset.generatedAdjustments) presetGeneratedMuted.add(id);
    }
    const needs = stack.stack.some((a) => a.enabled && (muted.has(a.id) || presetGeneratedMuted.has(a.id)));
    if (needs) {
      next = {
        ...next,
        imageAdjustments: {
          ...stack,
          stack: stack.stack.map((a) =>
            a.enabled && (muted.has(a.id) || presetGeneratedMuted.has(a.id)) ? { ...a, enabled: false } : a
          )
        }
      } as VisualLayer;
    }
  }

  // ── Visual-effects stack ─────────────────────────────────────────────────
  const vfx = (next as { visualEffects?: VisualEffectStack }).visualEffects;
  if (vfx !== undefined && vfx.effects.some((e) => e.enabled && muted.has(e.id))) {
    next = {
      ...next,
      visualEffects: {
        ...vfx,
        effects: vfx.effects.map((e) => (e.enabled && muted.has(e.id) ? { ...e, enabled: false } : e))
      }
    } as VisualLayer;
  }

  // ── Legacy flat effects (image layers) ───────────────────────────────────
  if (next.type === "image") {
    const image = next as ImageLayer;
    let patch: Partial<ImageLayerEffects> = {};
    let touched = false;
    for (const def of LEGACY_EDIT_DEFS) {
      if (muted.has(def.id) && def.isActive(image.effects)) {
        patch = { ...patch, ...def.neutralPatch() };
        touched = true;
      }
    }
    if (touched) next = { ...image, effects: { ...image.effects, ...patch } };
  }

  // ── Text effects ─────────────────────────────────────────────────────────
  if (next.type === "text") {
    const text = next as TextLayer;
    let patch: Partial<TextLayer> = {};
    let touched = false;
    for (const def of TEXT_EDIT_DEFS) {
      if (muted.has(def.id) && def.isActive(text)) {
        patch = { ...patch, ...def.neutralPatch(text) };
        touched = true;
      }
    }
    if (touched) next = { ...text, ...patch } as VisualLayer;
  }

  return next as T;
}

/**
 * Convenience: the persisted muted set for a layer (its `editState.disabled`).
 * The live path unions this with the transient before/after preview set.
 */
export function persistedMutedSet(layer: VisualLayer): Set<string> {
  return new Set(layer.editState?.disabled ?? []);
}
