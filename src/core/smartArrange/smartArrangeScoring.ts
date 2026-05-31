import type { Rect } from "@/types/primitives";
import {
  containsRect,
  intersectionArea,
  moveDistance,
  rectArea,
  rectBottom
} from "./smartArrangeGeometry";
import type { SmartArrangeContext, SmartArrangeItem } from "./smartArrangeTypes";

const TEXT_RANK: Record<string, number> = { title: 0, subtitle: 1, bodyText: 2, shortText: 3 };

/**
 * Score a candidate arrangement. Higher is better. The scale is arbitrary —
 * only relative comparison between candidates of the same context matters.
 */
export function scoreCandidate(items: SmartArrangeItem[], ctx: SmartArrangeContext): number {
  const safe = ctx.safeBounds;
  const canvasDiag = Math.hypot(ctx.canvasBounds.width, ctx.canvasBounds.height) || 1;
  const safeArea = Math.max(1, rectArea(safe));
  let score = 0;

  // ── Penalty: overlaps ──────────────────────────────────────────────────
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const overlap = intersectionArea(items[i].bounds, items[j].bounds);
      if (overlap > 1) score -= 60 * (overlap / safeArea);
    }
  }

  // ── Penalty: out of safe area + move distance + font shrink ─────────────
  for (const it of items) {
    if (!containsRect(safe, it.bounds)) {
      const outside = rectArea(it.bounds) - intersectionArea(it.bounds, safe);
      score -= 40 * (Math.max(0, outside) / safeArea);
    }
    const dist = moveDistance(it.bounds, it.originalBounds);
    score -= 18 * (dist / canvasDiag);

    if (it.fontSize !== undefined && it.originalFontSize !== undefined && it.originalFontSize > 0) {
      const shrink = 1 - it.fontSize / it.originalFontSize;
      if (shrink > 0) score -= 25 * shrink;
    }

    // Reward keeping the hero image significant.
    if (it.role === "mainImage") {
      score += 10 * Math.min(1, rectArea(it.bounds) / safeArea / 0.25);
    }
  }

  // ── Reward: even gaps in the text stack ────────────────────────────────
  const texts = items
    .filter((it) => it.kind === "text")
    .sort((a, b) => a.bounds.y - b.bounds.y);
  if (texts.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < texts.length; i += 1) {
      gaps.push(texts[i].bounds.y - rectBottom(texts[i - 1].bounds));
    }
    const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    const variance = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
    const norm = Math.sqrt(variance) / Math.max(1, safe.height);
    score += 15 * Math.max(0, 1 - norm * 4);

    // Reward correct hierarchy: title above subtitle above body (top-to-bottom).
    const ranked = texts
      .filter((it) => TEXT_RANK[it.role] !== undefined)
      .map((it) => TEXT_RANK[it.role]);
    let inOrder = 0;
    for (let i = 1; i < ranked.length; i += 1) if (ranked[i] >= ranked[i - 1]) inOrder += 1;
    if (ranked.length > 1) score += 12 * (inOrder / (ranked.length - 1));
  }

  return score;
}

interface Candidate {
  items: SmartArrangeItem[];
  mode: import("./smartArrangeTypes").SmartArrangeMode;
}

/** Pick the highest-scoring candidate. Ties keep the first (earlier = preferred). */
export function pickBest(candidates: Candidate[], ctx: SmartArrangeContext): Candidate {
  let best = candidates[0];
  let bestScore = scoreCandidate(best.items, ctx);
  for (let i = 1; i < candidates.length; i += 1) {
    const s = scoreCandidate(candidates[i].items, ctx);
    if (s > bestScore) {
      best = candidates[i];
      bestScore = s;
    }
  }
  return best;
}
