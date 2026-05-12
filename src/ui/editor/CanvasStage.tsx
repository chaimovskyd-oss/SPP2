import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Layer, Line, Rect, Stage, Transformer } from "react-konva";
import type Konva from "konva";
import { beginPointer, createInputState, endPointer, movePointer } from "@/core/input/inputSystem";
import { normalizeRect } from "@/core/bounds/bounds";
import { isGridCellLayer } from "@/core/grid/gridModeEngine";
import { marqueeSelect } from "@/core/selection/selectionEngine";
import { snapLayerBounds, snapLayerPosition, type SnapLine, type SnapLineKind, type SnapSourceRole } from "@/core/snap/snapEngine";
import { measureTextLayerSize } from "@/core/text/measurement";
import { useViewportStore } from "@/state/viewportStore";
import type { Asset, Page } from "@/types/document";
import type { Rect as RectType } from "@/types/primitives";
import type { TextLayer, VisualLayer } from "@/types/layers";
import { SCREEN_HELPER_NODE_NAME } from "./canvasNodeNames";
import { KonvaLayerNode } from "./KonvaLayerNode";

// ─── Guide color palette ──────────────────────────────────────────────────────
const GUIDE_COLORS: Partial<Record<SnapLineKind, string>> = {
  page:     "#7C6FE0",   // purple — page edges / center
  margin:   "#4D9EF5",   // blue   — margin lines
  safeArea: "#39B980",   // green  — safe area
  guide:    "#54C6EB",   // cyan   — user guides
  layer:    "#F7C948",   // yellow — layer alignment
  grid:     "#aaaaaa",   // gray   — grid
  spacing:  "#F59E0B"    // orange — equal spacing
};

interface CanvasStageProps {
  page: Page;
  assets: Asset[];
  selectedLayerId: string | null;
  selectedLayerIds: string[];
  layoutEditMode: boolean;
  onSelectLayer: (layerId: string | null) => void;
  onSelectLayers: (layerIds: string[]) => void;
  onLayerChange: (layer: VisualLayer) => void;
  editingLayerId: string | null;
  onBeginTextEdit: (layerId: string) => void;
  onEndTextEdit: () => void;
  stageRef: React.RefObject<Konva.Stage | null>;
}

