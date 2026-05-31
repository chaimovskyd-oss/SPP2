import { roundPx } from "@/core/units/conversion";
import type { SmartArrangeItem, SmartArrangeLayerUpdate } from "./smartArrangeTypes";

const EPSILON = 0.5;

/**
 * Diff each item's resulting geometry against its original snapshot and emit a
 * minimal update per changed layer. Only fields that actually moved are set.
 */
export function buildUpdates(items: SmartArrangeItem[]): SmartArrangeLayerUpdate[] {
  const updates: SmartArrangeLayerUpdate[] = [];
  for (const it of items) {
    const update: SmartArrangeLayerUpdate = { layerId: it.layerId };
    let changed = false;

    if (Math.abs(it.bounds.x - it.originalBounds.x) > EPSILON) {
      update.x = roundPx(it.bounds.x);
      changed = true;
    }
    if (Math.abs(it.bounds.y - it.originalBounds.y) > EPSILON) {
      update.y = roundPx(it.bounds.y);
      changed = true;
    }
    if (it.canResize && Math.abs(it.bounds.width - it.originalBounds.width) > EPSILON) {
      update.width = roundPx(it.bounds.width);
      changed = true;
    }
    if (it.canResize && Math.abs(it.bounds.height - it.originalBounds.height) > EPSILON) {
      update.height = roundPx(it.bounds.height);
      changed = true;
    }
    if (
      it.fontSize !== undefined &&
      it.originalFontSize !== undefined &&
      Math.abs(it.fontSize - it.originalFontSize) > 0.1
    ) {
      update.fontSize = roundPx(it.fontSize);
      changed = true;
    }

    if (changed) updates.push(update);
  }
  return updates;
}
