import type { Rect } from "@/types/primitives";
import {
  cloneRect,
  detectStackAxis,
  distributeAlong,
  getUnionBounds,
  intersectionArea,
  intersects,
  moveRectIntoBounds,
  rectBottom,
  rectCenterX,
  rectCenterY,
  rectRight
} from "./smartArrangeGeometry";
import type { SmartArrangeContext, SmartArrangeItem, SmartArrangeMode } from "./smartArrangeTypes";

const TEXT_ORDER: Record<string, number> = {
  title: 0,
  subtitle: 1,
  bodyText: 2,
  shortText: 3,
  unknown: 4
};

function cloneItems(items: SmartArrangeItem[]): SmartArrangeItem[] {
  return items.map((it) => ({ ...it, bounds: cloneRect(it.bounds) }));
}

function clampGap(value: number, ctx: SmartArrangeContext): number {
  return Math.min(ctx.gaps.large, Math.max(ctx.gaps.small, value));
}

/** Move every item minimally inside the safe area (no resize). */
function fitItemsIntoSafe(items: SmartArrangeItem[], safe: Rect): void {
  for (const it of items) {
    const next = moveRectIntoBounds(it.bounds, safe);
    it.bounds.x = next.x;
    it.bounds.y = next.y;
  }
}

/** Resolve overlaps by nudging the lower-importance item out of the way. */
function resolveOverlaps(items: SmartArrangeItem[], safe: Rect, gap: number): void {
  for (let pass = 0; pass < 3; pass += 1) {
    let moved = false;
    for (let i = 0; i < items.length; i += 1) {
      for (let j = i + 1; j < items.length; j += 1) {
        const a = items[i];
        const b = items[j];
        if (!intersects(a.bounds, b.bounds)) continue;
        if (intersectionArea(a.bounds, b.bounds) <= 1) continue;
        // Move the less-important one (b loses ties — stable order).
        const victim = a.importance >= b.importance ? b : a;
        const other = victim === a ? b : a;
        if (!victim.canMove) continue;

        // Push along the axis of smaller overlap.
        const overlapX = Math.min(rectRight(a.bounds), rectRight(b.bounds)) - Math.max(a.bounds.x, b.bounds.x);
        const overlapY = Math.min(rectBottom(a.bounds), rectBottom(b.bounds)) - Math.max(a.bounds.y, b.bounds.y);

        if (overlapY <= overlapX) {
          // separate vertically
          if (rectCenterY(victim.bounds) >= rectCenterY(other.bounds)) {
            victim.bounds.y = rectBottom(other.bounds) + gap;
          } else {
            victim.bounds.y = other.bounds.y - victim.bounds.height - gap;
          }
        } else if (rectCenterX(victim.bounds) >= rectCenterX(other.bounds)) {
          victim.bounds.x = rectRight(other.bounds) + gap;
        } else {
          victim.bounds.x = other.bounds.x - victim.bounds.width - gap;
        }
        const back = moveRectIntoBounds(victim.bounds, safe);
        victim.bounds.x = back.x;
        victim.bounds.y = back.y;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

/** Snap edges that are nearly aligned to a shared coordinate. */
function snapNearEdges(items: SmartArrangeItem[], tol: number): void {
  const snapKey = (getEdge: (r: Rect) => number, setEdge: (it: SmartArrangeItem, value: number) => void): void => {
    const movable = items.filter((it) => it.canMove);
    for (let i = 0; i < movable.length; i += 1) {
      const cluster = [movable[i]];
      for (let j = i + 1; j < movable.length; j += 1) {
        if (Math.abs(getEdge(movable[j].bounds) - getEdge(movable[i].bounds)) <= tol) {
          cluster.push(movable[j]);
        }
      }
      if (cluster.length >= 2) {
        const target = cluster.reduce((sum, it) => sum + getEdge(it.bounds), 0) / cluster.length;
        for (const it of cluster) setEdge(it, target);
      }
    }
  };
  snapKey((r) => r.x, (it, v) => (it.bounds.x = v));
  snapKey((r) => rectRight(r), (it, v) => (it.bounds.x = v - it.bounds.width));
  snapKey((r) => r.y, (it, v) => (it.bounds.y = v));
}

/** Equalize gaps in a stack, preserving the group center; sizes untouched. */
export function strategySpacingOnly(ctx: SmartArrangeContext): SmartArrangeItem[] {
  const items = cloneItems(ctx.items);
  const movable = items.filter((it) => it.canMove);
  if (movable.length < 2) return items;
  const axis = detectStackAxis(movable.map((it) => it.bounds));
  const gap = clampGap(ctx.gaps.normal, ctx);
  const distributed = distributeAlong(movable.map((it) => it.bounds), axis, gap);
  movable.forEach((it, i) => {
    it.bounds.x = distributed[i].x;
    it.bounds.y = distributed[i].y;
  });
  return items;
}

/** Gentle: into safe area, snap near edges, equalize an obvious stack, fix overlaps. */
export function strategyPolish(ctx: SmartArrangeContext): SmartArrangeItem[] {
  const items = cloneItems(ctx.items);
  const safe = ctx.safeBounds;
  fitItemsIntoSafe(items, safe);
  snapNearEdges(items, ctx.gaps.small * 0.6);

  const movable = items.filter((it) => it.canMove);
  if (movable.length >= 3) {
    const axis = detectStackAxis(movable.map((it) => it.bounds));
    // Only equalize if items genuinely stack (don't spread on the cross axis).
    const rects = movable.map((it) => it.bounds);
    const crossSpread =
      axis === "vertical"
        ? Math.max(...rects.map(rectCenterX)) - Math.min(...rects.map(rectCenterX))
        : Math.max(...rects.map(rectCenterY)) - Math.min(...rects.map(rectCenterY));
    const mainExtent = axis === "vertical" ? safe.height : safe.width;
    if (crossSpread < mainExtent * 0.25) {
      const gap = clampGap(ctx.gaps.normal, ctx);
      const distributed = distributeAlong(rects, axis, gap);
      movable.forEach((it, i) => {
        it.bounds.x = distributed[i].x;
        it.bounds.y = distributed[i].y;
      });
    }
  }

  resolveOverlaps(items, safe, ctx.gaps.small);
  fitItemsIntoSafe(items, safe);
  return items;
}

/** Pull everything inside the safe area; scale the whole group down if it overflows. */
export function strategyFitToSafeArea(ctx: SmartArrangeContext): SmartArrangeItem[] {
  const items = cloneItems(ctx.items);
  const safe = ctx.safeBounds;
  const movable = items.filter((it) => it.canMove);
  const union = getUnionBounds(movable.map((it) => it.bounds));
  if (union === null) return items;

  const needScale = union.width > safe.width || union.height > safe.height;
  if (needScale) {
    const s = Math.min(safe.width / union.width, safe.height / union.height, 1);
    for (const it of movable) {
      // Map position relative to union origin, scaled, into the safe origin.
      const relX = it.bounds.x - union.x;
      const relY = it.bounds.y - union.y;
      it.bounds.x = safe.x + relX * s;
      it.bounds.y = safe.y + relY * s;
      if (it.canResize) {
        it.bounds.width *= s;
        it.bounds.height *= s;
        if (it.fontSize !== undefined && it.originalFontSize !== undefined) {
          it.fontSize = it.originalFontSize * s;
        }
      }
    }
  }
  fitItemsIntoSafe(items, safe);
  return items;
}

/** Stack text by hierarchy from the top of the safe area, RTL-aligned by default. */
export function strategyTitleText(ctx: SmartArrangeContext): SmartArrangeItem[] {
  const items = cloneItems(ctx.items);
  const safe = ctx.safeBounds;
  const rtl = ctx.direction === "rtl";

  const texts = items
    .filter((it) => it.kind === "text" && it.canMove)
    .sort((a, b) => (TEXT_ORDER[a.role] ?? 9) - (TEXT_ORDER[b.role] ?? 9));
  const nonText = items.filter((it) => it.kind !== "text");

  // Fit images first so they don't overlap the text block.
  fitItemsIntoSafe(nonText, safe);

  let cursorY = safe.y;
  let prevRole: string | null = null;
  for (const it of texts) {
    // Tighter gap between title↔subtitle, looser before a new block.
    const gap = prevRole === null ? 0 : prevRole === "title" && it.role === "subtitle" ? ctx.gaps.small : ctx.gaps.normal;
    cursorY += gap;

    // Clamp width to the safe area.
    if (it.canResize && it.bounds.width > safe.width) it.bounds.width = safe.width;

    if (it.alignment === "center") {
      it.bounds.x = safe.x + (safe.width - it.bounds.width) / 2;
    } else if (rtl) {
      it.bounds.x = rectRight(safe) - it.bounds.width;
    } else {
      it.bounds.x = safe.x;
    }
    it.bounds.y = cursorY;
    cursorY += it.bounds.height;
    prevRole = it.role;
  }

  fitItemsIntoSafe(items, safe);
  return items;
}

/** Main image one side, text stack the other (or image-top for tall canvases). */
export function strategyImageText(ctx: SmartArrangeContext): SmartArrangeItem[] {
  const items = cloneItems(ctx.items);
  const safe = ctx.safeBounds;
  const rtl = ctx.direction === "rtl";

  const images = items.filter((it) => it.kind === "image" && it.canMove);
  const texts = items
    .filter((it) => it.kind === "text" && it.canMove)
    .sort((a, b) => (TEXT_ORDER[a.role] ?? 9) - (TEXT_ORDER[b.role] ?? 9));

  if (images.length === 0 || texts.length === 0) {
    return strategyTitleText(ctx);
  }

  // Pick the largest image as the hero.
  const hero = images.reduce((best, it) =>
    it.bounds.width * it.bounds.height > best.bounds.width * best.bounds.height ? it : best
  );

  const ratio = safe.width / safe.height;
  const totalText = texts.reduce((sum, it) => sum + (it.textLength ?? 0), 0);
  const sideBySide = ratio > 1.2 || (ratio >= 0.8 && ratio <= 1.2 && totalText < 200);

  const gap = ctx.gaps.large;

  const placeTextStack = (x: number, width: number, startY: number): number => {
    let cursorY = startY;
    let prev: string | null = null;
    for (const it of texts) {
      const g = prev === null ? 0 : prev === "title" ? ctx.gaps.small : ctx.gaps.normal;
      cursorY += g;
      if (it.canResize && it.bounds.width > width) it.bounds.width = width;
      if (it.alignment === "center") it.bounds.x = x + (width - it.bounds.width) / 2;
      else if (rtl) it.bounds.x = x + width - it.bounds.width;
      else it.bounds.x = x;
      it.bounds.y = cursorY;
      cursorY += it.bounds.height;
      prev = it.role;
    }
    return cursorY;
  };

  if (sideBySide) {
    const colWidth = (safe.width - gap) / 2;
    // Keep the hero on its current side when it already makes sense.
    const heroOnRight = rectCenterX(hero.bounds) > rectCenterX(safe);
    const imageX = heroOnRight ? safe.x + colWidth + gap : safe.x;
    const textX = heroOnRight ? safe.x : safe.x + colWidth + gap;

    // Hero: keep aspect, fit within its column + safe height.
    const aspect = hero.bounds.width / Math.max(1, hero.bounds.height);
    let hw = colWidth;
    let hh = hw / aspect;
    if (hh > safe.height) {
      hh = safe.height;
      hw = hh * aspect;
    }
    if (hero.canResize) {
      hero.bounds.width = hw;
      hero.bounds.height = hh;
    }
    hero.bounds.x = imageX + (colWidth - hero.bounds.width) / 2;
    hero.bounds.y = safe.y + (safe.height - hero.bounds.height) / 2;

    placeTextStack(textX, colWidth, safe.y);
  } else {
    // Image on top, text below.
    const aspect = hero.bounds.width / Math.max(1, hero.bounds.height);
    const maxImageH = safe.height * 0.55;
    let hw = safe.width;
    let hh = hw / aspect;
    if (hh > maxImageH) {
      hh = maxImageH;
      hw = hh * aspect;
    }
    if (hero.canResize) {
      hero.bounds.width = hw;
      hero.bounds.height = hh;
    }
    hero.bounds.x = safe.x + (safe.width - hero.bounds.width) / 2;
    hero.bounds.y = safe.y;

    placeTextStack(safe.x, safe.width, rectBottom(hero.bounds) + gap);
  }

  // Any secondary images: just keep them inside the safe area.
  fitItemsIntoSafe(
    items.filter((it) => it.kind === "image" && it !== hero),
    safe
  );
  resolveOverlaps(items, safe, ctx.gaps.small);
  fitItemsIntoSafe(items, safe);
  return items;
}

/** Decide which concrete strategy `auto` should prefer. */
export function routeAuto(ctx: SmartArrangeContext): SmartArrangeMode {
  const images = ctx.items.filter((it) => it.kind === "image");
  const texts = ctx.items.filter((it) => it.kind === "text");
  const hasHeroImage = images.some((it) => it.role === "mainImage");

  if (hasHeroImage && texts.length >= 1) return "imageText";
  if (texts.length >= 2 && texts.length >= images.length) return "titleText";
  return "polish";
}

export function runStrategy(mode: SmartArrangeMode, ctx: SmartArrangeContext): SmartArrangeItem[] {
  switch (mode) {
    case "spacingOnly":
      return strategySpacingOnly(ctx);
    case "fitToSafeArea":
      return strategyFitToSafeArea(ctx);
    case "titleText":
      return strategyTitleText(ctx);
    case "imageText":
      return strategyImageText(ctx);
    case "polish":
    default:
      return strategyPolish(ctx);
  }
}