export function CanvasStage({
  page,
  assets,
  selectedLayerId,
  selectedLayerIds,
  layoutEditMode,
  onSelectLayer,
  onSelectLayers,
  onLayerChange,
  editingLayerId,
  onBeginTextEdit,
  onEndTextEdit,
  stageRef
}: CanvasStageProps): React.ReactElement {
  const transformerRef = useRef<Konva.Transformer>(null);
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const inputStateRef = useRef(createInputState("move"));
  const [marqueeRect, setMarqueeRect] = useState<RectType | null>(null);
  const [smartLines, setSmartLines] = useState<SnapLine[]>([]);

  // Live snap state — updated via RAF during drag to avoid render thrashing
  const pendingLinesRef = useRef<SnapLine[]>([]);
  const rafRef = useRef<number | null>(null);

  const viewport = useViewportStore();
  const baseScale = useMemo(() => {
    if (viewport.fitMode === "actualSize") {
      return 96 / page.setup.dpi;
    }
    if (viewport.fitMode === "fitWidth") {
      return Math.min(1, 820 / page.width);
    }
    return Math.min(0.42, 720 / page.height, 820 / page.width);
  }, [page.height, page.setup.dpi, page.width, viewport.fitMode]);
  const scale = baseScale * viewport.zoom;
  const stageWidth = Math.round(page.width * scale);
  const stageHeight = Math.round(page.height * scale);
  const gridLines = useMemo(() => buildGridLines(page, viewport.showGrid), [page, viewport.showGrid]);
  const selectedTextLayer = useMemo(
    () => page.layers.find((layer): layer is TextLayer => layer.type === "text" && layer.id === selectedLayerId) ?? null,
    [page.layers, selectedLayerId]
  );
  const editingLayer = useMemo(
    () => page.layers.find((layer): layer is TextLayer => layer.type === "text" && layer.id === editingLayerId) ?? null,
    [editingLayerId, page.layers]
  );

  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (transformer === null || stage === null) {
      return;
    }
    const nonTransformableIds = new Set(
      page.layers
        .filter((l) => l.type === "frame" && (l.metadata["gridCell"] !== undefined || (l.behaviorMode === "layoutLocked" && !layoutEditMode)))
        .map((l) => l.id)
    );
    const nodes = selectedLayerIds
      .filter((layerId) => !nonTransformableIds.has(layerId))
      .map((layerId) => stage.findOne(`#${layerId}`))
      .filter((node): node is Konva.Node => node !== undefined);
    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [selectedLayerIds, layoutEditMode, stageRef, page.layers]);

  function getPointerPosition(): { x: number; y: number } | null {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (stage === undefined || stage === null || pointer === undefined || pointer === null) {
      return null;
    }
    return {
      x: pointer.x / scale,
      y: pointer.y / scale
    };
  }

  function finishMarqueeSelection(): void {
    if (marqueeRect === null || marqueeRect.width < 4 || marqueeRect.height < 4) {
      marqueeStartRef.current = null;
      setMarqueeRect(null);
      return;
    }
    onSelectLayers(marqueeSelect(page, marqueeRect).selectedLayerIds);
    marqueeStartRef.current = null;
    setMarqueeRect(null);
  }

  // ── Live snap helpers ──────────────────────────────────────────────────────

  function scheduleGuideUpdate(lines: SnapLine[]): void {
    pendingLinesRef.current = lines;
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setSmartLines(pendingLinesRef.current);
    });
  }

  function clearGuides(): void {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pendingLinesRef.current = [];
    setSmartLines([]);
  }

  // Called by Stage onDragMove — applies magnetic snap imperatively then updates guides
  function handleStageDragMove(event: Konva.KonvaEventObject<DragEvent>): void {
    if (!viewport.snapEnabled) return;

    const node = event.target;
    const layerId = node.id();
    if (layerId === "") return; // content-inside-frame drag or non-layer node

    const layer = page.layers.find((l) => l.id === layerId);
    if (layer === undefined) return;
    if (isGridCellLayer(layer)) return;

    const x = node.x();
    const y = node.y();
    const settings = { ...page.setup.snapSettings, enabled: viewport.snapEnabled };

    const result = snapLayerPosition({ layer, page, layers: page.layers, x, y, settings });

    // Magnetic correction: move the node to the snapped position
    if (result.dx !== 0) node.x(result.x);
    if (result.dy !== 0) node.y(result.y);

    if (page.setup.snapSettings.showSmartGuides && result.lines.length > 0) {
      scheduleGuideUpdate(result.lines);
    } else {
      scheduleGuideUpdate([]);
    }
  }

  function handleStageDragEnd(): void {
    clearGuides();
  }

  function handleTransformerTransform(): void {
    const transformer = transformerRef.current;
    const node = transformer?.nodes()[0];
    if (!viewport.snapEnabled || transformer === undefined || transformer === null || node === undefined) {
      return;
    }
    const layer = page.layers.find((item) => item.id === node.id());
    if (layer === undefined) return;
    if (isGridCellLayer(layer)) return;

    const anchor = transformer.getActiveAnchor();
    const result = snapLayerBounds({
      movingLayerId: layer.id,
      page,
      layers: page.layers,
      bounds: transformedNodeRect(node),
      settings: { ...page.setup.snapSettings, enabled: viewport.snapEnabled },
      allowedSourceRoles: sourceRolesForAnchor(anchor)
    });

    applyTransformSnap(node, result.dx, result.dy, result.sourceRoles, anchor);
    scheduleGuideUpdate(page.setup.snapSettings.showSmartGuides ? result.lines : []);
  }

  // ── Layer change callback (called from KonvaLayerNode onDragEnd / onTransformEnd) ──
  function handleLayerChange(layer: VisualLayer): void {
    // Position is already snapped by handleStageDragMove; just commit.
    // For transform-end (resize), we still snap the position component.
    const previous = page.layers.find((item) => item.id === layer.id);
    if (previous !== undefined && isGridCellLayer(previous) && layer.type === "frame") {
      onLayerChange({
        ...layer,
        x: previous.x,
        y: previous.y,
        width: previous.width,
        height: previous.height,
        rotation: previous.rotation,
        behaviorMode: "layoutLocked",
        lockedFrame: true
      });
      return;
    }
    const moved = previous === undefined || previous.x !== layer.x || previous.y !== layer.y;
    if (moved && viewport.snapEnabled && page.setup.snapSettings.enabled) {
      const result = snapLayerPosition({
        layer,
        page,
        layers: page.layers,
        x: layer.x,
        y: layer.y,
        settings: { ...page.setup.snapSettings, enabled: viewport.snapEnabled }
      });
      onLayerChange({ ...layer, x: result.x, y: result.y } as VisualLayer);
      return;
    }
    onLayerChange(layer);
  }

  return (
    <div
      className="canvas-frame"
      data-testid="canvas-frame"
      style={{ transform: `translate(${viewport.panX}px, ${viewport.panY}px)` }}
      onWheel={(event) => {
        event.preventDefault();
        const direction = event.deltaY > 0 ? 1 / 1.08 : 1.08;
        viewport.setZoom(viewport.zoom * direction);
      }}
    >
      {viewport.showRulers ? <RulerOverlay page={page} scale={scale} /> : null}
      <Stage
        ref={stageRef}
        width={stageWidth}
        height={stageHeight}
        scaleX={scale}
        scaleY={scale}
        onDragMove={handleStageDragMove}
        onDragEnd={handleStageDragEnd}
        onMouseDown={(event) => {
          if (event.evt.button === 1) {
            event.evt.preventDefault();
            panStartRef.current = { x: event.evt.clientX, y: event.evt.clientY };
            inputStateRef.current = beginPointer(inputStateRef.current, panStartRef.current, event.evt.button);
            return;
          }
          if (event.target === event.target.getStage()) {
            const pointer = getPointerPosition();
            if (pointer !== null) {
              inputStateRef.current = beginPointer(inputStateRef.current, pointer, event.evt.button);
            }
            marqueeStartRef.current = pointer;
            setMarqueeRect(pointer === null ? null : { ...pointer, width: 0, height: 0 });
          }
        }}
        onMouseMove={(event) => {
          if (panStartRef.current !== null) {
            viewport.panBy(event.evt.clientX - panStartRef.current.x, event.evt.clientY - panStartRef.current.y);
            panStartRef.current = { x: event.evt.clientX, y: event.evt.clientY };
            return;
          }
          const start = marqueeStartRef.current;
          const pointer = getPointerPosition();
          if (start !== null && pointer !== null) {
            inputStateRef.current = movePointer(inputStateRef.current, pointer);
            setMarqueeRect(normalizeRect(start, pointer));
          }
        }}
        onMouseUp={() => {
          if (panStartRef.current !== null) {
            panStartRef.current = null;
            inputStateRef.current = endPointer(inputStateRef.current);
            return;
          }
          if (marqueeStartRef.current === null) {
            return;
          }
          if (marqueeRect === null || marqueeRect.width < 4 || marqueeRect.height < 4) {
            onSelectLayer(null);
            marqueeStartRef.current = null;
            setMarqueeRect(null);
            inputStateRef.current = endPointer(inputStateRef.current);
            return;
          }
          finishMarqueeSelection();
          inputStateRef.current = endPointer(inputStateRef.current);
        }}
        onTouchStart={(event) => {
          if (event.target === event.target.getStage()) {
            onSelectLayer(null);
          }
        }}
      >
        <Layer>
          {page.background.type === "transparent" ? null : (
            <Rect x={0} y={0} width={page.width} height={page.height} fill={page.background.color ?? "#fbfafa"} listening={false} />
          )}
          {gridLines.map((line) => (
            <Line
              key={line.key}
              name={SCREEN_HELPER_NODE_NAME}
              points={line.points}
              stroke={page.setup.gridSettings.color ?? "#7C6FE0"}
              strokeWidth={1 / scale}
              opacity={page.setup.gridSettings.opacity ?? 0.18}
              listening={false}
            />
          ))}
          <Rect
            name={SCREEN_HELPER_NODE_NAME}
            x={page.bleed.left}
            y={page.bleed.top}
            width={page.width - page.bleed.left - page.bleed.right}
            height={page.height - page.bleed.top - page.bleed.bottom}
            stroke="#E05D5D"
            strokeWidth={1.5}
            dash={[10, 8]}
            opacity={0.45}
            listening={false}
          />
          <Rect
            name={SCREEN_HELPER_NODE_NAME}
            x={page.margins.left}
            y={page.margins.top}
            width={page.width - page.margins.left - page.margins.right}
            height={page.height - page.margins.top - page.margins.bottom}
            stroke="#7C6FE0"
            strokeWidth={2}
            dash={[14, 10]}
            opacity={0.32}
            listening={false}
          />
          <Rect
            name={SCREEN_HELPER_NODE_NAME}
            x={page.setup.safeArea.left}
            y={page.setup.safeArea.top}
            width={page.width - page.setup.safeArea.left - page.setup.safeArea.right}
            height={page.height - page.setup.safeArea.top - page.setup.safeArea.bottom}
            stroke="#39B980"
            strokeWidth={1.5}
            dash={[6, 8]}
            opacity={0.42}
            listening={false}
          />
          {viewport.showGuides ? page.guides.filter((guide) => guide.visible !== false).map((guide) => (
            <Line
              key={guide.id}
              name={SCREEN_HELPER_NODE_NAME}
              points={guide.axis === "x" ? [guide.position, 0, guide.position, page.height] : [0, guide.position, page.width, guide.position]}
              stroke={guide.color ?? "#54C6EB"}
              strokeWidth={1.5 / scale}
              listening={false}
            />
          )) : null}
          {[...page.layers]
            .sort((a, b) => a.zIndex - b.zIndex)
            .map((layer) => (
              <KonvaLayerNode
                assets={assets}
                key={layer.id}
                layer={layer}
                selected={selectedLayerIds.includes(layer.id)}
                layoutEditMode={layoutEditMode}
                onBeginTextEdit={onBeginTextEdit}
                onChange={handleLayerChange}
                onSelect={(layerId) => onSelectLayer(layerId)}
              />
            ))}
          {marqueeRect !== null ? (
            <Rect
              name={SCREEN_HELPER_NODE_NAME}
              x={marqueeRect.x}
              y={marqueeRect.y}
              width={marqueeRect.width}
              height={marqueeRect.height}
              fill="rgba(124, 111, 224, 0.12)"
              stroke="#7C6FE0"
              strokeWidth={1.5}
              dash={[8, 6]}
              listening={false}
            />
          ) : null}
          {smartLines.map((line) => {
            const color = GUIDE_COLORS[line.kind] ?? "#F7C948";
            const sw = 1.5 / scale;

            // Spacing indicators: render gap brackets instead of a full-canvas line
            if (line.kind === "spacing" && line.spacingGaps !== undefined) {
              const gaps = line.spacingGaps;
              if (line.axis === "x") {
                // Horizontal spacing — draw two vertical gap segments at the Y midpoint
                const yMid = line.position;
                const tickH = 12 / scale;
                return (
                  <Fragment key={`spacing-x-${line.label}`}>
                    {gaps.map((gap, i) => (
                      <Fragment key={i}>
                        {/* horizontal connector across the gap */}
                        <Line name={SCREEN_HELPER_NODE_NAME} points={[gap.from, yMid, gap.to, yMid]} stroke={color} strokeWidth={sw * 1.5} listening={false} />
                        {/* left tick */}
                        <Line name={SCREEN_HELPER_NODE_NAME} points={[gap.from, yMid - tickH, gap.from, yMid + tickH]} stroke={color} strokeWidth={sw * 1.5} listening={false} />
                        {/* right tick */}
                        <Line name={SCREEN_HELPER_NODE_NAME} points={[gap.to, yMid - tickH, gap.to, yMid + tickH]} stroke={color} strokeWidth={sw * 1.5} listening={false} />
                      </Fragment>
                    ))}
                  </Fragment>
                );
              }
              // Vertical spacing — draw two horizontal gap segments at the X midpoint
              const xMid = line.position;
              const tickW = 12 / scale;
              return (
                <Fragment key={`spacing-y-${line.label}`}>
                  {gaps.map((gap, i) => (
                    <Fragment key={i}>
                      <Line name={SCREEN_HELPER_NODE_NAME} points={[xMid, gap.from, xMid, gap.to]} stroke={color} strokeWidth={sw * 1.5} listening={false} />
                      <Line name={SCREEN_HELPER_NODE_NAME} points={[xMid - tickW, gap.from, xMid + tickW, gap.from]} stroke={color} strokeWidth={sw * 1.5} listening={false} />
                      <Line name={SCREEN_HELPER_NODE_NAME} points={[xMid - tickW, gap.to,   xMid + tickW, gap.to]}   stroke={color} strokeWidth={sw * 1.5} listening={false} />
                    </Fragment>
                  ))}
                </Fragment>
              );
            }

            // Regular alignment guide — full-canvas line
            const points = line.axis === "x"
              ? [line.position, 0, line.position, page.height]
              : [0, line.position, page.width, line.position];

            return (
              <Line
                key={`${line.kind}-${line.axis}-${line.position}`}
                name={SCREEN_HELPER_NODE_NAME}
                points={points}
                stroke={color}
                strokeWidth={sw}
                dash={line.kind === "layer" ? [10, 6] : undefined}
                listening={false}
              />
            );
          })}
          <Transformer
            ref={transformerRef}
            name={SCREEN_HELPER_NODE_NAME}
            rotateEnabled
            anchorSize={10}
            borderStroke="#7C6FE0"
            anchorStroke="#9B8FF0"
            anchorFill="#17161C"
            onTransform={handleTransformerTransform}
            onTransformEnd={clearGuides}
          />
        </Layer>
      </Stage>
      {selectedTextLayer !== null && editingLayer === null ? (
        <TextContextBar layer={selectedTextLayer} scale={scale} onChange={handleLayerChange} />
      ) : null}
      {editingLayer !== null ? (
        <InlineTextEditor layer={editingLayer} scale={scale} onChange={handleLayerChange} onClose={onEndTextEdit} />
      ) : null}
    </div>
  );
}

