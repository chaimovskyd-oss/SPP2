import { getTransformedBounds } from "@/core/bounds/bounds";
import type { Page } from "@/types/document";
import type { VisualLayer } from "@/types/layers";
import type { Guide, Rect, SnapSettings } from "@/types/primitives";

export type SnapAxis = "x" | "y";
export type SnapLineKind = "page" | "margin" | "safeArea" | "bleed" | "printableArea" | "guide" | "layer" | "grid" | "spacing";
export type SnapSourceRole = "min" | "center" | "max";

export interface SnapLine {
  axis: SnapAxis;
  position: number;
  label: string;
  kind: SnapLineKind;
  spacingGaps?: Array<{ from: number; to: number }>;
}

export interface SnapResult {
  x: number;
  y: number;
  dx: number;
  dy: number;
  lines: SnapLine[];
}

export interface SnapBoundsResult extends SnapResult {
  bounds: Rect;
  sourceRoles: {
    x?: SnapSourceRole;
    y?: SnapSourceRole;
  };
}

export interface SnapTarget {
  axis: SnapAxis;
  position: number;
  label: string;
  kind: SnapLineKind;
}

interface SnapSourcePoint extends SnapTarget {
  role: SnapSourceRole;
}

interface SnapCandidate {
  distance: number;
  delta: number;
  role: SnapSourceRole;
  line: SnapLine;
}

export function snapLayerPosition(input: {
  layer: VisualLayer;
  page: Page;
  layers: VisualLayer[];
  x: number;
  y: number;
  settings: SnapSettings;
}): SnapResult {
  const { layer, page, layers, x, y, settings } = input;
  const currentBounds = getTransformedBounds({ ...layer, x, y });
  const result = snapLayerBounds({
    movingLayerId: layer.id,
    page,
    layers,
    bounds: currentBounds,
    settings
  });
  return {
    x: x + result.dx,
    y: y + result.dy,
    dx: result.dx,
    dy: result.dy,
    lines: result.lines
  };
}

export function snapLayerBounds(input: {
  movingLayerId: string;
  page: Page;
  layers: VisualLayer[];
  bounds: Rect;
  settings: SnapSettings;
  allowedSourceRoles?: {
    x?: SnapSourceRole[];
    y?: SnapSourceRole[];
  };
}): SnapBoundsResult {
  const { movingLayerId, page, layers, bounds, settings, allowedSourceRoles } = input;

  if (!settings.enabled) {
    return { x: bounds.x, y: bounds.y, dx: 0, dy: 0, bounds, lines: [], sourceRoles: {} };
  }

  const otherLayers = layers.filter((item) => item.id !== movingLayerId && item.visible && !item.locked);
  const targets = buildSnapTargets(page, otherLayers, settings);
  const sourcePoints = rectSnapSourcePoints(bounds).filter((point) => {
    const roles = allowedSourceRoles?.[point.axis];
    return roles === undefined || roles.includes(point.role);
  });

  const regularX = nearestSnap(
    sourcePoints.filter((point) => point.axis === "x"),
    targets.filter((target) => target.axis === "x"),
    settings.snapTolerance
  );
  const regularY = nearestSnap(
    sourcePoints.filter((point) => point.axis === "y"),
    targets.filter((target) => target.axis === "y"),
    settings.snapTolerance
  );

  const otherBounds = settings.snapToLayers ? otherLayers.map((layer) => getTransformedBounds(layer)) : [];
  const spacingX = settings.snapToLayers ? nearestSpacingSnapX(bounds, otherBounds, settings.snapTolerance) : null;
  const spacingY = settings.snapToLayers ? nearestSpacingSnapY(bounds, otherBounds, settings.snapTolerance) : null;
  const snapX = betterCandidate(regularX, spacingX);
  const snapY = betterCandidate(regularY, spacingY);

  const dx = snapX?.delta ?? 0;
  const dy = snapY?.delta ?? 0;
  const snappedBounds = { ...bounds, x: bounds.x + dx, y: bounds.y + dy };
  const lines = [snapX?.line, snapY?.line].filter((line): line is SnapLine => line !== undefined);

  const passiveSpacingX = spacingX !== null && snapX !== spacingX ? spacingX.line : null;
  const passiveSpacingY = spacingY !== null && snapY !== spacingY ? spacingY.line : null;
  if (passiveSpacingX !== null) lines.push(passiveSpacingX);
  if (passiveSpacingY !== null) lines.push(passiveSpacingY);

  return {
    x: snappedBounds.x,
    y: snappedBounds.y,
    dx,
    dy,
    bounds: snappedBounds,
    lines,
    sourceRoles: {
      x: snapX?.role,
      y: snapY?.role
    }
  };
}

