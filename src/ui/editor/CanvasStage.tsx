import { Fragment, type ReactElement, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Image as KonvaImage, Layer, Line, Path, Rect, Stage, Transformer } from "react-konva";
import { useProductStore } from "@/state/productStore";
import { ProductGuidesOverlay } from "./ProductGuidesOverlay";
import { CollageGridOverlay } from "./CollageGridOverlay";
import type { ProductPageContext } from "@/types/product";
import { calculateRotateHandlePosition, nodeAABBInCanvasUnits, type RotateHandlePosition } from "./rotateHandleUtils";
import { useKonvaImage } from "./useKonvaImage";
import { createMaskAsset, resolveCanvasAssetPath } from "@/core/assets/assetManager";
import { runMagicWand } from "@/core/imageEdit/magicWandWorker";
import {
  makeSmartSelectionInput,
  maskResultToSelectionMask,
  runSmartPromptSelection
} from "@/services/ai/smartSelectionService";
import Konva from "konva";
import { beginPointer, createInputState, endPointer, movePointer } from "@/core/input/inputSystem";
import { normalizeRect } from "@/core/bounds/bounds";
import { isGridCellLayer } from "@/core/grid/gridModeEngine";
import { isMaskFrameLayer } from "@/core/mask/maskModeEngine";
import { isPhotoPrintSlotLayer } from "@/core/photoPrint/photoPrintModeEngine";
import { getEffectiveSourceSize } from "@/core/image/screenshotCropMetadata";
import { clampContentTransformToFillBounds } from "@/core/rendering/frameFitEngine";
import { marqueeSelect } from "@/core/selection/selectionEngine";
import { snapLayerBounds, snapLayerPosition, type SnapLine, type SnapLineKind, type SnapSourceRole } from "@/core/snap/snapEngine";
import { measureTextLayerSize } from "@/core/text/measurement";
import { useViewportStore } from "@/state/viewportStore";
import { useImageEditStore, type SmartSelectionPrompt } from "@/state/imageEditStore";
import { useDrawingToolsStore } from "@/state/drawingToolsStore";
import { useColorStore, rgbaToHex } from "@/state/colorStore";
import { useDocumentStore } from "@/state/documentStore";
import { resolveEffectivePerformanceSettings, useAppSettings } from "@/settings";
import { createShapeLayer } from "@/core/layers/factory";
import type { Asset, Page } from "@/types/document";
import type { CollageRule, CollageSlot } from "@/types/collage";
import type { Rect as RectType } from "@/types/primitives";
import type { AdjustmentLayer, FrameLayer, ImageLayer, ShapeLayer, TextLayer, VisualLayer } from "@/types/layers";
import { createAdjustmentPixelFilter, hasActiveAdjustment } from "@/core/rendering/adjustmentPipeline";
import { ENABLE_CLASSIC_ADJUSTMENT_LAYER_RENDERING } from "@/core/features/adjustmentFlags";
import { SCREEN_HELPER_NODE_NAME } from "./canvasNodeNames";
import { KonvaLayerNode, type CanvasContextMenuTarget } from "./KonvaLayerNode";
import { PageLookOverlay } from "./PageLookOverlay";
import { PassportGuidelinesOverlay } from "@/ui/photoPrint/PassportGuidelinesOverlay";
import { markDebugEvent, registerKonvaStage, trackDebugMount } from "@/debug/sppDiagnostics";

// Extra screen-pixel buffer around the Stage canvas so that Transformer anchors
// and the selection border remain visible and interactive even when the selected
// object extends beyond the canvas boundary.  Content is clipped to the canvas
// area by a Konva Group clipFunc; only the Transformer sits outside that clip.
const OVERFLOW_PAD = 200; // px

const VISUAL_LAYER_TYPES = new Set<VisualLayer["type"]>(["image", "text", "shape", "frame", "mask", "background", "guide"]);

// AABB hit-test in canvas units, taking rotation into account.
// Used for Alt+Click to bypass listening={false} on locked layers.
function findTopmostLayerAtPoint(layers: Page["layers"], pt: { x: number; y: number }): string | null {
  const candidates = [...layers]
    .filter((l) => l.visible !== false && (l.opacity ?? 1) > 0 && "x" in l && "width" in l && "height" in l)
    .sort((a, b) => b.zIndex - a.zIndex);
  for (const l of candidates) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lx = (l as any).x as number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ly = (l as any).y as number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lw = (l as any).width as number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lh = (l as any).height as number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rot = ((l as any).rotation as number | undefined) ?? 0;
    if (typeof lx !== "number" || typeof ly !== "number" || typeof lw !== "number" || typeof lh !== "number") continue;
    const rad = -rot * Math.PI / 180;
    const dx = pt.x - lx;
    const dy = pt.y - ly;
    const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
    const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
    if (localX >= 0 && localX <= lw && localY >= 0 && localY <= lh) {
      return l.id;
    }
  }
  return null;
}

function isWheelZoomableFrame(layer: FrameLayer): boolean {
  const collageMeta = layer.metadata["collageFrame"] as { slotType?: string } | undefined;
  return collageMeta?.slotType !== "empty" && layer.imageAssetId !== undefined && layer.lockedContent !== true;
}

function isRenderableLayer(layer: VisualLayer): boolean {
  return VISUAL_LAYER_TYPES.has(layer.type) && layer.type !== "adjustment-layer";
}

/** A frame that carries a non-rect shape or an alpha mask — a valid drop target for text fill. */
function isShapeMaskFrame(frame: FrameLayer): boolean {
  if (frame.shape !== "rect") return true;
  if (frame.maskSource !== undefined) return true;
  return isMaskFrameLayer(frame);
}

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
  hoveredLayerId?: string | null;
  layoutEditMode: boolean;
  onSelectLayer: (layerId: string | null) => void;
  onSelectLayers: (layerIds: string[]) => void;
  onLayerChange: (layer: VisualLayer) => void;
  editingLayerId: string | null;
  onBeginTextEdit: (layerId: string) => void;
  onEndTextEdit: () => void;
  onImageDoubleClick?: (layerId: string) => void;
  onLayerContextMenu?: (target: CanvasContextMenuTarget) => void;
  stageRef: React.RefObject<Konva.Stage | null>;
  onMaskPainted?: (layerId: string, maskDataUrl: string, width: number, height: number) => void;
  passportGuidelinesEnabled?: boolean;
  collageLayoutRule?: CollageRule | null;
  onUpdateCollageSlots?: (newSlots: CollageSlot[]) => void;
}