function TextContextBar({
  layer,
  scale,
  onChange
}: {
  layer: TextLayer;
  scale: number;
  onChange: (layer: VisualLayer) => void;
}): React.ReactElement {
  const top = Math.max(8, layer.y * scale - 44);
  const left = Math.max(8, layer.x * scale);
  return (
    <div className="text-context-bar" style={{ top, left }} data-testid="text-context-bar">
      <button
        className={layer.fontWeight >= 700 ? "on" : ""}
        onClick={() => onChange(withMeasuredTextSize({ ...layer, fontWeight: layer.fontWeight >= 700 ? 400 : 700 }))}
        title="Bold"
        type="button"
      >
        B
      </button>
      <button
        className={layer.fontStyle === "italic" ? "on" : ""}
        onClick={() => onChange(withMeasuredTextSize({ ...layer, fontStyle: layer.fontStyle === "italic" ? "normal" : "italic" }))}
        title="Italic"
        type="button"
      >
        I
      </button>
      <input
        aria-label="Font size"
        max={240}
        min={8}
        onChange={(event) => onChange(withMeasuredTextSize({ ...layer, fontSize: Number(event.target.value) || layer.fontSize }))}
        type="number"
        value={layer.fontSize}
      />
      <input
        aria-label="Text color"
        onChange={(event) => onChange(withMeasuredTextSize({ ...layer, color: event.target.value, autoContrastOverridden: true }))}
        type="color"
        value={layer.color}
      />
    </div>
  );
}

