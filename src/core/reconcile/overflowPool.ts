import type { ID, JsonValue, Metadata } from "@/types/primitives";

export interface CollageOverflowPool {
  hidden: ID[];
  lastChangedAt: number;
}

const META_KEY = "overflowPool";

export function readOverflow(metadata: Metadata | undefined): CollageOverflowPool {
  const raw = metadata?.[META_KEY] as unknown;
  if (!raw || typeof raw !== "object") return { hidden: [], lastChangedAt: 0 };
  const obj = raw as Partial<CollageOverflowPool>;
  const hidden = Array.isArray(obj.hidden) ? obj.hidden.filter((x): x is string => typeof x === "string") : [];
  const lastChangedAt = typeof obj.lastChangedAt === "number" ? obj.lastChangedAt : 0;
  return { hidden, lastChangedAt };
}

export function writeOverflow(metadata: Metadata | undefined, pool: CollageOverflowPool): Metadata {
  const base = metadata ? { ...metadata } : {};
  base[META_KEY] = {
    hidden: pool.hidden,
    lastChangedAt: pool.lastChangedAt,
  } as unknown as JsonValue;
  return base;
}

/** Compute the delta when pool size shrinks: which assetIds got pushed to overflow. */
export function pushOverflow(
  prevPool: ID[],
  nextPool: ID[],
  existing: CollageOverflowPool,
): { newOverflow: CollageOverflowPool; pushed: ID[] } {
  const nextSet = new Set(nextPool);
  const pushed = prevPool.filter(id => !nextSet.has(id));
  if (pushed.length === 0) {
    return { newOverflow: existing, pushed: [] };
  }
  // Maintain insertion order; avoid duplicates.
  const merged = [...existing.hidden];
  for (const id of pushed) {
    if (!merged.includes(id)) merged.push(id);
  }
  return {
    newOverflow: { hidden: merged, lastChangedAt: Date.now() },
    pushed,
  };
}

/** Drain up to `capacity` assetIds from overflow back into the pool. Returns the new pool + remaining overflow. */
export function drainOverflow(
  pool: ID[],
  existing: CollageOverflowPool,
  capacity: number,
): { pool: ID[]; newOverflow: CollageOverflowPool; drained: ID[] } {
  const free = Math.max(0, capacity - pool.length);
  if (free === 0 || existing.hidden.length === 0) {
    return { pool, newOverflow: existing, drained: [] };
  }
  const drained = existing.hidden.slice(0, free);
  const remaining = existing.hidden.slice(free);
  return {
    pool: [...pool, ...drained],
    newOverflow: { hidden: remaining, lastChangedAt: Date.now() },
    drained,
  };
}

/** Permanently drop overflow (user confirmed deletion). */
export function clearOverflow(): CollageOverflowPool {
  return { hidden: [], lastChangedAt: Date.now() };
}
