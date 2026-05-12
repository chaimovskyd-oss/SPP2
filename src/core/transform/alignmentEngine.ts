import { getTransformedBounds, unionRects } from "@/core/bounds/bounds";
import type { Page } from "@/types/document";
import type { VisualLayer } from "@/types/layers";
import type { Rect } from "@/types/primitives";

export type AlignmentCommand = "left" | "centerX" | "right" | "top" | "centerY" | "bottom" | "distributeX" | "distributeY";
export type AlignmentTarget = "page" | "selection";

export function alignLayers(input: {
  page: Page;
  layers: VisualLayer[];
  selectedLayerIds: string[];
  command: AlignmentCommand;
  target?: AlignmentTarget;
}): VisualLayer[] {
  const selected = input.layers.filter((layer) => input.selectedLayerIds.includes(layer.id) && layer.visible && !layer.locked);
  if (selected.length === 0) return input.layers;

  const target = input.target ?? (selected.length === 1 ? "page" : "selection");
  const targetBounds = target === "page"
    ? { x: 0, y: 0, width: input.page.width, height: input.page.height }
    : unionRects(selected.map(getTransformedBounds));
  const patches = new Map<string, Partial<VisualLayer>>();

  if (input.command === "distributeX" || input.command === "distributeY") {
    distributeSelected(selected, input.command, patches);
  } else {
    selected.forEach((layer) => {
      const bounds = getTransformedBounds(layer);
      patches.set(layer.id, deltaForAlignment(layer, bounds, targetBounds, input.command));
    });
  }

  return input.layers.map((layer) => {
    const patch = patches.get(layer.id);
    return patch === undefined ? layer : ({ ...layer, ...patch } as VisualLayer);
  });
}

function deltaForAlignment(layer: VisualLayer, bounds: Rect, target: Rect, command: AlignmentCommand): Partial<VisualLayer> {
  if (command === "left") return { x: layer.x + target.x - bounds.x } as Partial<VisualLayer>;
  if (command === "centerX") return { x: layer.x + target.x + target.width / 2 - (bounds.x + bounds.width / 2) } as Partial<VisualLayer>;
  if (command === "right") return { x: layer.x + target.x + target.width - (bounds.x + bounds.width) } as Partial<VisualLayer>;
  if (command === "top") return { y: layer.y + target.y - bounds.y } as Partial<VisualLayer>;
  if (command === "centerY") return { y: layer.y + target.y + target.height / 2 - (bounds.y + bounds.height / 2) } as Partial<VisualLayer>;
  if (command === "bottom") return { y: layer.y + target.y + target.height - (bounds.y + bounds.height) } as Partial<VisualLayer>;
  return {};
}

function distributeSelected(selected: VisualLayer[], command: "distributeX" | "distributeY", patches: Map<string, Partial<VisualLayer>>): void {
  if (selected.length < 3) return;
  const axis = command === "distributeX" ? "x" : "y";
  const size = command === "distributeX" ? "width" : "height";
  const sorted = selected
    .map((layer) => ({ layer, bounds: getTransformedBounds(layer) }))
    .sort((a, b) => a.bounds[axis] - b.bounds[axis]);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const totalSize = sorted.reduce((sum, item) => sum + item.bounds[size], 0);
  const span = last.bounds[axis] + last.bounds[size] - first.bounds[axis];
  const gap = (span - totalSize) / (sorted.length - 1);
  let cursor = first.bounds[axis] + first.bounds[size] + gap;

  sorted.slice(1, -1).forEach((item) => {
    const delta = cursor - item.bounds[axis];
    patches.set(item.layer.id, axis === "x" ? ({ x: item.layer.x + delta } as Partial<VisualLayer>) : ({ y: item.layer.y + delta } as Partial<VisualLayer>));
    cursor += item.bounds[size] + gap;
  });
}