function InlineTextEditor({
  layer,
  scale,
  onChange,
  onClose
}: {
  layer: TextLayer;
  scale: number;
  onChange: (layer: VisualLayer) => void;
  onClose: () => void;
}): React.ReactElement {
  const [value, setValue] = useState(layer.text);

  useEffect(() => {
    setValue(layer.text);
  }, [layer.id, layer.text]);

  function commit(): void {
    onChange(withMeasuredTextSize({
      ...layer,
      text: value
    }));
    onClose();
  }

  return (
    <textarea
      autoFocus
      className="inline-text-editor"
      data-testid="inline-text-editor"
      dir={layer.direction === "auto" ? "auto" : layer.direction}
      onBlur={commit}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          commit();
        }
      }}
      style={{
        left: layer.x * scale,
        top: layer.y * scale,
        width: Math.max(40, layer.width * scale),
        minHeight: Math.max(28, layer.height * scale),
        transform: `rotate(${layer.rotation}deg)`,
        fontFamily: layer.fontFamily,
        fontSize: Math.max(12, layer.fontSize * scale),
        fontStyle: layer.fontStyle,
        fontWeight: layer.fontWeight,
        lineHeight: layer.lineHeight,
        letterSpacing: layer.letterSpacing * scale,
        textAlign: layer.alignment === "justify" ? "justify" : layer.alignment,
        color: layer.color
      }}
      value={value}
    />
  );
}

