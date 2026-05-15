// Deterministic torn paper edge path generation

function lcgRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export type EdgeSide = "top" | "right" | "bottom" | "left";

export interface TornPaperCacheKey {
  slotId: string;
  width: number;
  height: number;
  roughness: number;
  seed: number;
}

const tornCache = new Map<string, number[]>();

function cacheKey(key: TornPaperCacheKey): string {
  return `${key.slotId}|${key.width}|${key.height}|${key.roughness}|${key.seed}`;
}

export function generateTornEdgePoints(
  width: number,
  height: number,
  sides: EdgeSide[],
  roughness: number,
  seed: number,
  slotId = ""
): number[] {
  const ck = cacheKey({ slotId, width, height, roughness, seed });
  const cached = tornCache.get(ck);
  if (cached) return cached;

  const rng = lcgRandom(seed);
  const amplitude = roughness * Math.min(width, height) * 0.07;
  const steps = Math.max(8, Math.floor(Math.min(width, height) / 8));

  // Build polygon: start top-left, go clockwise
  const pts: number[] = [];

  function addTop(): void {
    pts.push(0, 0);
    for (let i = 1; i < steps; i++) {
      const x = (i / steps) * width;
      const y = sides.includes("top") ? (rng() - 0.5) * amplitude * 2 : 0;
      pts.push(x, y);
    }
    pts.push(width, 0);
  }

  function addRight(): void {
    for (let i = 1; i < steps; i++) {
      const y = (i / steps) * height;
      const x = sides.includes("right") ? width + (rng() - 0.5) * amplitude * 2 : width;
      pts.push(x, y);
    }
    pts.push(width, height);
  }

  function addBottom(): void {
    for (let i = steps - 1; i > 0; i--) {
      const x = (i / steps) * width;
      const y = sides.includes("bottom") ? height + (rng() - 0.5) * amplitude * 2 : height;
      pts.push(x, y);
    }
    pts.push(0, height);
  }

  function addLeft(): void {
    for (let i = steps - 1; i > 0; i--) {
      const y = (i / steps) * height;
      const x = sides.includes("left") ? (rng() - 0.5) * amplitude * 2 : 0;
      pts.push(x, y);
    }
  }

  addTop();
  addRight();
  addBottom();
  addLeft();

  tornCache.set(ck, pts);
  if (tornCache.size > 500) {
    // Evict oldest entries
    const firstKey = tornCache.keys().next().value;
    if (firstKey !== undefined) tornCache.delete(firstKey);
  }

  return pts;
}

export function invalidateTornCache(slotId: string): void {
  for (const key of tornCache.keys()) {
    if (key.startsWith(`${slotId}|`)) {
      tornCache.delete(key);
    }
  }
}

/** Returns whether torn paper should be simplified based on cell count */
export function tornPaperQualityLevel(cellCount: number): "full" | "simplified" | "softEdge" {
  if (cellCount <= 20) return "full";
  if (cellCount <= 50) return "simplified";
  return "softEdge";
}