export function CanvasStage({
  page,
  assets,
  selectedLayerId,
  selectedLayerIds,
  hoveredLayerId,
  layoutEditMode,
  onSelectLayer,
  onSelectLayers,
  onLayerChange,
  editingLayerId,
  onBeginTextEdit,
  onEndTextEdit,
  onImageDoubleClick,
  onLayerContextMenu,
  stageRef,
  onMaskPainted,
  passportGuidelinesEnabled = false,
  collageLayoutRule = null,
  onUpdateCollageSlots
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

  function selectLayerFromCanvas(layerId: string, additive = false): void {
    if (!additive) {
      onSelectLayer(layerId);
      return;
    }
    const next = selectedLayerIds.includes(layerId)
      ? selectedLayerIds.filter((id) => id !== layerId)
      : [...selectedLayerIds, layerId];
    onSelectLayers(next);
  }

  useEffect(() => {
    const cleanupMount = trackDebugMount("CanvasStage", { pageId: page.id });
    return () => {
      markDebugEvent("canvas-stage:page-cleanup", {
        pageId: page.id,
        layerCount: page.layers.length
      });
      cleanupMount();
    };
  }, [page.id]);

  useEffect(() => registerKonvaStage(() => stageRef.current, page.id), [page.id, stageRef]);

  // ── Drawing tools (no-selection global tools) ─────────────────────────────
  const drawingTool = useDrawingToolsStore((s) => s.activeTool);
  const setDrawingTool = useDrawingToolsStore((s) => s.setActiveTool);
  const sampleColorToStore = useColorStore((s) => s.sampleColor);
  const [eyedropperPreview, setEyedropperPreview] = useState<{ x: number; y: number; hex: string } | null>(null);
  const eyedropperRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (drawingTool !== "eyedropper") setEyedropperPreview(null);
    if (drawingTool !== "brush") setBrushPreviewPath(null);
    if (drawingTool !== "shape") setShapeDragRect(null);
    if (drawingTool !== "lasso") setLassoPreviewPoints(null);
  }, [drawingTool]);

  function sampleColorAtStagePoint(): string | null {
    const stage = stageRef.current;
    if (stage === null) return null;
    const raw = stage.getPointerPosition();
    if (raw === null) return null;
    try {
      const cnv = stage.toCanvas({ x: raw.x, y: raw.y, width: 1, height: 1, pixelRatio: 1 });
      const ctx = cnv.getContext("2d");
      if (ctx === null) return null;
      const data = ctx.getImageData(0, 0, 1, 1).data;
      return rgbaToHex(data[0] ?? 0, data[1] ?? 0, data[2] ?? 0);
    } catch {
      return null;
    }
  }

  function scheduleEyedropperPreview(): void {
    if (eyedropperRafRef.current !== null) return;
    eyedropperRafRef.current = requestAnimationFrame(() => {
      eyedropperRafRef.current = null;
      const stage = stageRef.current;
      if (stage === null) return;
      const raw = stage.getPointerPosition();
      const hex = sampleColorAtStagePoint();
      if (raw !== null && hex !== null) {
        setEyedropperPreview({ x: raw.x, y: raw.y, hex });
      }
    });
  }

  // ── Paint Bucket ──────────────────────────────────────────────────────────
  const updatePage = useDocumentStore((s) => s.updatePage);
  const addLayerToDoc = useDocumentStore((s) => s.addLayer);
  const attachTextToFrame = useDocumentStore((s) => s.attachTextToFrame);
  const detachTextFromFrame = useDocumentStore((s) => s.detachTextFromFrame);

  // ── Free-hand Brush stroke recording (no-selection tool) ───────────────────
  const brushPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const [brushPreviewPath, setBrushPreviewPath] = useState<string | null>(null);
  function brushSvgPathFromPoints(points: Array<{ x: number; y: number }>, offsetX: number, offsetY: number): string {
    if (points.length === 0) return "";
    let d = `M ${(points[0]!.x - offsetX).toFixed(2)} ${(points[0]!.y - offsetY).toFixed(2)}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L ${(points[i]!.x - offsetX).toFixed(2)} ${(points[i]!.y - offsetY).toFixed(2)}`;
    }
    return d;
  }
  // ── Lasso (free-hand polygon selection) ────────────────────────────────────
  const lassoPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const [lassoPreviewPoints, setLassoPreviewPoints] = useState<number[] | null>(null);
  function pointInPolygon(px: number, py: number, poly: Array<{ x: number; y: number }>): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i]!.x, yi = poly[i]!.y;
      const xj = poly[j]!.x, yj = poly[j]!.y;
      const intersect = ((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
  function commitLassoSelection(): void {
    const points = lassoPointsRef.current;
    lassoPointsRef.current = [];
    setLassoPreviewPoints(null);
    if (points.length < 3) return;
    const selectedIds: string[] = [];
    for (const layer of page.layers) {
      if (layer.visible === false) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const a = layer as any;
      if (typeof a.x !== "number" || typeof a.y !== "number" || typeof a.width !== "number" || typeof a.height !== "number") continue;
      const cx = a.x + a.width / 2;
      const cy = a.y + a.height / 2;
      if (pointInPolygon(cx, cy, points)) selectedIds.push(layer.id);
    }
    if (selectedIds.length > 0) onSelectLayers(selectedIds);
  }

  // ── Shape tool drag-to-draw ────────────────────────────────────────────────
  const shapeDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [shapeDragRect, setShapeDragRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  function heartPathData(w: number, h: number): string {
    // Heart path inscribed in [0,0]..[w,h]
    const cx = w / 2;
    const top = h * 0.28;
    return [
      `M ${cx} ${h}`,
      `C ${-w * 0.05} ${h * 0.55}, ${w * 0.05} ${top - h * 0.15}, ${cx} ${top}`,
      `C ${w * 0.95} ${top - h * 0.15}, ${w * 1.05} ${h * 0.55}, ${cx} ${h}`,
      "Z"
    ].join(" ");
  }
  function arrowPathData(w: number, h: number): string {
    // Horizontal arrow inscribed in [0,0]..[w,h]
    const shaftH = h * 0.35;
    const headW = Math.min(w * 0.3, h);
    const y0 = (h - shaftH) / 2;
    const y1 = y0 + shaftH;
    return [
      `M 0 ${y0}`,
      `L ${w - headW} ${y0}`,
      `L ${w - headW} 0`,
      `L ${w} ${h / 2}`,
      `L ${w - headW} ${h}`,
      `L ${w - headW} ${y1}`,
      `L 0 ${y1}`,
      "Z"
    ].join(" ");
  }
  function commitShapeDraw(rawRect: { x: number; y: number; width: number; height: number }): void {
    const { shapeKind } = useDrawingToolsStore.getState();
    const color = useColorStore.getState().currentColor;
    const x = Math.min(rawRect.x, rawRect.x + rawRect.width);
    const y = Math.min(rawRect.y, rawRect.y + rawRect.height);
    const width = Math.max(2, Math.abs(rawRect.width));
    const height = Math.max(2, Math.abs(rawRect.height));
    const baseShape: ShapeLayer["shape"] = shapeKind === "heart" || shapeKind === "arrow" ? "svgPath" : shapeKind;
    const base = createShapeLayer({ shape: baseShape, rect: { x, y, width, height }, name: "צורה" });
    let pathData: string | undefined;
    if (shapeKind === "heart") pathData = heartPathData(width, height);
    else if (shapeKind === "arrow") pathData = arrowPathData(width, height);
    else if (shapeKind === "line") pathData = `0,${height / 2} ${width},${height / 2}`;
    const layer: VisualLayer = {
      ...base,
      zIndex: page.layers.length,
      pathData,
      fill: shapeKind === "line" ? undefined : { version: 1, color, opacity: 1 },
      stroke: shapeKind === "line"
        ? { version: 1, color, width: 3, opacity: 1 }
        : undefined
    };
    addLayerToDoc(page.id, layer);
    onSelectLayer(layer.id);
  }

  function commitBrushStroke(): void {
    const points = brushPointsRef.current;
    brushPointsRef.current = [];
    setBrushPreviewPath(null);
    if (points.length < 2) return;
    const { brushSize, brushOpacity } = useDrawingToolsStore.getState();
    const color = useColorStore.getState().currentColor;
    const pad = brushSize / 2 + 2;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const x = minX - pad;
    const y = minY - pad;
    const width = Math.max(1, maxX - minX + pad * 2);
    const height = Math.max(1, maxY - minY + pad * 2);
    const base = createShapeLayer({
      shape: "svgPath",
      rect: { x, y, width, height },
      name: "ציור"
    });
    const layer: VisualLayer = {
      ...base,
      zIndex: page.layers.length,
      pathData: brushSvgPathFromPoints(points, x, y),
      fill: undefined,
      stroke: { version: 1, color, width: brushSize, opacity: brushOpacity / 100 }
    };
    addLayerToDoc(page.id, layer);
    onSelectLayer(layer.id);
  }
  function applyBucketFill(canvasPoint: { x: number; y: number }): "ok" | "image-unsupported" | "noop" {
    const color = useColorStore.getState().currentColor;
    const hitId = findTopmostLayerAtPoint(page.layers, canvasPoint);
    if (hitId === null) {
      // No layer under cursor → fill page background
      updatePage({ ...page, background: { ...page.background, type: "color", color } });
      return "ok";
    }
    const layer = page.layers.find((l) => l.id === hitId);
    if (layer === undefined) return "noop";
    if (layer.type === "shape") {
      const existingFill = layer.fill;
      const nextFill = existingFill !== undefined
        ? { ...existingFill, color }
        : { version: 1 as const, color, opacity: 1 };
      onLayerChange({ ...layer, fill: nextFill });
      return "ok";
    }
    if (layer.type === "text") {
      onLayerChange({ ...layer, color });
      return "ok";
    }
    if (layer.type === "image" || layer.type === "frame") {
      // Destructive image painting deferred — see plans/serialized-herding-petal.md
      return "image-unsupported";
    }
    return "noop";
  }

  // ── Image edit mode state ────────────────────────────────────────────────────
  const imageEditStore = useImageEditStore();
  const { imageEditMode, editingLayerId: imageEditLayerId, activeTool: imageActiveTool } = imageEditStore;
  const eraserCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isPaintingRef = useRef(false);
  const lastPaintPosRef = useRef<{ x: number; y: number } | null>(null);
  const [selectionCanvas, setSelectionCanvas] = useState<HTMLCanvasElement | null>(null);
  const [selectionBrushPreviewCanvas, setSelectionBrushPreviewCanvas] = useState<HTMLCanvasElement | null>(null);
  const [whiteBgPreviewCanvas, setWhiteBgPreviewCanvas] = useState<HTMLCanvasElement | null>(null);
  const [eraserCursorPos, setEraserCursorPos] = useState<{ x: number; y: number } | null>(null);
  const rectStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    markDebugEvent("canvas-stage:page-active", {
      pageId: page.id,
      layerCount: page.layers.length,
      selectedLayerIds,
      imageEditMode,
      imageEditLayerId
    });
  }, [imageEditLayerId, imageEditMode, page.id, page.layers.length, selectedLayerIds]);

  useEffect(() => {
    if (imageEditStore.selectionMask === null || (imageActiveTool !== "wand" && imageActiveTool !== "rect-select" && imageActiveTool !== "smart-select" && imageActiveTool !== "brush-select")) {
      setSelectionCanvas(null);
      return;
    }
    setSelectionCanvas(createSelectionOverlayCanvas(imageEditStore.selectionMask.data, imageEditStore.selectionMask.width, imageEditStore.selectionMask.height));
  }, [imageEditStore.selectionMask, imageActiveTool]);

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
  const passportGuidelineFrames = useMemo(
    () => passportGuidelinesEnabled
      ? page.layers.filter((layer): layer is FrameLayer => isPhotoPrintSlotLayer(layer) && layer.contentType === "image")
      : [],
    [page.layers, passportGuidelinesEnabled]
  );
  const performanceSettings = useAppSettings((state) => state.settings.performance);
  const effectivePerformance = useMemo(
    () => resolveEffectivePerformanceSettings(performanceSettings),
    [performanceSettings]
  );
  // `reduceEffectsDuringInteraction` is a policy/setting — it only applies during
  // an actual drag or transform. Without gating on transient interaction state,
  // having the setting enabled would keep image filters off forever, so sliders
  // (brightness/contrast/grayscale/etc) would never visibly affect the canvas.
  const [isInteracting, setIsInteracting] = useState(false);
  const reduceImageEffects = isInteracting && effectivePerformance.reduceEffectsDuringInteraction;
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
    try {
      const nonTransformableIds = new Set(
        page.layers
          .filter((l) =>
            l.locked ||
            (l.type === "frame" && (
              l.metadata["gridCell"] !== undefined ||
              l.metadata["maskFrame"] !== undefined ||
              l.metadata["collageFrame"] !== undefined ||
              (l.behaviorMode === "layoutLocked" && !layoutEditMode)
            ))
          )
          .map((l) => l.id)
      );
      const nodes = selectedLayerIds
        .filter((layerId) => !nonTransformableIds.has(layerId))
        .map((layerId) => stage.findOne(`#${layerId}`))
        .filter((node): node is Konva.Node => node !== undefined && node.getStage() !== null);
      transformer.nodes(nodes);
      transformer.getLayer()?.batchDraw();
      if (nodes.length > 0) {
        setRotateHandlePos(calculateRotateHandlePosition(transformer, page.height));
      } else {
        setRotateHandlePos(null);
      }
    } catch (error) {
      markDebugEvent("konva-transformer:error", {
        pageId: page.id,
        selectedLayerIds,
        message: error instanceof Error ? error.message : String(error)
      });
      transformer.nodes([]);
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
    try {
      const node = event.target;
      const layerId = node.id();
      if (layerId === "") return; // content-inside-frame drag or non-layer node

      const layer = page.layers.find((l) => l.id === layerId);
      if (layer === undefined) return;
      if (isGridCellLayer(layer)) return;
      if (isMaskFrameLayer(layer as VisualLayer)) {
        if (((layer as unknown as { lockedFrame?: boolean }).lockedFrame ?? false)) return;
      }
      if (isPhotoPrintSlotLayer(layer)) return;

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
    } catch (error) {
      console.error("[CanvasStage] handleStageDragMove failed:", error);
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
    try {
      const layer = page.layers.find((item) => item.id === node.id());
      if (layer === undefined) return;
      if (isGridCellLayer(layer)) return;
      if (isMaskFrameLayer(layer as VisualLayer)) {
        if (((layer as unknown as { lockedFrame?: boolean }).lockedFrame ?? false)) return;
      }
      if (isPhotoPrintSlotLayer(layer)) return;

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
    } catch (error) {
      console.error("[CanvasStage] handleTransformerTransform failed:", error);
      scheduleGuideUpdate([]);
    }
  }

  // ── Layer change callback (called from KonvaLayerNode onDragEnd / onTransformEnd) ──
  function handleLayerChange(layer: VisualLayer): void {
    // Position is already snapped by handleStageDragMove; just commit.
    // For transform-end (resize), we still snap the position component.
    const previous = page.layers.find((item) => item.id === layer.id);

    // Drag a free text layer into an existing mask/shape frame → auto-attach as its content.
    // No new "text mask" is created: the existing mask keeps acting as the visual clip and the
    // text flows inside it (fitInsideShape). Dragging back out detaches it.
    if (layer.type === "text" && previous !== undefined && previous.type === "text") {
      const textMoved = previous.x !== layer.x || previous.y !== layer.y;
      if (textMoved) {
        const cx = layer.x + layer.width / 2;
        const cy = layer.y + layer.height / 2;
        // A mask/shape frame with no text yet accepts the dropped text. If it already holds an
        // image the frame becomes "mixed" (image behind + text in front).
        const targetFrame = page.layers.find(
          (item): item is FrameLayer =>
            item.type === "frame" &&
            isShapeMaskFrame(item) &&
            item.textLayerId === undefined &&
            cx >= item.x &&
            cx <= item.x + item.width &&
            cy >= item.y &&
            cy <= item.y + item.height
        );
        if (targetFrame !== undefined) {
          onLayerChange(layer);
          attachTextToFrame(page.id, targetFrame.id, layer.id);
          return;
        }
        if (typeof previous.parentFrameId === "string") {
          const stillInside = page.layers.some(
            (item) =>
              item.id === previous.parentFrameId &&
              cx >= item.x &&
              cx <= item.x + item.width &&
              cy >= item.y &&
              cy <= item.y + item.height
          );
          if (!stillInside) {
            onLayerChange(layer);
            detachTextFromFrame(page.id, previous.parentFrameId);
            return;
          }
        }
      }
    }

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
      const wasLocked = previous.lockedFrame ?? false;
      if (wasLocked) {
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
      } else {
        onLayerChange({ ...layer, lockedFrame: false });
      }
      return;
    }
    if (previous !== undefined && isPhotoPrintSlotLayer(previous) && layer.type === "frame" && !layoutEditMode) {
      onLayerChange({
        ...layer,
        x: previous.x,
        y: previous.y,
        width: previous.width,
        height: previous.height,
        rotation: previous.rotation,
        behaviorMode: "layoutLocked"
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

  function handleCanvasWheel(event: React.WheelEvent<HTMLDivElement>): void {
    // Selected image/frame → wheel zooms the image content (unchanged behavior).
    const selected = selectedLayerId !== null ? page.layers.find((layer) => layer.id === selectedLayerId) : undefined;
    if (selected?.type === "frame" && isWheelZoomableFrame(selected)) {
      event.preventDefault();
      const asset = assets.find((item) => item.id === selected.imageAssetId);
      const sourceSize = getEffectiveSourceSize(asset, asset?.width ?? selected.width, asset?.height ?? selected.height);
      const factor = event.deltaY < 0 ? 1.08 : 1 / 1.08;
      const nextScale = Math.max(0.5, Math.min(8, selected.contentTransform.scale * factor));
      const contentTransform = clampContentTransformToFillBounds(
        { ...selected.contentTransform, scale: nextScale },
        selected.width,
        selected.height,
        sourceSize.width,
        sourceSize.height,
        selected.fitMode,
        selected.padding
      );
      handleLayerChange({ ...selected, contentTransform });
      return;
    }

    // Ctrl/⌘ + wheel → zoom the canvas viewport.
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const direction = event.deltaY > 0 ? 1 / 1.08 : 1.08;
      viewport.setZoom(viewport.zoom * direction);
      return;
    }

    // Plain wheel → fall through; the browser scrolls the .canvas-area ancestor.
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

  // ── Selection brush (paints onto the selection mask inside image-edit) ─────
  const selectionBrushCanvasRef = useRef<HTMLCanvasElement | null>(null);
  function paintSelectionBrushStroke(x: number, y: number, prevX: number | null, prevY: number | null): void {
    const layer = getEditingImageLayer();
    if (layer === null) return;
    const cnv = selectionBrushCanvasRef.current;
    if (cnv === null) return;
    const ctx = cnv.getContext("2d");
    if (ctx === null) return;
    const w = Math.max(1, Math.round(layer.width));
    const h = Math.max(1, Math.round(layer.height));
    const sx = w / Math.max(1, layer.width);
    const sy = h / Math.max(1, layer.height);
    const lx = (x - layer.x) * sx;
    const ly = (y - layer.y) * sy;
    const plx = prevX !== null ? (prevX - layer.x) * sx : lx;
    const ply = prevY !== null ? (prevY - layer.y) * sy : ly;
    const r = Math.max(1, (imageEditStore.selectionBrushSize / 2) * Math.max(sx, sy));
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#ffffff";
    if (prevX !== null && prevY !== null) {
      const steps = Math.max(1, Math.ceil(Math.hypot(lx - plx, ly - ply) / Math.max(1, r * 0.3)));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const cx = plx + (lx - plx) * t;
        const cy = ply + (ly - ply) * t;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.beginPath();
      ctx.arc(lx, ly, r, 0, Math.PI * 2);
      ctx.fill();
    }
    setSelectionBrushPreviewCanvas(createSelectionOverlayCanvas(alphaFromCanvas(cnv), w, h, imageEditStore.selectionBrushMode === "subtract" ? "subtract" : "add"));
  }
  function commitSelectionBrushStroke(): void {
    const layer = getEditingImageLayer();
    const cnv = selectionBrushCanvasRef.current;
    if (layer === null || cnv === null) return;
    const ctx = cnv.getContext("2d");
    if (ctx === null) return;
    const w = Math.max(1, Math.round(layer.width));
    const h = Math.max(1, Math.round(layer.height));
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = new Uint8Array(w * h);
    let any = false;
    for (let i = 0; i < data.length; i++) {
      const a = imageData.data[i * 4 + 3] ?? 0;
      data[i] = a > 32 ? 255 : 0;
      if (data[i] > 0) any = true;
    }
    if (!any) return;
    const mask = { data, width: w, height: h };
    if (imageEditStore.selectionBrushMode === "subtract") {
      imageEditStore.subtractFromSelectionMask(mask);
    } else {
      imageEditStore.addToSelectionMask(mask);
    }
    // clear stroke buffer for next stroke
    ctx.clearRect(0, 0, w, h);
    setSelectionBrushPreviewCanvas(null);
  }

  // Initialize selection-brush canvas when entering brush-select mode
  useEffect(() => {
    if (!imageEditMode || imageActiveTool !== "brush-select") {
      selectionBrushCanvasRef.current = null;
      setSelectionBrushPreviewCanvas(null);
      return;
    }
    const layer = getEditingImageLayer();
    if (layer === null) return;
    const cnv = window.document.createElement("canvas");
    cnv.width = Math.max(1, Math.round(layer.width));
    cnv.height = Math.max(1, Math.round(layer.height));
    selectionBrushCanvasRef.current = cnv;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageEditMode, imageActiveTool, imageEditLayerId]);

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

  useEffect(() => {
    if (!imageEditMode || imageActiveTool !== "white-bg") {
      setWhiteBgPreviewCanvas(null);
      return;
    }
    const layer = getEditingImageLayer();
    if (layer === null) {
      setWhiteBgPreviewCanvas(null);
      return;
    }
    const asset = assets.find((item) => item.id === layer.assetId);
    const source = resolveCanvasAssetPath(asset);
    if (source === undefined) {
      setWhiteBgPreviewCanvas(null);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const width = Math.max(1, Math.round(layer.width));
      const height = Math.max(1, Math.round(layer.height));
      const sample = window.document.createElement("canvas");
      sample.width = width;
      sample.height = height;
      const sampleCtx = sample.getContext("2d");
      if (sampleCtx === null) return;

      const crop = layer.crop;
      const sourceWidth = img.naturalWidth || img.width;
      const sourceHeight = img.naturalHeight || img.height;
      sampleCtx.drawImage(
        img,
        crop.x * sourceWidth,
        crop.y * sourceHeight,
        crop.width * sourceWidth,
        crop.height * sourceHeight,
        0,
        0,
        width,
        height
      );

      const imageData = sampleCtx.getImageData(0, 0, width, height);
      const overlay = window.document.createElement("canvas");
      overlay.width = width;
      overlay.height = height;
      const overlayCtx = overlay.getContext("2d");
      if (overlayCtx === null) return;
      const preview = overlayCtx.createImageData(width, height);
      const cutoff = 255 - imageEditStore.whiteBackgroundThreshold * 2.55;
      const sourceData = imageData.data;
      const previewData = preview.data;
      for (let i = 0; i < sourceData.length; i += 4) {
        if (
          sourceData[i + 3] > 0 &&
          sourceData[i] >= cutoff &&
          sourceData[i + 1] >= cutoff &&
          sourceData[i + 2] >= cutoff
        ) {
          previewData[i] = 255;
          previewData[i + 1] = 56;
          previewData[i + 2] = 120;
          previewData[i + 3] = 135;
        }
      }
      overlayCtx.putImageData(preview, 0, 0);
      setWhiteBgPreviewCanvas(overlay);
    };
    img.onerror = () => {
      if (!cancelled) setWhiteBgPreviewCanvas(null);
    };
    img.src = source;

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageEditMode, imageActiveTool, imageEditLayerId, imageEditStore.whiteBackgroundThreshold, assets]);

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

    imageEditStore.addToSelectionMask({ data: mask, width, height });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageEditLayerId, imageEditStore.wandTolerance, imageEditStore.wandContiguous, scale, stageWidth, stageHeight]);

  async function handleSmartSelectionPrompt(prompt: SmartSelectionPrompt): Promise<void> {
    const layer = getEditingImageLayer();
    if (layer === null) return;
    const asset = assets.find((item) => item.id === layer.assetId);
    if (asset === undefined) return;
    const input = makeSmartSelectionInput(asset, layer);
    if (input === null) {
      imageEditStore.setSmartSelectionStatus("error", "Smart selection cannot read this image");
      return;
    }
    const prompts = [...imageEditStore.smartSelectionPrompts, prompt];
    imageEditStore.addSmartSelectionPrompt(prompt);
    imageEditStore.setSmartSelectionStatus("working", "Updating smart selection...");
    imageEditStore.setSmartSelectionProgress({ phase: "predict", message: "Updating smart selection...", percent: null });
    try {
      const result = await runSmartPromptSelection({ ...input, prompts });
      if (result === null) {
        imageEditStore.setSmartSelectionStatus("error", "Smart selection is unavailable");
        imageEditStore.setSmartSelectionProgress(null);
        return;
      }
      const mask = await maskResultToSelectionMask(result, input.sourceHash);
      if (imageEditStore.smartSelectionMode === "add") {
        imageEditStore.addToSelectionMask(mask);
      } else {
        imageEditStore.setSelectionMask(mask);
      }
      imageEditStore.setSmartSelectionStatus(result.fallback ? "fallback" : "ready", result.message ?? "Smart selection ready");
      imageEditStore.setSmartSelectionProgress(null);
    } catch (error) {
      imageEditStore.setSmartSelectionStatus("error", error instanceof Error ? error.message : "Smart selection failed");
      imageEditStore.setSmartSelectionProgress(null);
    }
  }

  return (
    <div
      className="canvas-frame"
      data-testid="canvas-frame"
      style={{
        transform: `translate(${viewport.panX}px, ${viewport.panY}px)`,
        cursor:
          drawingTool === "eyedropper" ? "crosshair"
          : drawingTool === "bucket" ? "crosshair"
          : drawingTool === "brush" ? "crosshair"
          : drawingTool === "shape" ? "crosshair"
          : drawingTool === "marquee" ? "crosshair"
          : drawingTool === "lasso" ? "crosshair"
          : undefined
      }}
      onWheel={handleCanvasWheel}
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
        onDragStart={() => setIsInteracting(true)}
        onDragMove={handleStageDragMove}
        onDragEnd={() => {
          setIsInteracting(false);
          handleStageDragEnd();
        }}
        onMouseDown={(event) => {
          if (event.evt.button === 1) {
            event.evt.preventDefault();
            panStartRef.current = { x: event.evt.clientX, y: event.evt.clientY };
            inputStateRef.current = beginPointer(inputStateRef.current, panStartRef.current, event.evt.button);
            return;
          }
          // Eyedropper: sample pixel at pointer (highest priority, works regardless of selection)
          if (drawingTool === "eyedropper") {
            event.evt.preventDefault();
            const hex = sampleColorAtStagePoint();
            if (hex !== null) {
              sampleColorToStore(hex);
            }
            if (!event.evt.altKey) {
              setDrawingTool(null);
            }
            return;
          }
          // Paint Bucket: fill the layer under the cursor (or page background if empty)
          if (drawingTool === "bucket") {
            event.evt.preventDefault();
            const pointer = getPointerPosition();
            if (pointer !== null) {
              applyBucketFill(pointer);
            }
            return;
          }
          // Brush: start recording free-hand stroke (creates a new shape layer on mouseup)
          if (drawingTool === "brush") {
            event.evt.preventDefault();
            const pointer = getPointerPosition();
            if (pointer !== null) {
              brushPointsRef.current = [pointer];
              isPaintingRef.current = true;
              setBrushPreviewPath(`M ${pointer.x.toFixed(2)} ${pointer.y.toFixed(2)}`);
            }
            return;
          }
          // Shape tool: start drag-to-draw
          if (drawingTool === "shape") {
            event.evt.preventDefault();
            const pointer = getPointerPosition();
            if (pointer !== null) {
              shapeDragStartRef.current = pointer;
              setShapeDragRect({ x: pointer.x, y: pointer.y, width: 0, height: 0 });
            }
            return;
          }
          // Marquee tool: drag to select layers in region (force-trigger marquee logic)
          if (drawingTool === "marquee") {
            event.evt.preventDefault();
            const pointer = getPointerPosition();
            if (pointer !== null) {
              marqueeStartRef.current = pointer;
              setMarqueeRect({ ...pointer, width: 0, height: 0 });
            }
            return;
          }
          // Lasso tool: start free-hand polygon
          if (drawingTool === "lasso") {
            event.evt.preventDefault();
            const pointer = getPointerPosition();
            if (pointer !== null) {
              lassoPointsRef.current = [pointer];
              isPaintingRef.current = true;
              setLassoPreviewPoints([pointer.x, pointer.y]);
            }
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
          // Selection brush: start painting stroke onto temp mask buffer
          if (imageEditMode && imageActiveTool === "brush-select") {
            isPaintingRef.current = true;
            const pointer = getPointerPosition();
            if (pointer !== null) {
              paintSelectionBrushStroke(pointer.x, pointer.y, null, null);
              lastPaintPosRef.current = pointer;
              setEraserCursorPos(pointer);
            }
            return;
          }
          // Wand/rect-select/smart-select: handled on mouse up
          if (imageEditMode && imageActiveTool === "wand") return;
          // Rect-select and smart-select box prompt: start drag
          if (imageEditMode && (imageActiveTool === "rect-select" || imageActiveTool === "smart-select")) {
            const pointer = getPointerPosition();
            if (pointer !== null) rectStartRef.current = pointer;
            return;
          }
          if (event.target === event.target.getStage()) {
            const pointer = getPointerPosition();
            // Alt+Click bypass: select topmost layer at point, including locked ones
            if (event.evt.altKey && pointer !== null) {
              const hit = findTopmostLayerAtPoint(page.layers, pointer);
              if (hit !== null) {
                onSelectLayer(hit);
                return;
              }
            }
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
          // Eyedropper: live preview swatch follows pointer
          if (drawingTool === "eyedropper") {
            scheduleEyedropperPreview();
            return;
          }
          // Marquee tool: update marquee rect during drag
          if (drawingTool === "marquee" && marqueeStartRef.current !== null) {
            const pointer = getPointerPosition();
            if (pointer !== null) {
              setMarqueeRect(normalizeRect(marqueeStartRef.current, pointer));
            }
            return;
          }
          // Lasso tool: append points
          if (drawingTool === "lasso" && isPaintingRef.current) {
            const pointer = getPointerPosition();
            if (pointer !== null) {
              const points = lassoPointsRef.current;
              const last = points[points.length - 1];
              if (last === undefined || Math.hypot(pointer.x - last.x, pointer.y - last.y) >= 2) {
                points.push(pointer);
                const flat: number[] = [];
                for (const p of points) { flat.push(p.x, p.y); }
                setLassoPreviewPoints(flat);
              }
            }
            return;
          }
          // Shape drag: update preview rect
          if ((drawingTool === "shape") && shapeDragStartRef.current !== null) {
            const pointer = getPointerPosition();
            if (pointer !== null) {
              const s = shapeDragStartRef.current;
              setShapeDragRect({ x: s.x, y: s.y, width: pointer.x - s.x, height: pointer.y - s.y });
            }
            return;
          }
          // Brush: extend stroke
          if (drawingTool === "brush" && isPaintingRef.current) {
            const pointer = getPointerPosition();
            if (pointer !== null) {
              const points = brushPointsRef.current;
              const last = points[points.length - 1];
              if (last === undefined || Math.hypot(pointer.x - last.x, pointer.y - last.y) >= 1.5) {
                points.push(pointer);
                let d = `M ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`;
                for (let i = 1; i < points.length; i++) d += ` L ${points[i]!.x.toFixed(2)} ${points[i]!.y.toFixed(2)}`;
                setBrushPreviewPath(d);
              }
            }
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
          // Selection brush: paint into temp mask buffer
          if (imageEditMode && imageActiveTool === "brush-select") {
            const pointer = getPointerPosition();
            if (pointer !== null) setEraserCursorPos(pointer);
            if (isPaintingRef.current && pointer !== null) {
              const prev = lastPaintPosRef.current;
              paintSelectionBrushStroke(pointer.x, pointer.y, prev?.x ?? null, prev?.y ?? null);
              lastPaintPosRef.current = pointer;
            }
            return;
          }
          // Rect-select and smart-select box prompt: update preview
          if (imageEditMode && (imageActiveTool === "rect-select" || imageActiveTool === "smart-select") && rectStartRef.current !== null) {
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
        onMouseUp={(event) => {
          // Eraser mode: commit stroke
          if (imageEditMode && imageActiveTool === "eraser") {
            if (isPaintingRef.current) {
              isPaintingRef.current = false;
              lastPaintPosRef.current = null;
              commitEraserStroke();
            }
            return;
          }
          // Selection brush: commit stroke to mask
          if (imageEditMode && imageActiveTool === "brush-select") {
            if (isPaintingRef.current) {
              isPaintingRef.current = false;
              lastPaintPosRef.current = null;
              commitSelectionBrushStroke();
            }
            return;
          }
          // Brush: commit stroke as new shape layer
          if (drawingTool === "brush") {
            if (isPaintingRef.current) {
              isPaintingRef.current = false;
              commitBrushStroke();
            }
            return;
          }
          // Marquee tool: commit marquee selection
          if (drawingTool === "marquee" && marqueeStartRef.current !== null) {
            finishMarqueeSelection();
            return;
          }
          // Lasso tool: commit polygon selection
          if (drawingTool === "lasso" && isPaintingRef.current) {
            isPaintingRef.current = false;
            commitLassoSelection();
            return;
          }
          // Shape: commit drawn rect as new shape layer
          if ((drawingTool === "shape") && shapeDragStartRef.current !== null) {
            const rect = shapeDragRect;
            shapeDragStartRef.current = null;
            setShapeDragRect(null);
            if (rect !== null && (Math.abs(rect.width) >= 3 || Math.abs(rect.height) >= 3)) {
              commitShapeDraw(rect);
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
          // Smart-select: click points or drag box prompts feed the sidecar and update selectionMask
          if (imageEditMode && imageActiveTool === "smart-select") {
            const preview = imageEditStore.rectSelectPreview;
            const editLayer = getEditingImageLayer();
            const pointer = getPointerPosition();
            if (editLayer !== null) {
              const lx = editLayer.x, ly = editLayer.y, lw = editLayer.width, lh = editLayer.height;
              let prompt: SmartSelectionPrompt | null = null;
              if (preview !== null && preview.width > 2 && preview.height > 2) {
                prompt = {
                  type: "box",
                  x: Math.max(0, Math.min(1, (preview.x - lx) / lw)),
                  y: Math.max(0, Math.min(1, (preview.y - ly) / lh)),
                  width: Math.max(0, Math.min(1, preview.width / lw)),
                  height: Math.max(0, Math.min(1, preview.height / lh))
                };
              } else if (pointer !== null) {
                const negative = imageEditStore.smartSelectionMode === "remove" || event.evt.altKey || event.evt.button === 2;
                prompt = {
                  type: "point",
                  x: Math.max(0, Math.min(1, (pointer.x - lx) / lw)),
                  y: Math.max(0, Math.min(1, (pointer.y - ly) / lh)),
                  label: negative ? "negative" : "positive"
                };
              }
              if (prompt !== null) void handleSmartSelectionPrompt(prompt);
            }
            rectStartRef.current = null;
            imageEditStore.setRectSelectPreview(null);
            return;
          }
          // Rect-select: finalize selection
          if (imageEditMode && imageActiveTool === "rect-select") {
            const preview = imageEditStore.rectSelectPreview;
            const editLayer = getEditingImageLayer();
            if (preview !== null && editLayer !== null && preview.width > 2 && preview.height > 2) {
              const lx = editLayer.x, ly = editLayer.y, lw = editLayer.width, lh = editLayer.height;
              const w = Math.max(1, Math.round(lw));
              const h = Math.max(1, Math.round(lh));
              const mask = new Uint8Array(w * h);
              // pixels inside the rect → selected
              const rx0 = Math.max(0, Math.min(w, Math.round((preview.x - lx) / lw * w)));
              const ry0 = Math.max(0, Math.min(h, Math.round((preview.y - ly) / lh * h)));
              const rx1 = Math.max(0, Math.min(w, Math.round((preview.x + preview.width - lx) / lw * w)));
              const ry1 = Math.max(0, Math.min(h, Math.round((preview.y + preview.height - ly) / lh * h)));
              for (let py = 0; py < h; py++) {
                for (let px = 0; px < w; px++) {
                  if (px >= rx0 && px < rx1 && py >= ry0 && py < ry1) {
                    mask[py * w + px] = 255;
                  }
                }
              }
              imageEditStore.setSelectionMask({ data: mask, width: w, height: h });
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
          <Group clipFunc={(ctx: any) => { ctx.rect(0, 0, page.width, page.height); }} listening={drawingTool === null}>
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
          {(() => {
            const allLayers = [...page.layers].sort((a, b) => a.zIndex - b.zIndex);
            const groupMap = new Map(
              allLayers
                .filter((l) => l.type === "group")
                .map((l) => [l.id, l as import("@/types/layers").GroupLayer])
            );
            // Text layers that are a frame's content are drawn inside the frame's clip — skip
            // their standalone render to avoid a duplicate copy outside the mask.
            const frameTextLayerIds = new Set(
              allLayers
                .filter((l) => l.type === "frame" && (l.contentType === "text" || l.contentType === "mixed") && l.textLayerId !== undefined)
                .map((l) => (l as FrameLayer).textLayerId as string)
            );
            const renderLayers = allLayers.filter((layer) => {
              if (layer.type === "group") return false;
              if (layer.type === "text" && frameTextLayerIds.has(layer.id)) return false;
              if (layer.parentId !== undefined) {
                const parentGroup = groupMap.get(layer.parentId);
                if (parentGroup !== undefined && parentGroup.visible === false) return false;
              }
              return true;
            });
            return renderAdjustmentAwareLayers(
              renderLayers,
              page.width,
              page.height,
              (layer) => {
                const parentGroup = layer.parentId !== undefined ? groupMap.get(layer.parentId) : undefined;
                const effectiveLayer = parentGroup !== undefined && parentGroup.opacity < 0.999
                  ? { ...layer, opacity: layer.opacity * parentGroup.opacity }
                  : layer;
                return (
                  <KonvaLayerNode
                    assets={assets}
                    key={layer.id}
                    layer={effectiveLayer}
                    selected={selectedLayerIds.includes(layer.id)}
                    layoutEditMode={layoutEditMode}
                    reduceImageEffects={reduceImageEffects}
                    onBeginTextEdit={onBeginTextEdit}
                    onImageDoubleClick={onImageDoubleClick}
                    onChange={handleLayerChange}
                    onSelect={selectLayerFromCanvas}
                    onContextMenu={onLayerContextMenu}
                  />
                );
              }
            );
          })()}
          <PageLookOverlay pageLooks={page.pageLooks} width={page.width} height={page.height} />
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
          {brushPreviewPath !== null ? (
            <Path
              name={SCREEN_HELPER_NODE_NAME}
              data={brushPreviewPath}
              stroke={useColorStore.getState().currentColor}
              strokeWidth={useDrawingToolsStore.getState().brushSize}
              lineCap="round"
              lineJoin="round"
              listening={false}
              opacity={useDrawingToolsStore.getState().brushOpacity / 100}
            />
          ) : null}
          {lassoPreviewPoints !== null ? (
            <Line
              name={SCREEN_HELPER_NODE_NAME}
              points={lassoPreviewPoints}
              stroke="#7C6FE0"
              strokeWidth={1.5}
              dash={[6, 4]}
              listening={false}
              closed={false}
            />
          ) : null}
          {shapeDragRect !== null ? (() => {
            const r = shapeDragRect;
            const x = Math.min(r.x, r.x + r.width);
            const y = Math.min(r.y, r.y + r.height);
            const w = Math.max(1, Math.abs(r.width));
            const h = Math.max(1, Math.abs(r.height));
            return (
              <Rect
                name={SCREEN_HELPER_NODE_NAME}
                x={x} y={y} width={w} height={h}
                fill="rgba(124, 111, 224, 0.10)"
                stroke="#7C6FE0"
                strokeWidth={1.5}
                dash={[6, 4]}
                listening={false}
              />
            );
          })() : null}
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
          {passportGuidelinesEnabled ? (
            <PassportGuidelinesOverlay frames={passportGuidelineFrames} scale={scale} />
          ) : null}
          {layoutEditMode && collageLayoutRule !== null && onUpdateCollageSlots !== undefined ? (
            <CollageGridOverlay
              rule={collageLayoutRule}
              page={page}
              scale={scale}
              onUpdateSlots={onUpdateCollageSlots}
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
          {/* Hover highlight from LayerList panel */}
          {hoveredLayerId !== null && hoveredLayerId !== undefined && !selectedLayerIds.includes(hoveredLayerId) && (() => {
            const l = page.layers.find((x) => x.id === hoveredLayerId);
            if (l === undefined) return null;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const lx = (l as any).x as number; const ly = (l as any).y as number;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const lw = (l as any).width as number; const lh = (l as any).height as number;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rot = ((l as any).rotation as number | undefined) ?? 0;
            if (typeof lx !== "number" || typeof lw !== "number") return null;
            return (
              <Rect
                name={SCREEN_HELPER_NODE_NAME}
                x={lx}
                y={ly}
                width={lw}
                height={lh}
                rotation={rot}
                stroke="#4D9EF5"
                strokeWidth={1.5 / scale}
                dash={[5 / scale, 3 / scale]}
                fill="transparent"
                listening={false}
              />
            );
          })()}
          {/* Outline for selected locked layers (no Transformer attached) */}
          {selectedLayerIds.map((id) => {
            const l = page.layers.find((x) => x.id === id);
            if (l === undefined || !l.locked) return null;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const lx = (l as any).x as number; const ly = (l as any).y as number;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const lw = (l as any).width as number; const lh = (l as any).height as number;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rot = ((l as any).rotation as number | undefined) ?? 0;
            if (typeof lx !== "number" || typeof lw !== "number") return null;
            return (
              <Rect
                key={`locked-outline-${id}`}
                name={SCREEN_HELPER_NODE_NAME}
                x={lx}
                y={ly}
                width={lw}
                height={lh}
                rotation={rot}
                stroke="#8a8a8a"
                strokeWidth={1 / scale}
                dash={[6 / scale, 4 / scale]}
                fill="transparent"
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
            onTransformStart={() => setIsInteracting(true)}
            onTransform={handleTransformerTransform}
            onTransformEnd={() => {
              setIsInteracting(false);
              clearGuides();
            }}
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
                {/* White background removal preview */}
                {imageActiveTool === "white-bg" && whiteBgPreviewCanvas !== null && (
                  <KonvaImage
                    x={0} y={0}
                    width={lw}
                    height={lh}
                    image={whiteBgPreviewCanvas}
                    listening={false}
                  />
                )}
                {/* Selection overlay (wand / rect-select / smart-select / brush-select) */}
                {(imageActiveTool === "wand" || imageActiveTool === "rect-select" || imageActiveTool === "smart-select" || imageActiveTool === "brush-select") && selectionCanvas !== null && (
                  <KonvaImage
                    x={0} y={0}
                    width={lw}
                    height={lh}
                    image={selectionCanvas}
                    listening={false}
                  />
                )}
                {imageActiveTool === "brush-select" && selectionBrushPreviewCanvas !== null && (
                  <KonvaImage
                    x={0} y={0}
                    width={lw}
                    height={lh}
                    image={selectionBrushPreviewCanvas}
                    listening={false}
                  />
                )}
                {/* Rect-select drag preview / smart-select box prompt */}
                {(imageActiveTool === "rect-select" || imageActiveTool === "smart-select") && imageEditStore.rectSelectPreview !== null && (() => {
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
      {/* Eyedropper live preview swatch */}
      {drawingTool === "eyedropper" && eyedropperPreview !== null && (
        <div
          style={{
            position: "absolute",
            left: eyedropperPreview.x + 18,
            top: eyedropperPreview.y - 38,
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 7px",
            background: "rgba(20,20,22,0.92)",
            color: "#fff",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: 11,
            borderRadius: 5,
            pointerEvents: "none",
            boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
            zIndex: 401
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 18,
              height: 18,
              borderRadius: 3,
              background: eyedropperPreview.hex,
              border: "1px solid rgba(255,255,255,0.6)"
            }}
          />
          <span>{eyedropperPreview.hex}</span>
        </div>
      )}
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
      {/* Selection brush cursor ring (image-edit) */}
      {imageEditMode && imageActiveTool === "brush-select" && eraserCursorPos !== null && (() => {
        const r = imageEditStore.selectionBrushSize / 2 * scale;
        const cx = eraserCursorPos.x * scale;
        const cy = eraserCursorPos.y * scale;
        const subtract = imageEditStore.selectionBrushMode === "subtract";
        return (
          <div
            style={{
              position: "absolute",
              left: cx - r,
              top: cy - r,
              width: r * 2,
              height: r * 2,
              borderRadius: "50%",
              border: subtract ? "2px dashed rgba(255,80,80,0.95)" : "2px solid rgba(80,180,255,0.95)",
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

function AdjustmentFilterGroup({
  adjustment,
  pageWidth,
  pageHeight,
  contentKey,
  children
}: {
  adjustment: AdjustmentLayer;
  pageWidth: number;
  pageHeight: number;
  contentKey: string;
  children: ReactNode;
}): ReactElement {
  const groupRef = useRef<Konva.Group>(null);
  const [cacheReady, setCacheReady] = useState(false);
  const active = hasActiveAdjustment(adjustment);
  const filter = useMemo(
    () => createAdjustmentPixelFilter(adjustment.adjustments, Math.max(0, Math.min(1, adjustment.opacity))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(adjustment.adjustments), adjustment.opacity]
  );

  useEffect(() => {
    // Bug fix: always reset cacheReady BEFORE checking groupRef,
    // because when active=false the ref is null and we'd early-return
    // leaving cacheReady stale at true — then when active flips back,
    // Konva tries to apply a filter to an uncached node → white screen.
    setCacheReady(false);
    const node = groupRef.current;
    if (node === null) return;
    let cancelled = false;
    let rafA = 0;
    let rafB = 0;
    let drawCleanup: (() => void) | null = null;
    node.clearCache();
    if (!active) {
      node.getLayer()?.batchDraw();
      return;
    }
    rafA = requestAnimationFrame(() => {
      rafB = requestAnimationFrame(() => {
        if (cancelled) return;
        const doCache = (): boolean => {
          try {
            node.clearCache();
            node.cache({
              x: 0,
              y: 0,
              width: Math.max(1, pageWidth),
              height: Math.max(1, pageHeight),
              pixelRatio: 1
            });
            return true;
          } catch (error) {
            node.clearCache();
            markDebugEvent("adjustment-layer:cache-failed", {
              layerId: adjustment.id,
              name: adjustment.name,
              message: error instanceof Error ? error.message : String(error)
            });
            return false;
          }
        };

        if (doCache()) {
          if (!cancelled) setCacheReady(true);
          const konvaLayer = node.getLayer();
          konvaLayer?.batchDraw();

          // One-time re-cache after the next Konva draw to pick up
          // images that finish loading after the initial cache snapshot.
          if (konvaLayer) {
            const onDraw = (): void => {
              if (cancelled) return;
              konvaLayer.off("draw", onDraw);
              drawCleanup = null;
              requestAnimationFrame(() => {
                if (cancelled || !node.isCached()) return;
                doCache();
                konvaLayer.batchDraw();
              });
            };
            konvaLayer.on("draw", onDraw);
            drawCleanup = () => konvaLayer.off("draw", onDraw);
          }
        } else {
          if (!cancelled) setCacheReady(false);
        }
      });
    });
    return () => {
      cancelled = true;
      if (rafA !== 0) cancelAnimationFrame(rafA);
      if (rafB !== 0) cancelAnimationFrame(rafB);
      if (drawCleanup) drawCleanup();
      node.clearCache();
    };
  }, [active, adjustment.id, adjustment.name, filter, pageHeight, pageWidth, contentKey]);

  if (!active) {
    return <Group>{children}</Group>;
  }

  return (
    <Group
      ref={groupRef}
      filters={cacheReady ? [filter] : []}
      listening
    >
      {children}
    </Group>
  );
}

function renderAdjustmentAwareLayers(
  layers: VisualLayer[],
  pageWidth: number,
  pageHeight: number,
  renderLayer: (layer: VisualLayer) => ReactNode
): ReactNode[] {
  // Safe Mode: legacy AdjustmentLayer rendering is disabled. Skip the
  // full-page Konva cache entirely — render only the renderable layers and
  // drop adjustment-layer entries (they still appear in the Layers Panel as
  // "Legacy — Disabled", and migration converts them to image adjustments).
  if (!ENABLE_CLASSIC_ADJUSTMENT_LAYER_RENDERING) {
    const out: ReactNode[] = [];
    for (const layer of layers) {
      if (layer.type === "adjustment-layer") continue;
      if (isRenderableLayer(layer)) out.push(renderLayer(layer));
    }
    return out;
  }

  let rendered: ReactNode[] = [];
  // Parallel array tracking a stable content key per rendered slot so that
  // AdjustmentFilterGroup can detect when its wrapped layers change and
  // invalidate the Konva cache accordingly.
  let contentIds: string[] = [];

  for (const layer of layers) {
    if (layer.type !== "adjustment-layer") {
      if (isRenderableLayer(layer)) {
        rendered.push(renderLayer(layer));
        // Include visibility and opacity so toggling either invalidates the cache.
        contentIds.push(`${layer.id}:${layer.visible ? 1 : 0}:${layer.opacity}`);
      }
      continue;
    }

    if (!hasActiveAdjustment(layer)) {
      continue;
    }

    if (layer.targetMode === "clipped-to-layer") {
      const index = rendered.length - 1;
      if (index >= 0) {
        rendered[index] = (
          <AdjustmentFilterGroup
            adjustment={layer}
            key={`adj-${layer.id}-clip`}
            pageHeight={pageHeight}
            pageWidth={pageWidth}
            contentKey={contentIds[index] ?? ""}
          >
            {rendered[index]}
          </AdjustmentFilterGroup>
        );
      }
      continue;
    }

    if (rendered.length > 0) {
      const belowKey = contentIds.join(",");
      rendered = [
        <AdjustmentFilterGroup
          adjustment={layer}
          key={`adj-${layer.id}-below`}
          pageHeight={pageHeight}
          pageWidth={pageWidth}
          contentKey={belowKey}
        >
          {rendered}
        </AdjustmentFilterGroup>
      ];
      contentIds = [belowKey];
    }
  }
  return rendered;
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

function alphaFromCanvas(canvas: HTMLCanvasElement): Uint8Array {
  const context = canvas.getContext("2d");
  const alpha = new Uint8Array(canvas.width * canvas.height);
  if (context === null) return alpha;
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < alpha.length; index += 1) {
    alpha[index] = imageData.data[index * 4 + 3] ?? 0;
  }
  return alpha;
}

function createSelectionOverlayCanvas(data: Uint8Array, width: number, height: number, mode: "add" | "subtract" = "add"): HTMLCanvasElement {
  const overlayCanvas = window.document.createElement("canvas");
  overlayCanvas.width = width;
  overlayCanvas.height = height;
  const context = overlayCanvas.getContext("2d");
  if (context === null) return overlayCanvas;
  const imageData = context.createImageData(width, height);
  for (let i = 0; i < data.length; i += 1) {
    if (data[i] > 128) {
      imageData.data[i * 4] = mode === "subtract" ? 240 : 80;
      imageData.data[i * 4 + 1] = mode === "subtract" ? 80 : 130;
      imageData.data[i * 4 + 2] = mode === "subtract" ? 80 : 220;
      imageData.data[i * 4 + 3] = 100;
    }
  }
  context.putImageData(imageData, 0, 0);
  return overlayCanvas;
}

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