function withMeasuredTextSize(layer: TextLayer): TextLayer {
  const size = measureTextLayerSize(layer);
  return {
    ...layer,
    width: size.width,
    height: size.height
  };
}

function buildGridLines(page: Page, visible: boolean): Array<{ key: string; points: number[] }> {
  if (!visible || !page.setup.gridSettings.enabled) {
    return [];
  }
  const spacingX = Math.max(1, page.setup.gridSettings.spacingX);
  const spacingY = Math.max(1, page.setup.gridSettings.spacingY);
  const lines: Array<{ key: string; points: number[] }> = [];
  for (let x = spacingX; x < page.width; x += spacingX) {
    lines.push({ key: `gx-${x}`, points: [x, 0, x, page.height] });
  }
  for (let y = spacingY; y < page.height; y += spacingY) {
    lines.push({ key: `gy-${y}`, points: [0, y, page.width, y] });
  }
  return lines;
}

function transformedNodeRect(node: Konva.Node): RectType {
  const sizedNode = node as Konva.Node & { width: () => number; height: () => number };
  const width = Number(sizedNode.width()) * Math.abs(node.scaleX());
  const height = Number(sizedNode.height()) * Math.abs(node.scaleY());
  return {
    x: node.x(),
    y: node.y(),
    width: Math.max(1, width),
    height: Math.max(1, height)
  };
}