export function buildSnapTargets(
  page: Page,
  otherLayers: VisualLayer[],
  settings: SnapSettings
): SnapTarget[] {
  const targets: SnapTarget[] = [];

  if (settings.snapToPage) {
    addRectTargets(targets, { x: 0, y: 0, width: page.width, height: page.height }, "page", "page");
    addMarginTargets(targets, page, page.margins, "margin", "margin");
    addMarginTargets(targets, page, page.setup.safeArea, "safeArea", "safe");
    addMarginTargets(targets, page, page.bleed, "bleed", "bleed");
    addRectTargets(
      targets,
      {
        x: page.bleed.left,
        y: page.bleed.top,
        width: page.width - page.bleed.left - page.bleed.right,
        height: page.height - page.bleed.top - page.bleed.bottom
      },
      "printableArea",
      "printable"
    );
  }

  if (settings.snapToGuides) {
    page.guides.filter(isVisibleGuide).forEach((guide) => {
      targets.push({
        axis: guide.axis === "x" ? "x" : "y",
        position: guide.position,
        label: guide.label ?? "guide",
        kind: "guide"
      });
    });
  }

  if (settings.snapToGrid && page.setup.gridSettings.snapToGrid) {
    const { spacingX, spacingY } = page.setup.gridSettings;
    const subdivisions = Math.max(1, page.setup.gridSettings.subdivisions ?? 1);
    addGridTargets(targets, "x", page.width, Math.max(1, spacingX / subdivisions));
    addGridTargets(targets, "y", page.height, Math.max(1, spacingY / subdivisions));
  }

  if (settings.snapToLayers) {
    otherLayers.forEach((layer) => {
      rectSnapSourcePoints(getTransformedBounds(layer)).forEach((point) => {
        targets.push({ axis: point.axis, position: point.position, label: point.label, kind: "layer" });
      });
    });
  }

  return dedupeTargets(targets);
}

function addRectTargets(targets: SnapTarget[], rect: Rect, kind: SnapLineKind, labelPrefix: string): void {
  targets.push(
    { axis: "x", position: rect.x, label: `${labelPrefix}-left`, kind },
    { axis: "x", position: rect.x + rect.width / 2, label: `${labelPrefix}-center-x`, kind },
    { axis: "x", position: rect.x + rect.width, label: `${labelPrefix}-right`, kind },
    { axis: "y", position: rect.y, label: `${labelPrefix}-top`, kind },
    { axis: "y", position: rect.y + rect.height / 2, label: `${labelPrefix}-center-y`, kind },
    { axis: "y", position: rect.y + rect.height, label: `${labelPrefix}-bottom`, kind }
  );
}

function addMarginTargets(targets: SnapTarget[], page: Page, margins: Page["margins"], kind: SnapLineKind, labelPrefix: string): void {
  if (margins.left === 0 && margins.right === 0 && margins.top === 0 && margins.bottom === 0) {
    return;
  }
  addRectTargets(
    targets,
    {
      x: margins.left,
      y: margins.top,
      width: page.width - margins.left - margins.right,
      height: page.height - margins.top - margins.bottom
    },
    kind,
    labelPrefix
  );
}

function addGridTargets(targets: SnapTarget[], axis: SnapAxis, length: number, spacing: number): void {
  for (let position = 0; position <= length; position += spacing) {
    targets.push({ axis, position, label: `grid-${axis}`, kind: "grid" });
  }
}

