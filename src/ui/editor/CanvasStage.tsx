import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Transformer } from "react-konva";
import { useProductStore } from "@/state/productStore";
import { ProductGuidesOverlay } from "./ProductGuidesOverlay";
import type { ProductPageContext } from "@/types/product";
import { calculateRotateHandlePosition, nodeAABBInCanvasUnits, type RotateHandlePosition } from "./rotateHandleUtils";
import { useKonvaImage } from "./useKonvaImage";
import { createMaskAsset, resolveCanvasAssetPath } from "@/core/assets/assetManager";
import { runMagicWand } from "@/core/imageEdit/magicWandWorker";
import type Konva from "konva";
import { beginPointer, createInputState, endPointer, movePointer } from "@/core/input/inputSystem";
import { normalizeRect } from "@/core/bounds/bounds";
import { isGridCellLayer } from "@/core/grid/gridModeEngine";
import { isMaskFrameLayer } from "@/core/mask/maskModeEngine";
import { marqueeSelect } from "@/core/selection/selectionEngine";
import { snapLayerBounds, snapLayerPosition, type SnapLine, type SnapLineKind, type SnapSourceRole } from "@/core/snap/snapEngine";
import { measureTextLayerSize } from "@/core/text/measurement";
import { useViewportStore } from "@/state/viewportStore";
import { useImageEditStore } from "@/state/imageEditStore";
import type { Asset, Page } from "@/types/document";
import type { Rect as RectType } from "@/types/primitives";
import type { ImageLayer, TextLayer, VisualLayer } from "@/types/layers";
import { SCREEN_HELPER_NODE_NAME } from "./canvasNodeNames";
import { KonvaLayerNode, type CanvasContextMenuTarget } from "./KonvaLayerNode";