function sourceRolesForAnchor(anchor: string | null): { x?: SnapSourceRole[]; y?: SnapSourceRole[] } | undefined {
  if (anchor === null || anchor === "") {
    return undefined;
  }
  const roles: { x?: SnapSourceRole[]; y?: SnapSourceRole[] } = {};
  if (anchor.includes("left")) roles.x = ["min"];
  if (anchor.includes("right")) roles.x = ["max"];
  if (anchor.includes("top")) roles.y = ["min"];
  if (anchor.includes("bottom")) roles.y = ["max"];
  return roles;
}

function applyTransformSnap(
  node: Konva.Node,
  dx: number,
  dy: number,
  sourceRoles: { x?: SnapSourceRole; y?: SnapSourceRole },
  anchor: string | null
): void {
  if (dx !== 0) {
    applyAxisTransformSnap(node, "x", dx, sourceRoles.x, anchor);
  }
  if (dy !== 0) {
    applyAxisTransformSnap(node, "y", dy, sourceRoles.y, anchor);
  }
}

function applyAxisTransformSnap(node: Konva.Node, axis: "x" | "y", delta: number, role: SnapSourceRole | undefined, anchor: string | null): void {
  const sizedNode = node as Konva.Node & { width: () => number; height: () => number };
  const position = axis === "x" ? node.x() : node.y();
  const baseSize = axis === "x" ? Number(sizedNode.width()) : Number(sizedNode.height());
  if (baseSize <= 0) return;
  const currentScale = axis === "x" ? node.scaleX() : node.scaleY();
  const scaledSize = baseSize * Math.abs(currentScale);
  const resizingMin = role === "min" && anchor !== null && (axis === "x" ? anchor.includes("left") : anchor.includes("top"));
  const resizingMax = role === "max" && anchor !== null && (axis === "x" ? anchor.includes("right") : anchor.includes("bottom"));

  if (resizingMin) {
    const nextSize = Math.max(1, scaledSize - delta);
    if (axis === "x") node.x(position + delta);
    else node.y(position + delta);
    if (axis === "x") node.scaleX(nextSize / baseSize);
    else node.scaleY(nextSize / baseSize);
    return;
  }

  if (resizingMax) {
    const nextSize = Math.max(1, scaledSize + delta);
    if (axis === "x") node.scaleX(nextSize / baseSize);
    else node.scaleY(nextSize / baseSize);
    return;
  }

  if (axis === "x") node.x(position + delta);
  else node.y(position + delta);
}

function RulerOverlay({ page, scale }: { page: Page; scale: number }): React.ReactElement {
  const major = Math.max(1, page.setup.gridSettings.spacingX * scale);
  const topTicks = Array.from({ length: Math.min(16, Math.floor(page.width / page.setup.gridSettings.spacingX) + 1) });
  const sideTicks = Array.from({ length: Math.min(16, Math.floor(page.height / page.setup.gridSettings.spacingY) + 1) });
  return (
    <>
      <div className="canvas-ruler canvas-ruler-top" style={{ width: page.width * scale }}>
        {topTicks.map((_, index) => (
          <span key={index} style={{ insetInlineStart: index * major }}>
            {Math.round(index * page.setup.gridSettings.spacingX)}
          </span>
        ))}
      </div>
      <div className="canvas-ruler canvas-ruler-side" style={{ height: page.height * scale }}>
        {sideTicks.map((_, index) => (
          <span key={index} style={{ top: index * Math.max(1, page.setup.gridSettings.spacingY * scale) }}>
            {Math.round(index * page.setup.gridSettings.spacingY)}
          </span>
        ))}
      </div>
    </>
  );
}
