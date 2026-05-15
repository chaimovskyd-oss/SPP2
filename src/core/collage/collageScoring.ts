import type { CollageImageInput, CollageLayout, CollageSlot } from "@/types/collage";
import type { ID } from "@/types/primitives";

export interface ScoreResult {
  score: number;
  aspectRatioScore: number;
  faceSafetyScore: number;
  balanceScore: number;
  diversityScore: number;
  assignment: Map<ID, ID>; // slotId → assetId
}

// ─── Greedy image→slot assignment by area descending ─────────────────────────

function assignImagesToSlots(slots: CollageSlot[], images: CollageImageInput[]): Map<ID, ID> {
  const imageSlots = slots.filter((s) => s.type === "image");
  const sortedSlots = [...imageSlots].sort((a, b) => b.w * b.h - a.w * a.h);
  const sortedImages = [...images].sort((a, b) => b.width * b.height - a.width * a.height);

  const map = new Map<ID, ID>();
  const usedImages = new Set<ID>();

  for (const slot of sortedSlots) {
    const img = sortedImages.find((i) => !usedImages.has(i.assetId));
    if (!img) break;
    map.set(slot.id, img.assetId);
    usedImages.add(img.assetId);
  }
  return map;
}

// ─── Scoring components ───────────────────────────────────────────────────────

function computeAspectRatioScore(
  slots: CollageSlot[],
  images: CollageImageInput[],
  assignment: Map<ID, ID>
): number {
  const imageMap = new Map(images.map((i) => [i.assetId, i]));
  let weightedSum = 0;
  let totalArea = 0;

  for (const slot of slots) {
    if (slot.type !== "image") continue;
    const assetId = assignment.get(slot.id);
    if (!assetId) continue;
    const img = imageMap.get(assetId);
    if (!img) continue;

    const slotAspect = slot.w / slot.h;
    const imgAspect = img.width / img.height;
    const pairScore = Math.min(slotAspect, imgAspect) / Math.max(slotAspect, imgAspect);
    const area = slot.w * slot.h;
    weightedSum += pairScore * area;
    totalArea += area;
  }

  return totalArea > 0 ? weightedSum / totalArea : 0;
}

function computeBalanceScore(slots: CollageSlot[]): number {
  const imageSlots = slots.filter((s) => s.type === "image");
  if (imageSlots.length === 0) return 1;

  let totalArea = 0;
  let cx = 0;
  let cy = 0;

  for (const s of imageSlots) {
    const area = s.w * s.h;
    cx += (s.x + s.w / 2) * area;
    cy += (s.y + s.h / 2) * area;
    totalArea += area;
  }

  if (totalArea === 0) return 1;
  cx /= totalArea;
  cy /= totalArea;

  const dist = Math.sqrt((cx - 0.5) ** 2 + (cy - 0.5) ** 2);
  return Math.max(0, 1 - dist * 2);
}

function computeDiversityScore(slots: CollageSlot[]): number {
  const imageSlots = slots.filter((s) => s.type === "image");
  if (imageSlots.length < 2) return 0.3;

  const areas = imageSlots.map((s) => s.w * s.h);
  const mean = areas.reduce((a, b) => a + b, 0) / areas.length;
  const variance = areas.reduce((s, a) => s + (a - mean) ** 2, 0) / areas.length;
  const cv = Math.sqrt(variance) / (mean || 1);
  return Math.min(1, cv);
}

// ─── Score a slots array ─────────────────────────────────────────────────────

export function scoreLayout(slots: CollageSlot[], images: CollageImageInput[]): ScoreResult {
  const assignment = assignImagesToSlots(slots, images);
  const aspectRatioScore = computeAspectRatioScore(slots, images, assignment);
  const faceSafetyScore = 1; // Python-only; default neutral
  const balanceScore = computeBalanceScore(slots);
  const diversityScore = computeDiversityScore(slots);

  const score =
    aspectRatioScore * 0.5 +
    faceSafetyScore * 0.25 +
    balanceScore * 0.15 +
    diversityScore * 0.1;

  return { score, aspectRatioScore, faceSafetyScore, balanceScore, diversityScore, assignment };
}

// ─── Score CollageLayout objects (legacy use) ─────────────────────────────────

export function scoreAndSortLayouts(
  layouts: CollageLayout[],
  images: CollageImageInput[]
): CollageLayout[] {
  return layouts
    .map((layout) => {
      const result = scoreLayout(layout.slots, images);
      return {
        ...layout,
        score: result.score,
        scoreBreakdown: {
          aspectRatioScore: result.aspectRatioScore,
          faceSafetyScore: result.faceSafetyScore,
          balanceScore: result.balanceScore,
          diversityScore: result.diversityScore
        }
      };
    })
    .sort((a, b) => b.score - a.score);
}