function rectSnapSourcePoints(bounds: Rect): SnapSourcePoint[] {
  return [
    { axis: "x", position: bounds.x, label: "left", kind: "layer", role: "min" },
    { axis: "x", position: bounds.x + bounds.width / 2, label: "center-x", kind: "layer", role: "center" },
    { axis: "x", position: bounds.x + bounds.width, label: "right", kind: "layer", role: "max" },
    { axis: "y", position: bounds.y, label: "top", kind: "layer", role: "min" },
    { axis: "y", position: bounds.y + bounds.height / 2, label: "center-y", kind: "layer", role: "center" },
    { axis: "y", position: bounds.y + bounds.height, label: "bottom", kind: "layer", role: "max" }
  ];
}

function nearestSnap(sourcePoints: SnapSourcePoint[], targets: SnapTarget[], tolerance: number): SnapCandidate | null {
  let best: SnapCandidate | null = null;

  for (const source of sourcePoints) {
    for (const target of targets) {
      const delta = target.position - source.position;
      const distance = Math.abs(delta);
      if (distance <= tolerance && (best === null || distance < best.distance)) {
        best = {
          distance,
          delta,
          role: source.role,
          line: { axis: target.axis, position: target.position, label: target.label, kind: target.kind }
        };
      }
    }
  }

  return best;
}

function nearestSpacingSnapX(bounds: Rect, others: Rect[], tolerance: number): SnapCandidate | null {
  const sorted = others.slice().sort((a, b) => a.x - b.x);
  let best: SnapCandidate | null = null;

  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const left = sorted[i];
      const right = sorted[j];
      const targetX = (left.x + left.width + right.x - bounds.width) / 2;
      if (targetX < left.x + left.width || targetX + bounds.width > right.x) continue;
      const delta = targetX - bounds.x;
      const distance = Math.abs(delta);
      if (distance > tolerance || (best !== null && distance >= best.distance)) continue;
      const yMin = Math.min(left.y, bounds.y, right.y);
      const yMax = Math.max(left.y + left.height, bounds.y + bounds.height, right.y + right.height);
      best = {
        distance,
        delta,
        role: "min",
        line: {
          axis: "x",
          position: (yMin + yMax) / 2,
          label: "spacing-x",
          kind: "spacing",
          spacingGaps: [
            { from: left.x + left.width, to: targetX },
            { from: targetX + bounds.width, to: right.x }
          ]
        }
      };
    }
  }

  return best;
}

function nearestSpacingSnapY(bounds: Rect, others: Rect[], tolerance: number): SnapCandidate | null {
  const sorted = others.slice().sort((a, b) => a.y - b.y);
  let best: SnapCandidate | null = null;

  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const above = sorted[i];
      const below = sorted[j];
      const targetY = (above.y + above.height + below.y - bounds.height) / 2;
      if (targetY < above.y + above.height || targetY + bounds.height > below.y) continue;
      const delta = targetY - bounds.y;
      const distance = Math.abs(delta);
      if (distance > tolerance || (best !== null && distance >= best.distance)) continue;
      const xMin = Math.min(above.x, bounds.x, below.x);
      const xMax = Math.max(above.x + above.width, bounds.x + bounds.width, below.x + below.width);
      best = {
        distance,
        delta,
        role: "min",
        line: {
          axis: "y",
          position: (xMin + xMax) / 2,
          label: "spacing-y",
          kind: "spacing",
          spacingGaps: [
            { from: above.y + above.height, to: targetY },
            { from: targetY + bounds.height, to: below.y }
          ]
        }
      };
    }
  }

  return best;
}

function betterCandidate(primary: SnapCandidate | null, secondary: SnapCandidate | null): SnapCandidate | null {
  if (primary === null) return secondary;
  if (secondary === null) return primary;
  return secondary.distance < primary.distance ? secondary : primary;
}

function dedupeTargets(targets: SnapTarget[]): SnapTarget[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.axis}:${target.position.toFixed(3)}:${target.kind}:${target.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isVisibleGuide(guide: Guide): boolean {
  return guide.visible !== false;
}
