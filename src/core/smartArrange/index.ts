import { buildUpdates } from "./smartArrangeApply";
import { pickBest } from "./smartArrangeScoring";
import { routeAuto, runStrategy } from "./smartArrangeStrategies";
import type {
  SmartArrangeContext,
  SmartArrangeMode,
  SmartArrangeResult
} from "./smartArrangeTypes";

export { analyzeLayersForSmartArrange, computeSafeBounds } from "./smartArrangeAnalyzer";
export type {
  SmartArrangeContext,
  SmartArrangeItem,
  SmartArrangeLayerUpdate,
  SmartArrangeMode,
  SmartArrangeResult,
  SmartArrangeRole
} from "./smartArrangeTypes";

/**
 * Run Smart Arrange over a prepared context and return the geometry updates.
 * For `auto`, the router picks a strategy and we score it against gentler
 * fallbacks (polish / fitToSafeArea), keeping the best.
 */
export function runSmartArrange(ctx: SmartArrangeContext): SmartArrangeResult {
  if (ctx.items.length === 0) {
    return { updates: [], changedLayerIds: [], resolvedMode: ctx.mode, reason: "no-eligible-layers" };
  }

  let resolvedMode: SmartArrangeMode = ctx.mode;
  let items;

  if (ctx.mode === "auto") {
    const routed = routeAuto(ctx);
    const candidateModes: SmartArrangeMode[] = Array.from(new Set([routed, "polish", "fitToSafeArea"]));
    const candidates = candidateModes.map((mode) => ({ mode, items: runStrategy(mode, ctx) }));
    const best = pickBest(candidates, ctx);
    items = best.items;
    resolvedMode = best.mode;
  } else {
    items = runStrategy(ctx.mode, ctx);
  }

  const updates = buildUpdates(items);
  return {
    updates,
    changedLayerIds: updates.map((u) => u.layerId),
    resolvedMode
  };
}