// Extra screen-pixel buffer around the Stage canvas so that Transformer anchors
// and the selection border remain visible and interactive even when the selected
// object extends beyond the canvas boundary.  Content is clipped to the canvas
// area by a Konva Group clipFunc; only the Transformer sits outside that clip.
const OVERFLOW_PAD = 200; // px

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
  onLayerContextMenu?: (target: CanvasContextMenuTarget) => void;
  stageRef: React.RefObject<Konva.Stage | null>;
  onMaskPainted?: (layerId: string, maskDataUrl: string, width: number, height: number) => void;
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
  onLayerContextMenu,
  stageRef,
  onMaskPainted
}: CanvasStageProps): React.ReactElement {
  const transformerRef = useRef<Konva.Transformer>(null);
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const rotatingRef = useRef<{
    pivot: { x: number; y: number };
    startAngle: number;
    initialNodes: Array<{ node: Konva.Node; x: number; y: number; rotation: number }>;
  } | null>(null);
  const [rotateHandlePos, setRotateHandlePos] = useState<RotateHandlePosition | null>(null);
  const inputStateRef = useRef(createInputState("move"));
  const [marqueeRect, setMarqueeRect] = useState<RectType | null>(null);
  const [smartLines, setSmartLines] = useState<SnapLine[]>([]);

  // ── Image edit mode state ────────────────────────────────────────────────────
  const imageEditStore = useImageEditStore();
  const { imageEditMode, editingLayerId: imageEditLayerId, activeTool: imageActiveTool } = imageEditStore;
  const eraserCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isPaintingRef = useRef(false);
  const lastPaintPosRef = useRef<{ x: number; y: number } | null>(null);
  const [selectionCanvas, setSelectionCanvas] = useState<HTMLCanvasElement | null>(null);
  const [eraserCursorPos, setEraserCursorPos] = useState<{ x: number; y: number } | null>(null);
  const rectStartRef = useRef<{ x: number; y: number } | null>(null);

  // Live snap state — updated via RAF during drag to avoid render thrashing
  const pendingLinesRef = useRef<SnapLine[]>([]);
  const rafRef = useRef<number | null>(null);

  const viewport = useViewportStore();
  const activeProduct = useProductStore((s) => s.activeProduct);
  const productContext = useMemo<ProductPageContext | null>(() => {
    if (!activeProduct) return null;
    const ctx = page.metadata.productContext;
    if (!ctx || typeof ctx !== "object" || Array.isArray(ctx)) return null;
    return ctx as unknown as ProductPageContext;
  }, [activeProduct, page.metadata]);

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
  // Extended Stage dimensions: OVERFLOW_PAD extra pixels on every side so the
  // Transformer can render its handles outside the canvas boundary.
  const extStageWidth = stageWidth + 2 * OVERFLOW_PAD;
  const extStageHeight = stageHeight + 2 * OVERFLOW_PAD;
  // Shift all Konva content by this offset (canvas units) so that canvas (0,0)
  // maps to Stage pixel (OVERFLOW_PAD, OVERFLOW_PAD), not (0,0).
  const layerOffset = OVERFLOW_PAD / scale;
  const gridLines = useMemo(() => buildGridLines(page, viewport.showGrid), [page, viewport.showGrid]);
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
    // Hide transformer completely while in image-edit mode (crop handles take over)
    if (imageEditMode) {
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
      setRotateHandlePos(null);
      return;
    }
    const nonTransformableIds = new Set(
      page.layers
        .filter((l) => l.type === "frame" && (l.metadata["gridCell"] !== undefined || l.metadata["maskFrame"] !== undefined || (l.behaviorMode === "layoutLocked" && !layoutEditMode)))
        .map((l) => l.id)
    );
    const nodes = selectedLayerIds
      .filter((layerId) => !nonTransformableIds.has(layerId))
      .map((layerId) => stage.findOne(`#${layerId}`))
      .filter((node): node is Konva.Node => node !== undefined);
    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
    if (nodes.length > 0) {
      setRotateHandlePos(calculateRotateHandlePosition(transformer, page.height));
    } else {
      setRotateHandlePos(null);
    }
  }, [selectedLayerIds, layoutEditMode, imageEditMode, stageRef, page.layers, page.height]);

  function getPointerPosition(): { x: number; y: number } | null {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (stage === undefined || stage === null || pointer === undefined || pointer === null) {
      return null;
    }
    // Subtract OVERFLOW_PAD before dividing by scale: Stage pixel (OVERFLOW_PAD, OVERFLOW_PAD)
    // corresponds to canvas content origin (0, 0).
    return {
      x: (pointer.x - OVERFLOW_PAD) / scale,
      y: (pointer.y - OVERFLOW_PAD) / scale
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

  function updateHandlePosition(): void {
    const transformer = transformerRef.current;
    if (transformer === null || transformer.nodes().length === 0) {
      setRotateHandlePos(null);
      return;
    }
    setRotateHandlePos(calculateRotateHandlePosition(transformer, page.height));
  }

  function handleRotateHandleMouseDown(e: Konva.KonvaEventObject<MouseEvent>): void {
    e.cancelBubble = true;
    const transformer = transformerRef.current;
    if (transformer === null) return;
    const nodes = transformer.nodes();
    if (nodes.length === 0) return;
    const pos = getPointerPosition();
    if (pos === null) return;

    // Recompute pivot (AABB center) fresh so it reflects any recent resize/drag
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of nodes) {
      const bb = nodeAABBInCanvasUnits(node, scale);
      minX = Math.min(minX, bb.minX);
      minY = Math.min(minY, bb.minY);
      maxX = Math.max(maxX, bb.maxX);
      maxY = Math.max(maxY, bb.maxY);
    }
    const pivot = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };

    rotatingRef.current = {
      pivot,
      startAngle: Math.atan2(pos.y - pivot.y, pos.x - pivot.x),
      initialNodes: nodes.map(node => ({ node, x: node.x(), y: node.y(), rotation: node.rotation() })),
    };
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
    if (isMaskFrameLayer(layer)) return;

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
    if (isMaskFrameLayer(layer)) return;

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
    if (previous !== undefined && isMaskFrameLayer(previous) && layer.type === "frame") {
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

  // ── Eraser brush painting ────────────────────────────────────────────────────
  function getEditingImageLayer(): ImageLayer | null {
    if (imageEditLayerId === null) return null;
    const l = page.layers.find((layer) => layer.id === imageEditLayerId);
    return l?.type === "image" ? l : null;
  }

  function paintEraserStroke(
    x: number, y: number,
    prevX: number | null, prevY: number | null
  ): void {
    const layer = getEditingImageLayer();
    if (layer === null) return;
    const cnv = eraserCanvasRef.current;
    if (cnv === null) return;
    const ctx = cnv.getContext("2d");
    if (ctx === null) return;
    const { eraserSize, eraserFeather, eraserStrength, eraserMode } = imageEditStore;

    // Local coords relative to layer origin
    const lx = x - layer.x;
    const ly = y - layer.y;
    const plx = prevX !== null ? prevX - layer.x : lx;
    const ply = prevY !== null ? prevY - layer.y : ly;

    const r = eraserSize / 2;
    const gradient = ctx.createRadialGradient(lx, ly, r * (1 - eraserFeather), lx, ly, r);
    const alpha = eraserStrength;

    if (eraserMode === "erase") {
      ctx.globalCompositeOperation = "destination-out";
      gradient.addColorStop(0, `rgba(0,0,0,${alpha})`);
      gradient.addColorStop(1, "rgba(0,0,0,0)");
    } else {
      ctx.globalCompositeOperation = "destination-over";
      gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
      gradient.addColorStop(1, "rgba(255,255,255,0)");
    }

    ctx.beginPath();
    if (prevX !== null && prevY !== null) {
      const steps = Math.ceil(Math.hypot(lx - plx, ly - ply) / (r * 0.3));
      for (let i = 0; i <= steps; i++) {
        const t = steps === 0 ? 0 : i / steps;
        const cx = plx + (lx - plx) * t;
        const cy = ply + (ly - ply) * t;
        const g2 = ctx.createRadialGradient(cx, cy, r * (1 - eraserFeather), cx, cy, r);
        if (eraserMode === "erase") {
          g2.addColorStop(0, `rgba(0,0,0,${alpha})`);
          g2.addColorStop(1, "rgba(0,0,0,0)");
        } else {
          g2.addColorStop(0, `rgba(255,255,255,${alpha})`);
          g2.addColorStop(1, "rgba(255,255,255,0)");
        }
        ctx.globalCompositeOperation = eraserMode === "erase" ? "destination-out" : "destination-over";
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = gradient;
      ctx.arc(lx, ly, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Force repaint
  }

  function commitEraserStroke(): void {
    const layer = getEditingImageLayer();
    const cnv = eraserCanvasRef.current;
    if (layer === null || cnv === null || onMaskPainted === undefined) return;
    const dataUrl = cnv.toDataURL("image/png");
    onMaskPainted(layer.id, dataUrl, cnv.width, cnv.height);
  }

  // Initialize eraser canvas when entering eraser mode
  useEffect(() => {
    if (!imageEditMode || imageActiveTool !== "eraser") return;
    const layer = getEditingImageLayer();
    if (layer === null) return;

    const cnv = window.document.createElement("canvas");
    cnv.width = layer.width;
    cnv.height = layer.height;
    const ctx = cnv.getContext("2d");
    if (ctx === null) return;

    // Load existing mask into canvas if available
    const maskAsset = layer.pixelMask !== undefined
      ? assets.find((a) => a.id === layer.pixelMask!.assetId)
      : undefined;

    if (maskAsset?.previewPath !== undefined) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, layer.width, layer.height);
        eraserCanvasRef.current = cnv;
      };
      img.src = maskAsset.previewPath;
    } else {
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, layer.width, layer.height);
      eraserCanvasRef.current = cnv;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageEditMode, imageActiveTool, imageEditLayerId]);

  // ── Magic Wand click handler ─────────────────────────────────────────────────
  const handleWandClick = useCallback((stageX: number, stageY: number) => {
    const layer = getEditingImageLayer();
    if (layer === null) return;

    // Get the Konva node for this layer to extract pixel data
    const stage = stageRef.current;
    if (stage === null) return;

    // Get the canvas data from the stage at the layer's bounding box
    const lx = Math.round(layer.x * scale);
    const ly = Math.round(layer.y * scale);
    const lw = Math.round(layer.width * scale);
    const lh = Math.round(layer.height * scale);

    // Clamp to stage bounds
    const sx = Math.max(0, lx);
    const sy = Math.max(0, ly);
    const sw = Math.min(lw, stageWidth - sx);
    const sh = Math.min(lh, stageHeight - sy);
    if (sw <= 0 || sh <= 0) return;

    // Content starts at Stage pixel (OVERFLOW_PAD, OVERFLOW_PAD), so add the offset.
    const stageCanvas = stage.toCanvas({ x: sx + OVERFLOW_PAD, y: sy + OVERFLOW_PAD, width: sw, height: sh });
    const ctx = stageCanvas.getContext("2d");
    if (ctx === null) return;
    const imageData = ctx.getImageData(0, 0, sw, sh);

    // Click coords relative to the cropped region
    const clickX = stageX * scale - lx;
    const clickY = stageY * scale - ly;

    const { mask, width, height } = runMagicWand({
      imageData,
      clickX,
      clickY,
      tolerance: imageEditStore.wandTolerance,
      contiguous: imageEditStore.wandContiguous
    });

    imageEditStore.setSelectionMask({ data: mask, width, height });

    // Build a selection overlay canvas for rendering
    const overlayCanvas = window.document.createElement("canvas");
    overlayCanvas.width = width;
    overlayCanvas.height = height;
    const octx = overlayCanvas.getContext("2d");
    if (octx !== null) {
      const id = octx.createImageData(width, height);
      for (let i = 0; i < mask.length; i++) {
        if (mask[i] > 128) {
          id.data[i * 4] = 80;
          id.data[i * 4 + 1] = 130;
          id.data[i * 4 + 2] = 220;
          id.data[i * 4 + 3] = 100;
        }
      }
      octx.putImageData(id, 0, 0);
    }
    setSelectionCanvas(overlayCanvas);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageEditLayerId, imageEditStore.wandTolerance, imageEditStore.wandContiguous, scale, stageWidth, stageHeight]);

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
      {/* Wrapper: keeps canvas-frame sized at the true canvas dimensions while
          the Stage canvas extends OVERFLOW_PAD px on every side so the
          Transformer handles can render outside the canvas boundary. */}
      <div style={{ width: stageWidth, height: stageHeight }}>
        <div style={{ position: 'absolute', left: -OVERFLOW_PAD, top: -OVERFLOW_PAD }}>
      <Stage
        ref={stageRef}
        width={extStageWidth}
        height={extStageHeight}
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
          // Eraser mode: start painting stroke
          if (imageEditMode && imageActiveTool === "eraser") {
            isPaintingRef.current = true;
            const pointer = getPointerPosition();
            if (pointer !== null) {
              paintEraserStroke(pointer.x, pointer.y, null, null);
              lastPaintPosRef.current = pointer;
            }
            return;
          }
          // Wand/rect-select: handled on mouse up
          if (imageEditMode && imageActiveTool === "wand") return;
          // Rect-select: start drag
          if (imageEditMode && imageActiveTool === "rect-select") {
            const pointer = getPointerPosition();
            if (pointer !== null) rectStartRef.current = pointer;
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
          // Update eraser cursor position
          if (imageEditMode && imageActiveTool === "eraser") {
            const pointer = getPointerPosition();
            if (pointer !== null) setEraserCursorPos(pointer);
            if (isPaintingRef.current && pointer !== null) {
              const prev = lastPaintPosRef.current;
              paintEraserStroke(pointer.x, pointer.y, prev?.x ?? null, prev?.y ?? null);
              lastPaintPosRef.current = pointer;
            }
            return;
          }
          // Rect-select: update preview
          if (imageEditMode && imageActiveTool === "rect-select" && rectStartRef.current !== null) {
            const pointer = getPointerPosition();
            if (pointer !== null) {
              const editLayer = getEditingImageLayer();
              if (editLayer !== null) {
                const lx = editLayer.x, ly = editLayer.y, lw = editLayer.width, lh = editLayer.height;
                const rx = Math.max(lx, Math.min(rectStartRef.current.x, pointer.x));
                const ry = Math.max(ly, Math.min(rectStartRef.current.y, pointer.y));
                const rw = Math.min(lx + lw, Math.max(rectStartRef.current.x, pointer.x)) - rx;
                const rh = Math.min(ly + lh, Math.max(rectStartRef.current.y, pointer.y)) - ry;
                imageEditStore.setRectSelectPreview({ x: rx, y: ry, width: rw, height: rh });
              }
            }
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
          // Eraser mode: commit stroke
          if (imageEditMode && imageActiveTool === "eraser") {
            if (isPaintingRef.current) {
              isPaintingRef.current = false;
              lastPaintPosRef.current = null;
              commitEraserStroke();
            }
            return;
          }
          // Wand mode: run flood fill on click
          if (imageEditMode && imageActiveTool === "wand") {
            const pointer = getPointerPosition();
            if (pointer !== null) {
              void handleWandClick(pointer.x, pointer.y);
            }
            return;
          }
          // Rect-select: finalize selection
          if (imageEditMode && imageActiveTool === "rect-select") {
            const preview = imageEditStore.rectSelectPreview;
            const editLayer = getEditingImageLayer();
            if (preview !== null && editLayer !== null && preview.width > 2 && preview.height > 2) {
              const lx = editLayer.x, ly = editLayer.y, lw = editLayer.width, lh = editLayer.height;
              const w = lw, h = lh;
              const mask = new Uint8Array(w * h);
              // pixels inside the rect → selected
              const rx0 = Math.round((preview.x - lx) / lw * w);
              const ry0 = Math.round((preview.y - ly) / lh * h);
              const rx1 = Math.round((preview.x + preview.width - lx) / lw * w);
              const ry1 = Math.round((preview.y + preview.height - ly) / lh * h);
              for (let py = 0; py < h; py++) {
                for (let px = 0; px < w; px++) {
                  if (px >= rx0 && px < rx1 && py >= ry0 && py < ry1) {
                    mask[py * w + px] = 255;
                  }
                }
              }
              imageEditStore.setSelectionMask({ data: mask, width: w, height: h });
              // Build overlay canvas
              const overlayCanvas = window.document.createElement("canvas");
              overlayCanvas.width = w; overlayCanvas.height = h;
              const octx = overlayCanvas.getContext("2d");
              if (octx !== null) {
                const id = octx.createImageData(w, h);
                for (let i = 0; i < mask.length; i++) {
                  if (mask[i] > 0) {
                    id.data[i * 4] = 80; id.data[i * 4 + 1] = 130; id.data[i * 4 + 2] = 220; id.data[i * 4 + 3] = 100;
                  }
                }
                octx.putImageData(id, 0, 0);
              }
              setSelectionCanvas(overlayCanvas);
            }
            rectStartRef.current = null;
            imageEditStore.setRectSelectPreview(null);
            return;
          }
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
        <Layer x={layerOffset} y={layerOffset}>
          {/* All canvas content is clipped to the canvas boundary.
              The Transformer lives outside this Group so its anchors render
              and respond to events even when an object overflows the canvas. */}
          <Group clipFunc={(ctx: any) => { ctx.rect(0, 0, page.width, page.height); }}>
          {page.background.type !== "transparent" && page.background.type !== "asset" ? (
            <Rect x={0} y={0} width={page.width} height={page.height} fill={page.background.color ?? "#fbfafa"} listening={false} />
          ) : null}
          {page.background.type === "asset" ? (
            <BackgroundImageNode
              assetId={page.background.assetId}
              assets={assets}
              width={page.width}
              height={page.height}
            />
          ) : null}
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
                onContextMenu={onLayerContextMenu}
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
          </Group>

          {/* ── Product Mode guides overlay (above content, below selection UI) ── */}
          {productContext && (
            <ProductGuidesOverlay
              context={productContext}
              pageWidth={page.width}
              pageHeight={page.height}
              scale={scale}
            />
          )}

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
        {/* ── Image edit overlay layer (crop handles, selection) ── */}
        {imageEditMode && imageEditLayerId !== null && (() => {
          const editLayer = page.layers.find((l) => l.id === imageEditLayerId);
          if (editLayer === undefined || editLayer.type !== "image") return null;
          const lx = editLayer.x;
          const ly = editLayer.y;
          const lw = editLayer.width;
          const lh = editLayer.height;
          const rot = editLayer.rotation ?? 0;
          const crop = imageEditStore.cropPreview ?? editLayer.crop;
          const cropX = crop.x * lw;
          const cropY = crop.y * lh;
          const cropW = crop.width * lw;
          const cropH = crop.height * lh;
          const hw = 8 / scale;
          const handles = [
            { id: "tl", cx: cropX,           cy: cropY,            dx: -1, dy: -1 },
            { id: "tc", cx: cropX + cropW/2,  cy: cropY,            dx:  0, dy: -1 },
            { id: "tr", cx: cropX + cropW,    cy: cropY,            dx:  1, dy: -1 },
            { id: "ml", cx: cropX,            cy: cropY + cropH/2,  dx: -1, dy:  0 },
            { id: "mr", cx: cropX + cropW,    cy: cropY + cropH/2,  dx:  1, dy:  0 },
            { id: "bl", cx: cropX,            cy: cropY + cropH,    dx: -1, dy:  1 },
            { id: "bc", cx: cropX + cropW/2,  cy: cropY + cropH,    dx:  0, dy:  1 },
            { id: "br", cx: cropX + cropW,    cy: cropY + cropH,    dx:  1, dy:  1 },
          ];
          return (
            <Layer x={layerOffset} y={layerOffset} listening={imageActiveTool === "crop"}>
              <Group x={lx} y={ly} rotation={rot}>
                {/* Dark overlay outside crop area */}
                {imageActiveTool === "crop" && (
                  <>
                    <Rect x={0} y={0} width={lw} height={cropY} fill="rgba(0,0,0,0.45)" listening={false} />
                    <Rect x={0} y={cropY + cropH} width={lw} height={lh - cropY - cropH} fill="rgba(0,0,0,0.45)" listening={false} />
                    <Rect x={0} y={cropY} width={cropX} height={cropH} fill="rgba(0,0,0,0.45)" listening={false} />
                    <Rect x={cropX + cropW} y={cropY} width={lw - cropX - cropW} height={cropH} fill="rgba(0,0,0,0.45)" listening={false} />
                    {/* Crop border */}
                    <Rect x={cropX} y={cropY} width={cropW} height={cropH} stroke="#fff" strokeWidth={1.5 / scale} fill="transparent" listening={false} />
                    {/* Rule-of-thirds lines */}
                    <Line points={[cropX + cropW/3, cropY, cropX + cropW/3, cropY + cropH]} stroke="rgba(255,255,255,0.35)" strokeWidth={0.8/scale} listening={false} />
                    <Line points={[cropX + 2*cropW/3, cropY, cropX + 2*cropW/3, cropY + cropH]} stroke="rgba(255,255,255,0.35)" strokeWidth={0.8/scale} listening={false} />
                    <Line points={[cropX, cropY + cropH/3, cropX + cropW, cropY + cropH/3]} stroke="rgba(255,255,255,0.35)" strokeWidth={0.8/scale} listening={false} />
                    <Line points={[cropX, cropY + 2*cropH/3, cropX + cropW, cropY + 2*cropH/3]} stroke="rgba(255,255,255,0.35)" strokeWidth={0.8/scale} listening={false} />
                    {/* Handles */}
                    {handles.map((h) => (
                      <Rect
                        key={h.id}
                        x={h.cx - hw / 2}
                        y={h.cy - hw / 2}
                        width={hw}
                        height={hw}
                        fill="#fff"
                        stroke="#7C6FE0"
                        strokeWidth={1 / scale}
                        draggable
                        onDragMove={(e) => {
                          const nx = e.target.x() + hw / 2;
                          const ny = e.target.y() + hw / 2;
                          let newX = crop.x;
                          let newY = crop.y;
                          let newW = crop.width;
                          let newH = crop.height;
                          if (h.dx < 0) { newX = Math.min(nx / lw, crop.x + crop.width - 0.02); newW = crop.x + crop.width - newX; }
                          if (h.dx > 0) { newW = Math.max(0.02, nx / lw - crop.x); }
                          if (h.dy < 0) { newY = Math.min(ny / lh, crop.y + crop.height - 0.02); newH = crop.y + crop.height - newY; }
                          if (h.dy > 0) { newH = Math.max(0.02, ny / lh - crop.y); }
                          imageEditStore.setCropPreview({
                            x: Math.max(0, Math.min(newX, 1 - newW)),
                            y: Math.max(0, Math.min(newY, 1 - newH)),
                            width: Math.min(newW, 1),
                            height: Math.min(newH, 1)
                          });
                        }}
                      />
                    ))}
                  </>
                )}
                {/* Selection overlay (wand / rect-select) */}
                {(imageActiveTool === "wand" || imageActiveTool === "rect-select") && selectionCanvas !== null && (
                  <KonvaImage
                    x={0} y={0}
                    width={lw}
                    height={lh}
                    image={selectionCanvas}
                    listening={false}
                  />
                )}
                {/* Rect-select drag preview */}
                {imageActiveTool === "rect-select" && imageEditStore.rectSelectPreview !== null && (() => {
                  const rp = imageEditStore.rectSelectPreview;
                  return (
                    <Rect
                      x={rp.x - lx} y={rp.y - ly}
                      width={rp.width} height={rp.height}
                      fill="rgba(80,130,220,0.18)"
                      stroke="#5082DC"
                      strokeWidth={1.5 / scale}
                      dash={[6 / scale, 4 / scale]}
                      listening={false}
                    />
                  );
                })()}
              </Group>
            </Layer>
          );
        })()}
      </Stage>
        </div>
      </div>
      {/* Eraser brush cursor canvas overlay */}
      {imageEditMode && imageActiveTool === "eraser" && imageEditLayerId !== null && (() => {
        const editLayer = page.layers.find((l) => l.id === imageEditLayerId);
        if (editLayer === undefined || editLayer.type !== "image") return null;
        return (
          <canvas
            className="eraser-preview-canvas"
            style={{
              position: "absolute",
              left: editLayer.x * scale,
              top: editLayer.y * scale,
              width: editLayer.width * scale,
              height: editLayer.height * scale,
              pointerEvents: "none",
              opacity: 0.6,
              mixBlendMode: "multiply"
            }}
            width={editLayer.width}
            height={editLayer.height}
          />
        );
      })()}
      {/* Eraser brush cursor ring */}
      {imageEditMode && imageActiveTool === "eraser" && eraserCursorPos !== null && (() => {
        const r = imageEditStore.eraserSize / 2 * scale;
        const cx = eraserCursorPos.x * scale;
        const cy = eraserCursorPos.y * scale;
        return (
          <div
            style={{
              position: "absolute",
              left: cx - r,
              top: cy - r,
              width: r * 2,
              height: r * 2,
              borderRadius: "50%",
              border: "2px solid rgba(255,255,255,0.9)",
              outline: "1px solid rgba(0,0,0,0.5)",
              pointerEvents: "none",
              boxSizing: "border-box",
              zIndex: 400
            }}
          />
        );
      })()}
      {editingLayer !== null ? (
        <InlineTextEditor layer={editingLayer} scale={scale} onChange={handleLayerChange} onClose={onEndTextEdit} />
      ) : null}
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

// ─── Background image node ────────────────────────────────────────────────────

function BackgroundImageNode({
  assetId,
  assets,
  width,
  height
}: {
  assetId: string | undefined;
  assets: Asset[];
  width: number;
  height: number;
}): React.ReactElement | null {
  const asset = assets.find((a) => a.id === assetId);
  const imageSrc = resolveCanvasAssetPath(asset);
  const image = useKonvaImage(imageSrc);
  if (!image) return null;
  return (
    <KonvaImage
      x={0}
      y={0}
      width={width}
      height={height}
      image={image}
      listening={false}
    />
  );
}
