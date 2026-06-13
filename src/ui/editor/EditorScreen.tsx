import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Boxes,
  ChevronDown,
  ChevronRight,
  Circle,
  Clipboard,
  Combine,
  Copy,
  Crop,
  Eraser,
  Download,
  FileDown,
  FileText,
  FileUp,
  FolderPlus,
  ChevronsDown,
  ChevronsUp,
  Crosshair,
  MoveHorizontal,
  MoveVertical,
  FlipHorizontal,
  FlipVertical,
  Frame,
  GripVertical,
  Eye,
  EyeOff,
  Home,
  ImagePlus,
  Italic,
  LayoutGrid,
  Layers,
  CloudUpload,
  Contrast,
  Link2,
  Lock,
  Maximize2,
  MoreVertical,
  MousePointer2,
  Plus,
  Redo2,
  Replace,
  RotateCcw,
  RotateCw,
  LineChart,
  Save,
  Settings,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Square,
  SquareRoundCorner,
  Star,
  Trash2,
  Type,
  Unlink2,
  Unlock,
  Undo2,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
  UserRound as UserRoundIcon,
  Smile as SmileIcon,
  Pipette as PipetteIcon,
  PaintBucket as PaintBucketIcon,
  Brush as BrushIcon,
  Shapes as ShapesIcon,
  Heart as HeartIcon,
  Minus as LineIcon,
  ArrowRight as ArrowIcon,
  RectangleHorizontal,
  Wand2,
  Lasso
} from "lucide-react";
import {
  Fragment,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  type ReactElement,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import type Konva from "konva";
import type { LucideIcon } from "lucide-react";
import {
  alignLayers,
  addImagesToGrid,
  addImagesToMask,
  applyTextLayerToAllGridCells,
  applyTextLayerToAllMaskFrames,
  applyGridFitModeToAll,
  applyMaskFitModeToAll,
  AutosaveManager,
  AUTOSAVE_TEMPORARILY_DISABLED,
  createGridTextOverlay,
  createAdjustmentLayer,
  createDocument,
  createFrameLayer,
  createGroupLayer,
  createImageLayer,
  createMaskTextOverlay,
  createShapeLayer,
  createTextLayer,
  createPage,
  createProjectEnvelope,
  checkMaskPageOverflow,
  commitDraftDimension,
  defaultContentTransform,
  deleteGridImageAndCompactFromEnd,
  deleteMaskImageAndCompactFromEnd,
  formatDimension,
  PAGE_PRESETS,
  pageSizeForMaskFit,
  pageSetupFromPreset,
  pxToUnit,
  pxToMm,
  pxToCm,
  pxToInch,
  mmToPx,
  cmToPx,
  inchToPx,
  regenerateGrid,
  regenerateMaskLayout,
  resizeMaskPagesToFit,
  resetGridCrops,
  resetMaskCrops,
  clampContentTransformToFillBounds,
  swapGridCellImages,
  unitToPx,
  withProjectMetadata,
  centerToCanvas,
  type AlignmentCommand,
  type AutosaveResult
} from "@/core";
import { MASK_DIMENSION_LABELS, MASK_DIMENSION_UNITS, type MaskDimensionUnit } from "@/core/mask/maskDimensions";
import { importImageAsset, createMaskAsset, createImageAssetFromDataUrl, resolveCanvasAssetPath } from "@/core/assets/assetManager";
import { getTransformedBounds, unionRects, getPageBounds, rotatedAabbSize, isCenterPivotLayer, visualCenterToOrigin } from "@/core/bounds/bounds";
import { rasterizeLayers } from "./layerRasterizer";
import { HEIC_CONVERSION_ERROR_MESSAGE, SUPPORTED_IMAGE_ACCEPT, isSupportedIncomingImageFile, normalizeIncomingImage, normalizeIncomingImages } from "@/core/image/normalizeIncomingImage";
import { analyzeScreenshotCrop } from "@/core/image/screenshotCropDetector";
import {
  applyScreenshotCropToAsset,
  cropAssetBitmapDestructive,
  getAppliedScreenshotCrop,
  getEffectiveSourceSize,
  getScreenshotCropSuggestion,
  ignoreScreenshotCropForAsset,
  resetScreenshotCropForAsset,
  type ScreenshotCropSuggestionMetadata
} from "@/core/image/screenshotCropMetadata";
import { measureTextLayerSize } from "@/core/text/measurement";
import {
  fitTextToPageBox,
  getTextFitSafeRect,
  type SmartTextFitMode
} from "@/core/text/smartTextFit";
import {
  DEFAULT_SMART_TEXT_BLOCK_SETTINGS,
  readSmartTextBlockSettings,
  withSmartTextBlockSettings,
  withoutSmartTextBlock,
  type SmartTextBlockSettings
} from "@/core/text/smartTextBlock";
import { applyRichTextStyleToRange, clampTextSelection, pruneRichTextForText, type TextSelectionRange } from "@/core/text/richText";
import {
  applyTextPresetToLayer,
  BUILTIN_TEXT_PRESETS,
  createTextPresetFromLayer,
  deleteUserTextPreset,
  loadUserTextPresets,
  saveUserTextPreset,
  updateUserTextPreset
} from "@/core/text/presets";
import { useDocumentStore } from "@/state/documentStore";
import { SmartRepeatDialog } from "@/ui/smartLayout/SmartRepeatDialog";
import { applyRepeatToDocument, type RepeatOptions } from "@/features/smartLayout";
import { generateMaskThumbnail, useMaskLibraryStore } from "@/state/maskLibraryStore";
import { useSelectionStore } from "@/state/selectionStore";
import { useImageEditStore } from "@/state/imageEditStore";
import { useDrawingToolsStore } from "@/state/drawingToolsStore";
import { useColorStore } from "@/state/colorStore";
import { useMaskContentEditStore } from "@/state/maskContentEditStore";
import { useCollageShapeTemplateStore } from "@/state/collageShapeTemplateStore";
import { ImageEditToolbar } from "./ImageEditToolbar";
import { ImageEditFloatingBar } from "./ImageEditFloatingBar";
import { CropUI } from "./CropUI";
import { useViewportStore, type ViewportStore } from "@/state/viewportStore";
import type { Asset, Document, Page } from "@/types/document";
import type { AdjustmentLayer, AdjustmentOperation, BlendMode, ContentTransform, EdgeFadeSettings, EdgeFadeShape, FaceAnchorData, FrameLayer, GroupLayer, ImageLayer, ImageLayerEffects, TextLayer, VisualLayer } from "@/types/layers";
import { DEFAULT_EDGE_FADE_SETTINGS, DEFAULT_IMAGE_LAYER_EFFECTS } from "@/types/layers";
import type { GridLayoutRule } from "@/types/grid";
import type { MaskLayoutRule } from "@/types/mask";
import type { PageSetup, Unit } from "@/types/primitives";
import type { TextEffect, TextPreset } from "@/types/text";
import {
  VISUAL_EFFECT_LABELS,
  VISUAL_EFFECT_PRESETS,
  type DropShadowEffect,
  type StrokeEffect,
  type VisualEffect,
  type VisualEffectParams,
  type VisualEffectStack
} from "@/types/visualEffects";
import {
  createFreeImageLayer,
  createStarterTextLayer,
  captureProjectThumbnail,
  exportStageJpg,
  exportStagePdf,
  exportStagePng,
  exportStagePrintImage,
  exportRenderedPagesAsPdf,
  exportRenderedPagesToFolder,
  type FolderExportResult,
  loadProject,
  savePortableProject,
  saveProject,
  saveProjectToCloud,
  saveProjectToDisk
} from "../projectActions";
import type { PrintableStageImage } from "../projectActions";
import { composeFrameMaskFromImageLayer } from "@/core/layers/composeFrameMask";
import {
  clearFrameImage as clearFrameImageDoc,
  convertFrameMaskBackToImage,
  insertImageIntoFrame as insertImageIntoFrameDoc,
  isFrameMaskLayer,
  moveImageLayerIntoFrame as moveImageLayerIntoFrameDoc
} from "@/core/layers/frameMask";
import { CanvasStage } from "./CanvasStage";
import { EditorStatusBar } from "./EditorStatusBar";
import { ExactSizeDialog } from "./ExactSizeDialog";
import { ColorPanel } from "./ColorPanel";
import { CanvasErrorBoundary } from "./CanvasErrorBoundary";
import { renderTextToAlphaCanvas } from "./warpText";
import { renderPageOffscreen, canRenderPageOffscreen } from "@/core/rendering/offscreenPageRenderer";
import type { CanvasContextMenuTarget } from "./KonvaLayerNode";
import { AutoFixModal } from "./AutoFixModal";
import { useAutoFixStore } from "@/state/autoFixStore";
import { CurvesModal } from "./CurvesModal";
import { useCurvesStore } from "@/state/curvesStore";
import { ShadowHighlightsModal } from "./ShadowHighlightsModal";
import { useShadowHighlightsStore } from "@/state/shadowHighlightsStore";
import { isImageEditorAvailable, openImageEditorForAsset } from "@/services/imageEditorService";
import { preloadAssetsForPrint, waitForKonvaPageImages } from "@/services/printAssetLoader";
import {
  makeSmartSelectionInput,
  maskResultToSelectionMask,
  runSmartAutoSegment,
  runSmartRefineMask
} from "@/services/ai/smartSelectionService";
import { runContentAwareFill, warmContentFillEngine } from "@/services/ai/contentAwareFillService";
import { ContentAwareFillWorkspace } from "@/ui/contentFill/ContentAwareFillWorkspace";
import { AdvancedPrintDialog } from "@/ui/advancedPrint/AdvancedPrintDialog";
import { PrintActionsButton } from "@/ui/printHub/PrintActionsButton";
import { SendToPrintHubDialog, type SendToPrintHubOptions } from "@/ui/printHub/SendToPrintHubDialog";
import { buildAndSubmitJob, type JobSourceImage } from "@/core/printHub/jobBuilder";
import { lanConfigFromSettings, type LanUploadProgress } from "@/services/lan/lanQueueClient";
import { buildClientPreset } from "@/core/printHub/sizes";
import { generateJobId } from "@/core/printHub/jobPackage";
import { orderSummaryFromFields } from "@/core/printHub/orderSummary";
import { renderOrderSummaryImage } from "@/core/printHub/orderSummaryRender";
import { useProjectLifecycleStore } from "@/state/projectLifecycleStore";
import { CollageModePanel } from "@/ui/collage/CollageModePanel";
import { PhotoPrintModePanel } from "@/ui/photoPrint/PhotoPrintModePanel";
import { ClassPhotoModePanel } from "@/ui/classPhoto/ClassPhotoModePanel";
import { BlessingModePanel } from "@/ui/blessing/BlessingModePanel";
import { ProductDefinitionPanel } from "./panels/ProductDefinitionPanel";
import { useProductStore } from "@/state/productStore";
import { regeneratePhotoPrint } from "@/core/photoPrint/photoPrintModeEngine";
import { resolvePassportRequirementForRule } from "@/core/passport/passportRequirements";
import type { PhotoPrintRule } from "@/types/photoPrint";
import { CollageLayoutsPanel } from "@/ui/collage/CollageLayoutsPanel";
import { UtilitiesMenu } from "@/ui/utilities/UtilitiesMenu";
import { GoogleFontsBrowser } from "@/ui/utilities/GoogleFontsBrowser";
import { HarmonizePanel } from "@/ui/editor/HarmonizePanel";
import { ImageAdjustmentsPanel } from "@/ui/editor/ImageAdjustmentsPanel";
import { LayerEditsPanel } from "@/ui/editor/LayerEditsPanel";
import { countLayerEdits, hasDisabledLayerEdits, setAllLayerEditsEnabled, resetAllLayerEdits as resetAllLayerEditsFor } from "@/core/layerEdits";
import { useLayerEditsPreviewStore } from "@/state/layerEditsPreviewStore";
import { AiToolsContainer } from "@/ui/aiTools/AiToolsContainer";
import { SmartExpandModal } from "@/ui/aiTools/SmartExpandModal";
import { useAiToolsStore } from "@/state/aiToolsStore";
import { useSmartExpandStore } from "@/state/smartExpandStore";
import { AiStyleStudioContainer } from "@/ui/aiStyles/AiStyleStudioContainer";
import { useAiStyleStore } from "@/state/aiStyleStore";
import { PageLookPanel } from "@/ui/editor/PageLookPanel";
import { PageAdjustmentsSection } from "@/ui/editor/PageAdjustmentsSection";
import { ToolLibrary } from "@/ui/editor/ToolLibrary";
import type { LibraryItem, LibraryContext } from "@/core/presets/toolLibrary";
import { createImageAdjustment, createPageLookLayer, type ImageAdjustmentTemplate } from "@/types/imageAdjustments";
import { ENABLE_IMAGE_LEVEL_ADJUSTMENTS, ENABLE_PAGE_LOOK_LAYERS, ENABLE_LEGACY_ADJUSTMENT_LAYER_CREATION } from "@/core/features/adjustmentFlags";
import { runWithBusy, useUiBusyStore } from "@/state/uiBusyStore";
import { LoadingToast } from "@/ui/editor/LoadingToast";
const PdfImportDialog = lazy(() =>
  import("@/ui/pdf/PdfImportDialog").then((module) => ({ default: module.PdfImportDialog }))
);
import {
  applyImportAsSeparatePages,
  applyImportToCurrentCanvas,
  buildCanvasImports,
  buildSeparatePageImports,
  type PdfImportMode,
  type PdfImportRenderedPage
} from "@/ui/pdf/pdfCanvasImport";
import { SmartArrangeControl } from "@/ui/editor/SmartArrangeControl";
import { analyzeLayersForSmartArrange, runSmartArrange, type SmartArrangeMode } from "@/core/smartArrange";
import { openInPhotoshop, stopPhotoshopWatch } from "@/integrations/photoshopIntegration";
import { openInColorLab, stopColorLabWatch } from "@/integrations/colorLabIntegration";
import { useUtilitiesSettings } from "@/utilities/settingsStore";
import { isEditableShortcutTarget, matchShortcut, shortcutBindingsToShortcuts } from "@/core/input/inputSystem";
import { createExportRenderOptions, getExportPixelRatio, getImportPreviewMaxSide, resolvePdfExportProfile, useAppSettings, type PdfQualityPreset } from "@/settings";
import { safeFilename } from "@/core";
import { downloadDataUrl } from "@/ui/file";
import { syncFrameLayersToPage } from "@/core/collage/collageModeEngine";
import {
  analyzeFaceSizingForFrame,
  computeFaceCenteredTransformForFrame,
  computeFaceSizeMatchedTransformForFrame
} from "@/core/frameSmartCrop";
import {
  fontFamilyExists,
  FONT_LIST,
  getFontFavorites,
  getGroupedFonts,
  loadSystemFonts,
  toggleFontFavorite,
  type FontEntry
} from "./fonts";
import { GraphicsLibraryPanel } from "@/ui/emoji/EmojiLibraryPanel";
import { useGraphicsLibraryStore } from "@/features/graphicsLibrary/store";
import { getBatchProductionMeta, upsertVariableField, removeVariableFieldForLayer, setBatchProductionMeta } from "@/core/batchProduction/batchProductionMeta";
import { saveTemplateToStore } from "@/core/batchProduction/batchTemplateStore";
import { convertImageLayerToVariableFrame } from "@/core/batchProduction/imageToFrameConversion";
import type { BatchVariableField } from "@/types/batchProduction";
import { markDebugEvent, setAutosaveDebugStatus, trackDebugMount } from "@/debug/sppDiagnostics";

type ToolId = "move" | "text" | "image" | "layers";

const BLEND_MODE_OPTIONS: Array<{ value: BlendMode; label: string }> = [
  { value: "normal", label: "Normal" },
  { value: "multiply", label: "Multiply" },
  { value: "screen", label: "Screen" },
  { value: "overlay", label: "Overlay" },
  { value: "darken", label: "Darken" },
  { value: "lighten", label: "Lighten" }
];

function layerHasEditableImage(layer: VisualLayer | null | undefined): layer is ImageLayer | FrameLayer {
  return layer?.type === "image" || (layer?.type === "frame" && layer.imageAssetId !== undefined);
}

function contextTargetFromLayer(layer: ImageLayer): CanvasContextMenuTarget {
  return {
    layerId: layer.id,
    layerType: "image",
    hasImage: true,
    screenX: Math.round(layer.x + layer.width / 2),
    screenY: Math.round(layer.y + layer.height / 2)
  };
}

// Center-preserving rotation is performed on the live Konva node inside CanvasStage
// (rotate around the node origin, then compensate x/y so the visual center stays fixed,
// committed as a single undo step). All rotation entry points dispatch this event so
// the object never drifts off-canvas. Optional `layerIds` targets specific layers
// (e.g. right-click menu); otherwise the current selection is rotated.
function rotateSelectionByEvent(delta: number, layerIds?: string[]): void {
  window.dispatchEvent(new CustomEvent("spp2:rotate-selection", { detail: { delta, layerIds } }));
}

// Fill / fit / center a layer to the page, accounting for rotation. Konva renders
// rect/image/text/frame layers around their top-left origin, so for a rotated layer
// the naive `x = (pageW - width) / 2` places the *unrotated* box at center and the
// real (rotated) box drifts off-canvas. Here we scale by the rotated AABB and position
// the origin so the layer's true visual center lands at the page center.
// Circle/ellipse shapes rotate around their own center, so they keep the simple placement.
function placeLayerToCanvas(
  layer: VisualLayer,
  pageW: number,
  pageH: number,
  mode: "fill" | "fit" | "center"
): { x?: number; y?: number; width?: number; height?: number } {
  const rotation = layer.rotation ?? 0;
  const centerPivot = isCenterPivotLayer(layer);
  const cx = pageW / 2;
  const cy = pageH / 2;

  if (mode === "center") {
    return visualCenterToOrigin(layer, cx, cy);
  }

  const aabb = centerPivot ? { width: layer.width, height: layer.height } : rotatedAabbSize(layer.width, layer.height, rotation);
  if (aabb.width <= 0 || aabb.height <= 0) return {};
  const scaleX = pageW / aabb.width;
  const scaleY = pageH / aabb.height;
  const scale = mode === "fill" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  const width = layer.width * scale;
  const height = layer.height * scale;

  const origin = visualCenterToOrigin(layer, cx, cy, { width, height });
  return { width, height, x: origin.x, y: origin.y };
}

function medianNumber(values: number[]): number | undefined {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return undefined;
  return sorted[Math.floor(sorted.length / 2)];
}

type LayerEffectsClipboard = {
  effects?: ImageLayerEffects;
  visualEffects?: VisualEffectStack;
  opacity: number;
  blendMode: BlendMode;
};

type SelectionClipboard = {
  dataUrl: string;
  width: number;
  height: number;
  canvasX: number;
  canvasY: number;
  sourceLayerId: string;
  sourceName: string;
};

const AUTOSAVE_QUOTA_WARNING =
  "הפרויקט גדול מדי לשמירה אוטומטית זמנית. מומלץ לשמור כקובץ SPP כדי לא לאבד שינויים.";
const AUTOSAVE_WARNING_THROTTLE_MS = 60_000;

function canUseLayerEffects(layer: VisualLayer | undefined): layer is Extract<VisualLayer, { type: "image" | "frame" }> {
  return layer?.type === "image" || layer?.type === "frame";
}

function makeLayerEffectsClipboard(layer: Extract<VisualLayer, { type: "image" | "frame" }>): LayerEffectsClipboard {
  const visualEffects = "visualEffects" in layer && layer.visualEffects !== undefined
    ? structuredClone(layer.visualEffects)
    : undefined;
  return {
    effects: layer.type === "image" ? structuredClone(layer.effects) : undefined,
    visualEffects,
    opacity: layer.opacity,
    blendMode: layer.blendMode
  };
}

function applyLayerEffectsClipboard<T extends Extract<VisualLayer, { type: "image" | "frame" }>>(
  layer: T,
  clipboard: LayerEffectsClipboard
): T {
  return {
    ...layer,
    ...(layer.type === "image" && clipboard.effects !== undefined ? { effects: structuredClone(clipboard.effects) } : {}),
    ...(clipboard.visualEffects !== undefined ? { visualEffects: structuredClone(clipboard.visualEffects) } : {}),
    opacity: clipboard.opacity,
    blendMode: clipboard.blendMode
  } as T;
}

function hasLayerFx(layer: VisualLayer): boolean {
  if (layer.type === "image") {
    return hasAnyImageEffect(layer.effects) || (layer.visualEffects?.effects.some((effect) => effect.enabled) ?? false);
  }
  if ("visualEffects" in layer) {
    return layer.visualEffects?.effects.some((effect) => effect.enabled) ?? false;
  }
  if (layer.type === "text") {
    return layer.effects.some((effect) => effect.enabled) || layer.shadow !== undefined || layer.stroke !== undefined;
  }
  return false;
}

function sameContentTransform(a: ContentTransform | undefined, b: ContentTransform | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.offsetX === b.offsetX && a.offsetY === b.offsetY && a.scale === b.scale && a.rotation === b.rotation;
}

function frameImageEditParams(layer: FrameLayer): Record<string, number | boolean | string> | undefined {
  const params = layer.metadata["imageEditParams"];
  if (typeof params !== "object" || params === null || Array.isArray(params)) return undefined;
  const entries = Object.entries(params).filter(([, value]) =>
    typeof value === "number" || typeof value === "boolean" || typeof value === "string"
  );
  return entries.length === 0 ? undefined : Object.fromEntries(entries) as Record<string, number | boolean | string>;
}

function hasManagedModeMetadata(layer: VisualLayer | null): layer is FrameLayer {
  return layer?.type === "frame" && (
    layer.metadata["gridCell"] !== undefined ||
    layer.metadata["maskFrame"] !== undefined ||
    layer.metadata["collageFrame"] !== undefined ||
    layer.metadata["classPhotoFrame"] !== undefined ||
    layer.metadata["photoPrintSlot"] !== undefined
  );
}

interface IsolatedImageEditSession {
  sourcePageId: string;
  sourceFrameId: string;
  sourceAssetId: string;
  sourceWidth: number;
  sourceHeight: number;
  sourceDocumentState: ReturnType<typeof useDocumentStore.getState>;
  sourceSelectionState: ReturnType<typeof useSelectionStore.getState>;
  sourceViewportState: ReturnType<typeof useViewportStore.getState>;
}

interface EditorScreenProps {
  onBackHome: () => void;
  onImportPsd?: () => void;
  onOpenClassPhotoWizard?: () => void;
  onOpenSeparateWindow?: () => void;
  onOpenSettings?: () => void;
}

export function EditorScreen({ onBackHome, onImportPsd, onOpenClassPhotoWizard, onOpenSeparateWindow, onOpenSettings }: EditorScreenProps): ReactElement {
  const stageRef = useRef<Konva.Stage | null>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const replaceImageInputRef = useRef<HTMLInputElement>(null);
  const classPhotoAddInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [pdfImportFile, setPdfImportFile] = useState<File | null>(null);
  const lastAutosavedRevisionRef = useRef(0);
  const aiFillInFlightRef = useRef(false);
  const activateImageRegionToolRef = useRef<(t: "rect-select" | "lasso" | "wand") => void>(() => {});
  const isolatedImageEditRef = useRef<IsolatedImageEditSession | null>(null);
  const [isolatedImageEdit, setIsolatedImageEdit] = useState<IsolatedImageEditSession | null>(null);
  const [contentFillWorkspace, setContentFillWorkspace] = useState<{ asset: Asset; layer: ImageLayer; imageDataUrl: string; width: number; height: number } | null>(null);
  const [tool, setTool] = useState<ToolId>("move");
  const [leftTab, setLeftTab] = useState<"layers" | "pages" | "settings" | "collage" | "emoji">("layers");
  const [collageSwapSourceSlotId, setCollageSwapSourceSlotId] = useState<string | null>(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [activeTextSelection, setActiveTextSelection] = useState<{ layerId: string; selection: TextSelectionRange | null } | null>(null);
  const [status, setStatus] = useState("שמירה אוטומטית מוכנה");
  const [collageTemplateToast, setCollageTemplateToast] = useState<string | null>(null);
  const [statusBarUnit, setStatusBarUnit] = useState<Unit>("cm");
  const lastAutosaveWarningRef = useRef(0);
  const autosaveMetricsRef = useRef({ pagesCount: 0, assetsCount: 0 });
  const autosaveRef = useRef(
    new AutosaveManager({
      intervalMs: 1000 * 60 * 2,
      debounceMs: 3000,
      actionThreshold: 20,
      onResult: (result: AutosaveResult) => {
        const metrics = autosaveMetricsRef.current;
        setAutosaveDebugStatus({
          ok: result.ok,
          reason: result.ok ? undefined : result.reason,
          pagesCount: metrics.pagesCount,
          assetsCount: metrics.assetsCount,
          estimatedSizeBytes: result.estimatedSizeBytes,
          estimatedSizeMb: Number((result.estimatedSizeBytes / 1024 / 1024).toFixed(2)),
          storageTarget: result.storageKey,
          message: result.ok ? undefined : result.message,
          savedAt: new Date().toISOString()
        });
        if (result.ok) {
          setStatus("Autosave saved");
          return;
        }
        markDebugEvent("autosave:failed", result);
        const now = Date.now();
        if (result.reason === "quota-exceeded" && now - lastAutosaveWarningRef.current > AUTOSAVE_WARNING_THROTTLE_MS) {
          lastAutosaveWarningRef.current = now;
          setStatus(AUTOSAVE_QUOTA_WARNING);
          return;
        }
        setStatus(result.reason === "quota-exceeded" ? "Autosave skipped: project is too large" : "Autosave failed");
      }
    })
  );

  useEffect(() => {
    if (collageTemplateToast === null) return;
    const timer = window.setTimeout(() => setCollageTemplateToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [collageTemplateToast]);

  const [canvasContextMenu, setCanvasContextMenu] = useState<CanvasContextMenuTarget | null>(null);
  const [smartRepeatTargetIds, setSmartRepeatTargetIds] = useState<string[] | null>(null);
  const [layerContextMenu, setLayerContextMenu] = useState<{ layerId: string; screenX: number; screenY: number } | null>(null);
  // Right-inspector top-level tab: layer properties vs. the unified Layer Edits list.
  const [inspectorTab, setInspectorTab] = useState<"props" | "edits">("props");
  const [harmonizeTarget, setHarmonizeTarget] = useState<{ layerId: string; bbox: { x: number; y: number; w: number; h: number } } | null>(null);
  const [effectsClipboard, setEffectsClipboard] = useState<LayerEffectsClipboard | null>(null);
  const [layerClipboard, setLayerClipboard] = useState<VisualLayer[] | null>(null);
  const [selectionClipboard, setSelectionClipboard] = useState<SelectionClipboard | null>(null);
  const [renamingLayerId, setRenamingLayerId] = useState<string | null>(null);
  const [hoveredLayerId, setHoveredLayerId] = useState<string | null>(null);
  const [imageEditorBusy, setImageEditorBusy] = useState(false);
  const [showFontsBrowser, setShowFontsBrowser] = useState(false);
  const [showExactSizeDialog, setShowExactSizeDialog] = useState(false);
  const [extWatchId, setExtWatchId] = useState<string | null>(null);
  const [showBackHomeDialog, setShowBackHomeDialog] = useState(false);
  // When true, resolving the unsaved-changes dialog quits the app instead of
  // returning to the home screen (the dialog was triggered by the X button).
  const [exitAfterDialog, setExitAfterDialog] = useState(false);
  const [advancedPrintOpen, setAdvancedPrintOpen] = useState<{ initialSelection: number[] | null } | null>(null);
  const [showSendRemote, setShowSendRemote] = useState(false);
  const [sendRemoteBusy, setSendRemoteBusy] = useState(false);
  const [sendRemoteProgress, setSendRemoteProgress] = useState<LanUploadProgress | null>(null);
  const [saveDropdownOpen, setSaveDropdownOpen] = useState(false);
  const [exportScope, setExportScope] = useState<"current" | "all">("all");
  const [pdfQualityPreset, setPdfQualityPreset] = useState<PdfQualityPreset>("balanced");
  const [fileDropActive, setFileDropActive] = useState(false);
  const [dropTargetFrame, setDropTargetFrame] = useState<{
    id: string;
    name: string;
    hasImage: boolean;
    screenLeft: number;
    screenTop: number;
    screenWidth: number;
    screenHeight: number;
  } | null>(null);
  const [dismissedScreenshotCropAssetIds, setDismissedScreenshotCropAssetIds] = useState<Set<string>>(() => new Set());
  const [projectScreenshotCropMuted, setProjectScreenshotCropMuted] = useState(false);
  const [screenshotCropReviewOpen, setScreenshotCropReviewOpen] = useState(false);
  const utilSettings = useUtilitiesSettings();
  const shortcutSettings = useAppSettings((state) => state.settings.shortcuts.shortcuts);
  const performanceSettings = useAppSettings((state) => state.settings.performance);
  const exportPrintSettings = useAppSettings((state) => state.settings.exportPrint);
  const exportRenderOptions = useMemo(
    () => createExportRenderOptions(performanceSettings, exportPrintSettings.jpgQuality),
    [exportPrintSettings.jpgQuality, performanceSettings]
  );
  const document = useDocumentStore((state) => state.document);
  const activePageId = useDocumentStore((state) => state.activePageId);
  const setDocument = useDocumentStore((state) => state.setDocument);
  const setHistoryLimit = useDocumentStore((state) => state.setHistoryLimit);
  const addLayer = useDocumentStore((state) => state.addLayer);
  const addAssetAndLayer = useDocumentStore((state) => state.addAssetAndLayer);
  const updateLayer = useDocumentStore((state) => state.updateLayer);
  const updateTextLayerStore = useDocumentStore((state) => state.updateTextLayer);
  const attachTextToFrame = useDocumentStore((state) => state.attachTextToFrame);
  const detachTextFromFrame = useDocumentStore((state) => state.detachTextFromFrame);
  const applySmartArrange = useDocumentStore((state) => state.applySmartArrange);
  const removeLayer = useDocumentStore((state) => state.removeLayer);
  const moveLayer = useDocumentStore((state) => state.moveLayer);
  const reorderLayers = useDocumentStore((state) => state.reorderLayers);
  const moveLayerIntoGroup = useDocumentStore((state) => state.moveLayerIntoGroup);
  const addPage = useDocumentStore((state) => state.addPage);
  const duplicatePage = useDocumentStore((state) => state.duplicatePage);
  const removePage = useDocumentStore((state) => state.removePage);
  const updatePage = useDocumentStore((state) => state.updatePage);
  const setActivePage = useDocumentStore((state) => state.setActivePage);
  const applyDocumentChange = useDocumentStore((state) => state.applyDocumentChange);
  const updateCollageCachedSlots = useDocumentStore((state) => state.updateCollageCachedSlots);
  const updateCollageImageTransform = useDocumentStore((state) => state.updateCollageImageTransform);
  const swapCollageImages = useDocumentStore((state) => state.swapCollageImages);
  const replaceCollageImage = useDocumentStore((state) => state.replaceCollageImage);
  const addAsset = useDocumentStore((state) => state.addAsset);
  const updateAsset = useDocumentStore((state) => state.updateAsset);
  const applyTextPreset = useDocumentStore((state) => state.applyTextPreset);
  const copyTextStyle = useDocumentStore((state) => state.copyTextStyle);
  const pasteTextStyle = useDocumentStore((state) => state.pasteTextStyle);
  const hasTextStyleClipboard = useDocumentStore((state) => state.textStyleClipboard !== null);

  useEffect(() => trackDebugMount("EditorScreen"), []);

  useEffect(() => {
    const unsubscribe = window.spp?.smartSelection?.onProgress?.((progress) => {
      const store = useImageEditStore.getState();
      if (progress.operation === "inpaint_remove") {
        store.setAiFillProgress(progress);
        if (progress.phase !== "ready") {
          store.setAiFillStatus("working", progress.message);
        }
        return;
      }
      store.setSmartSelectionProgress(progress);
      if (progress.phase !== "ready") {
        store.setSmartSelectionStatus("working", progress.message);
      }
    });
    return () => {
      unsubscribe?.();
    };
  }, []);
  const undo = useDocumentStore((state) => state.undo);
  const redo = useDocumentStore((state) => state.redo);
  const canUndo = useDocumentStore((state) => state.canUndo);
  const canRedo = useDocumentStore((state) => state.canRedo);
  const revision = useDocumentStore((state) => state.revision);
  const selectedLayerIds = useSelectionStore((state) => state.selectedLayerIds);
  const selectedLayerId = selectedLayerIds[0] ?? null;
  const setSelection = useSelectionStore((state) => state.setSelection);
  const clearSelection = useSelectionStore((state) => state.clearSelection);
  const layoutEditMode = useSelectionStore((state) => state.layoutEditMode);
  const toggleLayoutEditMode = useSelectionStore((state) => state.toggleLayoutEditMode);
  const imageEditMode = useImageEditStore((s) => s.imageEditMode);
  const imageEditLayerId = useImageEditStore((s) => s.editingLayerId);
  const imageActiveTool = useImageEditStore((s) => s.activeTool);
  const armedDrawingTool = useDrawingToolsStore((s) => s.activeTool);
  const cropPreview = useImageEditStore((s) => s.cropPreview);
  const whiteBackgroundThreshold = useImageEditStore((s) => s.whiteBackgroundThreshold);
  const setWhiteBackgroundThreshold = useImageEditStore((s) => s.setWhiteBackgroundThreshold);
  const enterImageEditMode = useImageEditStore((s) => s.enterImageEditMode);
  const exitImageEditMode = useImageEditStore((s) => s.exitImageEditMode);
  const maskContentEditActive = useMaskContentEditStore((s) => s.active);
  const maskContentEditLayerId = useMaskContentEditStore((s) => s.editingLayerId);
  const enterMaskContentEdit = useMaskContentEditStore((s) => s.enter);
  const exitMaskContentEdit = useMaskContentEditStore((s) => s.exit);
  const addCollageShapeTemplate = useCollageShapeTemplateStore((s) => s.addTemplate);
  const viewport = useViewportStore();
  const lifecycle = useProjectLifecycleStore();
  const [managedImageInspectorTab, setManagedImageInspectorTab] = useState<"image" | "mode">("image");
  const [cellSmartCropProgress, setCellSmartCropProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    setManagedImageInspectorTab("image");
  }, [selectedLayerId]);

  const activePage = useMemo(
    () => document?.pages.find((page) => page.id === activePageId) ?? document?.pages[0] ?? null,
    [activePageId, document]
  );
  const selectedLayer = useMemo(
    () => activePage?.layers.find((layer) => layer.id === selectedLayerId) ?? null,
    [activePage, selectedLayerId]
  );
  const selectedLayers = useMemo(
    () => selectedLayerIds.flatMap((layerId) => activePage?.layers.find((layer) => layer.id === layerId) ?? []),
    [activePage, selectedLayerIds]
  );
  const activeGridRule = useMemo(
    () => document?.gridRules.find((rule) => rule.id === document.metadata["activeGridId"]) ?? document?.gridRules[0] ?? null,
    [document]
  );
  const activeMaskRule = useMemo(
    () => document?.maskRules.find((rule) => rule.id === document.metadata["activeMaskId"]) ?? document?.maskRules[0] ?? null,
    [document]
  );
  const activeCollageRule = useMemo(
    () => {
      if (!document || !activePage) return null;
      return document.collageRules.find((r) => r.pageId === activePage.id) ?? null;
    },
    [document, activePage]
  );
  const isGridMode = document?.metadata["mode"] === "grid";
  const isMaskMode = document?.metadata["mode"] === "mask";
  const activeProductInStore = useProductStore((s) => s.activeProduct);
  const isProductMode = document?.metadata["mode"] === "product" || activeProductInStore !== null;
  const isCollageMode =
    document?.metadata["mode"] === "collage" ||
    // product+collage hybrid: product mode with collage rules present
    (isProductMode && (document?.collageRules.length ?? 0) > 0);
  const isPhotoPrintMode = document?.metadata["mode"] === "photo_print";
  const isClassPhotoMode = document?.metadata["mode"] === "class_photo";
  const activeClassPhotoRule = useMemo(() => {
    if (!document || !isClassPhotoMode || !activePage) return null;
    return document.classPhotoRules.find((r) => r.pageId === activePage.id) ?? document.classPhotoRules[0] ?? null;
  }, [document, isClassPhotoMode, activePage]);
  const isBlessingMode = document?.metadata["mode"] === "blessing";
  const activeBlessingRule = useMemo(() => {
    if (!document || !isBlessingMode || !activePage) return null;
    return document.blessingRules.find((r) => r.pageId === activePage.id) ?? document.blessingRules[0] ?? null;
  }, [document, isBlessingMode, activePage]);
  const activePhotoPrintRule = useMemo((): PhotoPrintRule | null => {
    if (!document || !isPhotoPrintMode) return null;
    const ruleId = document.metadata["activePhotoPrintId"];
    if (typeof ruleId !== "string") return document.photoPrintRules[0] ?? null;
    return document.photoPrintRules.find((r) => r.id === ruleId) ?? null;
  }, [document, isPhotoPrintMode]);
  const passportGuidelinesEnabled = useMemo(
    () => activePhotoPrintRule !== null &&
      resolvePassportRequirementForRule(activePhotoPrintRule) !== null &&
      (activePhotoPrintRule.showPassportGuidelines ?? true),
    [activePhotoPrintRule]
  );

  function switchPageFromUi(pageId: string, source: string): void {
    markDebugEvent("page-switch:intent", {
      source,
      from: activePageId,
      to: pageId,
      selectedLayerIds,
      imageEditMode,
      imageEditLayerId,
      maskContentEditActive,
      maskContentEditLayerId
    });
    clearSelection();
    exitImageEditMode();
    exitMaskContentEdit();
    setActivePage(pageId);
  }

  useEffect(() => {
    if (activePage === null) {
      if (imageEditMode) exitImageEditMode();
      if (maskContentEditActive) exitMaskContentEdit();
      return;
    }

    if (imageEditMode && imageEditLayerId !== null && !activePage.layers.some((layer) => layer.id === imageEditLayerId)) {
      exitImageEditMode();
    }
    if (maskContentEditActive && maskContentEditLayerId !== null && !activePage.layers.some((layer) => layer.id === maskContentEditLayerId)) {
      exitMaskContentEdit();
    }
  }, [
    activePage,
    exitImageEditMode,
    exitMaskContentEdit,
    imageEditLayerId,
    imageEditMode,
    maskContentEditActive,
    maskContentEditLayerId
  ]);

  // Auto-switch left tab to collage layouts when entering collage mode
  useEffect(() => {
    if (isCollageMode) setLeftTab("collage");
    else if (leftTab === "collage") setLeftTab("layers");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCollageMode]);

  useEffect(() => {
    if (document?.viewport !== undefined) {
      viewport.setViewport(document.viewport);
    }
  }, [document?.id]);

  // Initial sync: ensure collage FrameLayers exist when collage document first loads.
  useEffect(() => {
    if (!isCollageMode || !activeCollageRule || !document) return;

    const needsSync = activeCollageRule.frameIds.length === 0;
    if (needsSync) {
      const rule = activeCollageRule;
      const page = document.pages.find((p) => p.id === rule.pageId);
      if (page) {
        const { page: updatedPage, frameIds } = syncFrameLayersToPage(page, rule, page.width, page.height);
        const updatedRule = { ...rule, frameIds };
        const synced = {
          ...document,
          collageRules: document.collageRules.map((r) => r.id === rule.id ? updatedRule : r),
          pages: document.pages.map((p) => p.id === rule.pageId ? updatedPage : p)
        };
        setDocument(synced);
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCollageRule?.id]);

  // Reset swap source when leaving collage mode or changing page
  useEffect(() => {
    if (!isCollageMode) setCollageSwapSourceSlotId(null);
  }, [isCollageMode, activeCollageRule?.id]);

  // Broadcast swap state so KonvaLayerNode dots appear/disappear correctly
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("spp2:collage-swap-mode-change", {
      detail: { slotId: collageSwapSourceSlotId }
    }));
  }, [collageSwapSourceSlotId]);

  // Listen for blue-dot anchor clicks from KonvaLayerNode
  useEffect(() => {
    function onAnchorClick(event: Event): void {
      if (!isCollageMode || !activeCollageRule) return;
      const slotId = (event as CustomEvent<{ slotId: string }>).detail?.slotId;
      if (!slotId) return;

      setCollageSwapSourceSlotId((current) => {
        if (!current) {
          return slotId;
        }
        if (current === slotId) {
          return null;
        }
        swapCollageImages(activeCollageRule.id, current, slotId);
        return null;
      });
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setCollageSwapSourceSlotId(null);
    }
    window.addEventListener("spp2:collage-slot-anchor-click", onAnchorClick);
    window.addEventListener("keydown", onKeyDown);
    // handled inside this effect so it always has the latest handleDeleteSelection
    return () => {
      window.removeEventListener("spp2:collage-slot-anchor-click", onAnchorClick);
      window.removeEventListener("keydown", onKeyDown);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCollageMode, activeCollageRule?.id, swapCollageImages]);

  // DELETE key deletes the current selection when in image edit mode
  useEffect(() => {
    if (!imageEditMode) return;
    function onImageEditKey(event: KeyboardEvent): void {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        if (useImageEditStore.getState().undoSelectionStep()) {
          event.preventDefault();
          setStatus("Selection step undone");
        }
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        handleDeleteSelection();
      }
      if (event.key === "Escape") {
        if (useImageEditStore.getState().selectionMask !== null) handleClearImageSelection();
        else handleImageEditCancel();
      }
    }
    window.addEventListener("keydown", onImageEditKey);
    return () => window.removeEventListener("keydown", onImageEditKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageEditMode, imageEditLayerId]);

  // Exit mask content edit mode when selection changes away from the editing layer
  useEffect(() => {
    if (maskContentEditActive && maskContentEditLayerId !== selectedLayerId) {
      exitMaskContentEdit();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLayerId, maskContentEditActive, maskContentEditLayerId]);

  // Keyboard handling for mask content edit mode
  useEffect(() => {
    function onMaskContentKey(event: KeyboardEvent): void {
      // Escape or Enter exits mask content edit mode
      if (maskContentEditActive && (event.key === "Escape" || event.key === "Enter")) {
        exitMaskContentEdit();
        event.preventDefault();
        return;
      }

      // Shift + Arrow: nudge image content inside mask
      if (!event.shiftKey) return;
      const key = event.key;
      if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "ArrowUp" && key !== "ArrowDown") return;
      if (selectedLayer?.type !== "image") return;

      const imageShape = (selectedLayer.metadata["imageShape"] as string | undefined) ?? "rect";
      const hasAnyMask = selectedLayer.pixelMask !== undefined || imageShape !== "rect";
      if (!hasAnyMask) return;

      // Target input elements should not trigger this
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      event.preventDefault();
      const step = (event.ctrlKey || event.metaKey) ? 10 : event.altKey ? 0.25 : 1;
      let dx = 0;
      let dy = 0;
      if (key === "ArrowLeft") dx = -step;
      if (key === "ArrowRight") dx = step;
      if (key === "ArrowUp") dy = -step;
      if (key === "ArrowDown") dy = step;

      if (document !== null && activePage !== null) {
        updateLayer(activePage.id, {
          ...selectedLayer,
          imageOffsetX: (selectedLayer.imageOffsetX ?? 0) + dx,
          imageOffsetY: (selectedLayer.imageOffsetY ?? 0) + dy
        });
      }
    }
    window.addEventListener("keydown", onMaskContentKey);
    return () => window.removeEventListener("keydown", onMaskContentKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maskContentEditActive, selectedLayer, document, activePage, updateLayer, exitMaskContentEdit]);

  useEffect(() => {
    function nudgeSelectedLayers(dx: number, dy: number): void {
      if (activePage === null || selectedLayerIds.length === 0) return;
      const ids = new Set(selectedLayerIds);
      let movedCount = 0;
      applyDocumentChange(
        "KeyboardNudgeSelectionCommand",
        (doc) => ({
          ...doc,
          pages: doc.pages.map((page) => {
            if (page.id !== activePage.id) return page;
            return {
              ...page,
              layers: page.layers.map((layer) => {
                if (!ids.has(layer.id) || layer.locked || layer.type === "guide" || layer.type === "background") return layer;
                movedCount += 1;
                return { ...layer, x: layer.x + dx, y: layer.y + dy } as VisualLayer;
              })
            };
          })
        }),
        activePage.id
      );
      if (movedCount > 0) setStatus("Selection nudged");
    }

    function imageCanvasFitPatch(layer: Extract<VisualLayer, { type: "image" }>, mode: "fit" | "fill"): Partial<VisualLayer> | null {
      if (activePage === null || layer.width <= 0 || layer.height <= 0) return null;
      // Rotation-aware: scales by the rotated bounding box and centers the true visual
      // center on the page, so a rotated image (e.g. after Rotate Left) stays on-canvas.
      return placeLayerToCanvas(layer, activePage.width, activePage.height, mode) as Partial<VisualLayer>;
    }

    function isNearPatch(layer: VisualLayer, patch: Partial<VisualLayer>): boolean {
      return Math.abs(layer.x - (patch.x ?? layer.x)) < 0.5 &&
        Math.abs(layer.y - (patch.y ?? layer.y)) < 0.5 &&
        Math.abs(layer.width - (patch.width ?? layer.width)) < 0.5 &&
        Math.abs(layer.height - (patch.height ?? layer.height)) < 0.5;
    }

    function handleSpaceFit(): boolean {
      if (selectedLayer === null || selectedLayerIds.length !== 1) return false;
      if (selectedLayer.type === "frame" && selectedLayer.imageAssetId !== undefined) {
        handleCanvasLayerChange({
          ...selectedLayer,
          fitMode: selectedLayer.fitMode === "fill" ? "fit" : "fill"
        });
        setStatus(selectedLayer.fitMode === "fill" ? "Frame image set to fit" : "Frame image set to fill");
        return true;
      }
      if (selectedLayer.type === "image") {
        const fitPatch = imageCanvasFitPatch(selectedLayer, "fit");
        if (fitPatch === null) return false;
        const mode = isNearPatch(selectedLayer, fitPatch) ? "fill" : "fit";
        const patch = mode === "fit" ? fitPatch : imageCanvasFitPatch(selectedLayer, "fill");
        if (patch === null) return false;
        handleCanvasLayerChange({ ...selectedLayer, ...patch } as VisualLayer);
        setStatus(mode === "fit" ? "Image fitted to canvas" : "Image filled canvas");
        return true;
      }
      return false;
    }

    function onSelectionKey(event: KeyboardEvent): void {
      if (document === null || activePage === null) return;
      if (isEditableShortcutTarget(event.target)) return;
      if (imageEditMode || maskContentEditActive || useDrawingToolsStore.getState().activeTool !== null) return;

      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1]
      };
      const direction = arrows[event.key];
      if (direction !== undefined && selectedLayerIds.length > 0) {
        const step = event.altKey ? 0.25 : event.shiftKey || event.ctrlKey || event.metaKey ? 10 : 1;
        event.preventDefault();
        nudgeSelectedLayers(direction[0] * step, direction[1] * step);
        return;
      }

      if (event.code === "Space" && !event.repeat && handleSpaceFit()) {
        event.preventDefault();
      }
    }

    window.addEventListener("keydown", onSelectionKey);
    return () => window.removeEventListener("keydown", onSelectionKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activePage,
    document,
    imageEditMode,
    maskContentEditActive,
    selectedLayer,
    selectedLayerIds,
    applyDocumentChange
  ]);

  useEffect(() => {
    if (isolatedImageEditRef.current !== null) {
      return;
    }
    if (document === null) {
      return;
    }
    if (revision === 0 || revision === lastAutosavedRevisionRef.current) {
      return;
    }
    lastAutosavedRevisionRef.current = revision;
    lifecycle.markDirty();
    if (AUTOSAVE_TEMPORARILY_DISABLED) {
      setAutosaveDebugStatus({
        ok: false,
        reason: "unknown",
        pagesCount: document.pages.length,
        assetsCount: document.assets.length,
        estimatedSizeBytes: 0,
        estimatedSizeMb: 0,
        storageTarget: "disabled",
        message: "Autosave is temporarily disabled for crash isolation.",
        savedAt: new Date().toISOString()
      });
      setStatus("Autosave disabled");
      return;
    }
    autosaveMetricsRef.current = {
      pagesCount: document.pages.length,
      assetsCount: document.assets.length
    };
    autosaveRef.current.recordMeaningfulChange(createProjectEnvelope({ document: withViewport(document, viewport), linkedGroups: [], batchJobs: [] }), "unsaved");
    setStatus("Autosave queued");
  }, [document, lifecycle, revision, viewport]);

  useEffect(() => {
    setHistoryLimit(performanceSettings.undoHistoryLimit);
  }, [performanceSettings.undoHistoryLimit, setHistoryLimit]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      if (!useProjectLifecycleStore.getState().isDirty) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      autosaveRef.current.stop();
    };
  }, []);

  // The X button (window close) routes here from App when there are unsaved
  // changes. Show the same prompt as the home button, but resolve it by quitting
  // the app instead of returning home.
  useEffect(() => {
    function onCloseRequested(): void {
      if (!useProjectLifecycleStore.getState().isDirty) {
        window.spp?.confirmClose?.();
        return;
      }
      setExitAfterDialog(true);
      setShowBackHomeDialog(true);
    }
    window.addEventListener("spp2:close-requested", onCloseRequested);
    return () => window.removeEventListener("spp2:close-requested", onCloseRequested);
  }, []);

  const editorShortcuts = useMemo(
    () => [
      ...shortcutBindingsToShortcuts(shortcutSettings),
      { key: "z", ctrl: true, shift: true, action: "redo" }
    ],
    [shortcutSettings]
  );

  useEffect(() => {
    function onEditorShortcut(event: KeyboardEvent): void {
      if (document === null || activePage === null) return;
      if (isEditableShortcutTarget(event.target)) return;

      const action = matchShortcut(event, editorShortcuts);
      if (action === null) return;

      const hasSelection = selectedLayerIds.length > 0;
      const handledActions = new Set([
        "save", "saveAs", "undo", "redo", "delete", "duplicate", "selectAll", "deselect",
        "copy", "paste", "cut", "zoomIn", "zoomOut", "zoomFit", "zoom100",
        "toggleGrid", "toggleRulers", "settings", "quickContentFill", "contentFill",
        "rotate90Right", "rotate90Left", "centerToCanvas", "centerToTop", "centerToBottom", "exactSize"
      ]);
      if (!handledActions.has(action)) return;

      event.preventDefault();
      event.stopPropagation();

      if (isolatedImageEditRef.current !== null && (action === "save" || action === "saveAs")) {
        handleApplyIsolatedImageEdit();
        return;
      }

      if (imageEditMode) {
        if (action === "delete") handleDeleteSelection();
        if (action === "copy") void handleCopySelection();
        if (action === "cut") void handleCutSelection();
        if (action === "paste") handlePasteSelection();
        if (action === "undo" && useImageEditStore.getState().undoSelectionStep()) {
          setStatus("Selection step undone");
        }
        if (action === "deselect") {
          if (useImageEditStore.getState().selectionMask !== null) handleClearImageSelection();
          else handleImageEditCancel();
        }
        if (action === "quickContentFill") {
          if (useImageEditStore.getState().selectionMask !== null) void handleAiFillSelection();
          else useUiBusyStore.getState().flashToast("סמן אזור למחיקה ואז הפעל מילוי חכם");
        }
        if (action === "contentFill") {
          const fillTarget = getSmartSelectionTarget();
          if (fillTarget !== null) void openContentFillWorkspace(fillTarget.layer);
        }
        return;
      }

      switch (action) {
        case "save":
          void handleSaveLifecycle();
          break;
        case "saveAs":
          void handleSaveAsToDisk();
          break;
        case "undo":
          undo();
          setStatus("Undo");
          break;
        case "redo":
          redo();
          setStatus("Redo");
          break;
        case "delete":
          if (hasSelection) handleDeleteSelected();
          break;
        case "duplicate":
          if (hasSelection) handleDuplicateSelected();
          break;
        case "selectAll":
          handleSelectAllLayers();
          break;
        case "deselect":
          if (useDrawingToolsStore.getState().activeTool !== null) {
            useDrawingToolsStore.getState().setActiveTool(null);
          }
          clearSelection();
          setCollageSwapSourceSlotId(null);
          setCanvasContextMenu(null);
          setLayerContextMenu(null);
          setStatus("Selection cleared");
          break;
        case "copy":
          if (hasSelection) handleCopySelectedLayers();
          break;
        case "paste":
          void handlePasteLayers();
          break;
        case "cut":
          if (hasSelection) handleCutSelectedLayers();
          break;
        case "zoomIn":
          viewport.zoomIn();
          break;
        case "zoomOut":
          viewport.zoomOut();
          break;
        case "zoomFit":
          viewport.fitPage();
          break;
        case "zoom100":
          viewport.actualSize();
          break;
        case "toggleGrid":
          viewport.toggleGrid();
          break;
        case "toggleRulers":
          viewport.toggleRulers();
          break;
        case "settings":
          onOpenSettings?.();
          break;
        case "quickContentFill":
          if (selectedLayer?.type === "image") {
            enterImageEditMode(selectedLayer.id, { x: 0, y: 0, width: 1, height: 1 });
            useUiBusyStore.getState().flashToast("מצב מילוי חכם • סמן אזור ולחץ Shift+F5");
          } else {
            useUiBusyStore.getState().flashToast("בחר תמונה כדי להשתמש במילוי חכם");
          }
          break;
        case "contentFill":
          if (selectedLayer?.type === "image") void openContentFillWorkspace(selectedLayer);
          else useUiBusyStore.getState().flashToast("בחר תמונה כדי לפתוח מילוי מתקדם");
          break;
        case "smartExpand":
          if (selectedLayer?.type === "image" || (selectedLayer?.type === "frame" && layerHasEditableImage(selectedLayer))) {
            useSmartExpandStore.getState().open({ kind: "canvas", layerId: selectedLayer.id });
          } else {
            useUiBusyStore.getState().flashToast("יש לבחור תמונה כדי להשתמש בהרחבה חכמה.");
          }
          break;
        case "rotate90Right":
          if (hasSelection) rotateSelectionByEvent(90);
          break;
        case "rotate90Left":
          if (hasSelection) rotateSelectionByEvent(-90);
          break;
        case "centerToCanvas":
          if (hasSelection) handleCenterToCanvas("both");
          break;
        case "centerToTop":
          if (hasSelection) handleCenterToEdge("top");
          break;
        case "centerToBottom":
          if (hasSelection) handleCenterToEdge("bottom");
          break;
        case "exactSize":
          if (selectedLayerIds.length === 1 && selectedLayer !== null) setShowExactSizeDialog(true);
          break;
      }
    }

    window.addEventListener("keydown", onEditorShortcut, true);
    return () => window.removeEventListener("keydown", onEditorShortcut, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activePage,
    document,
    editorShortcuts,
    imageEditMode,
    layerClipboard,
    selectionClipboard,
    selectedLayerIds,
    selectedLayers,
    selectedLayer,
    enterImageEditMode,
    undo,
    redo,
    clearSelection,
    viewport,
    onOpenSettings
  ]);

  // Drawing tool shortcuts: I/B/G/U toggle drawing tools; M/L/W mark an image region (→ Shift+F5 fill)
  useEffect(() => {
    const KEY_TO_TOOL: Record<string, "eyedropper" | "brush" | "bucket" | "shape"> = {
      i: "eyedropper", I: "eyedropper",
      b: "brush", B: "brush",
      g: "bucket", G: "bucket",
      u: "shape", U: "shape"
    };
    const KEY_TO_REGION_TOOL: Record<string, "rect-select" | "lasso" | "wand"> = {
      m: "rect-select", M: "rect-select",
      l: "lasso", L: "lasso",
      w: "wand", W: "wand"
    };
    function onKey(event: KeyboardEvent): void {
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (isEditableShortcutTarget(event.target)) return;
      if (event.key === "Escape") {
        const store = useDrawingToolsStore.getState();
        if (store.activeTool !== null) {
          event.preventDefault();
          store.setActiveTool(null);
        }
        return;
      }
      const regionTool = KEY_TO_REGION_TOOL[event.key];
      if (regionTool !== undefined) {
        event.preventDefault();
        activateImageRegionToolRef.current(regionTool);
        return;
      }
      const tool = KEY_TO_TOOL[event.key];
      if (tool === undefined) return;
      event.preventDefault();
      const store = useDrawingToolsStore.getState();
      store.setActiveTool(store.activeTool === tool ? null : tool);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Batch production derived state — must be BEFORE any early return (Rules of Hooks)
  const batchProductionMeta = useMemo(
    () => (document !== null ? getBatchProductionMeta(document) : null),
    [document]
  );
  const variableLayerIds = useMemo(
    () => new Set((batchProductionMeta?.variableFields ?? []).map((f) => f.layerId)),
    [batchProductionMeta]
  );
  const [templateSaveModal, setTemplateSaveModal] = useState<{ name: string } | null>(null);
  const [cloudSaveAsModal, setCloudSaveAsModal] = useState<{ name: string } | null>(null);
  const [maskOverflowPrompt, setMaskOverflowPrompt] = useState<{ rule: MaskLayoutRule; patch: Partial<MaskLayoutRule> } | null>(null);

  if (document === null || activePage === null) {
    return (
      <main className="empty-state">
        <button className="btn btn-accent" onClick={onBackHome} type="button">
          חזרה למסך הבית
        </button>
      </main>
    );
  }

  const currentDocument = document;
  const currentPage = activePage;
  const currentPageIndex = Math.max(0, currentDocument.pages.findIndex((page) => page.id === currentPage.id));

  const handleSmartArrange = useCallback(
    (mode: SmartArrangeMode) => {
      const context = analyzeLayersForSmartArrange({
        page: currentPage,
        selectedLayerIds,
        mode
      });
      const result = runSmartArrange(context);
      const flashToast = useUiBusyStore.getState().flashToast;
      if (result.updates.length === 0) {
        flashToast("לא נמצאו שכבות מתאימות לסידור");
        return;
      }
      applySmartArrange(currentPage.id, result.updates, "SmartArrangeAction");
      flashToast("הסידור החכם הוחל • Ctrl+Z לביטול");
    },
    [currentPage, selectedLayerIds, applySmartArrange]
  );
  const suspiciousScreenshotCropAssets = currentDocument.assets.filter((asset) =>
    asset.kind === "image" &&
    getScreenshotCropSuggestion(asset) !== null &&
    getAppliedScreenshotCrop(asset) === null &&
    asset.metadata["screenshotCropIgnoredAt"] === undefined &&
    !dismissedScreenshotCropAssetIds.has(asset.id)
  );
  const activeScreenshotCropToastAssets = projectScreenshotCropMuted ? [] : suspiciousScreenshotCropAssets;

  function handleToggleBatchVariable(layer: VisualLayer): void {
    if (variableLayerIds.has(layer.id)) {
      handleBatchFieldChange(layer.id, null);
      return;
    }
    if (layer.type === "frame" || layer.type === "image") {
      const wasPlainImage = layer.type === "image";
      // A Variable Image field always lives on a FrameLayer. If the user
      // selected a plain ImageLayer, convert it in place first — same visible
      // bounds, image becomes the frame's placeholder, fitMode cover + clip.
      applyDocumentChange("SetBatchVariableFieldCommand", (doc) => {
        let nextDoc = doc;
        let droppedEffects = false;
        if (wasPlainImage) {
          const conv = convertImageLayerToVariableFrame(nextDoc, layer.id);
          nextDoc = conv.doc;
          droppedEffects = conv.effectsDropped;
        }
        nextDoc = upsertVariableField(nextDoc, {
          id: "photo",
          type: "image",
          layerId: layer.id,
          label: "תמונה",
          fitMode: "cover",
          smartCrop: false,
          preserveMask: true,
          applyImageAdjustmentsByDefault: false,
        });
        if (droppedEffects) {
          // Toast outside the updater so we don't fire it during render.
          queueMicrotask(() =>
            setStatus("האפקטים על התמונה לא נשמרו במעבר ל-Variable Slot"),
          );
        }
        return nextDoc;
      });
      return;
    }
    if (layer.type === "text") {
      handleBatchFieldChange(layer.id, {
        id: "name",
        type: "text",
        layerId: layer.id,
        label: "שם",
        sourceField: "name",
        preserveTextStyle: true,
        autoResize: true,
        minFontScale: 0.7,
      });
    }
  }

  function handleBatchFieldChange(layerId: string, field: BatchVariableField | null): void {
    applyDocumentChange("SetBatchVariableFieldCommand", (doc) => {
      if (field === null) return removeVariableFieldForLayer(doc, layerId);
      return upsertVariableField(doc, field);
    });
  }

  function handleSaveAsBatchTemplate(): void {
    const meta = getBatchProductionMeta(currentDocument);
    if (!meta || meta.variableFields.length === 0) {
      setStatus("שגיאה: לפחות שדה משתנה אחד נדרש — סמן שכבה כ'אלמנט מתחלף' קודם");
      return;
    }
    setTemplateSaveModal({ name: meta.templateName || currentDocument.name });
  }

  async function confirmSaveAsBatchTemplate(name: string): Promise<void> {
    setTemplateSaveModal(null);
    const meta = getBatchProductionMeta(currentDocument);
    if (!meta) return;

    const trimmed = name.trim();
    if (!trimmed) return;

    const updatedMeta = { ...meta, templateName: trimmed };
    const docToSave = setBatchProductionMeta(currentDocument, updatedMeta);

    let thumbnail: string | undefined;
    if (stageRef.current !== null) {
      try {
        thumbnail = captureProjectThumbnail(stageRef.current, currentPage);
      } catch {
        // thumbnail optional — save without it
      }
    }

    try {
      await saveTemplateToStore(docToSave, thumbnail);
      setStatus(`התבנית "${trimmed}" נשמרה בהצלחה ✓`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Save batch template failed:", err);
      setStatus(`שגיאה בשמירת התבנית: ${msg}`);
    }
  }

  function handleAddText(): void {
    const baseLayer = createStarterTextLayer(currentPage.width, currentPage.height);
    const layer = { ...baseLayer, color: useColorStore.getState().currentColor };
    addLayer(currentPage.id, layer);
    setSelection([layer.id]);
    setTool("text");
    setStatus("נוספה שכבת טקסט");
  }

  function handleFillFrameWithText(frame: FrameLayer): void {
    const base = createTextLayer({
      text: "טקסט",
      rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height }
    });
    const layer = {
      ...base,
      color: useColorStore.getState().currentColor,
      textFlow: { mode: "fitInsideShape" as const }
    };
    addLayer(currentPage.id, layer);
    attachTextToFrame(currentPage.id, frame.id, layer.id);
    setSelection([layer.id]);
    setStatus("הפריים מולא בטקסט");
  }

  function patchFrameTextFlow(textLayerId: string, patch: Partial<NonNullable<TextLayer["textFlow"]>>): void {
    const textLayer = currentPage.layers.find((item) => item.id === textLayerId);
    if (textLayer === undefined || textLayer.type !== "text") return;
    const nextFlow = { mode: "fitInsideShape" as const, ...(textLayer.textFlow ?? {}), ...patch };
    updateTextLayerStore(currentPage.id, textLayerId, { textFlow: nextFlow });
  }

  function layerZIndexAboveSelection(): number {
    const selected = selectedLayerId === null ? null : currentPage.layers.find((layer) => layer.id === selectedLayerId) ?? null;
    return selected === null
      ? currentPage.layers.reduce((max, layer) => Math.max(max, layer.zIndex), -1) + 1
      : selected.zIndex + 1;
  }

  function insertLayerAboveSelection(layer: VisualLayer, statusMessage: string): void {
    const insertZ = layer.zIndex;
    applyDocumentChange(
      "InsertLayerAboveSelectionCommand",
      (doc) => ({
        ...doc,
        pages: doc.pages.map((page) => page.id === currentPage.id
          ? {
              ...page,
              layers: [
                ...page.layers.map((item) => item.zIndex >= insertZ ? { ...item, zIndex: item.zIndex + 1 } : item),
                layer
              ]
            }
          : page)
      }),
      currentPage.id
    );
    setSelection([layer.id]);
    setStatus(statusMessage);
  }

  function handleAddAdjustmentLayer(operation: AdjustmentOperation): void {
    const layer = createAdjustmentLayer({
      name: adjustmentOperationLabel(operation),
      zIndex: layerZIndexAboveSelection(),
      rect: { x: 0, y: 0, width: currentPage.width, height: currentPage.height },
      operation
    });
    insertLayerAboveSelection(layer, `נוספה שכבת התאמה: ${adjustmentOperationLabel(operation)}`);
  }

  function handleAddGroup(): void {
    const existingGroupCount = currentPage.layers.filter((l) => l.type === "group").length;
    const layer = createGroupLayer({
      name: `קבוצה ${existingGroupCount + 1}`,
      zIndex: layerZIndexAboveSelection()
    });
    addLayer(currentPage.id, layer);
  }

  function handleDeleteGroup(groupId: string, deleteChildren: boolean): void {
    const group = currentPage.layers.find((l) => l.id === groupId) as GroupLayer | undefined;
    if (group === undefined) return;
    if (deleteChildren) {
      const toRemove = new Set([groupId, ...group.childIds]);
      applyDocumentChange(
        "DeleteGroupWithChildrenCommand",
        (doc) => ({
          ...doc,
          pages: doc.pages.map((p) =>
            p.id !== currentPage.id ? p : { ...p, layers: p.layers.filter((l) => !toRemove.has(l.id)) }
          )
        }),
        currentPage.id
      );
    } else {
      applyDocumentChange(
        "DeleteGroupOnlyCommand",
        (doc) => ({
          ...doc,
          pages: doc.pages.map((p) =>
            p.id !== currentPage.id ? p : {
              ...p,
              layers: p.layers
                .filter((l) => l.id !== groupId)
                .map((l) => l.parentId === groupId ? { ...l, parentId: undefined } : l)
            }
          )
        }),
        currentPage.id
      );
    }
  }

  function handleDuplicateGroup(groupId: string): void {
    const group = currentPage.layers.find((l) => l.id === groupId) as GroupLayer | undefined;
    if (group === undefined) return;
    const children = group.childIds
      .map((id) => currentPage.layers.find((l) => l.id === id))
      .filter((l): l is VisualLayer => l !== undefined);
    const now = Date.now();
    const newGroupId = `group-${now}`;
    const newChildIds: string[] = [];
    const newLayers: VisualLayer[] = [];
    children.forEach((child, i) => {
      const newId = `${child.type}-${now + i + 1}`;
      newChildIds.push(newId);
      newLayers.push({ ...child, id: newId, parentId: newGroupId, zIndex: child.zIndex - 1, selected: false });
    });
    const newGroup: GroupLayer = {
      ...group,
      id: newGroupId,
      name: `${group.name} (עותק)`,
      zIndex: group.zIndex - 1,
      childIds: newChildIds,
      selected: false
    };
    applyDocumentChange(
      "DuplicateGroupCommand",
      (doc) => ({
        ...doc,
        pages: doc.pages.map((p) =>
          p.id !== currentPage.id ? p : { ...p, layers: [...p.layers, newGroup, ...newLayers] }
        )
      }),
      currentPage.id
    );
  }

  function handleAddShapeLayer(): void {
    const size = Math.max(80, Math.min(currentPage.width, currentPage.height) * 0.18);
    const layer = createShapeLayer({
      name: "צורה",
      shape: "rect",
      rect: {
        x: currentPage.width / 2 - size / 2,
        y: currentPage.height / 2 - size / 2,
        width: size,
        height: size
      },
      zIndex: layerZIndexAboveSelection()
    });
    insertLayerAboveSelection({
      ...layer,
      fill: { version: 1, color: useColorStore.getState().currentColor, opacity: 1 }
    }, "נוספה שכבת צורה");
  }

  function convertPsdTextImageToEditable(layerId: string): void {
    const sourceLayer = currentPage.layers.find((item): item is ImageLayer => item.id === layerId && item.type === "image");
    if (sourceLayer === undefined) return;
    const psdText = readPsdTextMetadata(sourceLayer.metadata["psdText"]);
    if (psdText === null || psdText.text.trim().length === 0) {
      setStatus("אין נתוני טקסט זמינים לשכבת PSD זו");
      return;
    }
    const ok = window.confirm(
      "להמיר את שכבת הטקסט מ-PSD לטקסט עריך?\n\n" +
      "השכבה נראית כרגע כמו בפוטושופ בזכות PNG מיובא. אחרי המרה, אפקטים, עיוותים, פונט חסר או סגנונות Photoshop עשויים להשתנות."
    );
    if (!ok) return;
    const convertedLayerId = crypto.randomUUID();
    const fontSize = clampNumber(Math.max(12, sourceLayer.height * 0.42), 10, 220);
    const textLayer = createTextLayer({
      id: convertedLayerId,
      name: `${sourceLayer.name} - editable`,
      rect: {
        x: sourceLayer.x,
        y: sourceLayer.y,
        width: sourceLayer.width,
        height: sourceLayer.height
      },
      text: psdText.text,
      zIndex: sourceLayer.zIndex,
      metadata: {
        ...sourceLayer.metadata,
        source: "psd-import-text-converted",
        rasterAssetId: sourceLayer.assetId,
        rasterLayerId: sourceLayer.id,
        originalPsdFontNames: psdText.fontNames,
        convertedFromPsdTextAt: new Date().toISOString()
      }
    });
    const converted: TextLayer = {
      ...textLayer,
      visible: sourceLayer.visible,
      locked: sourceLayer.locked,
      opacity: sourceLayer.opacity,
      rotation: sourceLayer.rotation,
      blendMode: sourceLayer.blendMode,
      selected: false,
      fontFamily: "DM Sans",
      fontSize,
      color: psdText.color ?? textLayer.color,
      direction: "auto"
    };
    applyDocumentChange("ConvertPsdTextImageToEditableTextCommand", (doc) => ({
      ...doc,
      pages: doc.pages.map((page) => page.id === currentPage.id
        ? { ...page, layers: page.layers.map((layer) => layer.id === layerId ? converted : layer) }
        : page)
    }), currentPage.id);
    setSelection([converted.id]);
    setEditingLayerId(null);
    setTool("text");
    setStatus("שכבת PSD הומרה לטקסט רגיל. לחץ פעמיים על הטקסט כדי לערוך.");
  }

  async function handleOpenImageEditor(target: CanvasContextMenuTarget): Promise<void> {
    setCanvasContextMenu(null);
    if (!currentDocument || imageEditorBusy) return;

    // Resolve the asset for the target layer
    let asset = currentDocument.assets.find((a) => {
      const layer = currentPage?.layers.find((l) => l.id === target.layerId);
      if (!layer) return false;
      if (layer.type === "image") return a.id === layer.assetId;
      if (layer.type === "frame") return a.id === layer.imageAssetId;
      return false;
    });
    if (!asset) return;

    setImageEditorBusy(true);
    setStatus("עורך תמונות נפתח…");
    try {
      const updatedAsset = await openImageEditorForAsset(asset);
      if (updatedAsset) {
        updateAsset(updatedAsset);
        setStatus("התמונה עודכנה");
      } else {
        setStatus("עריכה בוטלה");
      }
    } catch {
      setStatus("שגיאה בפתיחת עורך התמונות");
    } finally {
      setImageEditorBusy(false);
    }
  }

  async function handleOpenInPhotoshop(target: CanvasContextMenuTarget): Promise<void> {
    setCanvasContextMenu(null);
    if (!currentDocument || !utilSettings.photoshopPath) {
      setStatus("נתיב Photoshop לא הוגדר — הגדר ב'כלי עזר → הגדרות'");
      return;
    }
    const layer = currentPage?.layers.find((l) => l.id === target.layerId);
    if (!layer) return;
    const asset = currentDocument.assets.find((a) => {
      if (layer.type === "image") return a.id === layer.assetId;
      if (layer.type === "frame") return a.id === layer.imageAssetId;
      return false;
    });
    if (!asset?.previewPath) return;

    const ext = asset.mimeType?.includes("png") ? "png" : "jpg";
    setStatus("פותח ב-Photoshop…");
    const { watchId, error } = await openInPhotoshop(
      utilSettings.photoshopPath,
      asset.previewPath,
      ext,
      (base64) => {
        const updated = { ...asset, previewPath: `data:image/${ext};base64,${base64}`, originalPath: `data:image/${ext};base64,${base64}` };
        updateAsset(updated);
        setStatus("התמונה עודכנה מ-Photoshop");
      }
    );
    if (error) {
      setStatus(`שגיאה: ${error}`);
    } else {
      setExtWatchId(watchId);
      setStatus("Photoshop נפתח — שמור בפוטושופ לעדכון אוטומטי");
    }
  }

  async function handleOpenInColorLab(target: CanvasContextMenuTarget): Promise<void> {
    setCanvasContextMenu(null);
    if (!currentDocument || !utilSettings.colorLabPath) {
      setStatus("נתיב ColorLab לא הוגדר — הגדר ב'כלי עזר → הגדרות'");
      return;
    }
    const layer = currentPage?.layers.find((l) => l.id === target.layerId);
    if (!layer) return;
    const asset = currentDocument.assets.find((a) => {
      if (layer.type === "image") return a.id === layer.assetId;
      if (layer.type === "frame") return a.id === layer.imageAssetId;
      return false;
    });
    if (!asset?.previewPath) return;

    const ext = asset.mimeType?.includes("png") ? "png" : "jpg";
    setStatus("פותח ב-ColorLab…");
    const { watchId, error } = await openInColorLab(
      utilSettings.colorLabPath,
      asset.previewPath,
      ext,
      (base64) => {
        const updated = { ...asset, previewPath: `data:image/${ext};base64,${base64}`, originalPath: `data:image/${ext};base64,${base64}` };
        updateAsset(updated);
        setStatus("התמונה עודכנה מ-ColorLab");
      }
    );
    if (error) {
      setStatus(`שגיאה: ${error}`);
    } else {
      setExtWatchId(watchId);
      setStatus("ColorLab נפתח — שמור לעדכון אוטומטי");
    }
  }

  function getCanvasMenuLayer(target: CanvasContextMenuTarget): Extract<VisualLayer, { type: "image" | "frame" }> | null {
    const layer = currentPage.layers.find((item) => item.id === target.layerId);
    if (layer?.type === "image" || layer?.type === "frame") return layer;
    return null;
  }

  function restoreIsolatedImageSource(session: IsolatedImageEditSession): void {
    useDocumentStore.setState(session.sourceDocumentState, true);
    useSelectionStore.setState(session.sourceSelectionState, true);
    useViewportStore.setState(session.sourceViewportState, true);
    isolatedImageEditRef.current = null;
    setIsolatedImageEdit(null);
    exitImageEditMode();
    exitMaskContentEdit();
  }

  function handleCancelIsolatedImageEdit(): void {
    const session = isolatedImageEditRef.current;
    if (session === null) return;
    restoreIsolatedImageSource(session);
    setStatus("עריכת התמונה המבודדת בוטלה");
  }

  useEffect(() => {
    function handleIsolatedEditEscape(event: KeyboardEvent): void {
      if (event.key !== "Escape" || isolatedImageEditRef.current === null) return;
      event.preventDefault();
      event.stopPropagation();
      handleCancelIsolatedImageEdit();
    }
    window.addEventListener("keydown", handleIsolatedEditEscape, true);
    return () => window.removeEventListener("keydown", handleIsolatedEditEscape, true);
  }, []);

  function openIsolatedImageEditor(target: CanvasContextMenuTarget): void {
    const frame = getCanvasMenuLayer(target);
    if (frame?.type !== "frame" || frame.imageAssetId === undefined) {
      setCanvasContextMenu(null);
      setStatus("עריכה מבודדת זמינה רק לתמונה בתוך תא");
      return;
    }
    const sourceAsset = currentDocument.assets.find((asset) => asset.id === frame.imageAssetId);
    const fullSource = sourceAsset?.originalPath ?? resolveCanvasAssetPath(sourceAsset);
    if (sourceAsset === undefined || fullSource === undefined) {
      setCanvasContextMenu(null);
      setStatus("לא ניתן לפתוח את התמונה המקורית לעריכה");
      return;
    }

    const width = Math.max(1, Math.round(sourceAsset.width ?? frame.width));
    const height = Math.max(1, Math.round(sourceAsset.height ?? frame.height));
    const isolatedAsset: Asset = {
      ...sourceAsset,
      previewPath: fullSource,
      thumbnailPath: fullSource,
      metadata: { ...sourceAsset.metadata, isolatedEditSource: true }
    };
    const isolatedLayer = createImageLayer({
      name: sourceAsset.name,
      rect: { x: 0, y: 0, width, height },
      assetId: isolatedAsset.id,
      fitMode: "stretch",
      zIndex: 0,
      metadata: { isolatedEditSource: true }
    });
    const isolatedPage = createPage({
      name: "עריכת תמונה מבודדת",
      setup: {
        size: { width, height },
        units: "px",
        dpi: currentDocument.dpi,
        orientation: width >= height ? "landscape" : "portrait",
        backgroundColor: "#ffffff",
        backgroundTransparent: false,
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
        safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
        bleed: { top: 0, right: 0, bottom: 0, left: 0 }
      },
      layers: [isolatedLayer],
      metadata: { isolatedImageEdit: true }
    });
    const isolatedDocument: Document = {
      ...createDocument({
        name: `עריכת תמונה - ${sourceAsset.name}`,
        dpi: currentDocument.dpi,
        pages: [isolatedPage],
        metadata: { mode: "free", isolatedImageEdit: true }
      }),
      assets: [isolatedAsset]
    };
    const session: IsolatedImageEditSession = {
      sourcePageId: currentPage.id,
      sourceFrameId: frame.id,
      sourceAssetId: sourceAsset.id,
      sourceWidth: width,
      sourceHeight: height,
      sourceDocumentState: useDocumentStore.getState(),
      sourceSelectionState: useSelectionStore.getState(),
      sourceViewportState: useViewportStore.getState()
    };

    isolatedImageEditRef.current = session;
    setIsolatedImageEdit(session);
    setCanvasContextMenu(null);
    exitImageEditMode();
    exitMaskContentEdit();
    useSelectionStore.getState().resetSelection();
    setDocument(isolatedDocument);
    requestAnimationFrame(() => {
      useSelectionStore.getState().setSelection([isolatedLayer.id]);
      useViewportStore.getState().fitPage();
    });
    setStatus("מצב עריכת תמונה מבודדת");
  }

  function handleApplyIsolatedImageEdit(): void {
    const session = isolatedImageEditRef.current;
    const stage = stageRef.current;
    if (session === null || stage === null) return;
    const temporaryDocument = useDocumentStore.getState().document;
    const temporaryPage = temporaryDocument?.pages[0];
    if (temporaryDocument === null || temporaryDocument === undefined || temporaryPage === undefined) return;
    if (Math.round(temporaryPage.width) !== session.sourceWidth || Math.round(temporaryPage.height) !== session.sourceHeight) {
      setStatus("לא ניתן להחיל: גודל קנבס העריכה השתנה");
      return;
    }

    const visibleLayerIds = new Set(
      temporaryPage.layers
        .filter((layer) => layer.visible !== false && layer.type !== "guide")
        .map((layer) => layer.id)
    );
    const raster = rasterizeLayers(stage, temporaryPage, visibleLayerIds, getPageBounds(temporaryPage), 1);
    const sourceAsset = session.sourceDocumentState.document?.assets.find((asset) => asset.id === session.sourceAssetId);
    const updatedAsset = createImageAssetFromDataUrl(
      raster.dataUrl,
      raster.width,
      raster.height,
      `${sourceAsset?.name.replace(/\.[^/.]+$/, "") ?? "image"} edited.png`
    );
    updatedAsset.metadata = {
      ...updatedAsset.metadata,
      isolatedEditSourceAssetId: session.sourceAssetId,
      isolatedEditSourceFrameId: session.sourceFrameId
    };

    restoreIsolatedImageSource(session);
    useDocumentStore.getState().applyDocumentChange("ApplyIsolatedFrameImageEdit", (doc) => {
      const sourceFrame = doc.pages
        .find((page) => page.id === session.sourcePageId)
        ?.layers.find((layer): layer is FrameLayer => layer.id === session.sourceFrameId && layer.type === "frame");
      const collageMeta = sourceFrame?.metadata["collageFrame"] as { collageRuleId?: string; slotId?: string } | undefined;
      const classPhotoMeta = sourceFrame?.metadata["classPhotoFrame"] as { ruleId?: string; personId?: string } | undefined;
      return {
        ...doc,
        assets: [...doc.assets, updatedAsset],
        gridImageAssignments: doc.gridImageAssignments.map((assignment) =>
          assignment.frameId === session.sourceFrameId ? { ...assignment, assetId: updatedAsset.id } : assignment
        ),
        maskImageAssignments: doc.maskImageAssignments.map((assignment) =>
          assignment.frameId === session.sourceFrameId ? { ...assignment, assetId: updatedAsset.id } : assignment
        ),
        photoPrintImageAssignments: doc.photoPrintImageAssignments.map((assignment) =>
          assignment.frameId === session.sourceFrameId ? { ...assignment, assetId: updatedAsset.id } : assignment
        ),
        collageRules: doc.collageRules.map((rule) => {
          if (collageMeta?.collageRuleId !== rule.id || collageMeta.slotId === undefined) return rule;
          let replacedPoolEntry = false;
          return {
            ...rule,
            imagePool: rule.imagePool.map((assetId) => {
              if (replacedPoolEntry || assetId !== session.sourceAssetId) return assetId;
              replacedPoolEntry = true;
              return updatedAsset.id;
            }),
            imageAssignments: rule.imageAssignments.map((assignment) =>
              assignment.slotId === collageMeta.slotId ? { ...assignment, assetId: updatedAsset.id } : assignment
            )
          };
        }),
        classPhotoRules: doc.classPhotoRules.map((rule) => ({
          ...rule,
          personRecords: rule.personRecords.map((person) =>
            person.frameLayerId === session.sourceFrameId || person.id === classPhotoMeta?.personId
              ? { ...person, assetId: updatedAsset.id }
              : person
          )
        })),
        pages: doc.pages.map((page) => page.id === session.sourcePageId ? {
          ...page,
          layers: page.layers.map((layer) =>
            layer.id === session.sourceFrameId && layer.type === "frame"
              ? { ...layer, imageAssetId: updatedAsset.id }
              : layer
          )
        } : page)
      };
    }, session.sourcePageId);
    useSelectionStore.getState().setSelection([session.sourceFrameId]);
    setStatus("התמונה עודכנה בתא");
  }

  function updateCanvasMenuLayer(
    target: CanvasContextMenuTarget,
    updater: (layer: Extract<VisualLayer, { type: "image" | "frame" }>) => Extract<VisualLayer, { type: "image" | "frame" }>,
    statusMessage?: string
  ): void {
    const layer = getCanvasMenuLayer(target);
    if (layer === null) return;
    updateLayer(currentPage.id, updater(layer));
    setSelection([layer.id]);
    setCanvasContextMenu(null);
    if (statusMessage !== undefined) setStatus(statusMessage);
  }

  function fitCanvasMenuLayer(target: CanvasContextMenuTarget, mode: "fill" | "fit"): void {
    updateCanvasMenuLayer(target, (layer) => {
      if (layer.width <= 0 || layer.height <= 0) return layer;
      return { ...layer, ...placeLayerToCanvas(layer, currentPage.width, currentPage.height, mode) };
    }, mode === "fill" ? "Image filled to canvas" : "Image fitted inside canvas");
  }

  function centerCanvasMenuLayer(target: CanvasContextMenuTarget): void {
    updateCanvasMenuLayer(target, (layer) => ({
      ...layer,
      ...placeLayerToCanvas(layer, currentPage.width, currentPage.height, "center")
    }), "Image centered on canvas");
  }

  function resetCanvasMenuLayerTransform(target: CanvasContextMenuTarget): void {
    updateCanvasMenuLayer(target, (layer) => {
      const metadata = { ...layer.metadata };
      delete metadata["flipH"];
      delete metadata["flipV"];
      if (layer.type === "image") {
        return {
          ...layer,
          rotation: 0,
          crop: { x: 0, y: 0, width: 1, height: 1 },
          imageOffsetX: 0,
          imageOffsetY: 0,
          imageScale: 1,
          metadata
        };
      }
      return {
        ...layer,
        rotation: 0,
        crop: { x: 0, y: 0, width: 1, height: 1 },
        contentTransform: { ...defaultContentTransform },
        metadata
      };
    }, "Image transform reset");
  }

  function applyQuickBorder(target: CanvasContextMenuTarget, color: "#ffffff" | "#000000"): void {
    updateCanvasMenuLayer(target, (layer) => {
      const stack: VisualEffectStack =
        "visualEffects" in layer && layer.visualEffects !== undefined
          ? layer.visualEffects
          : { version: 1, enabled: true, effects: [] };
      const stroke = stack.effects.find((effect) => effect.params.type === "stroke");
      const nextStroke: VisualEffect = stroke !== undefined
        ? {
            ...stroke,
            enabled: true,
            params: { ...(stroke.params as StrokeEffect), color, width: 20, position: "outside", opacity: 1 }
          }
        : {
            ...makeDefaultEffect("stroke"),
            params: { type: "stroke", color, width: 20, position: "outside", opacity: 1 }
          };
      const effects = stroke === undefined
        ? [...stack.effects, nextStroke]
        : stack.effects.map((effect) => effect.id === stroke.id ? nextStroke : effect);
      return { ...layer, visualEffects: { ...stack, enabled: true, effects } };
    }, color === "#ffffff" ? "White 20px border applied" : "Black 20px border applied");
  }

  function duplicateCanvasMenuLayer(target: CanvasContextMenuTarget): void {
    const layer = getCanvasMenuLayer(target);
    if (layer === null) return;
    const maxZIndex = Math.max(0, ...currentPage.layers.map((item) => item.zIndex));
    const clone = {
      ...(structuredClone(layer) as typeof layer),
      id: crypto.randomUUID(),
      name: `${layer.name} copy`,
      x: layer.x + 18,
      y: layer.y + 18,
      zIndex: maxZIndex + 1,
      selected: false,
      parentId: undefined,
      metadata: { ...layer.metadata }
    } as VisualLayer;
    applyDocumentChange("DuplicateContextLayerCommand", (doc) => ({
      ...doc,
      pages: doc.pages.map((page) => page.id === currentPage.id ? { ...page, layers: [...page.layers, clone] } : page)
    }), currentPage.id);
    setSelection([clone.id]);
    setCanvasContextMenu(null);
    setStatus("Layer duplicated");
  }

  function replaceCanvasMenuImage(target: CanvasContextMenuTarget): void {
    setSelection([target.layerId]);
    setCanvasContextMenu(null);
    requestAnimationFrame(() => replaceImageInputRef.current?.click());
  }

  function handleAddToLocalLibrary(): void {
    if (!canvasContextMenu) return;
    const layer = getCanvasMenuLayer(canvasContextMenu);
    setCanvasContextMenu(null);
    if (layer === null || layer.type !== "image") {
      setStatus("לא נמצאה תמונה לשמירה");
      return;
    }
    const asset = currentDocument.assets.find((a) => a.id === layer.assetId);
    if (!asset?.previewPath) {
      setStatus("לא נמצאה תמונה לשמירה");
      return;
    }
    const dataUrl = asset.previewPath;
    const match = /^data:image\/(\w+);base64,(.+)$/.exec(dataUrl);
    if (!match) {
      setStatus("פורמט תמונה לא נתמך");
      return;
    }
    const ext = match[1] === "jpeg" ? "jpg" : match[1];
    const base64 = match[2];
    const filename = (asset.name || layer.name || "graphic").replace(/\.[^.]+$/, "");
    void (async () => {
      try {
        const result = await window.spp.glib?.saveAsset({ base64, ext, filename, category: "Elements" });
        if (result?.success && result.filePath && result.fileName) {
          await useGraphicsLibraryStore.getState().addFileToIndex({
            filePath: result.filePath,
            fileName: result.fileName,
            mtimeMs: result.mtimeMs ?? Date.now(),
            size: result.size ?? base64.length,
          });
          // Switch to graphics tab so user sees the saved file immediately
          setLeftTab("emoji");
          useGraphicsLibraryStore.getState().setFilter("category", "Elements");
          setStatus(`"${filename}" נשמרה בספרייה המקומית`);
        } else {
          setStatus(result?.error ?? "שגיאה בשמירה לספרייה");
        }
      } catch {
        setStatus("שגיאה בשמירה לספרייה");
      }
    })();
  }

  function addCollageTemplateFromDataUrl(input: {
    name: string;
    sourceType: "image" | "text" | "svg" | "png" | "frameMask";
    fileDataUrl: string;
    width: number;
    height: number;
  }): void {
    addCollageShapeTemplate({
      name: input.name.trim() || "תבנית קולאג'",
      sourceType: input.sourceType,
      fileDataUrl: input.fileDataUrl,
      thumbnailDataUrl: input.fileDataUrl,
      defaultWidth: Math.max(1, Math.round(input.width)),
      defaultHeight: Math.max(1, Math.round(input.height)),
      maskMode: input.sourceType === "text" || input.sourceType === "frameMask" ? "alpha" : "auto",
      threshold: 245,
      alphaThreshold: 32,
      feather: 2,
      invert: false,
      metadata: { savedFromCanvas: true }
    });
    setCollageTemplateToast(`התבנית "${input.name.trim() || "קולאג'"}" נשמרה לספריית הקולאג'`);
    setStatus("נשמר כתבנית קולאג'");
  }

  function saveCanvasMenuAsCollageTemplate(target: CanvasContextMenuTarget): void {
    if (target.layerType === "text") {
      const layer = getCanvasMenuTextLayer(target);
      if (layer === null) return;
      const rendered = renderTextToAlphaCanvas(layer);
      const trimmed = rendered === null ? null : trimTransparentCanvas(rendered);
      if (trimmed === null) {
        setCanvasContextMenu(null);
        setStatus("לא ניתן לשמור טקסט ריק כתבנית קולאג'");
        return;
      }
      addCollageTemplateFromDataUrl({
        name: layer.name || layer.text || "Text collage shape",
        sourceType: "text",
        fileDataUrl: trimmed.canvas.toDataURL("image/png"),
        width: trimmed.width,
        height: trimmed.height
      });
      setCanvasContextMenu(null);
      return;
    }

    const layer = getCanvasMenuLayer(target);
    if (layer === null) return;
    if (layer.type === "frame" && layer.maskSource?.type === "alphaAsset") {
      const maskAsset = currentDocument.assets.find((asset) => asset.id === layer.maskSource?.assetId);
      const dataUrl = maskAsset?.originalPath ?? maskAsset?.previewPath ?? maskAsset?.thumbnailPath;
      if (dataUrl) {
        addCollageTemplateFromDataUrl({
          name: `${layer.name || "Frame"} collage shape`,
          sourceType: "frameMask",
          fileDataUrl: dataUrl,
          width: maskAsset?.width ?? layer.maskSource.width,
          height: maskAsset?.height ?? layer.maskSource.height
        });
        setCanvasContextMenu(null);
        return;
      }
    }

    const assetId = layer.type === "image" ? layer.assetId : layer.imageAssetId;
    const asset = currentDocument.assets.find((item) => item.id === assetId);
    const dataUrl = asset?.originalPath ?? asset?.previewPath ?? asset?.thumbnailPath;
    if (!asset || !dataUrl) {
      setCanvasContextMenu(null);
      setStatus("לא נמצאה תמונה לשמירה כתבנית קולאג'");
      return;
    }
    addCollageTemplateFromDataUrl({
      name: `${asset.name.replace(/\.[^.]+$/, "")} collage shape`,
      sourceType: "image",
      fileDataUrl: dataUrl,
      width: asset.width ?? layer.width,
      height: asset.height ?? layer.height
    });
    setCanvasContextMenu(null);
  }

  async function applyMaskFromSelectionToImageLayer(layerId: string, selectionData: Uint8Array, width: number, height: number): Promise<void> {
    if (activePage === null) return;
    const layer = activePage.layers.find((item): item is ImageLayer => item.id === layerId && item.type === "image");
    if (layer === undefined) return;

    const canvas = window.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;

    const existing = layer.pixelMask !== undefined
      ? currentDocument.assets.find((asset) => asset.id === layer.pixelMask!.assetId)
      : null;

    if (existing?.previewPath !== undefined) {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => { ctx.drawImage(img, 0, 0, width, height); resolve(); };
        img.src = existing.previewPath!;
      });
    } else {
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, width, height);
    }

    const imageDataObj = ctx.getImageData(0, 0, width, height);
    for (let i = 0; i < selectionData.length; i++) {
      if (selectionData[i] > 128) {
        imageDataObj.data[i * 4 + 3] = 0;
      }
    }
    ctx.putImageData(imageDataObj, 0, 0);

    const dataUrl = canvas.toDataURL("image/png");
    const maskAsset = createMaskAsset(dataUrl, width, height, layer.id);
    addAsset(maskAsset);
    updateLayer(activePage.id, {
      ...layer,
      pixelMask: { version: 1, assetId: maskAsset.id, width, height }
    });
  }

  async function selectCanvasMenuObject(target: CanvasContextMenuTarget): Promise<void> {
    const layer = getCanvasMenuLayer(target);
    if (layer?.type !== "image") {
      setStatus("Smart selection needs a free image layer");
      setCanvasContextMenu(null);
      return;
    }
    const asset = currentDocument.assets.find((item) => item.id === layer.assetId);
    if (asset === undefined) return;
    setCanvasContextMenu(null);
    setSelection([layer.id]);
    enterImageEditMode(layer.id);
    useImageEditStore.getState().setActiveTool("smart-select");
    setStatus("Preparing smart selection...");
    const store = useImageEditStore.getState();
    store.setSmartSelectionStatus("preparing", "Preparing smart selection...");
    store.setSmartSelectionProgress({ phase: "prepare", message: "Preparing smart selection...", percent: null });
    try {
      const result = await runSmartAutoSegment(asset, layer);
      if (result === null) {
        store.setSmartSelectionStatus("error", "Smart selection is unavailable");
        store.setSmartSelectionProgress(null);
        setStatus("Smart selection is unavailable");
        return;
      }
      const mask = await maskResultToSelectionMask(result, asset.hash ?? asset.checksum ?? asset.id);
      store.setSelectionMask(mask);
      store.setSmartSelectionStatus(result.fallback ? "fallback" : "ready", result.message ?? "Smart selection ready");
      store.setSmartSelectionProgress(null);
      setStatus(result.fallback ? "Smart selection used fallback preview" : "Smart selection ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Smart selection failed";
      store.setSmartSelectionStatus("error", message);
      store.setSmartSelectionProgress(null);
      setStatus(message);
    }
  }

  async function removeCanvasMenuBackground(target: CanvasContextMenuTarget): Promise<void> {
    const layer = getCanvasMenuLayer(target);
    if (layer?.type !== "image") {
      setStatus("Background removal needs a free image layer");
      setCanvasContextMenu(null);
      return;
    }
    const asset = currentDocument.assets.find((item) => item.id === layer.assetId);
    if (asset === undefined) return;
    setCanvasContextMenu(null);
    setSelection([layer.id]);
    setStatus("Removing background...");
    try {
      const result = await runSmartAutoSegment(asset, layer);
      if (result === null) {
        setStatus("Smart selection is unavailable");
        return;
      }
      const subjectMask = await maskResultToSelectionMask(result, asset.hash ?? asset.checksum ?? asset.id);
      const backgroundSelection = new Uint8Array(subjectMask.data.length);
      for (let i = 0; i < backgroundSelection.length; i++) {
        backgroundSelection[i] = subjectMask.data[i] > 128 ? 0 : 255;
      }
      await applyMaskFromSelectionToImageLayer(layer.id, backgroundSelection, subjectMask.width, subjectMask.height);
      useImageEditStore.getState().clearSelection();
      exitImageEditMode();
      setStatus("Background removed");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Background removal failed");
    }
  }

  function getCanvasMenuTextLayer(target: CanvasContextMenuTarget): Extract<VisualLayer, { type: "text" }> | null {
    const layer = currentPage.layers.find((item) => item.id === target.layerId);
    return layer?.type === "text" ? layer : null;
  }

  function updateCanvasMenuTextLayer(
    target: CanvasContextMenuTarget,
    updater: (layer: Extract<VisualLayer, { type: "text" }>) => Extract<VisualLayer, { type: "text" }>,
    statusMessage?: string
  ): void {
    const layer = getCanvasMenuTextLayer(target);
    if (layer === null) return;
    const next = updater(layer);
    const size = measureTextLayerSize(next);
    updateLayer(currentPage.id, { ...next, width: size.width, height: size.height });
    setSelection([layer.id]);
    setCanvasContextMenu(null);
    if (statusMessage !== undefined) setStatus(statusMessage);
  }

  function centerCanvasMenuText(target: CanvasContextMenuTarget, axis: "both" | "x" | "y"): void {
    updateCanvasMenuTextLayer(target, (layer) => {
      const origin = visualCenterToOrigin(layer, currentPage.width / 2, currentPage.height / 2);
      return {
        ...layer,
        ...(axis === "both" || axis === "x" ? { x: origin.x } : {}),
        ...(axis === "both" || axis === "y" ? { y: origin.y } : {})
      };
    }, axis === "both" ? "Text centered on canvas" : "Text aligned to canvas");
  }

  function applyQuickTextStroke(target: CanvasContextMenuTarget, color: "#ffffff" | "#000000"): void {
    updateCanvasMenuTextLayer(target, (layer) => ({
      ...layer,
      stroke: { version: 1, color, width: 4, opacity: 1 }
    }), color === "#ffffff" ? "White text stroke applied" : "Black text stroke applied");
  }

  function applyQuickTextShadow(target: CanvasContextMenuTarget, mode: "soft" | "hard"): void {
    updateCanvasMenuTextLayer(target, (layer) => ({
      ...layer,
      shadow: mode === "soft"
        ? { version: 1, color: "#000000", blur: 10, offsetX: 0, offsetY: 5, opacity: 0.22 }
        : { version: 1, color: "#000000", blur: 2, offsetX: 4, offsetY: 4, opacity: 0.55 }
    }), mode === "soft" ? "Soft text shadow applied" : "Hard text shadow applied");
  }

  function removeCanvasMenuTextEffects(target: CanvasContextMenuTarget): void {
    updateCanvasMenuTextLayer(target, (layer) => ({
      ...layer,
      stroke: undefined,
      shadow: undefined,
      gradient: undefined,
      effects: [],
      textEffects: []
    }), "Text effects removed");
  }

  function copyCanvasMenuTextStyle(target: CanvasContextMenuTarget): void {
    const layer = getCanvasMenuTextLayer(target);
    if (layer === null) return;
    copyTextStyle(currentPage.id, layer.id);
    setSelection([layer.id]);
    setCanvasContextMenu(null);
    setStatus("Text style copied");
  }

  function pasteCanvasMenuTextStyle(target: CanvasContextMenuTarget): void {
    const layer = getCanvasMenuTextLayer(target);
    if (layer === null) return;
    pasteTextStyle(currentPage.id, [layer.id]);
    setSelection([layer.id]);
    setCanvasContextMenu(null);
    setStatus("Text style pasted");
  }

  function trimTransparentCanvas(source: HTMLCanvasElement): { canvas: HTMLCanvasElement; x: number; y: number; width: number; height: number } | null {
    const ctx = source.getContext("2d");
    if (ctx === null) return null;
    const imageData = ctx.getImageData(0, 0, source.width, source.height);
    let minX = source.width;
    let minY = source.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        const alpha = imageData.data[(y * source.width + x) * 4 + 3] ?? 0;
        if (alpha <= 0) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    if (maxX < minX || maxY < minY) return null;
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const canvas = window.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const out = canvas.getContext("2d");
    if (out === null) return null;
    out.putImageData(ctx.getImageData(minX, minY, width, height), 0, 0);
    return { canvas, x: minX, y: minY, width, height };
  }

  function convertCanvasMenuTextToMask(target: CanvasContextMenuTarget): void {
    const layer = getCanvasMenuTextLayer(target);
    if (layer === null) return;
    const rendered = renderTextToAlphaCanvas(layer);
    if (rendered === null || rendered.width <= 0 || rendered.height <= 0) {
      setCanvasContextMenu(null);
      setStatus("Cannot create mask from empty text");
      return;
    }
    const trimmed = trimTransparentCanvas(rendered);
    if (trimmed === null) {
      setCanvasContextMenu(null);
      setStatus("Cannot create mask: text has no visible pixels");
      return;
    }
    const renderedWithOffset = rendered as HTMLCanvasElement & { sppTextOffsetX?: number; sppTextOffsetY?: number };
    const offsetX = renderedWithOffset.sppTextOffsetX ?? 0;
    const offsetY = renderedWithOffset.sppTextOffsetY ?? 0;
    const maskAsset = createMaskAsset(trimmed.canvas.toDataURL("image/png"), trimmed.width, trimmed.height, layer.id);
    const frame = createFrameLayer({
      id: layer.id,
      name: `${layer.name || "Text"} Mask`,
      rect: {
        x: layer.x - offsetX + trimmed.x,
        y: layer.y - offsetY + trimmed.y,
        width: trimmed.width,
        height: trimmed.height
      },
      behaviorMode: "freeform",
      shape: "customMask",
      contentType: "empty",
      fitMode: "fill",
      contentTransform: { ...defaultContentTransform },
      lockedContent: layer.locked,
      lockedFrame: layer.locked,
      zIndex: layer.zIndex,
      maskSource: {
        version: 1,
        type: "alphaAsset",
        assetId: maskAsset.id,
        width: trimmed.width,
        height: trimmed.height
      }
    });
    applyDocumentChange("ConvertTextToFrameMaskCommand", (doc) => ({
      ...doc,
      assets: [...doc.assets, maskAsset],
      pages: doc.pages.map((page) => page.id === currentPage.id ? {
        ...page,
        layers: page.layers.map((item) => item.id === layer.id ? {
          ...frame,
          rotation: layer.rotation,
          visible: layer.visible,
          opacity: layer.opacity,
          blendMode: layer.blendMode,
          selected: layer.selected
        } : item)
      } : page)
    }), currentPage.id);
    setSelection([frame.id]);
    setCanvasContextMenu(null);
    setStatus("Text converted to mask");
  }

  function duplicateCanvasMenuTextLayer(target: CanvasContextMenuTarget): void {
    const layer = getCanvasMenuTextLayer(target);
    if (layer === null) return;
    const maxZIndex = Math.max(0, ...currentPage.layers.map((item) => item.zIndex));
    const clone = {
      ...(structuredClone(layer) as typeof layer),
      id: crypto.randomUUID(),
      name: `${layer.name} copy`,
      x: layer.x + 18,
      y: layer.y + 18,
      zIndex: maxZIndex + 1,
      selected: false,
      parentId: undefined,
      metadata: { ...layer.metadata }
    } as VisualLayer;
    applyDocumentChange("DuplicateContextTextLayerCommand", (doc) => ({
      ...doc,
      pages: doc.pages.map((page) => page.id === currentPage.id ? { ...page, layers: [...page.layers, clone] } : page)
    }), currentPage.id);
    setSelection([clone.id]);
    setCanvasContextMenu(null);
    setStatus("Text duplicated");
  }

  function deleteCanvasMenuTarget(target: CanvasContextMenuTarget): void {
    removeLayer(currentPage.id, target.layerId);
    setCanvasContextMenu(null);
    clearSelection();
    setStatus("Layer deleted");
  }

  function handleInsertGraphic(fileUrl: string, name: string, fallbackUrl?: string): void {
    void (async () => {
      try {
        const tryFetch = async (url: string): Promise<Blob | null> => {
          try {
            const res = await fetch(url);
            if (res.ok) return res.blob();
          } catch {}
          return null;
        };
        let blob = await tryFetch(fileUrl);
        if (!blob && fallbackUrl) blob = await tryFetch(fallbackUrl);
        if (!blob) { setStatus("שגיאה בטעינת גרפיקה"); return; }
        const isSvg = fileUrl.includes(".svg") || (fallbackUrl ?? "").includes(".svg");
        const ext  = isSvg ? "svg" : "png";
        const mime = isSvg ? "image/svg+xml" : "image/png";
        const file = new File([blob], `${name}.${ext}`, { type: mime });
        const { asset } = await importImageAssetForEditor(file, currentDocument.assets, { createPreview: true });
        const layer = createFreeImageLayer(asset, currentPage.width, currentPage.height);
        addAssetAndLayer(currentPage.id, asset, layer);
        setSelection([layer.id]);
        setStatus(`"${name}" נוסף`);
      } catch {
        setStatus("שגיאה בהוספת גרפיקה");
      }
    })();
  }

  function handleInsertQRToCanvas(dataUrl: string): void {
    void (async () => {
      try {
        const file = await dataUrlToFile(dataUrl, "qr-code.png");
        const { asset } = await importImageAssetForEditor(file, currentDocument.assets, { createPreview: true });
        const maxZIndex = Math.max(0, ...currentPage.layers.map((l) => l.zIndex));
        const layer = createFreeImageLayer(asset, currentPage.width, currentPage.height);
        addAssetAndLayer(currentPage.id, asset, layer);
        setStatus("קוד QR נוסף לקנבס");
      } catch {
        setStatus("שגיאה בהכנסת QR");
      }
    })();
  }

  function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
    return fetch(dataUrl).then((r) => r.blob()).then((b) => new File([b], filename, { type: "image/png" }));
  }

  function clampFrameLayerToAssetCrop(layer: FrameLayer, asset: Asset | undefined): FrameLayer {
    if (asset === undefined || asset.width === undefined || asset.height === undefined) return layer;
    const sourceSize = getEffectiveSourceSize(asset, asset.width, asset.height);
    return {
      ...layer,
      contentTransform: clampContentTransformToFillBounds(
        layer.contentTransform,
        layer.width,
        layer.height,
        sourceSize.width,
        sourceSize.height,
        layer.fitMode,
        layer.padding
      )
    };
  }

  function handleCanvasLayerChange(layer: VisualLayer): void {
    if (isGridMode && activeGridRule !== null && layer.type === "frame" && layer.metadata["gridCell"] !== undefined) {
      const asset = currentDocument.assets.find((item) => item.id === layer.imageAssetId);
      const nextLayer = clampFrameLayerToAssetCrop(layer, asset);
      const contentChanged = !sameContentTransform(nextLayer.contentTransform, selectedLayer?.type === "frame" ? selectedLayer.contentTransform : undefined) ||
        nextLayer.fitMode !== (selectedLayer?.type === "frame" ? selectedLayer.fitMode : nextLayer.fitMode);
      const editParams = frameImageEditParams(nextLayer);
      applyDocumentChange(
        "UpdateGridCellContentCommand",
        (doc) => ({
          ...doc,
          pages: doc.pages.map((page) => page.id === currentPage.id
            ? { ...page, layers: page.layers.map((item) => (item.id === nextLayer.id ? nextLayer : item)) }
            : page),
          gridImageAssignments: doc.gridImageAssignments.map((assignment) => assignment.gridId === activeGridRule.id && assignment.frameId === nextLayer.id
            ? {
                ...assignment,
                manualContentTransform: contentChanged ? nextLayer.contentTransform : assignment.manualContentTransform,
                manualFitModeOverride: contentChanged ? nextLayer.fitMode : assignment.manualFitModeOverride,
                imageEditParams: editParams,
                visualEffects: nextLayer.visualEffects,
                hasManualCropOverride: assignment.hasManualCropOverride || contentChanged,
                hasManualRotationOverride: assignment.hasManualRotationOverride || (contentChanged && nextLayer.contentTransform.rotation !== 0)
              }
            : assignment)
        }),
        currentPage.id
      );
      return;
    }

    if (isCollageMode && activeCollageRule !== null && layer.type === "frame" &&
        (layer.metadata["collageFrame"] as { isCollageFrame?: boolean } | undefined)?.isCollageFrame === true) {
      const collageMeta = layer.metadata["collageFrame"] as { slotId?: string } | undefined;
      if (collageMeta?.slotId) {
        const asset = currentDocument.assets.find((item) => item.id === layer.imageAssetId);
        const nextLayer = clampFrameLayerToAssetCrop(layer, asset);
        const editParams = frameImageEditParams(nextLayer);
        applyDocumentChange(
          "UpdateCollageFrameImageToolsCommand",
          (doc) => ({
            ...doc,
            pages: doc.pages.map((page) => page.id === currentPage.id
              ? {
                  ...page,
                  layers: page.layers.map((item) => item.id === nextLayer.id
                    ? {
                        ...nextLayer,
                        metadata: (() => {
                          const { collageImageEditParams: _discarded, ...metadata } = nextLayer.metadata;
                          return editParams === undefined
                            ? metadata
                            : { ...metadata, collageImageEditParams: editParams as unknown as import("@/types/primitives").JsonValue };
                        })()
                      }
                    : item)
                }
              : page),
            collageRules: doc.collageRules.map((rule) => rule.id === activeCollageRule.id
              ? {
                  ...rule,
                  imageAssignments: rule.imageAssignments.map((assignment) => assignment.slotId === collageMeta.slotId
                    ? {
                        ...assignment,
                        contentTransform: nextLayer.contentTransform,
                        fitMode: nextLayer.fitMode,
                        hasManualTransform: true,
                        imageEditParams: editParams,
                        visualEffects: nextLayer.visualEffects
                      }
                    : assignment)
                }
              : rule)
          }),
          currentPage.id
        );
      }
      return;
    }

    if (isPhotoPrintMode && activePhotoPrintRule !== null && layer.type === "frame" && layer.metadata["photoPrintSlot"] !== undefined) {
      const asset = currentDocument.assets.find((item) => item.id === layer.imageAssetId);
      const nextLayer = clampFrameLayerToAssetCrop(layer, asset);
      const contentChanged = !sameContentTransform(nextLayer.contentTransform, selectedLayer?.type === "frame" ? selectedLayer.contentTransform : undefined) ||
        nextLayer.fitMode !== (selectedLayer?.type === "frame" ? selectedLayer.fitMode : nextLayer.fitMode);
      const editParams = frameImageEditParams(nextLayer);
      applyDocumentChange(
        "UpdatePhotoPrintFrameContentCommand",
        (doc) => ({
          ...doc,
          pages: doc.pages.map((page) => page.id === currentPage.id
            ? { ...page, layers: page.layers.map((item) => (item.id === nextLayer.id ? nextLayer : item)) }
            : page),
          photoPrintImageAssignments: doc.photoPrintImageAssignments.map((assignment) => assignment.photoPrintId === activePhotoPrintRule.id && assignment.frameId === nextLayer.id
            ? {
                ...assignment,
                manualContentTransform: contentChanged ? nextLayer.contentTransform : assignment.manualContentTransform,
                manualFitModeOverride: contentChanged ? nextLayer.fitMode : assignment.manualFitModeOverride,
                imageEditParams: editParams,
                visualEffects: nextLayer.visualEffects,
                hasManualCropOverride: assignment.hasManualCropOverride || contentChanged,
                hasManualRotationOverride: assignment.hasManualRotationOverride || (contentChanged && nextLayer.contentTransform.rotation !== 0)
              }
            : assignment)
        }),
        currentPage.id
      );
      return;
    }

    if (isMaskMode && activeMaskRule !== null && layer.type === "frame" && layer.metadata["maskFrame"] !== undefined) {
      const asset = currentDocument.assets.find((item) => item.id === layer.imageAssetId);
      const nextLayer = clampFrameLayerToAssetCrop(layer, asset);
      const contentChanged = !sameContentTransform(nextLayer.contentTransform, selectedLayer?.type === "frame" ? selectedLayer.contentTransform : undefined) ||
        nextLayer.fitMode !== (selectedLayer?.type === "frame" ? selectedLayer.fitMode : nextLayer.fitMode);
      const editParams = frameImageEditParams(nextLayer);
      applyDocumentChange(
        "UpdateMaskFrameContentCommand",
        (doc) => ({
          ...doc,
          pages: doc.pages.map((page) => page.id === currentPage.id
            ? { ...page, layers: page.layers.map((item) => (item.id === nextLayer.id ? nextLayer : item)) }
            : page),
          maskImageAssignments: doc.maskImageAssignments.map((assignment) => assignment.maskId === activeMaskRule.id && assignment.frameId === nextLayer.id
            ? {
                ...assignment,
                manualContentTransform: contentChanged ? nextLayer.contentTransform : assignment.manualContentTransform,
                manualFitModeOverride: contentChanged ? nextLayer.fitMode : assignment.manualFitModeOverride,
                imageEditParams: editParams,
                visualEffects: nextLayer.visualEffects,
                hasManualCropOverride: assignment.hasManualCropOverride || contentChanged,
                hasManualRotationOverride: assignment.hasManualRotationOverride || (contentChanged && nextLayer.contentTransform.rotation !== 0)
              }
            : assignment)
        }),
        currentPage.id
      );
      return;
    }

    if (isClassPhotoMode && activeClassPhotoRule !== null && layer.type === "frame" && layer.metadata["classPhotoFrame"] !== undefined) {
      const classMeta = layer.metadata["classPhotoFrame"] as { personId?: string; ruleId?: string } | undefined;
      const nextLayer = clampFrameLayerToAssetCrop(layer, currentDocument.assets.find((item) => item.id === layer.imageAssetId));
      const contentChanged = !sameContentTransform(nextLayer.contentTransform, selectedLayer?.type === "frame" ? selectedLayer.contentTransform : undefined);
      const editParams = frameImageEditParams(nextLayer);
      applyDocumentChange(
        "UpdateClassPhotoFrameImageToolsCommand",
        (doc) => ({
          ...doc,
          pages: doc.pages.map((page) => page.id === currentPage.id
            ? { ...page, layers: page.layers.map((item) => (item.id === nextLayer.id ? nextLayer : item)) }
            : page),
          classPhotoRules: doc.classPhotoRules.map((rule) => rule.id === activeClassPhotoRule.id
            ? {
                ...rule,
                personRecords: rule.personRecords.map((record) => record.id === classMeta?.personId
                  ? {
                      ...record,
                      manualImageCrop: contentChanged
                        ? { x: nextLayer.contentTransform.offsetX, y: nextLayer.contentTransform.offsetY, width: 1, height: 1 }
                        : record.manualImageCrop,
                      manualImageScale: contentChanged ? nextLayer.contentTransform.scale : record.manualImageScale,
                      manualImageRotation: contentChanged ? nextLayer.contentTransform.rotation : record.manualImageRotation,
                      hasManualCropOverride: record.hasManualCropOverride || contentChanged,
                      hasManualRotationOverride: record.hasManualRotationOverride || (contentChanged && nextLayer.contentTransform.rotation !== 0),
                      imageEditParams: editParams,
                      visualEffectsOverride: nextLayer.visualEffects
                    }
                  : record)
              }
            : rule)
        }),
        currentPage.id
      );
      return;
    }

    updateLayer(currentPage.id, layer);
  }

  function getLayerImageAssetId(layer: VisualLayer | null): string | null {
    if (layer?.type === "image") return layer.assetId;
    if (layer?.type === "frame") return layer.imageAssetId ?? null;
    return null;
  }

  function updateScreenshotCropAssets(assetIds: string[], mode: "apply" | "ignore" | "reset"): void {
    const ids = new Set(assetIds);
    if (ids.size === 0) return;
    applyDocumentChange(
      mode === "apply" ? "ApplySmartScreenshotCropCommand" : mode === "ignore" ? "IgnoreSmartScreenshotCropCommand" : "ResetSmartScreenshotCropCommand",
      (doc) => {
        const appliedCropByAssetId = new Map<string, ScreenshotCropSuggestionMetadata>();
        const assets = doc.assets.map((asset) => {
          if (!ids.has(asset.id)) return asset;
          if (mode === "reset") return resetScreenshotCropForAsset(asset);
          if (mode === "ignore") return ignoreScreenshotCropForAsset(asset);
          const suggestion = getScreenshotCropSuggestion(asset);
          if (suggestion !== null) appliedCropByAssetId.set(asset.id, suggestion);
          return suggestion === null ? asset : applyScreenshotCropToAsset(asset, suggestion);
        });
        if (mode !== "apply" || appliedCropByAssetId.size === 0) return { ...doc, assets };

        return {
          ...doc,
          assets,
          pages: doc.pages.map((page) => ({
            ...page,
            layers: page.layers.map((layer) => {
              if (layer.type === "image") {
                const suggestion = appliedCropByAssetId.get(layer.assetId);
                const cropRect = suggestion?.cropRect ?? null;
                if (cropRect === null || cropRect.height <= 0) return layer;
                const nextAspect = cropRect.width / cropRect.height;
                return {
                  ...layer,
                  height: Math.max(1, layer.width / Math.max(0.001, nextAspect)),
                  crop: { x: 0, y: 0, width: 1, height: 1 }
                };
              }
              if (layer.type === "frame" && layer.imageAssetId !== undefined && appliedCropByAssetId.has(layer.imageAssetId)) {
                return {
                  ...layer,
                  crop: { x: 0, y: 0, width: 1, height: 1 }
                };
              }
              return layer;
            })
          }))
        };
      },
      currentPage.id
    );
    setDismissedScreenshotCropAssetIds((previous) => {
      const next = new Set(previous);
      assetIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function handleSmartScreenshotCropSelectedImages(): Promise<void> {
    const assetId = getLayerImageAssetId(selectedLayer);
    const asset = currentDocument.assets.find((item) => item.id === assetId);
    const src = resolveCanvasAssetPath(asset);
    if (asset === undefined || src === undefined) {
      setStatus("בחר תמונה כדי לחתוך שוליים שחורים");
      return;
    }
    try {
      const image = await loadHtmlImage(src);
      const analysis = await analyzeScreenshotCrop(image);
      markDebugEvent("smart-screenshot-crop:manual-analysis", {
        assetId: asset.id,
        name: asset.name,
        confidence: analysis.confidence,
        cropRect: analysis.cropRect,
        removedPixels: analysis.removedPixels,
        reasons: analysis.reasons
      });
      if (!analysis.isSuspicious || analysis.cropRect === null) {
        setStatus("לא נמצאו שוליים שחורים משמעותיים בתמונה הזו.");
        return;
      }
      const croppedAsset = await cropAssetBitmapDestructive(asset, image, analysis.cropRect);
      const newAspect = croppedAsset.width !== undefined && croppedAsset.height !== undefined && croppedAsset.height > 0
        ? croppedAsset.width / croppedAsset.height
        : 1;
      applyDocumentChange(
        "ApplyManualSmartScreenshotCropCommand",
        (doc) => ({
          ...doc,
          assets: doc.assets.map((item) => item.id === asset.id ? croppedAsset : item),
          pages: doc.pages.map((page) => ({
            ...page,
            layers: page.layers.map((layer) => {
              if (layer.type === "image" && layer.assetId === asset.id) {
                const nextHeight = Math.max(1, layer.width / newAspect);
                return {
                  ...layer,
                  height: nextHeight,
                  crop: { x: 0, y: 0, width: 1, height: 1 }
                };
              }
              if (layer.type === "frame" && layer.imageAssetId === asset.id) {
                // Frame size is layout-managed; just reset crop so the cropped
                // bitmap fills via the layer's existing fitMode without stretching.
                return {
                  ...layer,
                  crop: { x: 0, y: 0, width: 1, height: 1 }
                };
              }
              return layer;
            })
          }))
        }),
        currentPage.id
      );
      setStatus("השוליים השחורים נחתכו בלי לעוות את התמונה");
    } catch {
      setStatus("לא ניתן לנתח את התמונה לחיתוך שוליים");
    }
  }

  function handleResetSmartScreenshotCropSelectedImage(): void {
    const assetId = getLayerImageAssetId(selectedLayer);
    if (assetId === null) {
      setStatus("בחר תמונה כדי לאפס חיתוך שוליים");
      return;
    }
    updateScreenshotCropAssets([assetId], "reset");
    setStatus("חיתוך השוליים אופס");
  }

  /**
   * Returns the topmost Frame layer whose AABB contains the given client point,
   * or null if none. Used to route image drops into Frame/Mask placeholders.
   */
  function findFrameAtClientPoint(clientX: number, clientY: number): FrameLayer | null {
    const stage = stageRef.current;
    if (stage === null) return null;
    const container = stage.container();
    const rect = container.getBoundingClientRect();
    const screen = { x: clientX - rect.left, y: clientY - rect.top };
    const transform = stage.getAbsoluteTransform().copy().invert();
    const pt = transform.point(screen);
    const candidates = currentPage.layers
      .filter((layer): layer is FrameLayer => layer.type === "frame" && layer.visible && !layer.locked)
      .sort((a, b) => b.zIndex - a.zIndex);
    for (const frame of candidates) {
      if (pt.x >= frame.x && pt.x <= frame.x + frame.width
        && pt.y >= frame.y && pt.y <= frame.y + frame.height) {
        return frame;
      }
    }
    return null;
  }

  function confirmLargeFiles(files: File[]): boolean {
    const thresholdMb = Math.max(1, performanceSettings.warnLargeFileMb);
    const largeFiles = files.filter((file) => file.size / 1024 / 1024 >= thresholdMb);
    if (largeFiles.length === 0) return true;
    const totalMb = largeFiles.reduce((sum, file) => sum + file.size / 1024 / 1024, 0);
    return window.confirm(
      `Some imported files are larger than ${thresholdMb} MB.\n` +
      `${largeFiles.length} file(s), ${totalMb.toFixed(1)} MB total.\n\n` +
      "Continue importing?"
    );
  }

  async function importImageAssetForEditor(
    file: File,
    existingAssets: typeof currentDocument.assets,
    options: Parameters<typeof importImageAsset>[2] = {}
  ): ReturnType<typeof importImageAsset> {
    return importImageAsset(file, existingAssets, {
      ...options,
      previewMaxSize: options.previewMaxSize ?? getImportPreviewMaxSide(performanceSettings)
    });
  }

  async function handleImageFiles(files: FileList | File[], targetFrameId?: string): Promise<void> {
    const { files: imageFiles, failed, message: failureMessage } = await normalizeIncomingImages(Array.from(files).filter(isSupportedIncomingImageFile));
    if (failed.length > 0) setStatus(failureMessage ?? HEIC_CONVERSION_ERROR_MESSAGE);
    if (!confirmLargeFiles(imageFiles)) {
      setStatus("Image import cancelled");
      return;
    }
    if (targetFrameId !== undefined && imageFiles.length > 0) {
      const file = imageFiles[0];
      const { asset } = await importImageAssetForEditor(file, currentDocument.assets, { createPreview: true });
      applyDocumentChange(
        "InsertImageIntoFrameCommand",
        (doc) => insertImageIntoFrameDoc(
          { ...doc, assets: doc.assets.some((a) => a.id === asset.id) ? doc.assets : [...doc.assets, asset] },
          currentPage.id,
          targetFrameId,
          asset.id,
          "insert"
        ),
        currentPage.id
      );
      setSelection([targetFrameId]);
      setStatus("התמונה הוכנסה לפריים");
      return;
    }
    if (isGridMode && activeGridRule !== null) {
      const assets: Asset[] = [];
      for (const file of imageFiles) {
        const { asset } = await importImageAssetForEditor(file, currentDocument.assets, { createPreview: true });
        assets.push(asset);
      }
      if (assets.length > 0) {
        applyDocumentChange(
          "AddImagesToGridCommand",
          (doc) => addImagesToGrid(doc, activeGridRule.id, assets.map((asset) => ({ asset }))),
          currentPage.id
        );
        setStatus(`Grid: נוספו ${assets.length} תמונות`);
      }
      return;
    }
    if (isMaskMode && activeMaskRule !== null) {
      const assets: Asset[] = [];
      for (const file of imageFiles) {
        const { asset } = await importImageAssetForEditor(file, currentDocument.assets, { createPreview: true });
        assets.push(asset);
      }
      if (assets.length > 0) {
        applyDocumentChange(
          "AddImagesToMaskCommand",
          (doc) => addImagesToMask(doc, activeMaskRule.id, assets.map((asset) => ({ asset }))),
          currentPage.id
        );
        setStatus(`Mask: added ${assets.length} images`);
      }
      return;
    }
    for (const file of imageFiles) {
      const { asset } = await importImageAssetForEditor(file, currentDocument.assets, { createPreview: true });
      const layer = createFreeImageLayer(asset, currentPage.width, currentPage.height);
      addAssetAndLayer(currentPage.id, asset, layer);
      setSelection([layer.id]);
    }
    if (imageFiles.length > 0) {
      setTool("image");
      setStatus(`נוספו ${imageFiles.length} תמונות`);
    }
  }

  // ─── PDF import ───────────────────────────────────────────────────────────
  function isPdfFile(file: File): boolean {
    return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  }

  /** Open the PDF import dialog for the first PDF among the given files. */
  function openPdfImport(files: FileList | File[]): void {
    const pdf = Array.from(files).find(isPdfFile);
    if (pdf !== undefined) setPdfImportFile(pdf);
  }

  async function handlePdfImportConfirm(result: { mode: PdfImportMode; pages: PdfImportRenderedPage[] }): Promise<void> {
    const { mode, pages } = result;
    const fileName = pdfImportFile?.name ?? "document.pdf";
    setPdfImportFile(null);
    if (pages.length === 0) return;
    await runWithBusy("מוסיף PDF לפרויקט…", () => {
      if (mode === "currentCanvas") {
        const baseZIndex = Math.max(0, ...currentPage.layers.map((l) => l.zIndex)) + 1;
        const build = buildCanvasImports(pages, fileName, currentPage.width, currentPage.height, baseZIndex);
        applyDocumentChange(
          "ImportPdfToCanvasCommand",
          (doc) => applyImportToCurrentCanvas(doc, currentPage.id, build),
          currentPage.id
        );
        setSelection(build.layers.map((layer) => layer.id));
        setTool("image");
        setStatus(`נוספו ${build.layers.length} עמודי PDF לקנבס`);
      } else {
        const build = buildSeparatePageImports(pages, fileName, currentPage.setup, currentPage.width, currentPage.height);
        const firstNewPageId = build.pages[0]?.id ?? currentPage.id;
        applyDocumentChange("ImportPdfAsPagesCommand", (doc) => applyImportAsSeparatePages(doc, build), firstNewPageId);
        setStatus(`נוספו ${build.pages.length} עמודי PDF כעמודים נפרדים`);
      }
    });
  }

  async function handleProjectLoad(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    if (!confirmLargeFiles([file])) {
      event.target.value = "";
      setStatus("Project load cancelled");
      return;
    }
    const envelope = await loadProject(file);
    setDocument(withProjectMetadata(envelope.document, envelope.metadata));
    viewport.setViewport(envelope.document.viewport);
    clearSelection();
    setStatus("הפרויקט נטען");
    event.target.value = "";
  }

  function handleImageInput(event: ChangeEvent<HTMLInputElement>): void {
    const files = event.target.files;
    if (files !== null) {
      if (Array.from(files).some(isPdfFile)) openPdfImport(files);
      else void handleImageFiles(files);
    }
    event.target.value = "";
  }

  function handlePdfInput(event: ChangeEvent<HTMLInputElement>): void {
    const files = event.target.files;
    if (files !== null) openPdfImport(files);
    event.target.value = "";
  }

  // Replace image: swap the asset on the currently selected image/frame layer.
  // For collage frames, also updates imagePool + imageAssignments so layout rebuilds
  // don't revert to the old image.
  async function handleReplaceImageInput(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined || selectedLayer === null) return;
    if (selectedLayer.type !== "image" && selectedLayer.type !== "frame") return;

    if (!confirmLargeFiles([file])) return;
    let normalizedFile: File;
    try {
      normalizedFile = await normalizeIncomingImage(file);
    } catch (err) {
      setStatus(err instanceof Error && err.message ? err.message : HEIC_CONVERSION_ERROR_MESSAGE);
      return;
    }
    const { asset } = await importImageAssetForEditor(normalizedFile, currentDocument.assets, { createPreview: true });
    addAsset(asset);

    if (selectedLayer.type === "image") {
      updateLayer(currentPage.id, { ...selectedLayer, assetId: asset.id });
    } else {
      // Check if this is a collage frame — use replaceCollageImage so imagePool stays in sync
      const collageMeta = selectedLayer.metadata["collageFrame"] as { collageRuleId?: string; slotId?: string; isCollageFrame?: boolean } | undefined;
      if (isCollageMode && activeCollageRule && collageMeta?.isCollageFrame && collageMeta.slotId) {
        replaceCollageImage(activeCollageRule.id, collageMeta.slotId, asset.id);
      } else {
        updateLayer(currentPage.id, { ...selectedLayer, imageAssetId: asset.id, contentType: "image" });
      }
    }
    setStatus("תמונה הוחלפה");
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.stopPropagation();
    // Graphics library drag (new)
    const graphicUrl = event.dataTransfer.getData("graphic/url");
    if (graphicUrl) {
      const name     = event.dataTransfer.getData("graphic/name") || "גרפיקה";
      const fallback = event.dataTransfer.getData("graphic/fallback") || undefined;
      handleInsertGraphic(graphicUrl, name, fallback);
      return;
    }
    // Legacy emoji drag (backward compat)
    const emojiUrl = event.dataTransfer.getData("emoji/url") || event.dataTransfer.getData("emoji/cdn");
    if (emojiUrl) {
      const name = event.dataTransfer.getData("emoji/name") || "אמוג'י";
      handleInsertGraphic(emojiUrl, name);
      return;
    }
    if (Array.from(event.dataTransfer.files).some(isPdfFile)) {
      openPdfImport(event.dataTransfer.files);
      return;
    }
    const targetFrame = findFrameAtClientPoint(event.clientX, event.clientY);
    void handleImageFiles(event.dataTransfer.files, targetFrame?.id);
  }

  useEffect(() => {
    function dataTransferHasFiles(dataTransfer: DataTransfer | null): boolean {
      return dataTransfer !== null && Array.from(dataTransfer.types).includes("Files");
    }

    function eventTargetsCanvas(event: globalThis.DragEvent): boolean {
      const canvasArea = canvasAreaRef.current;
      const stageContainer = stageRef.current?.container() ?? null;
      const path = typeof event.composedPath === "function" ? event.composedPath() : [];
      if (canvasArea !== null && path.includes(canvasArea)) return true;
      if (stageContainer !== null && path.includes(stageContainer)) return true;

      const target = event.target;
      if (!(target instanceof Node)) return false;
      return (
        (canvasArea !== null && canvasArea.contains(target)) ||
        (stageContainer !== null && stageContainer.contains(target))
      );
    }

    function prepareFileDrop(event: globalThis.DragEvent): void {
      if (!dataTransferHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "copy";
      setFileDropActive(true);
    }

    function onDragOver(event: globalThis.DragEvent): void {
      prepareFileDrop(event);
      if (!dataTransferHasFiles(event.dataTransfer)) return;
      if (!eventTargetsCanvas(event)) {
        setDropTargetFrame(null);
        return;
      }
      const frame = findFrameAtClientPoint(event.clientX, event.clientY);
      if (frame === null) {
        setDropTargetFrame(null);
        return;
      }
      const stage = stageRef.current;
      const canvasArea = canvasAreaRef.current;
      if (stage === null || canvasArea === null) return;
      const container = stage.container();
      const containerRect = container.getBoundingClientRect();
      const areaRect = canvasArea.getBoundingClientRect();
      const tf = stage.getAbsoluteTransform();
      const tl = tf.point({ x: frame.x, y: frame.y });
      const br = tf.point({ x: frame.x + frame.width, y: frame.y + frame.height });
      setDropTargetFrame({
        id: frame.id,
        name: frame.name,
        hasImage: frame.imageAssetId !== undefined,
        screenLeft: containerRect.left - areaRect.left + Math.min(tl.x, br.x),
        screenTop: containerRect.top - areaRect.top + Math.min(tl.y, br.y),
        screenWidth: Math.abs(br.x - tl.x),
        screenHeight: Math.abs(br.y - tl.y)
      });
    }

    function onDrop(event: globalThis.DragEvent): void {
      const dataTransfer = event.dataTransfer;
      if (dataTransfer === null || !dataTransferHasFiles(dataTransfer)) return;
      event.preventDefault();
      setFileDropActive(false);
      if (!eventTargetsCanvas(event)) return;
      event.stopPropagation();
      setDropTargetFrame(null);
      if (Array.from(dataTransfer.files).some(isPdfFile)) {
        openPdfImport(dataTransfer.files);
        return;
      }
      const targetFrame = findFrameAtClientPoint(event.clientX, event.clientY);
      void handleImageFiles(dataTransfer.files, targetFrame?.id);
    }

    function onDragLeave(event: globalThis.DragEvent): void {
      if (!dataTransferHasFiles(event.dataTransfer)) return;
      event.preventDefault();
      if (event.relatedTarget === null) {
        setFileDropActive(false);
        setDropTargetFrame(null);
      }
    }

    const capture = { capture: true };
    window.addEventListener("dragenter", prepareFileDrop, capture);
    window.addEventListener("dragover", onDragOver, capture);
    window.addEventListener("dragleave", onDragLeave, capture);
    window.addEventListener("drop", onDrop, capture);
    return () => {
      window.removeEventListener("dragenter", prepareFileDrop, capture);
      window.removeEventListener("dragover", onDragOver, capture);
      window.removeEventListener("dragleave", onDragLeave, capture);
      window.removeEventListener("drop", onDrop, capture);
    };
  });

  function handleSave(): void {
    saveProject(withViewport(currentDocument, viewport));
    setStatus("קובץ הפרויקט נשמר");
  }

  async function handleSavePortable(): Promise<void> {
    await savePortableProject(withViewport(currentDocument, viewport));
    setStatus("קובץ SPP נייד נשמר");
  }

  async function handleProjectLoadLifecycle(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    try {
      const envelope = await loadProject(file);
      const opened = lifecycle.beginProject(envelope, file.name);
      setDocument(withProjectMetadata(opened.document, opened.metadata));
      viewport.setViewport(opened.document.viewport);
      clearSelection();
      setStatus("Project loaded");
    } catch (error) {
      lifecycle.markSaveFailed(error instanceof Error ? error.message : "Project load failed");
      setStatus("Project load failed");
    } finally {
      event.target.value = "";
    }
  }

  // Save (Ctrl+S): overwrite the current file in place when its path is known;
  // the first save (no path yet) opens a native "Save As" dialog.
  async function handleSaveLifecycle(): Promise<void> {
    await saveToDisk({ forceDialog: false });
  }

  // Save As (Ctrl+Shift+S): always open the native dialog to choose a new path.
  async function handleSaveAsToDisk(): Promise<void> {
    await saveToDisk({ forceDialog: true });
  }

  async function saveToDisk(opts: { forceDialog: boolean }): Promise<void> {
    try {
      const stage = stageRef.current;
      const thumbnail = stage === null ? undefined : safeCaptureThumbnail(stage, currentPage);
      const outcome = await saveProjectToDisk(withViewport(currentDocument, viewport), {
        filePath: lifecycle.currentFilePath ?? undefined,
        thumbnailPath: thumbnail,
        forceDialog: opts.forceDialog
      });
      if (outcome.canceled) {
        setStatus("השמירה בוטלה");
        return;
      }
      lifecycle.markSaved(outcome.saved, outcome.saved.metadata.currentFilePath, thumbnail);
      setDocument(withProjectMetadata(outcome.saved.document, outcome.saved.metadata));
      setStatus(outcome.filePath !== null ? `נשמר: ${outcome.filePath}` : "הפרויקט נשמר");
    } catch (error) {
      lifecycle.markSaveFailed(error instanceof Error ? error.message : "Save failed");
      setStatus(`שגיאה בשמירה: ${error instanceof Error ? error.message : ""}`);
    }
  }

  async function handleSavePortableLifecycle(): Promise<void> {
    try {
      const stage = stageRef.current;
      const thumbnail = stage === null ? undefined : safeCaptureThumbnail(stage, currentPage);
      const saved = await savePortableProject(withViewport(currentDocument, viewport), {
        filePath: lifecycle.currentFilePath ?? undefined,
        thumbnailPath: thumbnail
      });
      lifecycle.markSaved(saved, saved.metadata.currentFilePath, thumbnail);
      setDocument(withProjectMetadata(saved.document, saved.metadata));
      setStatus("Portable SPP saved");
    } catch (error) {
      lifecycle.markSaveFailed(error instanceof Error ? error.message : "Save failed");
      setStatus("Save failed");
    }
  }

  async function runCloudSave(filename?: string): Promise<void> {
    try {
      const stage = stageRef.current;
      const thumbnail = stage === null ? undefined : safeCaptureThumbnail(stage, currentPage);
      setStatus("שומר בענן...");
      const outcome = await saveProjectToCloud(withViewport(currentDocument, viewport), {
        filePath: lifecycle.currentFilePath ?? undefined,
        thumbnailPath: thumbnail,
        filename
      });
      lifecycle.markSaved(outcome.saved, outcome.saved.metadata.currentFilePath, thumbnail);
      setDocument(withProjectMetadata(outcome.saved.document, outcome.saved.metadata));
      setStatus(`נשמר בענן: ${outcome.project.name}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Save failed";
      lifecycle.markSaveFailed(message);
      setStatus(formatCloudSaveError(message));
    }
  }

  async function handleSaveCloudLifecycle(): Promise<void> {
    await runCloudSave();
  }

  // Save to cloud with a chosen name (instead of the auto-generated default).
  function handleSaveCloudAsLifecycle(): void {
    const fallback = `פרויקט_${new Date().toISOString().slice(0, 10)}`;
    const base = currentDocument.name?.trim();
    const suggested = base && base.toLowerCase() !== "unknown" ? base : fallback;
    setCloudSaveAsModal({ name: suggested.replace(/\.spp2?$/i, "") });
  }

  async function confirmSaveCloudAs(name: string): Promise<void> {
    setCloudSaveAsModal(null);
    const trimmed = name.trim();
    if (!trimmed) return;
    const filename = /\.spp2?$/i.test(trimmed) ? trimmed : `${trimmed}.spp2`;
    await runCloudSave(filename);
  }

  function withViewport(documentToSave: Document, viewportState: ViewportStore): Document {
    return {
      ...documentToSave,
      viewport: {
        version: viewportState.version,
        zoom: viewportState.zoom,
        panX: viewportState.panX,
        panY: viewportState.panY,
        screenWidth: viewportState.screenWidth,
        screenHeight: viewportState.screenHeight,
        showRulers: viewportState.showRulers,
        showGrid: viewportState.showGrid,
        showGuides: viewportState.showGuides,
        snapEnabled: viewportState.snapEnabled,
        fitMode: viewportState.fitMode,
        backgroundStyle: viewportState.backgroundStyle
      }
    };
  }

  function safeCaptureThumbnail(stage: Konva.Stage, page: typeof currentPage): string | undefined {
    try {
      return captureProjectThumbnail(stage, page);
    } catch {
      return undefined;
    }
  }

  function formatCloudSaveError(message: string): string {
    if (message === "CLOUD_NOT_CONFIGURED") return "הענן לא מוגדר עדיין";
    if (message === "CLOUD_NOT_SIGNED_IN") return "צריך להתחבר לענן לפני שמירה";
    if (message === "CLOUD_PROJECT_FILE_TOO_LARGE_FREE") return "הקובץ גדול ממגבלת 50MB של Supabase Free";
    if (message.includes("413")) return "הקובץ גדול מדי לשמירה בענן";
    return `שגיאה בשמירה לענן: ${message}`;
  }

  function handleBackHome(): void {
    if (lifecycle.isDirty) {
      setExitAfterDialog(false);
      setShowBackHomeDialog(true);
    } else {
      onBackHome();
    }
  }

  async function confirmBackHome(action: "save" | "discard" | "cancel"): Promise<void> {
    setShowBackHomeDialog(false);
    const exiting = exitAfterDialog;
    setExitAfterDialog(false);
    if (action === "cancel") return;
    if (action === "save") {
      await handleSaveLifecycle();
      // If the save was canceled or failed the project is still dirty — don't
      // quit and lose the work; leave the app open so the user can retry.
      if (exiting && useProjectLifecycleStore.getState().isDirty) {
        return;
      }
    }
    if (exiting) {
      window.spp?.confirmClose?.();
    } else {
      onBackHome();
    }
  }

  function handleAddPage(): void {
    addPage(createPage({
      name: `Page ${currentDocument.pages.length + 1}`,
      setup: currentPage.setup
    }));
    clearSelection();
  }

  function handleAddGuide(axis: "x" | "y"): void {
    updatePage({
      ...currentPage,
      guides: [
        ...currentPage.guides,
        {
          version: 1,
          id: crypto.randomUUID(),
          axis,
          position: axis === "x" ? currentPage.width / 2 : currentPage.height / 2,
          locked: false,
          visible: true,
          color: "#54C6EB"
        }
      ]
    });
  }

  function handleApplyPageSetup(setup: PageSetup): void {
    updatePage({
      ...currentPage,
      width: setup.size.width,
      height: setup.size.height,
      orientation: setup.orientation,
      setup,
      bleed: setup.bleed,
      margins: setup.margins,
      background:
        setup.backgroundTransparent === true
          ? {
              version: 1,
              type: "transparent"
            }
          : {
              version: 1,
              type: "color",
              color: setup.backgroundColor ?? "#fbfafa"
            }
    });
  }

  interface ExportQualityOverride {
    jpgQuality?: number;
    maxLongSidePx?: number;
  }

  async function renderPageForExport(
    page: Page,
    mimeType: "image/png" | "image/jpeg",
    override?: ExportQualityOverride
  ): Promise<PrintableStageImage | null> {
    const jpegQuality = override?.jpgQuality ?? exportRenderOptions.jpgQuality;
    if (canRenderPageOffscreen(page)) {
      try {
        const rendered = await renderPageOffscreen(page, currentDocument.assets, {
          mimeType,
          pixelRatio: getExportPixelRatio(page, performanceSettings, override?.maxLongSidePx),
          jpegQuality
        });
        markDebugEvent("export:offscreen-render-used", { pageId: page.id, mimeType });
        return rendered;
      } catch (error) {
        markDebugEvent("export:offscreen-render-failed", {
          pageId: page.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const stage = stageRef.current;
    if (stage === null) return null;
    if (page.id !== useDocumentStore.getState().activePageId) {
      setActivePage(page.id);
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    }
    // Safety net against blank/black captures: wait for the page's Konva images to finish loading.
    try {
      await waitForKonvaPageImages(stage, 1);
    } catch {
      /* proceed — better a best-effort capture than hanging */
    }
    return exportStagePrintImage(stage, page, mimeType, { ...exportRenderOptions, jpgQuality: jpegQuality, maxLongSidePx: override?.maxLongSidePx });
  }

  async function renderPagesForExport(
    mimeType: "image/png" | "image/jpeg",
    override?: ExportQualityOverride
  ): Promise<PrintableStageImage[]> {
    const allPages = currentDocument.pages;
    const originalPageId = currentPage.id;
    const rendered: PrintableStageImage[] = [];
    for (const page of allPages) {
      const renderedPage = await renderPageForExport(page, mimeType, override);
      if (renderedPage !== null) rendered.push(renderedPage);
    }
    if (useDocumentStore.getState().activePageId !== originalPageId) {
      setActivePage(originalPageId);
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    }
    return rendered;
  }

  function setFolderExportStatus(result: FolderExportResult, format: string): void {
    if (result.canceled === true) {
      setStatus("הייצוא בוטל");
    } else if (!result.ok) {
      setStatus(`שגיאה בייצוא: ${result.error ?? "לא ידוע"}`);
    } else if (result.method === "folder") {
      setStatus(`יוצאו ${result.count} עמודי ${format} לתיקייה`);
    } else {
      setStatus(`יוצאו ${result.count} עמודי ${format} ל-ZIP`);
    }
  }

  async function handleExportPng(): Promise<void> {
    if (exportScope === "all" && currentDocument.pages.length > 1) {
      const pages = await renderPagesForExport("image/png");
      const result = await exportRenderedPagesToFolder(pages, currentDocument.name);
      setFolderExportStatus(result, "PNG");
    } else {
      const rendered = await renderPageForExport(currentPage, "image/png");
      if (rendered === null) {
        const stage = stageRef.current;
        if (stage === null) return;
        exportStagePng(stage, currentDocument.name, currentPage, exportRenderOptions);
      } else {
        downloadDataUrl(`${safeFilename(currentDocument.name)}.png`, rendered.dataUrl);
      }
      setStatus("PNG יוצא");
    }
  }

  async function handleExportPdf(): Promise<void> {
    const profile = resolvePdfExportProfile(pdfQualityPreset);
    const override: ExportQualityOverride = { jpgQuality: profile.jpgQuality, maxLongSidePx: profile.maxLongSidePx };
    if (exportScope === "all" && currentDocument.pages.length > 1) {
      const pages = await renderPagesForExport(profile.mimeType, override);
      await exportRenderedPagesAsPdf(pages, currentDocument.name);
      setStatus(`PDF יוצא (${pages.length} עמודים)`);
    } else {
      const rendered = await renderPageForExport(currentPage, profile.mimeType, override);
      if (rendered === null) {
        const stage = stageRef.current;
        if (stage === null) return;
        await exportStagePdf(stage, currentDocument.name, currentPage, { ...exportRenderOptions, jpgQuality: profile.jpgQuality, maxLongSidePx: profile.maxLongSidePx }, profile.mimeType);
      } else {
        await exportRenderedPagesAsPdf([rendered], currentDocument.name);
      }
      setStatus("PDF יוצא");
    }
  }

  async function handleExportJpg(): Promise<void> {
    if (exportScope === "all" && currentDocument.pages.length > 1) {
      const pages = await renderPagesForExport("image/jpeg");
      const result = await exportRenderedPagesToFolder(pages, currentDocument.name);
      setFolderExportStatus(result, "JPEG");
    } else {
      const rendered = await renderPageForExport(currentPage, "image/jpeg");
      if (rendered === null) {
        const stage = stageRef.current;
        if (stage === null) return;
        exportStageJpg(stage, currentDocument.name, currentPage, exportRenderOptions);
      } else {
        downloadDataUrl(`${safeFilename(currentDocument.name)}.jpg`, rendered.dataUrl);
      }
      setStatus("JPG exported");
    }
  }

  function handlePrint(): void {
    setAdvancedPrintOpen({ initialSelection: null });
  }
  /** Renders every page of the document to JPEG sources for a Print Hub job. */
  async function renderPagesAsPrintSources(): Promise<JobSourceImage[]> {
    const stage = stageRef.current;
    if (stage === null) return [];
    const pages = currentDocument.pages;
    const originalPageId = currentPage.id;
    const sources: JobSourceImage[] = [];
    for (let i = 0; i < pages.length; i += 1) {
      const page = pages[i];
      if (page.id !== useDocumentStore.getState().activePageId) {
        setActivePage(page.id);
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      }
      await waitForKonvaPageImages(stage, i + 1);
      const rendered = exportStagePrintImage(stage, page, "image/jpeg", exportRenderOptions);
      sources.push({ sourceUrl: rendered.dataUrl, fileName: `${String(i + 1).padStart(3, "0")}.jpg` });
    }
    if (originalPageId !== useDocumentStore.getState().activePageId) {
      setActivePage(originalPageId);
    }
    return sources;
  }

  /** Sends the document to the remote Print Hub queue (sender side, no local driver needed). */
  async function handleSendToPrintHub(opts: SendToPrintHubOptions): Promise<void> {
    const phCfg = useAppSettings.getState().settings.printHub;
    const lanCfg = lanConfigFromSettings(phCfg);
    const hubRoot = phCfg.serverHubRoot || phCfg.networkFolderPath;
    if (!lanCfg && !hubRoot) {
      setStatus("הגדר תחילה תיקיית תור או חיבור LAN בכלי \"מרכז הדפסות\"");
      return;
    }
    setSendRemoteBusy(true);
    setSendRemoteProgress(null);
    setStatus("מרנדר עמודים לשליחה…");
    try {
      const sources = await renderPagesAsPrintSources();
      if (sources.length === 0) {
        setStatus("לא נמצאו עמודים לשליחה");
        return;
      }
      const stationInfo = await window.spp?.printHub?.stationInfo?.();
      const station = stationInfo?.computerName ?? "SPP2";
      const jobId = generateJobId();

      // Optional order-summary slip appended as the last image of the job (spec §20).
      if (opts.includeSummary) {
        const summaryData = orderSummaryFromFields({
          orderId: jobId,
          createdAt: new Date().toISOString(),
          customerName: opts.customerName,
          customerPhone: opts.customerPhone,
          note: opts.note,
          imageCount: sources.length,
          copies: opts.copies,
          size: opts.size,
          finish: opts.finish,
          borderMode: opts.borderMode,
          station
        });
        const slip = await renderOrderSummaryImage(summaryData, opts.size);
        sources.push({ sourceUrl: slip, fileName: "summary.jpg" });
      }

      const preset = buildClientPreset(opts.size, opts.finish, opts.borderMode);
      const result = await buildAndSubmitJob({
        hubRoot,
        lan: lanCfg ?? undefined,
        onLanProgress: setSendRemoteProgress,
        sources,
        preset,
        size: opts.size,
        source: "spp2_editor",
        sourceComputer: station,
        jobId,
        copies: opts.copies,
        approvalMode: opts.approvalMode,
        testPrintFirstOnly: opts.testPrintFirstOnly,
        customer: { name: opts.customerName, phone: opts.customerPhone, note: opts.note },
        onProgress: (done, total) => setStatus(`מרנדר ${done}/${total}…`)
      });
      if (!result.success) {
        setStatus(result.error ?? "שגיאה בשליחה לתור");
        return;
      }
      setShowSendRemote(false);
      setStatus(result.destination === "outbox"
        ? "השרת לא זמין — העבודה נשמרה מקומית ותישלח כשהחיבור יחזור"
        : `העבודה נשלחה לתור ההדפסה (${result.jobId})`);
    } catch (err) {
      setStatus(`שגיאה בשליחה: ${err instanceof Error ? err.message : "לא ידוע"}`);
    } finally {
      setSendRemoteBusy(false);
      setSendRemoteProgress(null);
    }
  }

  function handleDeleteSelected(): void {
    const removableIds = selectedLayers.filter((layer) => !layer.locked).map((layer) => layer.id);
    if (removableIds.length === 0) return;
    removableIds.forEach((layerId) => removeLayer(currentPage.id, layerId));
    const hasBatchFields = removableIds.some((id) => variableLayerIds.has(id));
    if (hasBatchFields) {
      applyDocumentChange("CleanupBatchVariableFieldsCommand", (doc) => {
        let updated = doc;
        for (const id of removableIds) updated = removeVariableFieldForLayer(updated, id);
        return updated;
      });
    }
    clearSelection();
    setStatus("השכבה נמחקה");
  }

  function handleDuplicateSelected(): void {
    if (selectedLayers.length === 0) return;
    const maxZIndex = Math.max(0, ...currentPage.layers.map((layer) => layer.zIndex));
    const clones = selectedLayers.map((layer, index) => ({
      ...layer,
      id: crypto.randomUUID(),
      name: `${layer.name} copy`,
      x: layer.x + 18,
      y: layer.y + 18,
      zIndex: maxZIndex + index + 1,
      selected: false,
      metadata: { ...layer.metadata }
    })) as VisualLayer[];
    applyDocumentChange(
      "DuplicateLayersCommand",
      (doc) => ({
        ...doc,
        pages: doc.pages.map((page) =>
          page.id === currentPage.id ? { ...page, layers: [...page.layers, ...clones] } : page
        )
      }),
      currentPage.id
    );
    setSelection(clones.map((layer) => layer.id));
    setStatus("Layer duplicated");
  }

  /**
   * Expands a set of layers to include the children of any selected groups,
   * dropping the group layers themselves (they have no pixels of their own).
   */
  function expandLayersWithGroupChildren(layers: VisualLayer[]): VisualLayer[] {
    const result = new Map<string, VisualLayer>();
    for (const layer of layers) {
      if (layer.type === "group") {
        const childIds = new Set((layer as GroupLayer).childIds);
        for (const child of currentPage.layers) {
          if (childIds.has(child.id)) result.set(child.id, child);
        }
      } else {
        result.set(layer.id, layer);
      }
    }
    return [...result.values()];
  }

  // Photoshop-style "Merge Layers": rasterize the selected layers (2+) into a
  // single image layer, preserving effects/blend modes exactly as displayed.
  function handleMergeSelected(): void {
    const stage = stageRef.current;
    if (stage === null) return;
    const targets = expandLayersWithGroupChildren(selectedLayers)
      .filter((layer) => layer.visible !== false && layer.type !== "guide");
    if (targets.length < 2) {
      setStatus("בחר לפחות שתי שכבות גלויות לאיחוד");
      return;
    }
    // Content is clipped to the page, so clamp the union to the page bounds.
    const page = currentPage;
    const union = unionRects(targets.map(getTransformedBounds));
    const bounds = {
      x: Math.max(0, union.x),
      y: Math.max(0, union.y),
      width: Math.min(page.width, union.x + union.width) - Math.max(0, union.x),
      height: Math.min(page.height, union.y + union.height) - Math.max(0, union.y)
    };
    if (bounds.width <= 0 || bounds.height <= 0) {
      setStatus("השכבות שנבחרו מחוץ לגבולות העמוד");
      return;
    }
    const targetIds = new Set(targets.map((layer) => layer.id));
    const maxZ = Math.max(...targets.map((layer) => layer.zIndex));
    const pixelRatio = getExportPixelRatio(page, performanceSettings);
    const raster = rasterizeLayers(stage, page, targetIds, bounds, pixelRatio);
    const asset = createImageAssetFromDataUrl(raster.dataUrl, raster.width, raster.height, "שכבה ממוזגת");
    const mergedLayer = createImageLayer({
      name: "שכבה ממוזגת",
      rect: bounds,
      assetId: asset.id,
      fitMode: "fill",
      zIndex: maxZ
    });
    applyDocumentChange(
      "MergeLayersCommand",
      (doc) => ({
        ...doc,
        assets: [...doc.assets, asset],
        pages: doc.pages.map((p) => {
          if (p.id !== page.id) return p;
          const kept = p.layers.filter((layer) => !targetIds.has(layer.id));
          const reindexed = [...kept, mergedLayer]
            .sort((a, b) => a.zIndex - b.zIndex)
            .map((layer, index) => ({ ...layer, zIndex: index }));
          return { ...p, layers: reindexed };
        })
      }),
      page.id
    );
    setSelection([mergedLayer.id]);
    setStatus("השכבות אוחדו");
  }

  // Photoshop-style "Flatten": rasterize all visible layers into one image
  // layer at page size. Hidden layers (and guides) are preserved above it.
  function handleFlattenVisible(): void {
    const stage = stageRef.current;
    if (stage === null) return;
    const page = currentPage;
    const targets = page.layers.filter((layer) => layer.visible !== false && layer.type !== "guide");
    if (targets.length === 0) {
      setStatus("אין שכבות גלויות לשיטוח");
      return;
    }
    const bounds = getPageBounds(page);
    const targetIds = new Set(targets.map((layer) => layer.id));
    const pixelRatio = getExportPixelRatio(page, performanceSettings);
    const raster = rasterizeLayers(stage, page, targetIds, bounds, pixelRatio);
    const asset = createImageAssetFromDataUrl(raster.dataUrl, raster.width, raster.height, "תמונה משוטחת");
    const flatLayer = createImageLayer({
      name: "תמונה משוטחת",
      rect: bounds,
      assetId: asset.id,
      fitMode: "fill",
      zIndex: 0
    });
    applyDocumentChange(
      "FlattenPageCommand",
      (doc) => ({
        ...doc,
        assets: [...doc.assets, asset],
        pages: doc.pages.map((p) => {
          if (p.id !== page.id) return p;
          const preserved = p.layers
            .filter((layer) => !targetIds.has(layer.id))
            .sort((a, b) => a.zIndex - b.zIndex);
          const layers = [flatLayer, ...preserved].map((layer, index) => ({ ...layer, zIndex: index }));
          return { ...p, layers };
        })
      }),
      page.id
    );
    setSelection([flatLayer.id]);
    setStatus("השכבות שוטחו");
  }

  function cloneLayerForPaste(layer: VisualLayer, index: number, maxZIndex: number): VisualLayer {
    const clone = structuredClone(layer) as VisualLayer;
    const pasted = {
      ...clone,
      id: crypto.randomUUID(),
      name: `${clone.name} copy`,
      x: clone.x + 18,
      y: clone.y + 18,
      zIndex: maxZIndex + index + 1,
      selected: false,
      parentId: undefined,
      metadata: { ...clone.metadata }
    } as VisualLayer;

    if (pasted.type === "text") {
      const size = measureTextLayerSize(pasted);
      return { ...pasted, width: size.width, height: size.height };
    }
    return pasted;
  }

  function applySmartTextFitToLayer(layerId: string, mode: SmartTextFitMode): void {
    const layer = currentPage.layers.find((item): item is TextLayer => item.id === layerId && item.type === "text");
    if (layer === undefined) {
      return;
    }

    const result = fitTextToPageBox(layer, currentPage, mode);
    applyDocumentChange(
      "SmartTextFitCommand",
      (doc) => ({
        ...doc,
        pages: doc.pages.map((docPage) =>
          docPage.id === currentPage.id
            ? { ...docPage, layers: docPage.layers.map((item) => (item.id === result.layer.id ? result.layer : item)) }
            : docPage
        )
      }),
      currentPage.id
    );
    setSelection([result.layer.id]);
    const labels: Record<SmartTextFitMode, string> = {
      balanced: "התאמה מלאה",
      shrink: "התאמה חלקית",
      wrap: "פריסת שורות"
    };
    setStatus(result.overflows ? `${labels[mode]} בוצעה ככל האפשר, אבל הטקסט עדיין ארוך מדי` : `${labels[mode]} בוצעה`);
  }

  function applySmartTextBlockToLayer(layerId: string): void {
    const layer = currentPage.layers.find((item): item is TextLayer => item.id === layerId && item.type === "text");
    if (layer === undefined) return;
    const centerX = layer.x + layer.width / 2;
    const centerY = layer.y + layer.height / 2;
    const smartLayer = withSmartTextBlockSettings(layer, {
      enabled: true,
      strength: readSmartTextBlockSettings(layer)?.strength ?? DEFAULT_SMART_TEXT_BLOCK_SETTINGS.strength
    });
    const size = measureTextLayerSize(smartLayer);
    const result: TextLayer = {
      ...smartLayer,
      x: Math.round(centerX - size.width / 2),
      y: Math.round(centerY - size.height / 2),
      width: size.width,
      height: size.height
    };
    applyDocumentChange(
      "SmartTextBlockCommand",
      (doc) => ({
        ...doc,
        pages: doc.pages.map((docPage) =>
          docPage.id === currentPage.id
            ? { ...docPage, layers: docPage.layers.map((item) => (item.id === result.id ? result : item)) }
            : docPage
        )
      }),
      currentPage.id
    );
    setSelection([result.id]);
    setStatus("Smart Text Block applied");
  }

  function handleCopySelectedLayers(): void {
    if (selectedLayers.length === 0) return;
    setLayerClipboard(selectedLayers.map((layer) => structuredClone(layer) as VisualLayer));
    setStatus("Selection copied");
  }

  async function handlePasteLayers(): Promise<void> {
    if (layerClipboard !== null && layerClipboard.length > 0) {
      const maxZIndex = Math.max(0, ...currentPage.layers.map((layer) => layer.zIndex));
      const clones = layerClipboard.map((layer, index) => cloneLayerForPaste(layer, index, maxZIndex));
      applyDocumentChange(
        "PasteLayersCommand",
        (doc) => ({
          ...doc,
          pages: doc.pages.map((page) =>
            page.id === currentPage.id ? { ...page, layers: [...page.layers, ...clones] } : page
          )
        }),
        currentPage.id
      );
      setSelection(clones.map((layer) => layer.id));
      setStatus("Selection pasted");
      return;
    }

    if (isEditableShortcutTarget(window.document.activeElement)) return;
    const text = await navigator.clipboard?.readText().catch(() => "");
    const trimmedText = text?.trim();
    if (!trimmedText) return;

    const maxZIndex = Math.max(0, ...currentPage.layers.map((layer) => layer.zIndex));
    const starter = createStarterTextLayer(currentPage.width, currentPage.height) as TextLayer;
    const draftLayer: TextLayer = {
      ...starter,
      id: crypto.randomUUID(),
      name: "טקסט מודבק",
      text,
      color: useColorStore.getState().currentColor,
      zIndex: maxZIndex + 1,
      overflowPolicy: "auto_shrink"
    };
    const safeRect = getTextFitSafeRect(currentPage);
    const pastedTextIsLong = trimmedText.length >= 80;
    const initialWidth = pastedTextIsLong ? Math.round(safeRect.width * 0.82) : draftLayer.width;
    const size = measureTextLayerSize({ ...draftLayer, width: initialWidth });
    const initialHeight = pastedTextIsLong ? Math.min(safeRect.height, Math.max(80, size.height)) : size.height;
    const layer: TextLayer = {
      ...draftLayer,
      width: pastedTextIsLong ? initialWidth : size.width,
      height: initialHeight,
      x: Math.round(safeRect.x + (safeRect.width - (pastedTextIsLong ? initialWidth : size.width)) / 2),
      y: Math.round(safeRect.y + (safeRect.height - initialHeight) / 2)
    };
    applyDocumentChange(
      "PasteTextLayerCommand",
      (doc) => ({
        ...doc,
        pages: doc.pages.map((page) =>
          page.id === currentPage.id ? { ...page, layers: [...page.layers, layer] } : page
        )
      }),
      currentPage.id
    );
    setSelection([layer.id]);
    setTool("text");
    setStatus("הטקסט הודבק כשכבה חדשה");
  }

  function handleCutSelectedLayers(): void {
    if (selectedLayers.length === 0) return;
    setLayerClipboard(selectedLayers.map((layer) => structuredClone(layer) as VisualLayer));
    handleDeleteSelected();
    setStatus("Selection cut");
  }

  function makeSelectionAsset(clip: SelectionClipboard): Asset {
    return {
      version: 1,
      id: crypto.randomUUID(),
      name: `${clip.sourceName.replace(/\.[^/.]+$/, "")} selection.png`,
      kind: "image",
      status: "ready",
      originalPath: clip.dataUrl,
      previewPath: clip.dataUrl,
      thumbnailPath: clip.dataUrl,
      mimeType: "image/png",
      width: clip.width,
      height: clip.height,
      fileSize: Math.round(clip.dataUrl.length * 0.75),
      metadata: {
        generatedFromSelection: true,
        sourceLayerId: clip.sourceLayerId
      }
    };
  }

  async function createSelectionClipboardFromActiveLayer(): Promise<SelectionClipboard | null> {
    const storeState = useImageEditStore.getState();
    const selMask = storeState.selectionMask;
    if (selMask === null || imageEditLayerId === null || activePage === null) return null;
    const layer = activePage.layers.find((item): item is ImageLayer => item.id === imageEditLayerId && item.type === "image");
    if (layer === undefined) return null;
    const asset = currentDocument.assets.find((item) => item.id === layer.assetId);
    if (asset === undefined) return null;
    const bounds = selectionMaskBounds(selMask.data, selMask.width, selMask.height);
    if (bounds === null) {
      setStatus("No selected pixels to copy");
      return null;
    }
    const rendered = await renderImageLayerToSelectionCanvas(layer, asset, currentDocument.assets, selMask.width, selMask.height);
    if (rendered === null) return null;
    const context = rendered.getContext("2d");
    if (context === null) return null;

    const imageData = context.getImageData(0, 0, selMask.width, selMask.height);
    for (let index = 0; index < selMask.data.length; index += 1) {
      if (selMask.data[index] <= 128) {
        imageData.data[index * 4 + 3] = 0;
      }
    }
    context.putImageData(imageData, 0, 0);

    const cropped = window.document.createElement("canvas");
    cropped.width = bounds.width;
    cropped.height = bounds.height;
    const croppedContext = cropped.getContext("2d");
    if (croppedContext === null) return null;
    croppedContext.putImageData(context.getImageData(bounds.x, bounds.y, bounds.width, bounds.height), 0, 0);

    const scaleX = layer.width / selMask.width;
    const scaleY = layer.height / selMask.height;
    return {
      dataUrl: cropped.toDataURL("image/png"),
      width: Math.max(1, Math.round(bounds.width * scaleX)),
      height: Math.max(1, Math.round(bounds.height * scaleY)),
      canvasX: layer.x + bounds.x * scaleX,
      canvasY: layer.y + bounds.y * scaleY,
      sourceLayerId: layer.id,
      sourceName: layer.name || asset.name || "Selection"
    };
  }

  function pasteSelectionClipboard(clip: SelectionClipboard): void {
    const asset = makeSelectionAsset(clip);
    const maxZIndex = Math.max(0, ...currentPage.layers.map((layer) => layer.zIndex));
    const layer = createImageLayer({
      name: asset.name,
      assetId: asset.id,
      rect: {
        x: Math.round(clip.canvasX),
        y: Math.round(clip.canvasY),
        width: clip.width,
        height: clip.height
      },
      fitMode: "stretch",
      zIndex: maxZIndex + 1,
      metadata: {
        generatedFromSelection: true,
        sourceLayerId: clip.sourceLayerId
      }
    });
    applyDocumentChange("PasteSelectionAsLayerCommand", (doc) => ({
      ...doc,
      assets: [...doc.assets, asset],
      pages: doc.pages.map((page) => page.id === currentPage.id ? { ...page, layers: [...page.layers, layer] } : page)
    }), currentPage.id);
    exitImageEditMode();
    setSelection([layer.id]);
    setStatus("Selection pasted as a new layer");
  }

  async function handleConvertLayerAlphaToFrameMask(layerId: string): Promise<void> {
    const layer = currentPage.layers.find((item): item is ImageLayer => item.id === layerId && item.type === "image");
    if (layer === undefined) return;

    const asset = currentDocument.assets.find((item) => item.id === layer.assetId);
    if (asset === undefined) {
      setStatus("Cannot convert: image asset is missing");
      return;
    }

    // Render the layer's *current visible alpha* (image alpha גˆ© shape clip גˆ©
    // pixelMask גˆ© library mask, with crop/flip/imageScale/imageOffset) into a
    // new mask asset so the Frame/Mask exactly matches what the user saw.
    let maskAsset: Asset;
    try {
      const composed = await composeFrameMaskFromImageLayer(layer, currentDocument.assets);
      maskAsset = createMaskAsset(composed.dataUrl, composed.width, composed.height, layer.id);
    } catch (err) {
      console.error("composeFrameMaskFromImageLayer failed", err);
      setStatus("Conversion failed: could not compose mask");
      return;
    }

    const frame = createFrameLayer({
      id: layer.id,
      name: `${layer.name || asset.name || "Selection"} Frame`,
      rect: {
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height
      },
      behaviorMode: "freeform",
      shape: "customMask",
      // Keep the original artwork visible inside the mask (colours preserved): the composed
      // RGBA asset IS the original silhouette, so use it as the frame's image content. The same
      // asset's alpha drives the destination-in clip. A red heart stays a red heart, and text
      // dropped in later turns this into a "mixed" image+text mask.
      contentType: "image",
      imageAssetId: maskAsset.id,
      fitMode: "fill",
      contentTransform: { ...defaultContentTransform },
      lockedFrame: layer.locked,
      zIndex: layer.zIndex,
      maskSource: {
        version: 1,
        type: "alphaAsset",
        assetId: maskAsset.id,
        width: maskAsset.width ?? Math.max(1, Math.round(layer.width)),
        height: maskAsset.height ?? Math.max(1, Math.round(layer.height))
      },
      // Reset metadata — the visual alpha is now baked into the mask asset, so
      // carrying over imageShape/cornerRadius/flip/imageMaskDataUrl would
      // double-apply on the frame side.
      metadata: {
        frameMask: {
          source: "imageAlpha",
          sourceAssetId: layer.assetId,
          maskAssetId: maskAsset.id,
          convertedFromLayerId: layer.id
        }
      }
    });

    applyDocumentChange("ConvertLayerAlphaToFrameMaskCommand", (doc) => ({
      ...doc,
      assets: [...doc.assets, maskAsset],
      pages: doc.pages.map((page) => page.id === currentPage.id ? {
        ...page,
        layers: page.layers.map((l) => l.id === layer.id ? {
          ...frame,
          rotation: layer.rotation,
          visible: layer.visible,
          opacity: layer.opacity,
          blendMode: layer.blendMode,
          selected: layer.selected
        } : l)
      } : page)
    }), currentPage.id);
    setSelection([frame.id]);
    setStatus("נוצרה מסיכה השומרת על המראה המקורי — אפשר לגרור לתוכה טקסט");
  }

  function handleConvertAlphaToFrameMask(): void {
    if (selectedLayer?.type !== "image") return;
    void handleConvertLayerAlphaToFrameMask(selectedLayer.id);
  }

  async function handleCopySelection(): Promise<void> {
    const clip = await createSelectionClipboardFromActiveLayer();
    if (clip === null) return;
    setSelectionClipboard(clip);
    setStatus("Selection copied. Press Ctrl+V to paste as a new layer.");
  }

  async function handleCutSelection(): Promise<void> {
    const clip = await createSelectionClipboardFromActiveLayer();
    if (clip === null) return;
    setSelectionClipboard(clip);
    const storeState = useImageEditStore.getState();
    const selMask = storeState.selectionMask;
    if (selMask !== null) {
      await handleApplyMaskFromSelection(selMask.data, selMask.width, selMask.height);
      storeState.clearSelection();
    }
    setStatus("Selection cut. Press Ctrl+V to paste as a new layer.");
  }

  async function handleCopySelectionToNewLayer(): Promise<void> {
    const clip = await createSelectionClipboardFromActiveLayer();
    if (clip === null) return;
    setSelectionClipboard(clip);
    pasteSelectionClipboard(clip);
  }

  async function handleCutSelectionToNewLayer(): Promise<void> {
    const clip = await createSelectionClipboardFromActiveLayer();
    if (clip === null) return;
    setSelectionClipboard(clip);
    const storeState = useImageEditStore.getState();
    const selMask = storeState.selectionMask;
    if (selMask !== null) {
      await handleApplyMaskFromSelection(selMask.data, selMask.width, selMask.height);
      storeState.clearSelection();
    }
    pasteSelectionClipboard(clip);
  }

  function handlePasteSelection(): void {
    if (selectionClipboard === null) return;
    pasteSelectionClipboard(selectionClipboard);
  }

  function handleClearImageSelection(): void {
    useImageEditStore.getState().clearSelection();
    setStatus("Selection cleared");
  }

  function getSmartSelectionTarget(): { layer: ImageLayer; asset: Asset } | null {
    if (imageEditLayerId === null || activePage === null) return null;
    const layer = activePage.layers.find((item): item is ImageLayer => item.id === imageEditLayerId && item.type === "image");
    if (layer === undefined) return null;
    const asset = currentDocument.assets.find((item) => item.id === layer.assetId);
    if (asset === undefined) return null;
    return { layer, asset };
  }

  // General selection tools (Marquee/Lasso/Magic Wand) mark a pixel REGION inside an image
  // (feeding Shift+F5), rather than rubber-band-selecting whole layers. We just ARM the tool here;
  // CanvasStage then enters image-edit mode on whichever image the user drags on, and runs the
  // matching image-edit selection (overlay, undo, refine, AI Fill all reused).
  function activateImageRegionTool(imageTool: "rect-select" | "lasso" | "wand"): void {
    const armed = imageTool === "wand" ? "regionWand" : imageTool === "lasso" ? "regionLasso" : "regionRect";
    const current = useDrawingToolsStore.getState().activeTool;
    useDrawingToolsStore.getState().setActiveTool(current === armed ? null : armed);
    if (current !== armed) {
      const label = imageTool === "wand" ? "מטה קסם" : imageTool === "lasso" ? "לאסו" : "בחירת מלבן";
      useUiBusyStore.getState().flashToast(`${label}: גרור על תמונה לסימון אזור → Shift+F5 למילוי`);
    }
  }
  activateImageRegionToolRef.current = activateImageRegionTool;

  // Open the dedicated Content-Aware Fill workspace (Before/After preview + sampling) on an image.
  async function openContentFillWorkspace(targetLayer: ImageLayer): Promise<void> {
    const targetAsset = currentDocument.assets.find((a) => a.id === targetLayer.assetId);
    if (targetAsset === undefined) { useUiBusyStore.getState().flashToast("בחר תמונה כדי לפתוח מילוי מתקדם"); return; }
    // Cap the working resolution so painting + fills stay responsive on large photos.
    const natW = Math.max(1, Math.round(targetLayer.width));
    const natH = Math.max(1, Math.round(targetLayer.height));
    const CAP = 1400;
    const fit = Math.min(1, CAP / Math.max(natW, natH));
    const w = Math.max(1, Math.round(natW * fit));
    const h = Math.max(1, Math.round(natH * fit));
    useUiBusyStore.getState().flashToast("פותח מילוי מתקדם...");
    const canvas = await renderImageLayerToSelectionCanvas(targetLayer, targetAsset, currentDocument.assets, w, h);
    if (canvas === null) { useUiBusyStore.getState().flashToast("לא ניתן לטעון את התמונה"); return; }
    if (useImageEditStore.getState().imageEditMode) exitImageEditMode();
    setContentFillWorkspace({ asset: targetAsset, layer: targetLayer, imageDataUrl: canvas.toDataURL("image/png"), width: w, height: h });
    window.setTimeout(() => { void warmContentFillEngine(); }, 250);
  }

  function commitFilledLayerImage(targetLayer: ImageLayer, targetAsset: Asset, filledDataUrl: string, w: number, h: number): void {
    if (activePage === null) return;
    const generatedAsset: Asset = {
      version: 1,
      id: crypto.randomUUID(),
      name: `${targetAsset.name.replace(/\.[^/.]+$/, "")} fill.png`,
      kind: "image",
      status: "ready",
      originalPath: filledDataUrl,
      previewPath: filledDataUrl,
      thumbnailPath: filledDataUrl,
      mimeType: "image/png",
      width: w,
      height: h,
      fileSize: Math.round(filledDataUrl.length * 0.75),
      hash: `${targetAsset.hash ?? targetAsset.checksum ?? targetAsset.id}:content-fill:${Date.now()}`,
      checksum: `${targetAsset.checksum ?? targetAsset.hash ?? targetAsset.id}:content-fill:${Date.now()}`,
      metadata: { generatedBy: "content-fill", sourceAssetId: targetAsset.id, sourceLayerId: targetLayer.id, createdAt: new Date().toISOString() }
    };
    const nextMetadata = { ...targetLayer.metadata };
    delete nextMetadata["flipH"];
    delete nextMetadata["flipV"];
    const nextLayer: ImageLayer = {
      ...targetLayer,
      assetId: generatedAsset.id,
      crop: { x: 0, y: 0, width: 1, height: 1 },
      pixelMask: undefined,
      imageOffsetX: 0,
      imageOffsetY: 0,
      imageScale: 1,
      metadata: nextMetadata
    };
    applyDocumentChange("ContentFillAction", (doc) => ({
      ...doc,
      assets: [...doc.assets, generatedAsset],
      pages: doc.pages.map((page) => page.id === activePage.id ? {
        ...page,
        layers: page.layers.map((l) => l.id === targetLayer.id ? nextLayer : l)
      } : page)
    }), activePage.id);
  }

  async function handleSmartAutoSelect(): Promise<void> {
    const target = getSmartSelectionTarget();
    if (target === null) {
      setStatus("Smart selection needs an image layer");
      return;
    }
    const store = useImageEditStore.getState();
    store.setSmartSelectionStatus("preparing", "Preparing smart selection...");
    store.setSmartSelectionProgress({ phase: "prepare", message: "Preparing smart selection...", percent: null });
    setStatus("Preparing smart selection...");
    try {
      const result = await runSmartAutoSegment(target.asset, target.layer);
      if (result === null) {
        store.setSmartSelectionStatus("error", "Smart selection is unavailable");
        store.setSmartSelectionProgress(null);
        setStatus("Smart selection is unavailable");
        return;
      }
      const mask = await maskResultToSelectionMask(result, target.asset.hash ?? target.asset.checksum ?? target.asset.id);
      if (store.smartSelectionMode === "add") {
        store.addToSelectionMask(mask);
      } else {
        store.setSelectionMask(mask);
      }
      store.setSmartSelectionStatus(result.fallback ? "fallback" : "ready", result.message ?? "Smart selection ready");
      store.setSmartSelectionProgress(null);
      setStatus(result.fallback ? "Smart selection used fallback preview" : "Smart selection ready");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Smart selection failed";
      store.setSmartSelectionStatus("error", message);
      store.setSmartSelectionProgress(null);
      setStatus(message);
    }
  }

  async function handleSmartRefineSelection(): Promise<void> {
    const target = getSmartSelectionTarget();
    const store = useImageEditStore.getState();
    const selection = store.selectionMask;
    if (target === null || selection === null) return;
    store.setSmartSelectionStatus("working", "Refining edges...");
    store.setSmartSelectionProgress({ phase: "refine", message: "Refining edges...", percent: null });
    setStatus("Refining selection edges...");
    try {
      const input = makeSmartSelectionInput(target.asset, target.layer);
      if (input !== null) {
        await window.spp?.smartSelection?.loadImage(input.imageId, input.imagePath, input.sourceHash);
      }
      const result = await runSmartRefineMask(target.asset.id, selection.data, selection.width, selection.height, store.smartSelectionSoftness);
      if (result === null) {
        store.setSmartSelectionStatus("error", "Edge refinement is unavailable");
        store.setSmartSelectionProgress(null);
        setStatus("Edge refinement is unavailable");
        return;
      }
      const mask = await maskResultToSelectionMask(result, target.asset.hash ?? target.asset.checksum ?? target.asset.id);
      store.setSelectionMask(mask);
      store.setSmartSelectionStatus(result.fallback ? "fallback" : "ready", result.message ?? "Edges refined");
      store.setSmartSelectionProgress(null);
      setStatus("Selection edges refined");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Edge refinement failed";
      store.setSmartSelectionStatus("error", message);
      store.setSmartSelectionProgress(null);
      setStatus(message);
    }
  }

  async function handleAiFillSelection(): Promise<void> {
    if (aiFillInFlightRef.current) return;
    const target = getSmartSelectionTarget();
    const store = useImageEditStore.getState();
    const selection = store.selectionMask;
    if (target === null || activePage === null || selection === null) {
      setStatus("Select an area first");
      return;
    }
    const selectedPixels = countSelectedPixels(selection.data);
    if (selectedPixels === 0) {
      setStatus("Select an area first");
      return;
    }
    const selectedRatio = selectedPixels / Math.max(1, selection.width * selection.height);
    if (selectedRatio > 0.5) {
      const message = `Selection is too large for AI Fill (${Math.round(selectedRatio * 100)}% of the layer). Choose a smaller area.`;
      store.setAiFillStatus("error", message);
      store.setAiFillProgress(null);
      setStatus(message);
      return;
    }
    const estimatedRoi = estimateAiFillRoi(selection.data, selection.width, selection.height);
    if (estimatedRoi === null) {
      setStatus("Select an area first");
      return;
    }
    const maxPatchPixels = 10_000_000;
    if (estimatedRoi.pixels > maxPatchPixels) {
      const message = `AI Fill area is too large (${formatMegapixels(estimatedRoi.pixels)} MP ROI). Choose a tighter selection or crop the image first.`;
      store.setAiFillStatus("error", message);
      store.setAiFillProgress(null);
      setStatus(message);
      return;
    }
    aiFillInFlightRef.current = true;
    store.setAiFillStatus("preparing", selectedRatio > 0.3 ? "Large selection: preparing ROI fill..." : "Preparing AI Fill...");
    store.setAiFillProgress({ operation: "inpaint_remove", phase: "prepare", message: "Preparing AI Fill...", percent: null });
    setStatus(selectedRatio > 0.3 ? "Large selection: preparing ROI fill..." : "Preparing AI Fill...");
    try {
      const rendered = await renderImageLayerToSelectionCanvas(target.layer, target.asset, currentDocument.assets, selection.width, selection.height);
      if (rendered === null) {
        throw new Error("Cannot render the selected layer for AI Fill");
      }
      const renderedDataUrl = rendered.toDataURL("image/png");
      const result = await runContentAwareFill({
        asset: target.asset,
        layer: target.layer,
        targetMask: selection,
        renderedImageDataUrl: renderedDataUrl,
        engine: store.contentFillEngine
      });
      if (result === null) {
        const message = "AI Fill is unavailable";
        store.setAiFillStatus("error", message);
        store.setAiFillProgress(null);
        setStatus(message);
        return;
      }
      const filledDataUrl = await composeInpaintPatch(rendered, result.patchPngBase64, result.roi);
      const generatedAsset: Asset = {
        version: 1,
        id: crypto.randomUUID(),
        name: `${target.asset.name.replace(/\.[^/.]+$/, "")} ai-fill.png`,
        kind: "image",
        status: "ready",
        originalPath: filledDataUrl,
        previewPath: filledDataUrl,
        thumbnailPath: filledDataUrl,
        mimeType: "image/png",
        width: selection.width,
        height: selection.height,
        fileSize: Math.round(filledDataUrl.length * 0.75),
        hash: `${target.asset.hash ?? target.asset.checksum ?? target.asset.id}:ai-fill:${Date.now()}`,
        checksum: `${target.asset.checksum ?? target.asset.hash ?? target.asset.id}:ai-fill:${Date.now()}`,
        metadata: {
          generatedBy: "ai-fill",
          sourceAssetId: target.asset.id,
          sourceLayerId: target.layer.id,
          roiX: result.roi.x,
          roiY: result.roi.y,
          roiWidth: result.roi.width,
          roiHeight: result.roi.height,
          modelId: result.modelId,
          modelVersion: result.modelVersion,
          fallback: result.fallback,
          backendAttempted: result.backendAttempted ?? "simple-lama-inpainting",
          backendUsed: result.backendUsed ?? result.modelId,
          backendDevice: result.backendDevice ?? null,
          modelWeightsPath: result.modelWeightsPath ?? null,
          fallbackReason: result.fallbackReason ?? null,
          debugDir: result.debugDir ?? null,
          processingMs: result.processingMs,
          createdAt: new Date().toISOString()
        }
      };
      const nextMetadata = { ...target.layer.metadata };
      delete nextMetadata["flipH"];
      delete nextMetadata["flipV"];
      const nextLayer: ImageLayer = {
        ...target.layer,
        assetId: generatedAsset.id,
        crop: { x: 0, y: 0, width: 1, height: 1 },
        pixelMask: undefined,
        imageOffsetX: 0,
        imageOffsetY: 0,
        imageScale: 1,
        metadata: {
          ...nextMetadata,
          aiFillSourceAssetId: target.asset.id,
          aiFillModelId: result.modelId,
          aiFillFallback: result.fallback,
          aiFillFallbackReason: result.fallbackReason ?? null
        }
      };
      applyDocumentChange("AiFillRemoveAction", (doc) => ({
        ...doc,
        assets: [...doc.assets, generatedAsset],
        pages: doc.pages.map((page) => page.id === activePage.id ? {
          ...page,
          layers: page.layers.map((layer) => layer.id === target.layer.id ? nextLayer : layer)
        } : page)
      }), activePage.id);
      store.clearSelection();
      store.setAiFillStatus(result.fallback ? "fallback" : "ready", result.message);
      store.setAiFillProgress(null);
      setStatus(result.fallback ? `Fallback: OpenCV${result.fallbackReason ? ` (${result.fallbackReason})` : ""}` : `AI Fill: LaMa${result.backendDevice ? ` (${result.backendDevice})` : ""}`);
      useUiBusyStore.getState().flashToast("המילוי הוחל • Ctrl+Z לביטול");
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "AI Fill failed";
      const message = rawMessage.startsWith("selection_too_large")
        ? `Selection is too large for AI Fill. ${rawMessage}`
        : rawMessage;
      store.setAiFillStatus("error", message);
      store.setAiFillProgress(null);
      setStatus(message);
    } finally {
      aiFillInFlightRef.current = false;
    }
  }

  function handleSelectAllLayers(): void {
    const selectableIds = currentPage.layers
      .filter((layer) => layer.type !== "background" && layer.type !== "guide" && !layer.locked)
      .map((layer) => layer.id);
    setSelection(selectableIds);
    setStatus(selectableIds.length > 0 ? "All layers selected" : "No selectable layers");
  }

  function updateSelectedText(text: string): void {
    if (selectedLayer?.type !== "text") return;
    const nextLayer = pruneRichTextForText({ ...selectedLayer, text });
    const size = measureTextLayerSize(nextLayer);
    const updatedLayer = { ...nextLayer, width: size.width, height: size.height };
    updateLayer(currentPage.id, updatedLayer);
  }

  function applySimpleImageCrop(layer: ImageLayer, crop: { x: number; y: number; width: number; height: number }): ImageLayer {
    const cropX = Math.max(0, Math.min(1, crop.x));
    const cropY = Math.max(0, Math.min(1, crop.y));
    const cropW = Math.max(0.001, Math.min(1 - cropX, crop.width));
    const cropH = Math.max(0.001, Math.min(1 - cropY, crop.height));
    const nextCrop = {
      x: layer.crop.x + cropX * layer.crop.width,
      y: layer.crop.y + cropY * layer.crop.height,
      width: cropW * layer.crop.width,
      height: cropH * layer.crop.height
    };
    const localX = cropX * layer.width;
    const localY = cropY * layer.height;
    const rotation = ((layer.rotation ?? 0) * Math.PI) / 180;
    const rotatedX = localX * Math.cos(rotation) - localY * Math.sin(rotation);
    const rotatedY = localX * Math.sin(rotation) + localY * Math.cos(rotation);

    return {
      ...layer,
      x: layer.x + rotatedX,
      y: layer.y + rotatedY,
      width: Math.max(1, layer.width * cropW),
      height: Math.max(1, layer.height * cropH),
      crop: nextCrop
    };
  }

  function handleImageEditApply(): void {
    if (imageEditLayerId === null || activePage === null) {
      exitImageEditMode();
      return;
    }
    const layer = activePage.layers.find((l) => l.id === imageEditLayerId);
    if (layer?.type !== "image") {
      exitImageEditMode();
      return;
    }
    if (imageActiveTool === "crop" && cropPreview !== null) {
      updateLayer(activePage.id, applySimpleImageCrop(layer, cropPreview));
      setStatus("התמונה נחתכה בלי עיוות");
      exitImageEditMode();
      return;
    }
    if (imageActiveTool === "white-bg") {
      updateLayer(activePage.id, {
        ...layer,
        effects: {
          ...layer.effects,
          remove_white: true,
          remove_white_tolerance: whiteBackgroundThreshold
        }
      });
      setStatus("White background removal applied");
      exitImageEditMode();
      return;
    }
    if ((imageActiveTool === "wand" || imageActiveTool === "rect-select" || imageActiveTool === "smart-select" || imageActiveTool === "brush-select") && useImageEditStore.getState().selectionMask !== null) {
      setStatus("Choose Delete, Copy, Cut, or Clear for the active selection");
      return;
    }
    exitImageEditMode();
  }

  function handleDeleteSelection(): void {
    const storeState = useImageEditStore.getState();
    if (!storeState.imageEditMode) return;
    const selMask = storeState.selectionMask;
    if (selMask === null || imageEditLayerId === null || activePage === null) return;
    const layer = activePage.layers.find((l) => l.id === imageEditLayerId);
    if (layer?.type !== "image") return;
    void handleApplyMaskFromSelection(selMask.data, selMask.width, selMask.height).then(() => {
      setStatus("Selection deleted");
    });
    useImageEditStore.getState().clearSelection();
  }

  function handleImageEditCancel(): void {
    exitImageEditMode();
  }

  function handleImageEditResetCrop(): void {
    if (imageEditLayerId === null || activePage === null) return;
    const layer = activePage.layers.find((l) => l.id === imageEditLayerId);
    if (layer?.type !== "image") return;
    updateLayer(activePage.id, { ...layer, crop: { x: 0, y: 0, width: 1, height: 1 } });
  }

  function handleImageEditResetMask(): void {
    if (imageEditLayerId === null || activePage === null) return;
    const layer = activePage.layers.find((l) => l.id === imageEditLayerId);
    if (layer?.type !== "image") return;
    updateLayer(activePage.id, { ...layer, pixelMask: undefined });
  }

  async function handleApplyMaskFromSelection(selectionData: Uint8Array, width: number, height: number): Promise<void> {
    if (imageEditLayerId === null || activePage === null) return;
    const layer = activePage.layers.find((l) => l.id === imageEditLayerId);
    if (layer?.type !== "image") return;

    const canvas = window.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;

    const existing = layer.pixelMask !== undefined
      ? currentDocument.assets.find((a) => a.id === layer.pixelMask!.assetId)
      : null;

    if (existing?.previewPath !== undefined) {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => { ctx.drawImage(img, 0, 0, width, height); resolve(); };
        img.src = existing.previewPath!;
      });
    } else {
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, width, height);
    }

    // Apply selection as mask (erase selected pixels)
    const imageDataObj = ctx.getImageData(0, 0, width, height);
    for (let i = 0; i < selectionData.length; i++) {
      if (selectionData[i] > 128) {
        imageDataObj.data[i * 4 + 3] = 0;
      }
    }
    ctx.putImageData(imageDataObj, 0, 0);

    const dataUrl = canvas.toDataURL("image/png");
    const maskAsset = createMaskAsset(dataUrl, width, height, layer.id);
    addAsset(maskAsset);
    updateLayer(activePage.id, {
      ...layer,
      pixelMask: { version: 1, assetId: maskAsset.id, width, height }
    });
  }

  function patchManagedClassPhotoTextLayer(nextLayer: TextLayer, patch: Partial<VisualLayer>): boolean {
    if (!isClassPhotoMode || activeClassPhotoRule === null || selectedLayer?.type !== "text") return false;
    const nameMeta = selectedLayer.metadata["classPhotoName"] as { ruleId?: string; personId?: string; role?: string } | undefined;
    const isTitle = selectedLayer.metadata["classPhotoTitle"] !== undefined;
    const isFooter = selectedLayer.metadata["classPhotoFooter"] !== undefined;
    if (nameMeta?.ruleId !== activeClassPhotoRule.id && !isTitle && !isFooter) return false;

    const hasPatchKey = (key: keyof TextLayer): boolean => Object.prototype.hasOwnProperty.call(patch, key);
    const stableLayer: TextLayer = {
      ...nextLayer,
      x: hasPatchKey("x") ? nextLayer.x : selectedLayer.x,
      y: hasPatchKey("y") ? nextLayer.y : selectedLayer.y,
      width: hasPatchKey("width") ? nextLayer.width : selectedLayer.width,
      height: hasPatchKey("height") ? nextLayer.height : selectedLayer.height
    };
    const stylePatch = {
      fontFamily: stableLayer.fontFamily,
      fontWeight: stableLayer.fontWeight,
      fontSize: stableLayer.fontSize,
      lineHeight: stableLayer.lineHeight,
      letterSpacing: stableLayer.letterSpacing,
      color: stableLayer.color,
      alignment: stableLayer.alignment,
      direction: stableLayer.direction
    };
    const textPatch = (patch as Partial<TextLayer>).text;

    applyDocumentChange(
      "UpdateClassPhotoManagedTextLayerCommand",
      (doc) => ({
        ...doc,
        pages: doc.pages.map((page) => page.id === currentPage.id
          ? { ...page, layers: page.layers.map((layer) => layer.id === stableLayer.id ? stableLayer : layer) }
          : page),
        classPhotoRules: doc.classPhotoRules.map((rule) => {
          if (rule.id !== activeClassPhotoRule.id) return rule;
          if (nameMeta?.personId !== undefined) {
            return {
              ...rule,
              personRecords: rule.personRecords.map((record) =>
                record.id === nameMeta.personId && typeof textPatch === "string"
                  ? { ...record, displayName: stableLayer.text }
                  : record
              )
            };
          }
          if (isTitle) {
            return {
              ...rule,
              titleText: typeof textPatch === "string" ? stableLayer.text : rule.titleText,
              titleTextStyle: { ...rule.titleTextStyle, ...stylePatch },
              titleTextEffects: stableLayer.effects
            };
          }
          if (isFooter) {
            return {
              ...rule,
              footerText: typeof textPatch === "string" ? stableLayer.text : rule.footerText,
              footerTextStyle: { ...rule.footerTextStyle, ...stylePatch },
              footerTextEffects: stableLayer.effects
            };
          }
          return rule;
        })
      }),
      currentPage.id
    );
    return true;
  }

  function patchSelectedLayer(patch: Partial<VisualLayer>): void {
    if (selectedLayer === null) return;

    // Single selection: existing behavior unchanged
    if (selectedLayerIds.length <= 1) {
      const nextLayer = { ...selectedLayer, ...patch } as VisualLayer;
      if (nextLayer.type === "text") {
        if (patchManagedClassPhotoTextLayer(nextLayer, patch)) return;
        const size = measureTextLayerSize(nextLayer);
        updateLayer(currentPage.id, { ...nextLayer, width: size.width, height: size.height });
        return;
      }
      handleCanvasLayerChange(nextLayer);
      return;
    }

    // Multi-selection: apply patch to all selected layers of the same type, in one history entry
    const primaryType = selectedLayer.type;
    const matchingLayers = selectedLayers.filter((l) => l.type === primaryType);

    if (matchingLayers.length <= 1) {
      const nextLayer = { ...selectedLayer, ...patch } as VisualLayer;
      if (nextLayer.type === "text") {
        const size = measureTextLayerSize(nextLayer);
        updateLayer(currentPage.id, { ...nextLayer, width: size.width, height: size.height });
        return;
      }
      handleCanvasLayerChange(nextLayer);
      return;
    }

    // For image effects patches, compute a delta so each layer keeps its own other effects intact
    const patchEffects = (patch as { effects?: ImageLayerEffects }).effects;
    const effectsDelta: Partial<ImageLayerEffects> | null =
      patchEffects !== undefined && selectedLayer.type === "image"
        ? (() => {
            const origEffects = (selectedLayer as Extract<VisualLayer, { type: "image" }>).effects;
            const delta: Partial<ImageLayerEffects> = {};
            for (const key of Object.keys(patchEffects) as (keyof ImageLayerEffects)[]) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              if ((patchEffects as any)[key] !== (origEffects as any)[key]) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (delta as any)[key] = (patchEffects as any)[key];
              }
            }
            return delta;
          })()
        : null;

    // For frame quick-edit patches (metadata.imageEditParams), compute a per-key
    // delta vs the primary layer's previous params. Applying { ...layer, ...patch }
    // would overwrite each other selected frame's entire metadata with the primary's,
    // wiping their collageColorAdj / collageFrame / per-frame settings.
    const patchMeta = (patch as { metadata?: Record<string, unknown> }).metadata;
    const editParamsDelta: { setKeys: Record<string, unknown>; removeKeys: string[] } | null =
      patchMeta !== undefined && Object.prototype.hasOwnProperty.call(patchMeta, "imageEditParams") && selectedLayer.type === "frame"
        ? (() => {
            const origParams = (selectedLayer.metadata["imageEditParams"] ?? {}) as Record<string, unknown>;
            const newParams = (patchMeta["imageEditParams"] ?? {}) as Record<string, unknown>;
            const setKeys: Record<string, unknown> = {};
            const removeKeys: string[] = [];
            const allKeys = new Set<string>([...Object.keys(origParams), ...Object.keys(newParams)]);
            for (const key of allKeys) {
              const before = origParams[key];
              const after = newParams[key];
              if (before === after) continue;
              if (key in newParams) {
                setKeys[key] = after;
              } else {
                removeKeys.push(key);
              }
            }
            return { setKeys, removeKeys };
          })()
        : null;

    applyDocumentChange(
      `UpdateMultiLayerPatch(${matchingLayers.length})`,
      (doc) => ({
        ...doc,
        pages: doc.pages.map((page) =>
          page.id !== currentPage.id
            ? page
            : {
                ...page,
                layers: page.layers.map((layer) => {
                  if (!matchingLayers.some((t) => t.id === layer.id)) return layer;
                  if (effectsDelta !== null && layer.type === "image") {
                    return {
                      ...layer,
                      effects: { ...(layer as Extract<VisualLayer, { type: "image" }>).effects, ...effectsDelta }
                    } as VisualLayer;
                  }
                  if (editParamsDelta !== null && layer.type === "frame") {
                    const ownParams = { ...((layer.metadata["imageEditParams"] ?? {}) as Record<string, unknown>) };
                    for (const [k, v] of Object.entries(editParamsDelta.setKeys)) ownParams[k] = v;
                    for (const k of editParamsDelta.removeKeys) delete ownParams[k];
                    return {
                      ...layer,
                      metadata: {
                        ...layer.metadata,
                        imageEditParams: ownParams as unknown as import("@/types/primitives").JsonValue
                      }
                    } as VisualLayer;
                  }
                  if (layer.type === "text") {
                    const next = { ...layer, ...patch } as Extract<VisualLayer, { type: "text" }>;
                    const size = measureTextLayerSize(next);
                    return { ...next, width: size.width, height: size.height } as VisualLayer;
                  }
                  return { ...layer, ...patch } as VisualLayer;
                })
              }
        )
      }),
      currentPage.id
    );
  }

  // Collect {x,y} deltas from an aligned layer set and commit them in ONE undo step.
  function commitAlignGeometry(alignedLayers: VisualLayer[], label: string, status: string): void {
    const updates: Array<{ layerId: string; x: number; y: number }> = [];
    alignedLayers.forEach((layer) => {
      const original = currentPage.layers.find((item) => item.id === layer.id);
      if (original !== undefined && (original.x !== layer.x || original.y !== layer.y)) {
        updates.push({ layerId: layer.id, x: layer.x, y: layer.y });
      }
    });
    if (updates.length === 0) return;
    applySmartArrange(currentPage.id, updates, label);
    setStatus(status);
  }

  function handleAlign(command: AlignmentCommand): void {
    if (selectedLayerIds.length === 0) return;
    const alignedLayers = alignLayers({
      page: currentPage,
      layers: currentPage.layers,
      selectedLayerIds,
      command
    });
    commitAlignGeometry(alignedLayers, "AlignLayersAction", "Alignment updated");
  }

  function handleCenterToCanvas(axis: "both" | "x" | "y"): void {
    if (selectedLayerIds.length === 0) return;
    const centered = centerToCanvas({
      page: currentPage,
      layers: currentPage.layers,
      selectedLayerIds,
      axis
    });
    commitAlignGeometry(centered, "CenterToCanvasAction", "Centered to page");
  }

  // Center horizontally on the page and snap to the top/bottom edge.
  function handleCenterToEdge(edge: "top" | "bottom"): void {
    if (selectedLayerIds.length === 0) return;
    const centeredX = centerToCanvas({
      page: currentPage,
      layers: currentPage.layers,
      selectedLayerIds,
      axis: "x"
    });
    const aligned = alignLayers({
      page: currentPage,
      layers: centeredX,
      selectedLayerIds,
      command: edge,
      target: "page"
    });
    commitAlignGeometry(aligned, "CenterToEdgeAction", edge === "top" ? "מורכז למעלה" : "מורכז למטה");
  }

  function resizeSelectedLayer(wPx: number, hPx: number): void {
    if (selectedLayer === null) return;
    const cx = selectedLayer.x + selectedLayer.width / 2;
    const cy = selectedLayer.y + selectedLayer.height / 2;
    const nextLayer = {
      ...selectedLayer,
      x: cx - wPx / 2,
      y: cy - hPx / 2,
      width: wPx,
      height: hPx
    } as VisualLayer;
    handleCanvasLayerChange(nextLayer);
  }

  function handleRegenerateGrid(rule: GridLayoutRule, patch: Partial<GridLayoutRule>): void {
    applyDocumentChange("RegenerateGridCommand", (doc) => regenerateGrid(doc, rule.id, patch), currentPage.id);
    setStatus("Grid regenerated");
  }

  function handleApplyGridFit(rule: GridLayoutRule, fitMode: GridLayoutRule["fitMode"]): void {
    applyDocumentChange("ApplyGridFitModeToAllCommand", (doc) => applyGridFitModeToAll(doc, rule.id, fitMode), currentPage.id);
    setStatus("Grid fit mode applied");
  }

  function handleResetGridCrops(rule: GridLayoutRule): void {
    applyDocumentChange("ResetGridCropsCommand", (doc) => resetGridCrops(doc, rule.id), currentPage.id);
    setStatus("Grid crops reset");
  }

  async function handleApplyFaceCropToManagedCells(
    mode: "grid" | "mask" | "photoPrint" | "classPhoto",
    ruleId: string
  ): Promise<void> {
    if (cellSmartCropProgress !== null) return;
    const sourceDoc = useDocumentStore.getState().document;
    if (sourceDoc === null) return;

    const rule = sourceDoc.classPhotoRules.find((item) => item.id === ruleId);
    const recordById = new Map(rule?.personRecords.map((record) => [record.id, record]) ?? []);
    const frames: Array<{ pageId: string; frame: FrameLayer; personId?: string; faceData?: FaceAnchorData }> = [];
    for (const page of sourceDoc.pages) {
      for (const layer of page.layers) {
        if (layer.type !== "frame" || layer.contentType !== "image" || layer.imageAssetId === undefined) continue;
        if (mode === "grid") {
          const meta = layer.metadata["gridCell"] as { gridId?: string } | undefined;
          if (meta?.gridId === ruleId) frames.push({ pageId: page.id, frame: layer });
        } else if (mode === "mask") {
          const meta = layer.metadata["maskFrame"] as { maskId?: string } | undefined;
          if (meta?.maskId === ruleId) frames.push({ pageId: page.id, frame: layer });
        } else if (mode === "photoPrint") {
          const meta = layer.metadata["photoPrintSlot"] as { photoPrintId?: string } | undefined;
          if (meta?.photoPrintId === ruleId) frames.push({ pageId: page.id, frame: layer });
        } else {
          const meta = layer.metadata["classPhotoFrame"] as { ruleId?: string; personId?: string } | undefined;
          if (meta?.ruleId === ruleId && meta.personId !== undefined) frames.push({ pageId: page.id, frame: layer, personId: meta.personId });
        }
      }
    }

    if (frames.length === 0) {
      setStatus("No images found for face alignment");
      return;
    }

    setCellSmartCropProgress({ done: 0, total: frames.length });
    const transformByFrameId = new Map<string, ContentTransform>();
    const personIdByFrameId = new Map<string, string>();
    let done = 0;
    for (const item of frames) {
      const latestDoc = useDocumentStore.getState().document;
      const asset = latestDoc?.assets.find((candidate) => candidate.id === item.frame.imageAssetId);
      if (asset !== undefined) {
        const transform = await computeFaceCenteredTransformForFrame(asset, item.frame);
        transformByFrameId.set(item.frame.id, transform);
        if (item.personId !== undefined) personIdByFrameId.set(item.frame.id, item.personId);
      }
      done += 1;
      setCellSmartCropProgress({ done, total: frames.length });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    setCellSmartCropProgress(null);
    if (transformByFrameId.size === 0) {
      setStatus("Face alignment skipped");
      return;
    }

    applyDocumentChange(
      "ApplyFaceCropToManagedCellsCommand",
      (doc) => ({
        ...doc,
        pages: doc.pages.map((page) => ({
          ...page,
          layers: page.layers.map((layer) =>
            layer.type === "frame" && transformByFrameId.has(layer.id)
              ? { ...layer, contentTransform: transformByFrameId.get(layer.id)! }
              : layer
          )
        })),
        gridImageAssignments: mode === "grid"
          ? doc.gridImageAssignments.map((assignment) => {
              const transform = assignment.gridId === ruleId ? transformByFrameId.get(assignment.frameId) : undefined;
              return transform === undefined
                ? assignment
                : {
                    ...assignment,
                    manualContentTransform: transform,
                    manualFitModeOverride: assignment.manualFitModeOverride,
                    hasManualCropOverride: true,
                    hasManualRotationOverride: transform.rotation !== 0,
                    manualRotation: transform.rotation
                  };
            })
          : doc.gridImageAssignments,
        maskImageAssignments: mode === "mask"
          ? doc.maskImageAssignments.map((assignment) => {
              const transform = assignment.maskId === ruleId ? transformByFrameId.get(assignment.frameId) : undefined;
              return transform === undefined
                ? assignment
                : {
                    ...assignment,
                    manualContentTransform: transform,
                    manualFitModeOverride: assignment.manualFitModeOverride,
                    hasManualCropOverride: true,
                    hasManualRotationOverride: transform.rotation !== 0
                  };
            })
          : doc.maskImageAssignments,
        photoPrintImageAssignments: mode === "photoPrint"
          ? doc.photoPrintImageAssignments.map((assignment) => {
              const transform = assignment.photoPrintId === ruleId ? transformByFrameId.get(assignment.frameId) : undefined;
              return transform === undefined
                ? assignment
                : {
                    ...assignment,
                    manualContentTransform: transform,
                    manualFitModeOverride: assignment.manualFitModeOverride,
                    hasManualCropOverride: true,
                    hasManualRotationOverride: transform.rotation !== 0
                  };
            })
          : doc.photoPrintImageAssignments,
        classPhotoRules: mode === "classPhoto"
          ? doc.classPhotoRules.map((rule) => rule.id === ruleId
              ? {
                  ...rule,
                  personRecords: rule.personRecords.map((record) => {
                    const frameId = record.frameLayerId;
                    const transform = frameId !== undefined ? transformByFrameId.get(frameId) : undefined;
                    const fallbackTransform = [...personIdByFrameId.entries()].find(([, personId]) => personId === record.id);
                    const nextTransform = transform ?? (fallbackTransform ? transformByFrameId.get(fallbackTransform[0]) : undefined);
                    return nextTransform === undefined
                      ? record
                      : {
                          ...record,
                          manualImageCrop: { x: nextTransform.offsetX, y: nextTransform.offsetY, width: 1, height: 1 },
                          manualImageScale: nextTransform.scale,
                          manualImageRotation: nextTransform.rotation,
                          hasManualCropOverride: true,
                          hasManualRotationOverride: nextTransform.rotation !== 0
                        };
                  })
                }
              : rule)
          : doc.classPhotoRules
      }),
      currentPage.id
    );
    setStatus(`Face alignment applied to ${transformByFrameId.size} images`);
  }

  async function handleEqualizeClassPhotoFaceSize(ruleId: string): Promise<void> {
    if (cellSmartCropProgress !== null) return;
    const sourceDoc = useDocumentStore.getState().document;
    if (sourceDoc === null) return;

    const rule = sourceDoc.classPhotoRules.find((item) => item.id === ruleId);
    const recordById = new Map(rule?.personRecords.map((record) => [record.id, record]) ?? []);
    const frames: Array<{ pageId: string; frame: FrameLayer; personId?: string; faceData?: FaceAnchorData }> = [];
    for (const page of sourceDoc.pages) {
      for (const layer of page.layers) {
        if (layer.type !== "frame" || layer.contentType !== "image" || layer.imageAssetId === undefined) continue;
        const meta = layer.metadata["classPhotoFrame"] as { ruleId?: string; personId?: string } | undefined;
        if (meta?.ruleId === ruleId && meta.personId !== undefined) {
          frames.push({
            pageId: page.id,
            frame: layer,
            personId: meta.personId,
            faceData: recordById.get(meta.personId)?.faceData
          });
        }
      }
    }

    if (frames.length === 0) {
      setStatus("לא נמצאו תמונות מחזור להשוואת גודל פנים");
      return;
    }

    const selectedClassMeta =
      selectedLayer?.type === "frame"
        ? (selectedLayer.metadata["classPhotoFrame"] as { ruleId?: string; personId?: string } | undefined)
        : selectedLayer?.type === "text"
        ? (selectedLayer.metadata["classPhotoName"] as { ruleId?: string; personId?: string } | undefined)
        : undefined;
    const selectedReferenceFrame =
      selectedClassMeta?.ruleId === ruleId
        ? frames.find((item) => item.personId === selectedClassMeta.personId)?.frame
        : undefined;

    setCellSmartCropProgress({ done: 0, total: frames.length * 2 });
    const ratioByFrameId = new Map<string, { ratio: number; detected: boolean }>();
    let done = 0;
    for (const item of frames) {
      const latestDoc = useDocumentStore.getState().document;
      const asset = latestDoc?.assets.find((candidate) => candidate.id === item.frame.imageAssetId);
      if (asset !== undefined) {
        const analysis = await analyzeFaceSizingForFrame(asset, item.frame, item.faceData);
        if (analysis !== null && Number.isFinite(analysis.faceRatio) && analysis.faceRatio > 0) {
          ratioByFrameId.set(item.frame.id, { ratio: analysis.faceRatio, detected: analysis.hasDetectedFace });
        }
      }
      done += 1;
      setCellSmartCropProgress({ done, total: frames.length * 2 });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    const selectedRatio = selectedReferenceFrame !== undefined ? ratioByFrameId.get(selectedReferenceFrame.id)?.ratio : undefined;
    const detectedRatios = [...ratioByFrameId.values()].filter((item) => item.detected).map((item) => item.ratio);
    const fallbackRatios = [...ratioByFrameId.values()].map((item) => item.ratio);
    const targetFaceRatio = selectedRatio ?? medianNumber(detectedRatios.length > 0 ? detectedRatios : fallbackRatios);
    if (targetFaceRatio === undefined) {
      setCellSmartCropProgress(null);
      setStatus("לא זוהו פנים להשוואת גודל");
      return;
    }

    const transformByFrameId = new Map<string, ContentTransform>();
    const personIdByFrameId = new Map<string, string>();
    for (const item of frames) {
      const latestDoc = useDocumentStore.getState().document;
      const asset = latestDoc?.assets.find((candidate) => candidate.id === item.frame.imageAssetId);
      if (asset !== undefined) {
        const transform = await computeFaceSizeMatchedTransformForFrame(asset, item.frame, targetFaceRatio, item.faceData);
        if (!sameContentTransform(transform, item.frame.contentTransform)) {
          transformByFrameId.set(item.frame.id, transform);
        }
        if (item.personId !== undefined) personIdByFrameId.set(item.frame.id, item.personId);
      }
      done += 1;
      setCellSmartCropProgress({ done, total: frames.length * 2 });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    setCellSmartCropProgress(null);
    if (transformByFrameId.size === 0) {
      setStatus("לא נמצאו זיהויי פנים מהימנים להשוואת גודל");
      return;
    }

    applyDocumentChange(
      "EqualizeClassPhotoFaceSizeCommand",
      (doc) => ({
        ...doc,
        pages: doc.pages.map((page) => ({
          ...page,
          layers: page.layers.map((layer) =>
            layer.type === "frame" && transformByFrameId.has(layer.id)
              ? { ...layer, contentTransform: transformByFrameId.get(layer.id)! }
              : layer
          )
        })),
        classPhotoRules: doc.classPhotoRules.map((rule) => rule.id === ruleId
          ? {
              ...rule,
              personRecords: rule.personRecords.map((record) => {
                const frameId = record.frameLayerId;
                const transform = frameId !== undefined ? transformByFrameId.get(frameId) : undefined;
                const fallbackTransform = [...personIdByFrameId.entries()].find(([, personId]) => personId === record.id);
                const nextTransform = transform ?? (fallbackTransform ? transformByFrameId.get(fallbackTransform[0]) : undefined);
                return nextTransform === undefined
                  ? record
                  : {
                      ...record,
                      manualImageCrop: { x: nextTransform.offsetX, y: nextTransform.offsetY, width: 1, height: 1 },
                      manualImageScale: nextTransform.scale,
                      manualImageRotation: nextTransform.rotation,
                      hasManualCropOverride: true,
                      hasManualRotationOverride: nextTransform.rotation !== 0
                    };
              })
            }
          : rule)
      }),
      currentPage.id
    );
    setStatus(
      selectedReferenceFrame !== undefined
        ? `גודל פנים הושווה לפי התא הנבחר (${transformByFrameId.size} תמונות)`
        : `גודל פנים הושווה לפי ממוצע (${transformByFrameId.size} תמונות)`
    );
  }

  async function handleClassPhotoAddFiles(files: FileList): Promise<void> {
    if (!activeClassPhotoRule) return;
    const { createClassPhotoPersonRecord: makeRecord } = await import("@/core/classPhoto/classPhotoFactory");
    const { addPeopleToClassPhoto } = useDocumentStore.getState();
    const { files: fileArr, failed, message: failureMessage } = await normalizeIncomingImages(Array.from(files).filter(isSupportedIncomingImageFile));
    if (failed.length > 0) setStatus(failureMessage ?? HEIC_CONVERSION_ERROR_MESSAGE);
    const imported: import("@/types/document").Asset[] = [];
    const newRecords: import("@/types/classPhoto").ClassPhotoPersonRecord[] = [];
    const maxOrder = activeClassPhotoRule.personRecords.reduce((m, r) => Math.max(m, r.orderIndex), -1);
    for (let i = 0; i < fileArr.length; i++) {
      const file = fileArr[i];
      if (!file) continue;
      try {
        const { asset } = await importImageAssetForEditor(file, [], { createPreview: true });
        imported.push(asset);
        newRecords.push(makeRecord(asset.id, file.name, "child", maxOrder + 1 + i));
      } catch { /* skip */ }
    }
    if (newRecords.length > 0) addPeopleToClassPhoto(activeClassPhotoRule.id, newRecords, imported);
  }

  function handleAddGridFilenameText(rule: GridLayoutRule): void {
    applyDocumentChange("ApplyGridTextOverlayCommand", (doc) => createGridTextOverlay(doc, rule.id, { textSource: "filename" }), currentPage.id);
    setStatus("Filename text added to grid cells");
  }

  function handleApplySelectedTextToGrid(rule: GridLayoutRule): void {
    if (selectedLayer?.type !== "text") return;
    applyDocumentChange("ApplyTextLayerToAllGridCellsCommand", (doc) => applyTextLayerToAllGridCells(doc, rule.id, selectedLayer.id), currentPage.id);
    setStatus("הטקסט הוחל על כל התאים");
  }

  function handleDeleteGridImage(rule: GridLayoutRule): void {
    if (selectedLayer?.type !== "frame") return;
    const cell = selectedLayer.metadata["gridCell"];
    if (typeof cell !== "object" || cell === null || !("cellIndexGlobal" in cell) || typeof cell.cellIndexGlobal !== "number") return;
    const cellIndexGlobal = cell.cellIndexGlobal;
    applyDocumentChange("DeleteGridImageAndCompactFromEndCommand", (doc) => deleteGridImageAndCompactFromEnd(doc, rule.id, cellIndexGlobal), currentPage.id);
  }

  function applyMaskRegeneration(rule: MaskLayoutRule, patch: Partial<MaskLayoutRule>, resizePage: boolean): void {
    applyDocumentChange(
      resizePage ? "ResizePageAndRegenerateMaskLayoutCommand" : "RegenerateMaskLayoutCommand",
      (doc) => {
        const sizedDoc = resizePage
          ? resizeMaskPagesToFit(doc, rule.id, {
              maskWidth: patch.maskWidth ?? rule.maskWidth,
              maskHeight: patch.maskHeight ?? rule.maskHeight
            })
          : doc;
        return regenerateMaskLayout(sizedDoc, rule.id, patch);
      },
      currentPage.id
    );
    setStatus("Mask layout regenerated");
  }

  function handleRegenerateMask(rule: MaskLayoutRule, patch: Partial<MaskLayoutRule>): void {
    const nextSize = {
      maskWidth: patch.maskWidth ?? rule.maskWidth,
      maskHeight: patch.maskHeight ?? rule.maskHeight
    };
    const overflow = checkMaskPageOverflow(currentPage, rule, nextSize);
    if (overflow.exceeds) {
      setMaskOverflowPrompt({ rule, patch });
      setStatus("גודל המסיכה גדול משטח הדף");
      return;
    }
    applyMaskRegeneration(rule, patch, false);
  }

  function handleApplyMaskFit(rule: MaskLayoutRule, fitMode: MaskLayoutRule["fitMode"]): void {
    applyDocumentChange("ApplyMaskFitModeToAllCommand", (doc) => applyMaskFitModeToAll(doc, rule.id, fitMode), currentPage.id);
    setStatus("Mask fit mode applied");
  }

  function handleResetMaskCrops(rule: MaskLayoutRule): void {
    applyDocumentChange("ResetMaskCropsCommand", (doc) => resetMaskCrops(doc, rule.id), currentPage.id);
    setStatus("Mask crops reset");
  }

  function handleAddMaskFilenameText(rule: MaskLayoutRule): void {
    applyDocumentChange("ApplyMaskTextOverlayCommand", (doc) => createMaskTextOverlay(doc, rule.id, { textSource: "filename" }), currentPage.id);
    setStatus("Filename text added to masks");
  }

  function handleApplySelectedTextToMask(rule: MaskLayoutRule): void {
    if (selectedLayer?.type !== "text") return;
    applyDocumentChange("ApplyTextLayerToAllMaskFramesCommand", (doc) => applyTextLayerToAllMaskFrames(doc, rule.id, selectedLayer.id), currentPage.id);
    setStatus("Selected text applied to all masks");
  }

  async function handleChangeMaskPreset(rule: MaskLayoutRule, entry: import("@/state/maskLibraryStore").MaskLibraryEntry): Promise<void> {
    const now = new Date().toISOString();
    const newPresetId = crypto.randomUUID();
    let importedAsset: import("@/types/document").Asset | undefined;

    if (entry.fileDataUrl) {
      try {
        const processed = await generateMaskThumbnail(
          entry.fileDataUrl,
          entry.type as "svg" | "png",
          entry.thresholdEnabled,
          entry.thresholdColor,
          entry.thresholdTolerance,
          entry.thresholdFeather,
          2048
        );
        const file = await dataUrlToFile(processed, `${entry.name}-mask.png`);
        const { asset } = await importImageAsset(file, currentDocument.assets, { createPreview: false });
        importedAsset = asset;
      } catch {
        // continue without asset
      }
    }

    applyDocumentChange("ChangeMaskPresetCommand", (doc) => {
      const docWithAsset = importedAsset !== undefined && !doc.assets.some((a) => a.id === importedAsset!.id)
        ? { ...doc, assets: [...doc.assets, importedAsset!] }
        : doc;
      const newPreset: import("@/types/mask").MaskPreset = {
        version: 1,
        id: newPresetId,
        name: entry.name,
        type: entry.type === "svg" ? "svg" : entry.thresholdEnabled ? "pngThreshold" : "png",
        assetId: importedAsset?.id,
        thumbnailAssetId: undefined,
        thresholdSettings: entry.thresholdEnabled
          ? { version: 1, enabled: true, color: entry.thresholdColor, tolerance: entry.thresholdTolerance, feather: entry.thresholdFeather }
          : undefined,
        defaultSize: { width: entry.defaultWidth, height: entry.defaultHeight },
        keepProportionsDefault: true,
        createdAt: now,
        updatedAt: now,
        metadata: { libraryEntryId: entry.id }
      };
      return regenerateMaskLayout(
        { ...docWithAsset, maskPresets: [...docWithAsset.maskPresets, newPreset] },
        rule.id,
        { maskShape: "custom", maskPresetId: newPresetId, metadata: { ...rule.metadata, maskAssetId: importedAsset?.id ?? null } }
      );
    }, currentPage.id);
    setStatus("מסיכה הוחלפה");
  }

  function handleDeleteMaskImage(rule: MaskLayoutRule): void {
    if (selectedLayer?.type !== "frame") return;
    const frame = selectedLayer.metadata["maskFrame"];
    if (typeof frame !== "object" || frame === null || !("maskIndexGlobal" in frame) || typeof frame.maskIndexGlobal !== "number") return;
    const maskIndexGlobal = frame.maskIndexGlobal;
    applyDocumentChange("DeleteMaskImageAndCompactFromEndCommand", (doc) => deleteMaskImageAndCompactFromEnd(doc, rule.id, maskIndexGlobal), currentPage.id);
  }

  function renderModeSpecificPanel(): ReactNode {
    if (isProductMode) {
      return (
        <div className="rs-mode-section">
          <div className="rs-mode-label"><Boxes size={11} />מצב מוצר</div>
          <ProductDefinitionPanel />
        </div>
      );
    }
    if (isCollageMode && activeCollageRule !== null) {
      return (
        <div className="rs-mode-section">
          <div className="rs-mode-label"><SlidersHorizontal size={11} />מצב קולאז׳</div>
          <CollageModePanel rule={activeCollageRule} selectedLayer={selectedLayer} onReplaceImage={() => replaceImageInputRef.current?.click()} />
        </div>
      );
    }
    if (isGridMode && activeGridRule !== null) {
      return (
        <div className="rs-mode-section">
          <div className="rs-mode-label"><SlidersHorizontal size={11} />מצב גריד</div>
          <GridModePanel
            assignmentCount={currentDocument.gridImageAssignments.filter((assignment) => assignment.gridId === activeGridRule.id).length}
            rule={activeGridRule}
            selectedLayer={selectedLayer}
            onAddImages={() => imageInputRef.current?.click()}
            onAddFilenameText={() => handleAddGridFilenameText(activeGridRule)}
            onApplyFit={handleApplyGridFit}
            onApplyFaceCrop={() => void handleApplyFaceCropToManagedCells("grid", activeGridRule.id)}
            onApplySelectedText={() => handleApplySelectedTextToGrid(activeGridRule)}
            onDeleteSelectedImage={() => handleDeleteGridImage(activeGridRule)}
            onRegenerate={handleRegenerateGrid}
            onResetCrops={() => handleResetGridCrops(activeGridRule)}
          />
        </div>
      );
    }
    if (isMaskMode && activeMaskRule !== null) {
      return (
        <div className="rs-mode-section">
          <div className="rs-mode-label"><SlidersHorizontal size={11} />מצב מסכה</div>
          <MaskModePanel
            assignmentCount={currentDocument.maskImageAssignments.filter((assignment) => assignment.maskId === activeMaskRule.id).length}
            dpi={currentPage.setup.dpi}
            rule={activeMaskRule}
            selectedLayer={selectedLayer}
            onAddImages={() => imageInputRef.current?.click()}
            onAddFilenameText={() => handleAddMaskFilenameText(activeMaskRule)}
            onApplyFit={handleApplyMaskFit}
            onApplyFaceCrop={() => void handleApplyFaceCropToManagedCells("mask", activeMaskRule.id)}
            onApplySelectedText={() => handleApplySelectedTextToMask(activeMaskRule)}
            onDeleteSelectedImage={() => handleDeleteMaskImage(activeMaskRule)}
            onRegenerate={handleRegenerateMask}
            onResetCrops={() => handleResetMaskCrops(activeMaskRule)}
            onChangePreset={(entry) => void handleChangeMaskPreset(activeMaskRule, entry)}
          />
        </div>
      );
    }
    if (isPhotoPrintMode && activePhotoPrintRule !== null) {
      return (
        <div className="rs-mode-section">
          <div className="rs-mode-label"><SlidersHorizontal size={11} />פיתוח תמונות</div>
          <PhotoPrintModePanel
            rule={activePhotoPrintRule}
            document={currentDocument}
            smartCropProgress={cellSmartCropProgress}
            onApplyFaceCrop={() => void handleApplyFaceCropToManagedCells("photoPrint", activePhotoPrintRule.id)}
            onRegenerate={(patch) => {
              clearSelection();
              const updated = regeneratePhotoPrint(currentDocument, activePhotoPrintRule.id, patch);
              setDocument(updated);
            }}
          />
        </div>
      );
    }
    if (isClassPhotoMode && activeClassPhotoRule !== null) {
      return (
        <div className="rs-mode-section">
          <div className="rs-mode-label"><SlidersHorizontal size={11} />תמונת מחזור</div>
          <ClassPhotoModePanel
            rule={activeClassPhotoRule}
            selectedLayer={selectedLayer}
            smartCropProgress={cellSmartCropProgress}
            onApplyFaceCrop={() => void handleApplyFaceCropToManagedCells("classPhoto", activeClassPhotoRule.id)}
            onEqualizeFaceSize={() => void handleEqualizeClassPhotoFaceSize(activeClassPhotoRule.id)}
            onBackToWizard={() => onOpenClassPhotoWizard?.()}
          />
        </div>
      );
    }
    if (isBlessingMode && activeBlessingRule !== null) {
      return (
        <div className="rs-mode-section">
          <div className="rs-mode-label"><SlidersHorizontal size={11} />מצב ברכות</div>
          <BlessingModePanel rule={activeBlessingRule} selectedLayer={selectedLayer} />
        </div>
      );
    }
    return null;
  }

  const modeSpecificPanel = renderModeSpecificPanel();
  const selectedFrameHasImage = selectedLayer?.type === "frame" && selectedLayer.imageAssetId !== undefined;
  const selectedUsesManagedModeTabs = selectedFrameHasImage && (hasManagedModeMetadata(selectedLayer) || modeSpecificPanel !== null);

  return (
    <main className="canvas-shell" data-testid="editor-screen">
      {/* Save as Batch Template modal */}
      {templateSaveModal !== null && (
        <TemplateSaveModal
          initialName={templateSaveModal.name}
          onConfirm={confirmSaveAsBatchTemplate}
          onCancel={() => setTemplateSaveModal(null)}
        />
      )}
      {cloudSaveAsModal !== null && (
        <CloudSaveAsModal
          initialName={cloudSaveAsModal.name}
          onConfirm={confirmSaveCloudAs}
          onCancel={() => setCloudSaveAsModal(null)}
        />
      )}
      {advancedPrintOpen !== null && (
        <AdvancedPrintDialog
          pagesMeta={currentDocument.pages.map((p, index) => {
            const dpi = p?.setup?.dpi || 300;
            const widthMm = (p.width / dpi) * 25.4;
            const heightMm = (p.height / dpi) * 25.4;
            return {
              index,
              name: `עמוד ${index + 1}`,
              widthMm,
              heightMm,
              orientation: widthMm >= heightMm ? ("landscape" as const) : ("portrait" as const)
            };
          })}
          currentPageIndex={currentPageIndex}
          initialSelection={advancedPrintOpen.initialSelection}
          renderPage={async (index) => {
            const page = currentDocument.pages[index];
            if (!page) return null;
            try {
              await preloadAssetsForPrint(currentDocument.pages, [index], currentDocument.assets);
            } catch {
              /* best-effort preload */
            }
            const image = await renderPageForExport(page, "image/png");
            return image ? { rendered: image, dataUrl: image.dataUrl } : null;
          }}
          documentName={currentDocument.name}
          onClose={() => setAdvancedPrintOpen(null)}
        />
      )}
      {showSendRemote && (
        <SendToPrintHubDialog
          defaultApprovalMode={useAppSettings.getState().settings.printHub.defaultApprovalMode}
          customerName={typeof currentDocument.metadata.customerName === "string" ? currentDocument.metadata.customerName : ""}
          customerPhone={typeof currentDocument.metadata.customerPhone === "string" ? currentDocument.metadata.customerPhone : ""}
          pageCount={currentDocument.pages.length}
          busy={sendRemoteBusy}
          hubConfigured={(() => { const p = useAppSettings.getState().settings.printHub; return Boolean(lanConfigFromSettings(p)) || (p.serverHubRoot || p.networkFolderPath).length > 0; })()}
          uploadProgress={sendRemoteProgress}
          onCancel={() => { if (!sendRemoteBusy) setShowSendRemote(false); }}
          onConfirm={(opts) => { void handleSendToPrintHub(opts); }}
        />
      )}
      {maskOverflowPrompt !== null && (() => {
        const nextSize = {
          maskWidth: maskOverflowPrompt.patch.maskWidth ?? maskOverflowPrompt.rule.maskWidth,
          maskHeight: maskOverflowPrompt.patch.maskHeight ?? maskOverflowPrompt.rule.maskHeight
        };
        const overflow = checkMaskPageOverflow(currentPage, maskOverflowPrompt.rule, nextSize);
        const fitSize = pageSizeForMaskFit(currentPage, maskOverflowPrompt.rule, nextSize);
        return (
          <MaskOverflowPrompt
            available={`${Math.round(overflow.availableWidth)} ֳ— ${Math.round(overflow.availableHeight)} px`}
            required={`${Math.round(overflow.requiredWidth)} ֳ— ${Math.round(overflow.requiredHeight)} px`}
            resizedTo={`${fitSize.width} ֳ— ${fitSize.height} px`}
            onCancel={() => {
              setMaskOverflowPrompt(null);
              setStatus("שינוי גודל המסיכה בוטל");
            }}
            onContinue={() => {
              const pending = maskOverflowPrompt;
              setMaskOverflowPrompt(null);
              applyMaskRegeneration(pending.rule, pending.patch, false);
            }}
            onResizePage={() => {
              const pending = maskOverflowPrompt;
              setMaskOverflowPrompt(null);
              applyMaskRegeneration(pending.rule, pending.patch, true);
            }}
          />
        );
      })()}
      {/* Back-home confirmation dialog */}
      {showBackHomeDialog && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)" }}>
          <div style={{ background: "var(--color-surface, #fff)", borderRadius: 12, padding: "28px 32px", boxShadow: "0 8px 32px rgba(0,0,0,0.25)", maxWidth: 380, width: "90%", textAlign: "center" }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 17 }}>יש שינויים שלא נשמרו</h3>
            <p style={{ margin: "0 0 22px", fontSize: 14, color: "var(--color-text-secondary, #666)" }}>
              שמירה אוטומטית היא גיבוי בלבד. {exitAfterDialog ? "האם לשמור לפני היציאה מהתוכנה?" : "האם לשמור לפני החזרה לדף הבית?"}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button className="btn btn-primary" type="button" onClick={() => void confirmBackHome("save")}>
                <Save size={14} /> שמור וצא
              </button>
              <button className="btn btn-ghost" type="button" style={{ color: "#e53e3e" }} onClick={() => void confirmBackHome("discard")}>
                צא ללא שמירה
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => void confirmBackHome("cancel")}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
      <header className="topbar">
        <div className="topbar-side">
          <button className="icon-btn" onClick={isolatedImageEdit !== null ? handleCancelIsolatedImageEdit : handleBackHome} title={isolatedImageEdit !== null ? "ביטול עריכה מבודדת" : "בית"} type="button">
            {isolatedImageEdit !== null ? <X size={16} /> : <Home size={16} />}
          </button>
          <span className="topbar-divider" />
          <button
            className={`icon-btn ${canUndo ? "" : "disabled"}`}
            disabled={!canUndo}
            onClick={undo}
            title="Undo"
            type="button"
          >
            <Undo2 size={16} />
          </button>
          <button
            className={`icon-btn ${canRedo ? "" : "disabled"}`}
            disabled={!canRedo}
            onClick={redo}
            title="Redo"
            type="button"
          >
            <Redo2 size={16} />
          </button>
          <span className="project-name">{isolatedImageEdit !== null ? "עריכת תמונה מבודדת" : currentDocument.name}</span>
        </div>

        <div className="topbar-center">
          <span className="mode-label">{isolatedImageEdit !== null ? "עריכת התמונה המלאה" : "עיצוב חופשי"}</span>
          {onOpenSeparateWindow !== undefined ? (
            <button
              aria-label="פתח בחלון נפרד"
              className="mode-chip mode-chip-button"
              onClick={onOpenSeparateWindow}
              title="פתח בחלון נפרד"
              type="button"
            >
              <Maximize2 size={13} />
              פתח בחלון נפרד
            </button>
          ) : (
            <span className="mode-chip">
              <span className="mode-chip-dot" />
              {isolatedImageEdit !== null ? "Isolated Image" : "Free Mode"}
            </span>
          )}
          {!isMaskMode && (
            <button
              className={`btn btn-ghost ${layoutEditMode ? "btn-accent" : ""}`}
              onClick={toggleLayoutEditMode}
              title="מצב עריכת פריסה — מאפשר הזזה ושינוי גודל של פריימים"
              type="button"
            >
              {layoutEditMode ? "✏️ עריכת פריסה פעילה" : "עריכת פריסה"}
            </button>
          )}
          <span className="topbar-divider" />
          <button className="icon-btn" disabled={selectedLayerIds.length === 0} onClick={() => handleAlign("left")} title="Align left" type="button">
            <AlignLeft size={15} />
          </button>
          <button className="icon-btn" disabled={selectedLayerIds.length === 0} onClick={() => handleAlign("centerX")} title="Align horizontal center" type="button">
            <AlignCenter size={15} />
          </button>
          <button className="icon-btn" disabled={selectedLayerIds.length === 0} onClick={() => handleAlign("right")} title="Align right" type="button">
            <AlignRight size={15} />
          </button>
          <button className="icon-btn" disabled={selectedLayerIds.length === 0} onClick={() => handleAlign("top")} title="Align top" type="button">
            <ChevronsUp size={15} />
          </button>
          <button className="icon-btn" disabled={selectedLayerIds.length === 0} onClick={() => handleAlign("centerY")} title="Align vertical center" type="button">
            <AlignCenter size={15} />
          </button>
          <button className="icon-btn" disabled={selectedLayerIds.length === 0} onClick={() => handleAlign("bottom")} title="Align bottom" type="button">
            <ChevronsDown size={15} />
          </button>
          <button className="icon-btn" disabled={selectedLayerIds.length < 3} onClick={() => handleAlign("distributeX")} title="Distribute horizontally" type="button">
            <GripVertical size={15} />
          </button>
          <button className="icon-btn" disabled={selectedLayerIds.length < 3} onClick={() => handleAlign("distributeY")} title="Distribute vertically" type="button">
            <ChevronsDown size={15} />
          </button>
          <span className="topbar-divider" />
          <button className="icon-btn" disabled={selectedLayerIds.length === 0} onClick={() => handleCenterToCanvas("both")} title="מרכז לעמוד" type="button">
            <Crosshair size={15} />
          </button>
          <button className="icon-btn" disabled={selectedLayerIds.length === 0} onClick={() => handleCenterToCanvas("x")} title="מרכז אופקית לעמוד" type="button">
            <MoveHorizontal size={15} />
          </button>
          <button className="icon-btn" disabled={selectedLayerIds.length === 0} onClick={() => handleCenterToCanvas("y")} title="מרכז אנכית לעמוד" type="button">
            <MoveVertical size={15} />
          </button>
        </div>

        <div className="topbar-side topbar-actions">
          {isolatedImageEdit !== null ? (
            <>
              <button className="btn btn-ghost" onClick={handleCancelIsolatedImageEdit} type="button">
                <X size={14} />
                ביטול
              </button>
              <button className="btn btn-primary" onClick={handleApplyIsolatedImageEdit} type="button">
                <Save size={14} />
                החל וחזור
              </button>
            </>
          ) : (
            <>
          <button
            type="button"
            className="icon-btn"
            title="הגדרות (Ctrl+,)"
            onClick={onOpenSettings}
          >
            <Settings size={15} />
          </button>
          <UtilitiesMenu
            customerName={currentDocument.metadata.customerName as string | undefined}
            customerPhone={(currentDocument.metadata.customerPhone ?? currentDocument.metadata.phoneNumber) as string | undefined}
            customerEmail={(currentDocument.metadata.customerEmail ?? currentDocument.metadata.email) as string | undefined}
            projectName={currentDocument.name}
            onInsertQRToCanvas={handleInsertQRToCanvas}
          />
          <span className="topbar-divider" />
          <button className="btn btn-ghost" onClick={() => projectInputRef.current?.click()} type="button">
            <FileUp size={14} />
            טעינה
          </button>
          {onImportPsd !== undefined ? (
            <button className="btn btn-ghost" onClick={onImportPsd} type="button">
              <Layers size={14} />
              ייבוא PSD
            </button>
          ) : null}
          <button className="btn btn-ghost" onClick={() => pdfInputRef.current?.click()} type="button">
            <FileText size={14} />
            ייבוא PDF
          </button>
          {/* Save dropdown */}
          <div className="save-dropdown-wrapper" style={{ position: "relative" }}>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setSaveDropdownOpen((v) => !v)}
            >
              <Save size={14} />
              שמירה
              <ChevronDown size={12} style={{ marginInlineStart: 2 }} />
            </button>
            {saveDropdownOpen && (
              <>
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 999 }}
                  onClick={() => setSaveDropdownOpen(false)}
                />
                <div className="save-dropdown-menu" style={{
                  position: "absolute", top: "calc(100% + 4px)", right: 0,
                  background: "var(--bg-surface)", border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                  borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.45)", zIndex: 1000,
                  minWidth: 220, padding: "4px 0"
                }}>
                  <button
                    className="save-dropdown-item"
                    type="button"
                    onClick={() => { void handleSaveLifecycle(); setSaveDropdownOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text-primary)" }}
                  >
                    <Save size={13} /> שמירה <span style={{ marginInlineStart: "auto", opacity: 0.5, fontSize: 11 }}>Ctrl+S</span>
                  </button>
                  <button
                    className="save-dropdown-item"
                    type="button"
                    onClick={() => { void handleSaveAsToDisk(); setSaveDropdownOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text-primary)" }}
                  >
                    <Save size={13} /> שמירה בשם… <span style={{ marginInlineStart: "auto", opacity: 0.5, fontSize: 11 }}>Ctrl+Shift+S</span>
                  </button>
                  <button
                    className="save-dropdown-item"
                    type="button"
                    onClick={() => { void handleSavePortableLifecycle(); setSaveDropdownOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text-primary)" }}
                  >
                    <FileDown size={13} /> שמירה SPP (נייד)
                  </button>
                  <button
                    className="save-dropdown-item"
                    type="button"
                    onClick={() => { void handleSaveCloudLifecycle(); setSaveDropdownOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text-primary)" }}
                  >
                    <CloudUpload size={13} /> שמירה בענן
                  </button>
                  <button
                    className="save-dropdown-item"
                    type="button"
                    onClick={() => { handleSaveCloudAsLifecycle(); setSaveDropdownOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text-primary)" }}
                  >
                    <CloudUpload size={13} /> שמירה בענן בשם…
                  </button>
                  <button
                    className="save-dropdown-item"
                    type="button"
                    onClick={() => { handleSaveAsBatchTemplate(); setSaveDropdownOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#c084fc" }}
                  >
                    <Zap size={13} /> שמור כתבנית ייצור
                  </button>
                  <hr style={{ margin: "4px 0", border: "none", borderTop: "1px solid var(--border)" }} />
                  <div style={{ display: "flex", gap: 4, padding: "4px 10px", fontSize: 11, opacity: 0.85 }}>
                    <button
                      type="button"
                      onClick={() => setExportScope("all")}
                      style={{
                        flex: 1, padding: "4px 8px", borderRadius: 4, fontSize: 11, cursor: "pointer",
                        background: exportScope === "all" ? "var(--accent)" : "var(--bg-elevated)",
                        color: exportScope === "all" ? "#fff" : "var(--text-primary)",
                        border: "1px solid var(--border)"
                      }}
                    >כל המסמך</button>
                    <button
                      type="button"
                      onClick={() => setExportScope("current")}
                      style={{
                        flex: 1, padding: "4px 8px", borderRadius: 4, fontSize: 11, cursor: "pointer",
                        background: exportScope === "current" ? "var(--accent)" : "var(--bg-elevated)",
                        color: exportScope === "current" ? "#fff" : "var(--text-primary)",
                        border: "1px solid var(--border)"
                      }}
                    >עמוד נוכחי</button>
                  </div>
                  <button
                    className="save-dropdown-item"
                    type="button"
                    onClick={() => { void handleExportPng(); setSaveDropdownOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text-primary)" }}
                  >
                    <Download size={13} /> ייצוא PNG
                  </button>
                  <button
                    className="save-dropdown-item"
                    type="button"
                    onClick={() => { void handleExportJpg(); setSaveDropdownOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text-primary)" }}
                  >
                    <Download size={13} /> ייצוא JPEG
                  </button>
                  <hr style={{ margin: "4px 0", border: "none", borderTop: "1px solid var(--border)" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "4px 10px" }}>
                    <span style={{ fontSize: 10, opacity: 0.7 }}>איכות PDF</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      {([
                        { key: "high", label: "גבוה" },
                        { key: "balanced", label: "מאוזן" },
                        { key: "compact", label: "קומפקטי" }
                      ] as { key: PdfQualityPreset; label: string }[]).map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setPdfQualityPreset(opt.key)}
                          title={opt.key === "high" ? "איכות מקסימלית להדפסה" : opt.key === "balanced" ? "איזון בין איכות לגודל קובץ" : "קובץ קל לשיתוף ואימייל"}
                          style={{
                            flex: 1, padding: "4px 6px", borderRadius: 4, fontSize: 11, cursor: "pointer",
                            background: pdfQualityPreset === opt.key ? "var(--accent)" : "var(--bg-elevated)",
                            color: pdfQualityPreset === opt.key ? "#fff" : "var(--text-primary)",
                            border: "1px solid var(--border)"
                          }}
                        >{opt.label}</button>
                      ))}
                    </div>
                  </div>
                  <button
                    className="save-dropdown-item"
                    type="button"
                    onClick={() => { void handleExportPdf(); setSaveDropdownOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text-primary)" }}
                  >
                    <FileDown size={13} /> ייצוא PDF
                  </button>
                </div>
              </>
            )}
          </div>
          {/* Print actions — Advanced Print / send to remote (Print Hub) */}
          <PrintActionsButton
            onPrint={handlePrint}
            onSendRemote={() => setShowSendRemote(true)}
          />
          {/* Send to client buttons */}
          {currentDocument.metadata.customerEmail && (
            <button
              className="btn btn-ghost"
              type="button"
              title={`שלח מייל ל-${String(currentDocument.metadata.customerEmail)}`}
              onClick={() => window.open(`mailto:${String(currentDocument.metadata.customerEmail)}?subject=${encodeURIComponent(currentDocument.name)}`, "_blank")}
            >
              ✉ מייל
            </button>
          )}
          {(currentDocument.metadata.customerPhone ?? currentDocument.metadata.phoneNumber) && (
            <button
              className="btn btn-ghost"
              type="button"
              title="שלח וואטסאפ ללקוח"
              onClick={() => {
                const phone = String(currentDocument.metadata.customerPhone ?? currentDocument.metadata.phoneNumber ?? "").replace(/\D/g, "");
                window.open(`https://wa.me/${phone}?text=${encodeURIComponent(currentDocument.name)}`, "_blank");
              }}
            >
              💬 וואטסאפ
            </button>
          )}
            </>
          )}
        </div>
      </header>

      <ContextToolbar
        canvasWidth={currentPage.width}
        canvasHeight={currentPage.height}
        dpi={currentPage.setup.dpi}
        hasTextStyleClipboard={hasTextStyleClipboard}
        imageEditMode={imageEditMode}
        selectedLayer={selectedLayer}
        selectedLayers={selectedLayers}
        showGrid={viewport.showGrid}
        snapEnabled={viewport.snapEnabled}
        onAddImage={() => imageInputRef.current?.click()}
        onAddText={handleAddText}
        onApplyPreset={(preset) => {
          if (selectedLayer?.type === "text") {
            const textIds = selectedLayers
              .filter((layer): layer is Extract<VisualLayer, { type: "text" }> => layer.type === "text")
              .map((layer) => layer.id);
            (textIds.length > 1 ? textIds : [selectedLayer.id]).forEach((layerId) => {
              applyTextPreset(currentPage.id, layerId, preset);
            });
          }
        }}
        onBrowseFonts={() => setShowFontsBrowser(true)}
        onCopyTextStyle={() => {
          if (selectedLayer?.type === "text") {
            copyTextStyle(currentPage.id, selectedLayer.id);
            setStatus("Text style copied");
          }
        }}
        onDelete={handleDeleteSelected}
        onDuplicate={handleDuplicateSelected}
        onEnterImageEditMode={() => {
          if (selectedLayer?.type === "image") {
            setWhiteBackgroundThreshold(selectedLayer.effects.remove_white_tolerance ?? 22);
            enterImageEditMode(selectedLayer.id, { x: 0, y: 0, width: 1, height: 1 });
          }
        }}
        onEnterMaskContentEditMode={() => {
          if (selectedLayer?.type === "image") {
            enterMaskContentEdit(selectedLayer.id);
          }
        }}
        onExitMaskContentEditMode={exitMaskContentEdit}
        onImageEditApply={handleImageEditApply}
        onImageEditCancel={handleImageEditCancel}
        onImageEditClearSelection={handleClearImageSelection}
        onImageEditAiFillSelection={() => { void handleAiFillSelection(); }}
        onImageEditCopySelection={() => { void handleCopySelectionToNewLayer(); }}
        onImageEditCutSelection={() => { void handleCutSelectionToNewLayer(); }}
        onImageEditDeleteSelection={handleDeleteSelection}
        onImageEditResetCrop={handleImageEditResetCrop}
        onImageEditResetMask={handleImageEditResetMask}
        onSmartScreenshotCrop={() => { void handleSmartScreenshotCropSelectedImages(); }}
        onResetSmartScreenshotCrop={handleResetSmartScreenshotCropSelectedImage}
        onAlign={handleAlign}
        onMoveLayer={(direction) => {
          const targets = selectedLayers.length > 1 ? selectedLayers : selectedLayer !== null ? [selectedLayer] : [];
          targets
            .slice()
            .sort((a, b) => direction === "backward" || direction === "back" ? a.zIndex - b.zIndex : b.zIndex - a.zIndex)
            .forEach((layer) => moveLayer(currentPage.id, layer.id, direction));
        }}
        onNotify={setStatus}
        onPasteTextStyle={() => {
          if (selectedLayer?.type === "text") {
            const textIds = selectedLayers
              .filter((layer): layer is Extract<VisualLayer, { type: "text" }> => layer.type === "text")
              .map((layer) => layer.id);
            pasteTextStyle(currentPage.id, textIds.length > 1 ? textIds : [selectedLayer.id]);
            setStatus(textIds.length > 1 ? "Text style pasted to selection" : "Text style pasted");
          }
        }}
        onPatch={patchSelectedLayer}
        onSmartTextFit={(mode) => {
          if (selectedLayer?.type === "text") {
            const textIds = selectedLayers
              .filter((layer): layer is Extract<VisualLayer, { type: "text" }> => layer.type === "text")
              .map((layer) => layer.id);
            (textIds.length > 1 ? textIds : [selectedLayer.id]).forEach((layerId) => applySmartTextFitToLayer(layerId, mode));
          }
        }}
        onToggleGrid={viewport.toggleGrid}
        onToggleSnap={viewport.toggleSnap}
        onOpenAiTool={(tool) => {
          if (layerHasEditableImage(selectedLayer)) {
            useAiToolsStore.getState().openTool({ tool, layerId: selectedLayer.id, pageId: currentPage.id });
            exitImageEditMode();
          }
        }}
        onOpenAiStyles={() => {
          if (layerHasEditableImage(selectedLayer)) {
            useAiStyleStore.getState().open({ layerId: selectedLayer.id, pageId: currentPage.id });
            exitImageEditMode();
          }
        }}
      />

      <section className="stage">
        <aside className="left-sidebar" aria-label="ניווט">
          <div className="ls-tools">
            <ToolButton active={tool === "move"} icon={MousePointer2} label="הזזה" onClick={() => setTool("move")} testId="tool-move" />
            <ToolButton active={tool === "text"} icon={Type} label="טקסט" onClick={handleAddText} testId="tool-text" />
            <ToolButton active={tool === "image"} icon={ImagePlus} label="תמונה" onClick={() => imageInputRef.current?.click()} testId="tool-image" />
            <ToolButton active={armedDrawingTool === "regionRect" || (imageEditMode && imageActiveTool === "rect-select")} icon={RectangleHorizontal} label="בחירת מלבן" onClick={() => activateImageRegionTool("rect-select")} testId="tool-region-rect" />
            <ToolButton active={armedDrawingTool === "regionLasso" || (imageEditMode && imageActiveTool === "lasso")} icon={Lasso} label="לאסו" onClick={() => activateImageRegionTool("lasso")} testId="tool-region-lasso" />
            <ToolButton active={armedDrawingTool === "regionWand" || (imageEditMode && imageActiveTool === "wand")} icon={Wand2} label="מטה קסם" onClick={() => activateImageRegionTool("wand")} testId="tool-region-wand" />
            {!isMaskMode && (
              <ToolButton
                active={layoutEditMode}
                icon={Frame}
                label="עריכת פריסה"
                onClick={toggleLayoutEditMode}
                testId="tool-layout-edit"
              />
            )}
            {isCollageMode && (
              <ToolButton
                active={layoutEditMode}
                icon={LayoutGrid}
                label="קווי חלוקה"
                onClick={toggleLayoutEditMode}
                testId="tool-collage-layout-edit"
              />
            )}
            {isClassPhotoMode && (
              <ToolButton
                active={false}
                icon={UserRoundIcon}
                label="הוסף לתמונת מחזור"
                onClick={() => classPhotoAddInputRef.current?.click()}
                testId="tool-class-photo-add"
              />
            )}
          </div>
          <nav className={`ls-nav ${isCollageMode ? "ls-nav--5col" : "ls-nav--4col"}`} aria-label="סעיפי לוח שמאל">
            {isCollageMode && (
              <button
                aria-pressed={leftTab === "collage"}
                className={`ls-nav-btn ${leftTab === "collage" ? "active" : ""}`}
                onClick={() => setLeftTab("collage")}
                type="button"
              >
                <LayoutGrid size={15} />
                פריסות
              </button>
            )}
            <button
              aria-pressed={leftTab === "layers"}
              className={`ls-nav-btn ${leftTab === "layers" ? "active" : ""}`}
              onClick={() => setLeftTab("layers")}
              type="button"
            >
              <Layers size={15} />
              שכבות
            </button>
            <button
              aria-pressed={leftTab === "pages"}
              className={`ls-nav-btn ${leftTab === "pages" ? "active" : ""}`}
              onClick={() => setLeftTab("pages")}
              type="button"
            >
              <FileText size={15} />
              עמודים
            </button>
            <button
              aria-pressed={leftTab === "settings"}
              className={`ls-nav-btn ${leftTab === "settings" ? "active" : ""}`}
              onClick={() => setLeftTab("settings")}
              type="button"
            >
              <Settings size={15} />
              הגדרות
            </button>
            <button
              aria-pressed={leftTab === "emoji"}
              className={`ls-nav-btn ${leftTab === "emoji" ? "active" : ""}`}
              onClick={() => setLeftTab("emoji")}
              type="button"
            >
              <SmileIcon size={15} />
              גרפיקה
            </button>
          </nav>
          <div className={`ls-content ${leftTab === "emoji" ? "ls-content--emoji" : ""}`}>
            {leftTab === "collage" && isCollageMode && activeCollageRule !== null && (
              <CollageLayoutsPanel rule={activeCollageRule} />
            )}
            {leftTab === "layers" && (
              <LayerList
                assets={currentDocument.assets}
                layers={currentPage.layers}
                renamingLayerId={renamingLayerId}
                selectedLayerIds={selectedLayerIds}
                selectedLayerId={selectedLayerId}
                variableLayerIds={variableLayerIds}
                onAddAdjustmentLayer={handleAddAdjustmentLayer}
                onAddGroup={handleAddGroup}
                onAddImageLayer={() => imageInputRef.current?.click()}
                onAddShapeLayer={handleAddShapeLayer}
                onAddTextLayer={handleAddText}
                onRenameComplete={() => setRenamingLayerId(null)}
                onStartRename={(layerId) => setRenamingLayerId(layerId)}
                onReorder={(layerIdsTopToBottom) => reorderLayers(currentPage.id, layerIdsTopToBottom)}
                onSmartArrange={handleSmartArrange}
                onSelect={(layerId) => setSelection([layerId])}
                onSelectMany={(layerIds) => setSelection(layerIds)}
                onPatchLayer={(layer) => updateLayer(currentPage.id, layer)}
                onRename={(layerId, name) => {
                  const layer = currentPage.layers.find((l) => l.id === layerId);
                  if (layer !== undefined) updateLayer(currentPage.id, { ...layer, name });
                }}
                onToggleLock={(layerId) => {
                  const layer = currentPage.layers.find((l) => l.id === layerId);
                  if (layer !== undefined) updateLayer(currentPage.id, { ...layer, locked: !layer.locked });
                }}
                onToggleVisibility={(layerId) => {
                  const layer = currentPage.layers.find((l) => l.id === layerId);
                  if (layer !== undefined) updateLayer(currentPage.id, { ...layer, visible: !layer.visible });
                }}
                onLayerContextMenu={(layerId, screenX, screenY) => {
                  if (!selectedLayerIds.includes(layerId)) setSelection([layerId]);
                  setLayerContextMenu({ layerId, screenX, screenY });
                }}
                onOpenLayerEdits={(layerId) => {
                  setSelection([layerId]);
                  setInspectorTab("edits");
                }}
                onHoverLayer={setHoveredLayerId}
                onMoveImageIntoFrame={(imageLayerId, frameId) => {
                  applyDocumentChange(
                    "MoveImageLayerIntoFrameCommand",
                    (doc) => moveImageLayerIntoFrameDoc(doc, currentPage.id, imageLayerId, frameId),
                    currentPage.id
                  );
                  setSelection([frameId]);
                  setStatus("התמונה הועברה לתוך הפריים");
                }}
                onMoveLayerIntoGroup={(layerId, groupId) => moveLayerIntoGroup(currentPage.id, layerId, groupId)}
                onDeleteGroup={handleDeleteGroup}
                onDuplicateGroup={handleDuplicateGroup}
                onMergeLayers={handleMergeSelected}
                onFlattenVisible={handleFlattenVisible}
              />
            )}
            {leftTab === "pages" && (
              <PagesPanel
                activePageId={currentPage.id}
                document={currentDocument}
                onAddPage={handleAddPage}
                onDuplicatePage={() => duplicatePage(currentPage.id)}
                onRemovePage={() => removePage(currentPage.id)}
                onSelectPage={(pageId) => {
                  switchPageFromUi(pageId, "pages-panel");
                }}
              />
            )}
            {leftTab === "settings" && (
              <PageSettingsPanel
                activePage={currentPage}
                document={currentDocument}
                viewport={viewport}
                onAddGuide={handleAddGuide}
                onApplyPageSetup={handleApplyPageSetup}
              />
            )}
            {leftTab === "emoji" && (
              <GraphicsLibraryPanel onInsertGraphic={handleInsertGraphic} />
            )}
          </div>
        </aside>

        <div
          className="canvas-area"
          ref={canvasAreaRef}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onDrop={handleDrop}
          onClick={(event) => {
            // Deselect when clicking the canvas-area background (outside the Konva stage)
            if (event.target === event.currentTarget) {
              clearSelection();
            }
          }}
        >
          <div className="ruler-top" />
          <div className="ruler-side" />
          <CanvasErrorBoundary>
            <CanvasStage
              assets={currentDocument.assets}
              editingLayerId={editingLayerId}
              layoutEditMode={layoutEditMode}
              page={currentPage}
              selectedLayerIds={selectedLayerIds}
              selectedLayerId={selectedLayerId}
              passportGuidelinesEnabled={passportGuidelinesEnabled}
              collageLayoutRule={isCollageMode && layoutEditMode ? activeCollageRule : null}
              onUpdateCollageSlots={
                activeCollageRule !== null
                  ? (newSlots) => updateCollageCachedSlots(activeCollageRule.id, newSlots)
                  : undefined
              }
              hoveredLayerId={hoveredLayerId}
              stageRef={stageRef}
              onBeginTextEdit={(layerId) => {
                setSelection([layerId]);
                setEditingLayerId(layerId);
                setTool("text");
              }}
              onEndTextEdit={() => setEditingLayerId(null)}
              onTextSelectionChange={(layerId, selection) => setActiveTextSelection({ layerId, selection })}
              onImageDoubleClick={convertPsdTextImageToEditable}
              onLayerChange={handleCanvasLayerChange}
              onSelectLayer={(layerId) => (layerId === null ? clearSelection() : setSelection([layerId]))}
              onSelectLayers={(layerIds) => setSelection(layerIds)}
              onLayerContextMenu={(target) => {
                setCanvasContextMenu(target);
                setSelection([target.layerId]);
              }}
              onMaskPainted={(layerId, maskDataUrl, width, height) => {
                if (activePage === null) return;
                const layer = activePage.layers.find((l) => l.id === layerId);
                if (layer?.type !== "image") return;
                const maskAsset = createMaskAsset(maskDataUrl, width, height, layerId);
                addAsset(maskAsset);
                updateLayer(activePage.id, {
                  ...layer,
                  pixelMask: { version: 1, assetId: maskAsset.id, width, height }
                });
              }}
            />
          </CanvasErrorBoundary>
          {/* Image Edit floating params bar */}
          {imageEditMode && (
            <ImageEditFloatingBar
              onSmartAutoSelect={() => { void handleSmartAutoSelect(); }}
              onSmartRefine={() => { void handleSmartRefineSelection(); }}
            />
          )}
          {selectedLayers.length === 1 && selectedLayer?.type === "image" && !maskContentEditActive && (
            <ContextualImageBar
              canvasAreaRef={canvasAreaRef}
              layer={selectedLayer}
              stageRef={stageRef}
              viewportSignature={`${viewport.zoom}:${viewport.panX}:${viewport.panY}`}
              onEdit={() => {
                if (!imageEditMode) {
                  enterImageEditMode(selectedLayer.id, { x: 0, y: 0, width: 1, height: 1 });
                }
              }}
              onPatch={(patch) => updateLayer(currentPage.id, { ...(selectedLayer as ImageLayer), ...patch })}
              onSmartExpand={() => useSmartExpandStore.getState().open({ kind: "canvas", layerId: selectedLayer.id })}
              onSelectObject={() => void selectCanvasMenuObject(contextTargetFromLayer(selectedLayer))}
              onRemoveBackground={() => void removeCanvasMenuBackground(contextTargetFromLayer(selectedLayer))}
              onRotate={(delta) => rotateSelectionByEvent(delta, [selectedLayer.id])}
              onFitCanvasFill={() => fitCanvasMenuLayer(contextTargetFromLayer(selectedLayer), "fill")}
              onFitCanvasFit={() => fitCanvasMenuLayer(contextTargetFromLayer(selectedLayer), "fit")}
              onCenterCanvas={() => centerCanvasMenuLayer(contextTargetFromLayer(selectedLayer))}
              onResetTransform={() => resetCanvasMenuLayerTransform(contextTargetFromLayer(selectedLayer))}
              onFlipHorizontal={() => updateCanvasMenuLayer(contextTargetFromLayer(selectedLayer), (layer) => ({ ...layer, metadata: { ...layer.metadata, flipH: !((layer.metadata["flipH"] as boolean | undefined) ?? false) } }), "Image flipped horizontally")}
              onFlipVertical={() => updateCanvasMenuLayer(contextTargetFromLayer(selectedLayer), (layer) => ({ ...layer, metadata: { ...layer.metadata, flipV: !((layer.metadata["flipV"] as boolean | undefined) ?? false) } }), "Image flipped vertically")}
              onOpenAdvancedEditor={() => void handleOpenImageEditor(contextTargetFromLayer(selectedLayer))}
              onReplaceImage={() => replaceCanvasMenuImage(contextTargetFromLayer(selectedLayer))}
              onDuplicate={() => duplicateCanvasMenuLayer(contextTargetFromLayer(selectedLayer))}
              onDelete={() => deleteCanvasMenuTarget(contextTargetFromLayer(selectedLayer))}
            />
          )}
          {/* Mask content edit mode banner */}
          {maskContentEditActive && (
            <div className="collage-swap-banner">
              עריכת תמונה בתוך מסיכה — גרור להזזת התמונה פנימה | Shift+גרירה גם עובד | Esc לסיום
            </div>
          )}
          {/* Collage swap mode banner */}
          {isCollageMode && collageSwapSourceSlotId !== null && (
            <div className="collage-swap-banner">
              מצב החלפה — לחץ על נקודה כחולה בתמונה שנייה להחלפה | Esc לביטול
            </div>
          )}
          <div className="drop-hint">גרור תמונות אל הקנבס או לחץ על כלי התמונה</div>
          {fileDropActive ? (
            <div className="canvas-file-drop-overlay">
              <div>שחרר כאן כדי להוסיף תמונות לקנבס</div>
            </div>
          ) : null}
          {fileDropActive && dropTargetFrame !== null ? (
            <div
              className={`canvas-frame-drop-target ${dropTargetFrame.hasImage ? "replace" : "insert"}`}
              style={{
                left: dropTargetFrame.screenLeft,
                top: dropTargetFrame.screenTop,
                width: dropTargetFrame.screenWidth,
                height: dropTargetFrame.screenHeight
              }}
            >
              <span>{dropTargetFrame.hasImage ? "החלף תמונה בפריים" : "שחרר תמונה לפריים"}</span>
            </div>
          ) : null}
          {activeScreenshotCropToastAssets.length > 0 ? (
            <SmartScreenshotCropToast
              assets={activeScreenshotCropToastAssets}
              onApplyAll={() => {
                updateScreenshotCropAssets(activeScreenshotCropToastAssets.map((asset) => asset.id), "apply");
                setStatus(`נחתכו ${activeScreenshotCropToastAssets.length} תמונות בצורה לא הרסנית`);
              }}
              onIgnoreAll={() => {
                updateScreenshotCropAssets(activeScreenshotCropToastAssets.map((asset) => asset.id), "ignore");
                setStatus("הצעת חיתוך צילום המסך נדחתה");
              }}
              onMuteProject={() => {
                setProjectScreenshotCropMuted(true);
                setStatus("לא נשאל שוב בפרויקט הזה על חיתוך צילומי מסך");
              }}
              onReview={() => setScreenshotCropReviewOpen(true)}
            />
          ) : null}
          {collageTemplateToast !== null ? (
            <div className="collage-template-toast" role="status" dir="rtl">
              {collageTemplateToast}
            </div>
          ) : null}
          <LoadingToast />
          {screenshotCropReviewOpen ? (
            <ScreenshotCropReviewPanel
              assets={suspiciousScreenshotCropAssets}
              onApply={(assetId) => updateScreenshotCropAssets([assetId], "apply")}
              onApplyAllHighConfidence={() => {
                const ids = suspiciousScreenshotCropAssets
                  .filter((asset) => (getScreenshotCropSuggestion(asset)?.confidence ?? 0) >= 0.72)
                  .map((asset) => asset.id);
                updateScreenshotCropAssets(ids, "apply");
              }}
              onClose={() => setScreenshotCropReviewOpen(false)}
              onReset={(assetId) => updateScreenshotCropAssets([assetId], "reset")}
              onSkip={(assetId) => updateScreenshotCropAssets([assetId], "ignore")}
              onSkipAll={() => updateScreenshotCropAssets(suspiciousScreenshotCropAssets.map((asset) => asset.id), "ignore")}
            />
          ) : null}
          {smartRepeatTargetIds !== null && (
            <SmartRepeatDialog
              page={currentPage}
              selectedLayerIds={smartRepeatTargetIds}
              onClose={() => setSmartRepeatTargetIds(null)}
              onApply={(options: RepeatOptions) => {
                const ids = smartRepeatTargetIds;
                applyDocumentChange(
                  "SMART_REPEAT",
                  (doc) => applyRepeatToDocument(doc, { pageId: currentPage.id, selectedLayerIds: ids, options }),
                  currentPage.id
                );
                setSmartRepeatTargetIds(null);
                clearSelection();
                setStatus("נוצרה פריסת שכפול חכם");
              }}
            />
          )}
          {canvasContextMenu !== null && (
            <CanvasContextMenu
              target={canvasContextMenu}
              imageEditorAvailable={isImageEditorAvailable() && canvasContextMenu.hasImage}
              imageEditorBusy={imageEditorBusy}
              photoshopConfigured={!!utilSettings.photoshopPath}
              colorLabConfigured={!!utilSettings.colorLabPath}
              onClose={() => setCanvasContextMenu(null)}
              onSelectObject={() => void selectCanvasMenuObject(canvasContextMenu)}
              onRemoveBackground={() => void removeCanvasMenuBackground(canvasContextMenu)}
              onAutoFix={canvasContextMenu.hasImage ? () => {
                useAutoFixStore.getState().open(canvasContextMenu.layerId);
                setCanvasContextMenu(null);
              } : undefined}
              onCurves={canvasContextMenu.hasImage ? () => {
                useCurvesStore.getState().open(canvasContextMenu.layerId);
                setCanvasContextMenu(null);
              } : undefined}
              onShadowHighlights={canvasContextMenu.hasImage ? () => {
                useShadowHighlightsStore.getState().open(canvasContextMenu.layerId);
                setCanvasContextMenu(null);
              } : undefined}
              onOpenIsolatedImageEditor={() => openIsolatedImageEditor(canvasContextMenu)}
              onConvertAlphaToFrame={() => {
                setCanvasContextMenu(null);
                void handleConvertLayerAlphaToFrameMask(canvasContextMenu.layerId);
              }}
              onMoveForward={() => {
                moveLayer(currentPage.id, canvasContextMenu.layerId, "forward");
                setCanvasContextMenu(null);
              }}
              onMoveBackward={() => {
                moveLayer(currentPage.id, canvasContextMenu.layerId, "backward");
                setCanvasContextMenu(null);
              }}
              onMoveToFront={() => {
                moveLayer(currentPage.id, canvasContextMenu.layerId, "front");
                setCanvasContextMenu(null);
              }}
              onMoveToBack={() => {
                moveLayer(currentPage.id, canvasContextMenu.layerId, "back");
                setCanvasContextMenu(null);
              }}
              onFitCanvasFill={() => fitCanvasMenuLayer(canvasContextMenu, "fill")}
              onFitCanvasFit={() => fitCanvasMenuLayer(canvasContextMenu, "fit")}
              onCenterCanvas={() => centerCanvasMenuLayer(canvasContextMenu)}
              onResetTransform={() => resetCanvasMenuLayerTransform(canvasContextMenu)}
              onRotate90={() => { rotateSelectionByEvent(90, [canvasContextMenu.layerId]); setCanvasContextMenu(null); }}
              onRotate180={() => { rotateSelectionByEvent(180, [canvasContextMenu.layerId]); setCanvasContextMenu(null); }}
              onFlipHorizontal={() => updateCanvasMenuLayer(canvasContextMenu, (layer) => ({ ...layer, metadata: { ...layer.metadata, flipH: !((layer.metadata["flipH"] as boolean | undefined) ?? false) } }), "Image flipped horizontally")}
              onFlipVertical={() => updateCanvasMenuLayer(canvasContextMenu, (layer) => ({ ...layer, metadata: { ...layer.metadata, flipV: !((layer.metadata["flipV"] as boolean | undefined) ?? false) } }), "Image flipped vertically")}
              onWhiteBorder={() => applyQuickBorder(canvasContextMenu, "#ffffff")}
              onBlackBorder={() => applyQuickBorder(canvasContextMenu, "#000000")}
              onReplaceImage={() => replaceCanvasMenuImage(canvasContextMenu)}
              onDuplicate={() => canvasContextMenu.layerType === "text" ? duplicateCanvasMenuTextLayer(canvasContextMenu) : duplicateCanvasMenuLayer(canvasContextMenu)}
              onSmartRepeat={() => {
                const ids = selectedLayerIds.includes(canvasContextMenu.layerId) && selectedLayerIds.length > 0
                  ? selectedLayerIds
                  : [canvasContextMenu.layerId];
                setSmartRepeatTargetIds(ids);
                setCanvasContextMenu(null);
              }}
              onDeleteTarget={() => deleteCanvasMenuTarget(canvasContextMenu)}
              onToggleLock={() => {
                if (canvasContextMenu.layerType === "text") {
                  updateCanvasMenuTextLayer(canvasContextMenu, (layer) => ({ ...layer, locked: !layer.locked }), "Layer lock toggled");
                  return;
                }
                updateCanvasMenuLayer(canvasContextMenu, (layer) => ({ ...layer, locked: !layer.locked }), "Layer lock toggled");
              }}
              onToggleVisibility={() => {
                if (canvasContextMenu.layerType === "text") {
                  updateCanvasMenuTextLayer(canvasContextMenu, (layer) => ({ ...layer, visible: layer.visible === false }), "Layer visibility toggled");
                  return;
                }
                updateCanvasMenuLayer(canvasContextMenu, (layer) => ({ ...layer, visible: layer.visible === false }), "Layer visibility toggled");
              }}
              onAddToFavorites={handleAddToLocalLibrary}
              hasTextStyleClipboard={hasTextStyleClipboard}
              onTextMaskPlaceholder={() => convertCanvasMenuTextToMask(canvasContextMenu)}
              onSaveAsCollageTemplate={() => saveCanvasMenuAsCollageTemplate(canvasContextMenu)}
              onTextCenterCanvas={() => centerCanvasMenuText(canvasContextMenu, "both")}
              onTextCenterX={() => centerCanvasMenuText(canvasContextMenu, "x")}
              onTextCenterY={() => centerCanvasMenuText(canvasContextMenu, "y")}
              onTextBold={() => updateCanvasMenuTextLayer(canvasContextMenu, (layer) => ({ ...layer, fontWeight: layer.fontWeight >= 700 ? 400 : 700 }), "Text bold toggled")}
              onTextItalic={() => updateCanvasMenuTextLayer(canvasContextMenu, (layer) => ({ ...layer, fontStyle: layer.fontStyle === "italic" ? "normal" : "italic" }), "Text italic toggled")}
              onTextAlignLeft={() => updateCanvasMenuTextLayer(canvasContextMenu, (layer) => ({ ...layer, alignment: "left" }), "Text aligned left")}
              onTextAlignCenter={() => updateCanvasMenuTextLayer(canvasContextMenu, (layer) => ({ ...layer, alignment: "center" }), "Text aligned center")}
              onTextAlignRight={() => updateCanvasMenuTextLayer(canvasContextMenu, (layer) => ({ ...layer, alignment: "right" }), "Text aligned right")}
              onTextDirectionAuto={() => updateCanvasMenuTextLayer(canvasContextMenu, (layer) => ({ ...layer, direction: "auto" }), "Text direction set to Auto")}
              onTextDirectionRtl={() => updateCanvasMenuTextLayer(canvasContextMenu, (layer) => ({ ...layer, direction: "rtl" }), "Text direction set to RTL")}
              onTextDirectionLtr={() => updateCanvasMenuTextLayer(canvasContextMenu, (layer) => ({ ...layer, direction: "ltr" }), "Text direction set to LTR")}
              onTextIncreaseSize={() => updateCanvasMenuTextLayer(canvasContextMenu, (layer) => ({ ...layer, fontSize: Math.min(240, layer.fontSize + 4) }), "Text size increased")}
              onTextDecreaseSize={() => updateCanvasMenuTextLayer(canvasContextMenu, (layer) => ({ ...layer, fontSize: Math.max(8, layer.fontSize - 4) }), "Text size decreased")}
              onTextSmartBlock={() => {
                applySmartTextBlockToLayer(canvasContextMenu.layerId);
                setCanvasContextMenu(null);
              }}
              onTextSmartFitFull={() => {
                applySmartTextFitToLayer(canvasContextMenu.layerId, "balanced");
                setCanvasContextMenu(null);
              }}
              onTextSmartFitPartial={() => {
                applySmartTextFitToLayer(canvasContextMenu.layerId, "shrink");
                setCanvasContextMenu(null);
              }}
              onTextSmartFitWrap={() => {
                applySmartTextFitToLayer(canvasContextMenu.layerId, "wrap");
                setCanvasContextMenu(null);
              }}
              onTextStrokeWhite={() => applyQuickTextStroke(canvasContextMenu, "#ffffff")}
              onTextStrokeBlack={() => applyQuickTextStroke(canvasContextMenu, "#000000")}
              onTextShadowSoft={() => applyQuickTextShadow(canvasContextMenu, "soft")}
              onTextShadowHard={() => applyQuickTextShadow(canvasContextMenu, "hard")}
              onTextRemoveEffects={() => removeCanvasMenuTextEffects(canvasContextMenu)}
              onTextCopyEffects={() => copyCanvasMenuTextStyle(canvasContextMenu)}
              onTextPasteEffects={() => pasteCanvasMenuTextStyle(canvasContextMenu)}
              onOpenImageEditor={() => void handleOpenImageEditor(canvasContextMenu)}
              onOpenInPhotoshop={() => void handleOpenInPhotoshop(canvasContextMenu)}
              onOpenInColorLab={() => void handleOpenInColorLab(canvasContextMenu)}
              onHarmonize={canvasContextMenu.hasImage ? () => {
                const layer = currentPage.layers.find((l) => l.id === canvasContextMenu.layerId);
                if (layer !== undefined) {
                  setHarmonizeTarget({
                    layerId: layer.id,
                    bbox: { x: Math.round(layer.x), y: Math.round(layer.y), w: Math.round(layer.width), h: Math.round(layer.height) }
                  });
                }
                setCanvasContextMenu(null);
              } : undefined}
              onSmartExpand={canvasContextMenu.hasImage ? () => {
                useSmartExpandStore.getState().open({ kind: "canvas", layerId: canvasContextMenu.layerId });
                setCanvasContextMenu(null);
              } : undefined}
              onAiExpand={canvasContextMenu.hasImage ? () => {
                useAiToolsStore.getState().openTool({ tool: "expand", layerId: canvasContextMenu.layerId, pageId: currentPage.id });
                setCanvasContextMenu(null);
              } : undefined}
              onAiRemove={canvasContextMenu.hasImage ? () => {
                useAiToolsStore.getState().openTool({ tool: "remove", layerId: canvasContextMenu.layerId, pageId: currentPage.id });
                setCanvasContextMenu(null);
              } : undefined}
              onContentFill={canvasContextMenu.hasImage ? () => {
                const fillLayer = currentPage.layers.find((l): l is ImageLayer => l.id === canvasContextMenu.layerId && l.type === "image");
                if (fillLayer !== undefined) void openContentFillWorkspace(fillLayer);
                setCanvasContextMenu(null);
              } : undefined}
              onAiUpscale={canvasContextMenu.hasImage ? () => {
                useAiToolsStore.getState().openTool({ tool: "upscale", layerId: canvasContextMenu.layerId, pageId: currentPage.id });
                setCanvasContextMenu(null);
              } : undefined}
              onAiRestore={canvasContextMenu.hasImage ? () => {
                useAiToolsStore.getState().openTool({ tool: "restore", layerId: canvasContextMenu.layerId, pageId: currentPage.id });
                setCanvasContextMenu(null);
              } : undefined}
            />
          )}
          {layerContextMenu !== null && (() => {
            const ctxLayer = currentPage.layers.find((l) => l.id === layerContextMenu.layerId);
            const ctxCanUseFx = canUseLayerEffects(ctxLayer);
            const ctxSelectedFxLayers = selectedLayerIds
              .flatMap((id) => {
                const l = currentPage.layers.find((layer) => layer.id === id);
                return canUseLayerEffects(l) ? [l] : [];
              });
            return (
              <LayerContextMenu
                target={layerContextMenu}
                layer={ctxLayer}
                canUseEffects={ctxCanUseFx}
                hasEffectsClipboard={effectsClipboard !== null}
                isVariableLayer={ctxLayer !== undefined && variableLayerIds.has(ctxLayer.id)}
                onClose={() => setLayerContextMenu(null)}
                onRename={() => setRenamingLayerId(layerContextMenu.layerId)}
                onToggleVisibility={() => {
                  if (ctxLayer !== undefined) updateLayer(currentPage.id, { ...ctxLayer, visible: !ctxLayer.visible });
                }}
                onToggleLock={() => {
                  if (ctxLayer !== undefined) updateLayer(currentPage.id, { ...ctxLayer, locked: !ctxLayer.locked });
                }}
                onSetBlendMode={(mode) => {
                  if (ctxLayer !== undefined) updateLayer(currentPage.id, { ...ctxLayer, blendMode: mode });
                }}
                onMoveForward={() => moveLayer(currentPage.id, layerContextMenu.layerId, "forward")}
                onMoveBackward={() => moveLayer(currentPage.id, layerContextMenu.layerId, "backward")}
                onMoveToFront={() => moveLayer(currentPage.id, layerContextMenu.layerId, "front")}
                onMoveToBack={() => moveLayer(currentPage.id, layerContextMenu.layerId, "back")}
                onDuplicate={handleDuplicateSelected}
                onDelete={handleDeleteSelected}
                onMergeLayers={selectedLayerIds.length >= 2 ? handleMergeSelected : undefined}
                onFlatten={handleFlattenVisible}
                onToggleBatchVariable={
                  ctxLayer !== undefined &&
                  (ctxLayer.type === "frame" || ctxLayer.type === "text" || ctxLayer.type === "image")
                    ? () => handleToggleBatchVariable(ctxLayer)
                    : undefined
                }
                onConvertAlphaToFrame={
                  ctxLayer?.type === "image"
                    ? () => handleConvertLayerAlphaToFrameMask(ctxLayer.id)
                    : undefined
                }
                onInsertImageIntoFrame={
                  ctxLayer?.type === "frame"
                    ? () => {
                        setSelection([ctxLayer.id]);
                        replaceImageInputRef.current?.click();
                      }
                    : undefined
                }
                onClearFrameImage={
                  ctxLayer?.type === "frame" && ctxLayer.imageAssetId !== undefined
                    ? () => {
                        applyDocumentChange(
                          "ClearFrameImageCommand",
                          (doc) => clearFrameImageDoc(doc, currentPage.id, ctxLayer.id),
                          currentPage.id
                        );
                        setStatus("התמונה נוקתה מהפריים");
                      }
                    : undefined
                }
                onEditInsideFrame={
                  ctxLayer?.type === "frame" && ctxLayer.imageAssetId !== undefined
                    ? () => {
                        setSelection([ctxLayer.id]);
                        enterMaskContentEdit(ctxLayer.id);
                      }
                    : undefined
                }
                onConvertFrameBackToImage={
                  ctxLayer?.type === "frame" && ctxLayer.imageAssetId !== undefined
                    ? () => {
                        applyDocumentChange(
                          "ConvertFrameMaskBackToImageCommand",
                          (doc) => convertFrameMaskBackToImage(
                            doc,
                            currentPage.id,
                            ctxLayer.id,
                            (args) => createImageLayer({
                              id: args.id,
                              name: args.name,
                              rect: args.rect,
                              assetId: args.assetId,
                              fitMode: "fill",
                              zIndex: args.zIndex
                            })
                          ),
                          currentPage.id
                        );
                        setStatus("הומר חזרה לשכבת תמונה");
                      }
                    : undefined
                }
                frameHasImage={ctxLayer?.type === "frame" && ctxLayer.imageAssetId !== undefined}
                onCopyEffects={() => {
                  if (canUseLayerEffects(ctxLayer)) {
                    setEffectsClipboard(makeLayerEffectsClipboard(ctxLayer));
                    setStatus("אפקטים הועתקו");
                  }
                }}
                onPasteEffects={() => {
                  if (effectsClipboard === null) return;
                  const targets = ctxSelectedFxLayers.length > 0 ? ctxSelectedFxLayers : canUseLayerEffects(ctxLayer) ? [ctxLayer] : [];
                  targets.forEach((fxLayer) => {
                    updateLayer(currentPage.id, applyLayerEffectsClipboard(fxLayer, effectsClipboard));
                  });
                  setStatus("אפקטים הודבקו");
                }}
                onOpenLayerEdits={
                  ctxLayer !== undefined
                    ? () => {
                        setSelection([ctxLayer.id]);
                        setInspectorTab("edits");
                        setLayerContextMenu(null);
                      }
                    : undefined
                }
                onToggleBeforeAfter={
                  ctxLayer !== undefined
                    ? () => {
                        useLayerEditsPreviewStore.getState().toggleBeforeAfter(ctxLayer.id);
                        setLayerContextMenu(null);
                      }
                    : undefined
                }
                onDisableAllEdits={
                  ctxLayer !== undefined && countLayerEdits(ctxLayer) > 0
                    ? () => {
                        updateLayer(currentPage.id, setAllLayerEditsEnabled(ctxLayer, false));
                        setLayerContextMenu(null);
                      }
                    : undefined
                }
                onResetAllEdits={
                  ctxLayer !== undefined && countLayerEdits(ctxLayer) > 0
                    ? () => {
                        updateLayer(currentPage.id, resetAllLayerEditsFor(ctxLayer));
                        setLayerContextMenu(null);
                      }
                    : undefined
                }
              />
            );
          })()}
        </div>

        <aside className="right-sidebar">
          <ColorPanel getStageCanvas={() => stageRef.current?.toCanvas({ pixelRatio: 1 }) ?? null} />
          {/* Mode-specific panel at top */}
          {!selectedUsesManagedModeTabs && (
            <>
          {isProductMode ? (
            <div className="rs-mode-section">
              <div className="rs-mode-label"><Boxes size={11} />מצב מוצר</div>
              <ProductDefinitionPanel />
            </div>
          ) : null}
          {isCollageMode && activeCollageRule !== null ? (
            <div className="rs-mode-section">
              <div className="rs-mode-label"><SlidersHorizontal size={11} />מצב קולאז׳</div>
              <CollageModePanel rule={activeCollageRule} selectedLayer={selectedLayer} onReplaceImage={() => replaceImageInputRef.current?.click()} />
            </div>
          ) : null}
          {isGridMode && activeGridRule !== null ? (
            <div className="rs-mode-section">
              <div className="rs-mode-label"><SlidersHorizontal size={11} />מצב גריד</div>
              <GridModePanel
                assignmentCount={currentDocument.gridImageAssignments.filter((assignment) => assignment.gridId === activeGridRule.id).length}
                rule={activeGridRule}
                selectedLayer={selectedLayer}
                onAddImages={() => imageInputRef.current?.click()}
                onAddFilenameText={() => handleAddGridFilenameText(activeGridRule)}
                onApplyFit={handleApplyGridFit}
                onApplyFaceCrop={() => void handleApplyFaceCropToManagedCells("grid", activeGridRule.id)}
                onApplySelectedText={() => handleApplySelectedTextToGrid(activeGridRule)}
                onDeleteSelectedImage={() => handleDeleteGridImage(activeGridRule)}
                onRegenerate={handleRegenerateGrid}
                onResetCrops={() => handleResetGridCrops(activeGridRule)}
              />
            </div>
          ) : null}
          {isMaskMode && activeMaskRule !== null ? (
            <div className="rs-mode-section">
              <div className="rs-mode-label"><SlidersHorizontal size={11} />מצב מסכה</div>
              <MaskModePanel
                assignmentCount={currentDocument.maskImageAssignments.filter((assignment) => assignment.maskId === activeMaskRule.id).length}
                dpi={currentPage.setup.dpi}
                rule={activeMaskRule}
                selectedLayer={selectedLayer}
                onAddImages={() => imageInputRef.current?.click()}
                onAddFilenameText={() => handleAddMaskFilenameText(activeMaskRule)}
                onApplyFit={handleApplyMaskFit}
                onApplyFaceCrop={() => void handleApplyFaceCropToManagedCells("mask", activeMaskRule.id)}
                onApplySelectedText={() => handleApplySelectedTextToMask(activeMaskRule)}
                onDeleteSelectedImage={() => handleDeleteMaskImage(activeMaskRule)}
                onRegenerate={handleRegenerateMask}
                onResetCrops={() => handleResetMaskCrops(activeMaskRule)}
                onChangePreset={(entry) => void handleChangeMaskPreset(activeMaskRule, entry)}
              />
            </div>
          ) : null}
          {isPhotoPrintMode && activePhotoPrintRule !== null ? (
            <div className="rs-mode-section">
              <div className="rs-mode-label"><SlidersHorizontal size={11} />פיתוח תמונות</div>
              <PhotoPrintModePanel
                rule={activePhotoPrintRule}
                document={currentDocument}
                smartCropProgress={cellSmartCropProgress}
                onApplyFaceCrop={() => void handleApplyFaceCropToManagedCells("photoPrint", activePhotoPrintRule.id)}
                onRegenerate={(patch) => {
                  // regeneratePhotoPrint rebuilds the document with brand-new
                  // page + frame IDs. Any selection from the previous layout
                  // points at frame IDs that no longer exist, which makes
                  // downstream lookups (transformer, ID-based stage.findOne,
                  // selection-driven panels) operate on stale references. Clear
                  // selection first so the new document loads cleanly.
                  clearSelection();
                  const updated = regeneratePhotoPrint(currentDocument, activePhotoPrintRule.id, patch);
                  setDocument(updated);
                }}
              />
            </div>
          ) : null}
          {isClassPhotoMode && activeClassPhotoRule !== null ? (
            <div className="rs-mode-section">
              <div className="rs-mode-label"><SlidersHorizontal size={11} />תמונת מחזור</div>
              <ClassPhotoModePanel
                rule={activeClassPhotoRule}
                selectedLayer={selectedLayer}
                smartCropProgress={cellSmartCropProgress}
                onApplyFaceCrop={() => void handleApplyFaceCropToManagedCells("classPhoto", activeClassPhotoRule.id)}
                onEqualizeFaceSize={() => void handleEqualizeClassPhotoFaceSize(activeClassPhotoRule.id)}
                onBackToWizard={() => onOpenClassPhotoWizard?.()}
              />
            </div>
          ) : null}

          {isBlessingMode && activeBlessingRule !== null ? (
            <div className="rs-mode-section">
              <div className="rs-mode-label"><SlidersHorizontal size={11} />מצב ברכות</div>
              <BlessingModePanel
                rule={activeBlessingRule}
                selectedLayer={selectedLayer}
              />
            </div>
          ) : null}
            </>
          )}

          {/* Contextual inspector body */}
          <div className="rs-body">
            {selectedLayer === null ? (
              <EmptyInspectorState />
            ) : (
              <>
                {(() => {
                  const editCount = countLayerEdits(selectedLayer);
                  return (
                    <div className="rs-inspector-tabs" role="tablist" aria-label="Inspector sections">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={inspectorTab === "props"}
                        className={inspectorTab === "props" ? "on" : ""}
                        onClick={() => setInspectorTab("props")}
                      >
                        מאפיינים
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={inspectorTab === "edits"}
                        className={inspectorTab === "edits" ? "on" : ""}
                        onClick={() => setInspectorTab("edits")}
                      >
                        עריכות
                        {editCount > 0 ? (
                          <span className={`layer-edits-dot${hasDisabledLayerEdits(selectedLayer) ? " has-disabled" : ""}`}>{editCount}</span>
                        ) : null}
                      </button>
                    </div>
                  );
                })()}
                {inspectorTab === "edits" ? (
                  <>
                    <div className="rs-inspector-header">
                      <span className="rs-inspector-name">{selectedLayer.name}</span>
                      <span className="rs-inspector-type">עריכות</span>
                    </div>
                    <LayerEditsPanel layer={selectedLayer} />
                  </>
                ) : selectedLayer.type === "text" ? (
              <>
                <div className="rs-inspector-header">
                  <span className="rs-inspector-name">{selectedLayer.name}</span>
                  <span className="rs-inspector-type">טקסט</span>
                </div>
                <TextStudio
                  hasTextStyleClipboard={hasTextStyleClipboard}
                  layer={selectedLayer}
                  batchField={batchProductionMeta?.variableFields.find((f) => f.layerId === selectedLayer.id)}
                  onApplyPreset={(preset) => applyTextPreset(currentPage.id, selectedLayer.id, preset)}
                  onBatchFieldChange={(field) => handleBatchFieldChange(selectedLayer.id, field)}
                  onCopyTextStyle={() => {
                    copyTextStyle(currentPage.id, selectedLayer.id);
                    setStatus("סגנון טקסט הועתק");
                  }}
                  onDelete={handleDeleteSelected}
                  onNotify={setStatus}
                  onPatch={patchSelectedLayer}
                  onPasteTextStyle={() => {
                    pasteTextStyle(currentPage.id, [selectedLayer.id]);
                    setStatus("סגנון טקסט הודבק");
                  }}
                  selectedTextRange={activeTextSelection?.layerId === selectedLayer.id ? activeTextSelection.selection : null}
                  onTextSelectionChange={(selection) => setActiveTextSelection({ layerId: selectedLayer.id, selection })}
                  onTextChange={updateSelectedText}
                />
              </>
            ) : (selectedLayer.type === "image" || selectedLayer.type === "frame") ? (
              <>
                <div className="rs-inspector-header">
                  <span className="rs-inspector-name">{selectedLayer.name}</span>
                  <span className="rs-inspector-type">
                    {selectedLayer.type === "image" ? "תמונה" : (selectedLayer.maskSource !== undefined ? "Frame/Mask" : "פריים")}
                  </span>
                  {!(selectedLayer.type === "frame" && (selectedLayer.metadata["collageFrame"] as { isCollageFrame?: boolean } | undefined)?.isCollageFrame === true) && (
                    <button
                      className="rs-replace-btn"
                      title="החלף תמונה"
                      type="button"
                      onClick={() => replaceImageInputRef.current?.click()}
                    >
                      <Replace size={13} />
                      החלף
                    </button>
                  )}
                </div>
                {selectedLayer.type === "frame" && isFrameMaskLayer(selectedLayer) && (
                  <div className="rs-frame-mask-toolbar" role="toolbar" aria-label="Frame/Mask actions">
                    <button
                      className="rs-frame-mask-btn"
                      title={selectedLayer.imageAssetId !== undefined ? "החלף תמונה" : "בחר תמונה"}
                      type="button"
                      onClick={() => replaceImageInputRef.current?.click()}
                    >
                      <ImagePlus size={12} />
                      {selectedLayer.imageAssetId !== undefined ? "החלף" : "בחר תמונה"}
                    </button>
                    <button
                      className="rs-frame-mask-btn"
                      disabled={selectedLayer.imageAssetId === undefined}
                      title="הסר תמונה"
                      type="button"
                      onClick={() => {
                        applyDocumentChange(
                          "ClearFrameImageCommand",
                          (doc) => clearFrameImageDoc(doc, currentPage.id, selectedLayer.id),
                          currentPage.id
                        );
                        setStatus("התמונה נוקתה מהפריים");
                      }}
                    >
                      <X size={12} />
                      נקה
                    </button>
                    <button
                      className="rs-frame-mask-btn"
                      disabled={selectedLayer.imageAssetId === undefined}
                      title="ערוך תמונה בתוך הפריים"
                      type="button"
                      onClick={() => enterMaskContentEdit(selectedLayer.id)}
                    >
                      <Maximize2 size={12} />
                      ערוך פנימה
                    </button>
                    {selectedLayer.textLayerId === undefined && (
                      <button
                        className="rs-frame-mask-btn"
                        title="מלא את הצורה בטקסט"
                        type="button"
                        onClick={() => handleFillFrameWithText(selectedLayer)}
                      >
                        <Type size={12} />
                        מלא במלל
                      </button>
                    )}
                    {(selectedLayer.contentType === "text" || selectedLayer.contentType === "mixed") && (
                      <button
                        className="rs-frame-mask-btn"
                        title="נתק את הטקסט מהפריים"
                        type="button"
                        onClick={() => detachTextFromFrame(currentPage.id, selectedLayer.id)}
                      >
                        <X size={12} />
                        נתק טקסט
                      </button>
                    )}
                  </div>
                )}
                {selectedLayer.type === "frame" && (selectedLayer.contentType === "text" || selectedLayer.contentType === "mixed") && selectedLayer.textLayerId !== undefined && (() => {
                  const linkedText = currentPage.layers.find(
                    (item): item is TextLayer => item.id === selectedLayer.textLayerId && item.type === "text"
                  );
                  if (linkedText === undefined) return null;
                  const flow = linkedText.textFlow ?? { mode: "fitInsideShape" as const };
                  const textLayerId = linkedText.id;
                  return (
                    <div className="rs-frame-text-flow">
                      <label className="context-menu-section-label">תוכן הטקסט</label>
                      <textarea
                        className="context-select full"
                        rows={2}
                        style={{ resize: "vertical", fontFamily: "inherit" }}
                        value={linkedText.text}
                        onChange={(event) => updateTextLayerStore(currentPage.id, textLayerId, { text: event.target.value })}
                      />
                      <label className="context-menu-section-label">גופן</label>
                      <select
                        className="context-select full"
                        value={linkedText.fontFamily}
                        onChange={(event) => updateTextLayerStore(currentPage.id, textLayerId, { fontFamily: event.target.value })}
                      >
                        {FONT_LIST.map((font) => <option key={font.family} value={font.family}>{font.label}</option>)}
                      </select>
                      <div className="context-group">
                        <input
                          className="context-color wide"
                          type="color"
                          value={linkedText.color}
                          onChange={(event) => updateTextLayerStore(currentPage.id, textLayerId, { color: event.target.value })}
                        />
                        <select
                          className="context-select"
                          value={String(linkedText.fontWeight)}
                          onChange={(event) => updateTextLayerStore(currentPage.id, textLayerId, { fontWeight: Number(event.target.value) })}
                        >
                          <option value="400">רגיל</option>
                          <option value="700">מודגש</option>
                        </select>
                        <select
                          className="context-select"
                          value={linkedText.alignment}
                          onChange={(event) => updateTextLayerStore(currentPage.id, textLayerId, { alignment: event.target.value as TextLayer["alignment"] })}
                        >
                          <option value="right">ימין</option>
                          <option value="center">מרכז</option>
                          <option value="left">שמאל</option>
                        </select>
                      </div>
                      <label className="context-menu-section-label">מצב מילוי טקסט</label>
                      <select
                        className="context-select full"
                        value={flow.mode}
                        onChange={(event) => patchFrameTextFlow(textLayerId, { mode: event.target.value as NonNullable<TextLayer["textFlow"]>["mode"] })}
                      >
                        <option value="fitInsideShape">מלא את הצורה</option>
                        <option value="fitBox">התאם למלבן</option>
                        <option value="normal">רגיל</option>
                      </select>
                      <label className="context-menu-section-label">יישור אנכי</label>
                      <select
                        className="context-select full"
                        value={flow.verticalAlign ?? "center"}
                        onChange={(event) => patchFrameTextFlow(textLayerId, { verticalAlign: event.target.value as NonNullable<TextLayer["textFlow"]>["verticalAlign"] })}
                      >
                        <option value="top">למעלה</option>
                        <option value="center">מרכז</option>
                        <option value="bottom">למטה</option>
                      </select>
                      <label className="context-menu-section-label">צפיפות שורות</label>
                      <select
                        className="context-select full"
                        value={flow.density ?? "normal"}
                        onChange={(event) => patchFrameTextFlow(textLayerId, { density: event.target.value as NonNullable<TextLayer["textFlow"]>["density"] })}
                      >
                        <option value="relaxed">מרווח</option>
                        <option value="normal">רגיל</option>
                        <option value="tight">צפוף</option>
                      </select>
                      <SliderField
                        label="ריפוד"
                        min={0}
                        max={40}
                        value={flow.padding ?? selectedLayer.padding}
                        onChange={(value) => patchFrameTextFlow(textLayerId, { padding: value })}
                        unit=" px"
                      />
                    </div>
                  );
                })()}
                {selectedUsesManagedModeTabs && selectedLayer.type === "frame" ? (
                  <ManagedImageFrameInspector
                    activeTab={managedImageInspectorTab}
                    assets={currentDocument.assets}
                    batchField={batchProductionMeta?.variableFields.find((f) => f.layerId === selectedLayer.id)}
                    layer={selectedLayer}
                    modePanel={modeSpecificPanel}
                    onBatchFieldChange={(field) => handleBatchFieldChange(selectedLayer.id, field)}
                    onDelete={handleDeleteSelected}
                    onOpenAiTool={(tool) => {
                      useAiToolsStore.getState().openTool({ tool, layerId: selectedLayer.id, pageId: currentPage.id });
                    }}
                    onOpenAiStyles={() => {
                      useAiStyleStore.getState().open({ layerId: selectedLayer.id, pageId: currentPage.id });
                    }}
                    onPatch={patchSelectedLayer}
                    onTabChange={setManagedImageInspectorTab}
                    onUpdateAsset={updateAsset}
                  />
                ) : (
                  <ImageStudio
                    layer={selectedLayer}
                    assets={currentDocument.assets}
                    batchField={(selectedLayer.type === "frame" || selectedLayer.type === "image") ? batchProductionMeta?.variableFields.find((f) => f.layerId === selectedLayer.id) : undefined}
                    onBatchFieldChange={(selectedLayer.type === "frame" || selectedLayer.type === "image") ? (field) => handleBatchFieldChange(selectedLayer.id, field) : undefined}
                    onConvertAlphaToFrame={selectedLayer.type === "image" ? handleConvertAlphaToFrameMask : undefined}
                    onDelete={handleDeleteSelected}
                    onOpenAiTool={layerHasEditableImage(selectedLayer) ? (tool) => {
                      useAiToolsStore.getState().openTool({ tool, layerId: selectedLayer.id, pageId: currentPage.id });
                    } : undefined}
                    onOpenAiStyles={layerHasEditableImage(selectedLayer) ? () => {
                      useAiStyleStore.getState().open({ layerId: selectedLayer.id, pageId: currentPage.id });
                    } : undefined}
                    onPatch={patchSelectedLayer}
                    onUpdateAsset={updateAsset}
                  />
                )}
              </>
            ) : (
              <>
                <div className="rs-inspector-header">
                  <span className="rs-inspector-name">{selectedLayer.name}</span>
                  <span className="rs-inspector-type">{selectedLayer.type}</span>
                </div>
                <LayerInspector
                  selectedLayer={selectedLayer}
                  hasTextStyleClipboard={hasTextStyleClipboard}
                  onDelete={handleDeleteSelected}
                  onPatch={patchSelectedLayer}
                  onApplyPreset={() => undefined}
                  onCopyTextStyle={() => undefined}
                  onNotify={setStatus}
                  onPasteTextStyle={() => undefined}
                  onTextChange={updateSelectedText}
                />
              </>
            )}
              </>
            )}
          </div>
        </aside>
      </section>

      <EditorStatusBar
        pageWidthPx={currentPage.width}
        pageHeightPx={currentPage.height}
        dpi={currentDocument.dpi}
        selectedLayer={selectedLayer}
        selectedCount={selectedLayerIds.length}
        zoom={viewport.zoom}
        onZoomIn={viewport.zoomIn}
        onZoomOut={viewport.zoomOut}
        onSetZoom={viewport.setZoom}
        onFitPage={viewport.fitPage}
        autosaveStatus={status}
        unit={statusBarUnit}
        onUnitChange={setStatusBarUnit}
        onResizeSelectedLayer={resizeSelectedLayer}
      />

      <footer className="bottombar">
        <div className="bottom-side">
          <span className="current-page-label">עמוד {currentPageIndex + 1} מתוך {currentDocument.pages.length}</span>
          <div className="bottom-page-nav" aria-label="ניווט עמודים">
            <button
              aria-label="עמוד קודם"
              className="page-nav-btn"
              disabled={currentPageIndex <= 0}
              onClick={() => {
                const page = currentDocument.pages[currentPageIndex - 1];
                if (page !== undefined) {
                  switchPageFromUi(page.id, "bottom-prev");
                }
              }}
              type="button"
            >
              ג€¹
            </button>
            {currentDocument.pages.map((page, index) => (
              <button
                aria-label={`עמוד ${index + 1}`}
                className={`page-chip ${page.id === currentPage.id ? "active" : ""}`}
                key={page.id}
                onClick={() => {
                  switchPageFromUi(page.id, "bottom-chip");
                }}
                type="button"
              >
                {index + 1}
              </button>
            ))}
            <button
              aria-label="עמוד הבא"
              className="page-nav-btn"
              disabled={currentPageIndex >= currentDocument.pages.length - 1}
              onClick={() => {
                const page = currentDocument.pages[currentPageIndex + 1];
                if (page !== undefined) {
                  switchPageFromUi(page.id, "bottom-next");
                }
              }}
              type="button"
            >
              ג€÷
            </button>
          </div>
        </div>
      </footer>

      <input ref={imageInputRef} accept={SUPPORTED_IMAGE_ACCEPT} hidden multiple onChange={handleImageInput} type="file" />
      <input ref={replaceImageInputRef} accept={SUPPORTED_IMAGE_ACCEPT} hidden onChange={(e) => void handleReplaceImageInput(e)} type="file" />
      <input ref={projectInputRef} accept=".json,.spp.json,.spp" hidden onChange={(event) => void handleProjectLoadLifecycle(event)} type="file" />
      <input ref={pdfInputRef} accept=".pdf,application/pdf" hidden onChange={handlePdfInput} type="file" />
      <input ref={classPhotoAddInputRef} accept={SUPPORTED_IMAGE_ACCEPT} hidden multiple onChange={(e) => { if (e.target.files) void handleClassPhotoAddFiles(e.target.files); e.target.value = ""; }} type="file" />

      {pdfImportFile !== null && (
        <Suspense fallback={null}>
          <PdfImportDialog
            file={pdfImportFile}
            onClose={() => setPdfImportFile(null)}
            onConfirm={(result) => void handlePdfImportConfirm(result)}
          />
        </Suspense>
      )}

      {showExactSizeDialog && selectedLayer !== null && (
        <ExactSizeDialog
          layer={selectedLayer}
          dpi={currentDocument.dpi}
          defaultUnit={statusBarUnit}
          onApply={resizeSelectedLayer}
          onClose={() => setShowExactSizeDialog(false)}
        />
      )}

      {showFontsBrowser && (
        <div className="util-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowFontsBrowser(false); }}>
          <GoogleFontsBrowser
            previewText={selectedLayer?.type === "text" ? selectedLayer.text : undefined}
            onUseFont={(family) => {
              if (selectedLayer?.type === "text") {
                patchSelectedLayer({ fontFamily: family } as Partial<VisualLayer>);
              }
              setShowFontsBrowser(false);
            }}
            onClose={() => setShowFontsBrowser(false)}
          />
        </div>
      )}

      {harmonizeTarget !== null && (() => {
        const harmonizeLayer = currentPage.layers.find((l) => l.id === harmonizeTarget.layerId);
        const harmonizeAsset = harmonizeLayer?.type === "image"
          ? currentDocument.assets.find((a) => a.id === harmonizeLayer.assetId)
          : harmonizeLayer?.type === "frame"
          ? currentDocument.assets.find((a) => a.id === harmonizeLayer.imageAssetId)
          : undefined;
        if (harmonizeAsset === undefined) return null;
        return (
          <HarmonizePanel
            layerId={harmonizeTarget.layerId}
            asset={harmonizeAsset}
            bbox={harmonizeTarget.bbox}
            stageRef={stageRef}
            onApply={(updatedAsset, shadowResult) => {
              updateAsset(updatedAsset);
              if (shadowResult) {
                const targetLayer = currentPage.layers.find(
                  (l) => l.id === harmonizeTarget.layerId
                );
                if (targetLayer !== undefined) {
                  const shadowLayer = createImageLayer({
                    name: shadowResult.asset.name,
                    assetId: shadowResult.asset.id,
                    rect: {
                      x: targetLayer.x,
                      y: targetLayer.y,
                      width: targetLayer.width,
                      height: targetLayer.height,
                    },
                    zIndex: targetLayer.zIndex - 1,
                    fitMode: "fit",
                  });
                  addAssetAndLayer(currentPage.id, shadowResult.asset, shadowLayer);
                }
              }
              setStatus("ההתאמה לרקע הוחלה");
              setHarmonizeTarget(null);
            }}
            onClose={() => setHarmonizeTarget(null)}
          />
        );
      })()}

      <AiToolsContainer />
      <SmartExpandModal stageRef={stageRef} />
      <AiStyleStudioContainer />
      <AutoFixModal />
      <CurvesModal />
      <ShadowHighlightsModal />

      {contentFillWorkspace !== null && (
        <ContentAwareFillWorkspace
          baseImageDataUrl={contentFillWorkspace.imageDataUrl}
          width={contentFillWorkspace.width}
          height={contentFillWorkspace.height}
          asset={contentFillWorkspace.asset}
          layer={contentFillWorkspace.layer}
          onApplied={(url) => {
            commitFilledLayerImage(contentFillWorkspace.layer, contentFillWorkspace.asset, url, contentFillWorkspace.width, contentFillWorkspace.height);
            setContentFillWorkspace(null);
            useUiBusyStore.getState().flashToast("המילוי הוחל • Ctrl+Z לביטול");
          }}
          onClose={() => setContentFillWorkspace(null)}
        />
      )}

    </main>
  );
}

function selectionMaskBounds(data: Uint8Array, width: number, height: number): { x: number; y: number; width: number; height: number } | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let index = 0; index < data.length; index += 1) {
    if (data[index] <= 128) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function countSelectedPixels(data: Uint8Array): number {
  let count = 0;
  for (let index = 0; index < data.length; index += 1) {
    if (data[index] > 128) count += 1;
  }
  return count;
}

function estimateAiFillRoi(data: Uint8Array, width: number, height: number): { width: number; height: number; pixels: number } | null {
  const bounds = selectionMaskBounds(data, width, height);
  if (bounds === null) return null;
  const dilationPx = Math.max(4, Math.min(18, Math.round(Math.min(width, height) * 0.006)));
  const dilatedWidth = Math.min(width, bounds.width + dilationPx * 2);
  const dilatedHeight = Math.min(height, bounds.height + dilationPx * 2);
  const shortSide = Math.max(1, Math.min(dilatedWidth, dilatedHeight));
  const paddingX = Math.max(96, Math.min(768, Math.round(Math.max(dilatedWidth * 0.75, shortSide * 2, 96))));
  const paddingY = Math.max(96, Math.min(768, Math.round(Math.max(dilatedHeight * 1.75, shortSide * 2, 96))));
  let roiWidth = Math.min(width, dilatedWidth + paddingX * 2);
  let roiHeight = Math.min(height, dilatedHeight + paddingY * 2);
  roiWidth = Math.min(width, Math.max(roiWidth, Math.min(512, width)));
  roiHeight = Math.min(height, Math.max(roiHeight, Math.min(512, height)));
  return {
    width: roiWidth,
    height: roiHeight,
    pixels: roiWidth * roiHeight
  };
}

function formatMegapixels(pixels: number): string {
  return (pixels / 1_000_000).toFixed(1);
}

async function composeInpaintPatch(
  baseCanvas: HTMLCanvasElement,
  patchPngBase64: string,
  roi: { x: number; y: number; width: number; height: number }
): Promise<string> {
  const patch = await loadHtmlImage(`data:image/png;base64,${patchPngBase64}`);
  const canvas = window.document.createElement("canvas");
  canvas.width = baseCanvas.width;
  canvas.height = baseCanvas.height;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("Cannot compose AI Fill result");
  }
  context.drawImage(baseCanvas, 0, 0);
  context.drawImage(patch, roi.x, roi.y, roi.width, roi.height);
  return canvas.toDataURL("image/png");
}

async function renderImageLayerToSelectionCanvas(
  layer: ImageLayer,
  asset: Asset,
  assets: Asset[],
  width: number,
  height: number
): Promise<HTMLCanvasElement | null> {
  const source = resolveCanvasAssetPath(asset);
  if (source === undefined) return null;
  const image = await loadHtmlImage(source).catch(() => null);
  if (image === null) return null;
  const canvas = window.document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) return null;

  const crop = layer.crop;
  const sx = crop.x * image.naturalWidth;
  const sy = crop.y * image.naturalHeight;
  const sw = crop.width * image.naturalWidth;
  const sh = crop.height * image.naturalHeight;
  const imageScale = Math.max(0.05, Math.min(20, layer.imageScale ?? 1));
  const scaleX = width / layer.width;
  const scaleY = height / layer.height;
  const flipH = (layer.metadata["flipH"] as boolean | undefined) ?? false;
  const flipV = (layer.metadata["flipV"] as boolean | undefined) ?? false;
  const imageX = (flipH ? layer.width * (1 + imageScale) / 2 : layer.width * (1 - imageScale) / 2) + (layer.imageOffsetX ?? 0);
  const imageY = (flipV ? layer.height * (1 + imageScale) / 2 : layer.height * (1 - imageScale) / 2) + (layer.imageOffsetY ?? 0);

  context.save();
  context.translate(imageX * scaleX, imageY * scaleY);
  context.scale((flipH ? -1 : 1) * imageScale * scaleX, (flipV ? -1 : 1) * imageScale * scaleY);
  context.drawImage(image, sx, sy, sw, sh, 0, 0, layer.width, layer.height);
  context.restore();

  if (layer.pixelMask !== undefined) {
    const maskAsset = assets.find((item) => item.id === layer.pixelMask?.assetId);
    const maskSource = resolveCanvasAssetPath(maskAsset);
    if (maskSource !== undefined) {
      const mask = await loadHtmlImage(maskSource).catch(() => null);
      if (mask === null) return canvas;
      context.save();
      context.globalCompositeOperation = "destination-in";
      context.drawImage(mask, 0, 0, width, height);
      context.restore();
    }
  }

  return canvas;
}

function loadHtmlImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Cannot load image"));
    image.src = source;
  });
}

// ג”€ג”€ג”€ Tool button ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

function SmartScreenshotCropToast({
  assets,
  onApplyAll,
  onIgnoreAll,
  onMuteProject,
  onReview
}: {
  assets: Asset[];
  onApplyAll: () => void;
  onIgnoreAll: () => void;
  onMuteProject: () => void;
  onReview: () => void;
}): ReactElement {
  const multiple = assets.length > 1;
  return (
    <div className="smart-crop-toast" role="status" dir="rtl">
      <div className="smart-crop-toast-text">
        {multiple
          ? `זוהו ${assets.length} תמונות שנראות כמו צילומי מסך עם שוליים שחורים.`
          : "נראה שהתמונה היא צילום מסך ויש לה שוליים שחורים. האם לחתוך אותם?"}
      </div>
      <div className="smart-crop-toast-actions">
        <button className="btn btn-accent" onClick={onApplyAll} type="button">{multiple ? "חתוך את כולן" : "חתוך אוטומטית"}</button>
        <button className="btn btn-secondary" onClick={onReview} type="button">{multiple ? "בדוק תמונות" : "הצג לפני/אחרי"}</button>
        <button className="btn btn-ghost" onClick={onIgnoreAll} type="button">התעלם</button>
        <button className="btn btn-ghost" onClick={onMuteProject} type="button">אל תשאל שוב בפרויקט הזה</button>
      </div>
    </div>
  );
}

function ScreenshotCropReviewPanel({
  assets,
  onApply,
  onApplyAllHighConfidence,
  onClose,
  onReset,
  onSkip,
  onSkipAll
}: {
  assets: Asset[];
  onApply: (assetId: string) => void;
  onApplyAllHighConfidence: () => void;
  onClose: () => void;
  onReset: (assetId: string) => void;
  onSkip: (assetId: string) => void;
  onSkipAll: () => void;
}): ReactElement {
  return (
    <div className="smart-crop-review-backdrop" role="dialog" aria-modal="true" dir="rtl">
      <div className="smart-crop-review">
        <header className="smart-crop-review-header">
          <div>
            <h2>בדיקת חיתוך צילומי מסך</h2>
            <p>{assets.length} תמונות חשודות</p>
          </div>
          <button className="context-icon" onClick={onClose} title="סגור" type="button"><X size={16} /></button>
        </header>
        <div className="smart-crop-review-actions">
          <button className="btn btn-accent" onClick={onApplyAllHighConfidence} type="button">חתוך את כל הביטחון הגבוה</button>
          <button className="btn btn-ghost" onClick={onSkipAll} type="button">דלג על כולן</button>
        </div>
        <div className="smart-crop-review-grid">
          {assets.map((asset) => {
            const suggestion = getScreenshotCropSuggestion(asset);
            const source = resolveCanvasAssetPath(asset);
            return (
              <article className="smart-crop-review-item" key={asset.id}>
                <div className="smart-crop-review-title">
                  <strong>{asset.name}</strong>
                  <span>{Math.round((suggestion?.confidence ?? 0) * 100)}%</span>
                </div>
                <div className="smart-crop-preview-pair">
                  <div className="smart-crop-preview-box">{source !== undefined ? <img src={source} alt="" /> : null}<span>לפני</span></div>
                  <div className="smart-crop-preview-box smart-crop-preview-after">
                    {source !== undefined && suggestion?.cropRect !== null && suggestion?.cropRect !== undefined ? <img src={source} alt="" style={cropPreviewStyle(asset, suggestion)} /> : null}
                    <span>אחרי</span>
                  </div>
                </div>
                <div className="smart-crop-review-meta">
                  {suggestion !== null ? `הוסר: עליון ${suggestion.removedPixels.top}, תחתון ${suggestion.removedPixels.bottom}, שמאל ${suggestion.removedPixels.left}, ימין ${suggestion.removedPixels.right}` : ""}
                </div>
                <div className="smart-crop-review-item-actions">
                  <button className="mini-action success" onClick={() => onApply(asset.id)} type="button">Apply</button>
                  <button className="mini-action" onClick={() => onSkip(asset.id)} type="button">Skip</button>
                  <button className="mini-action" onClick={() => onReset(asset.id)} type="button">Reset</button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function cropPreviewStyle(asset: Asset, suggestion: ScreenshotCropSuggestionMetadata): CSSProperties {
  const crop = suggestion.cropRect;
  if (crop === null) return {};
  const width = Math.max(1, asset.width ?? suggestion.originalWidth);
  const height = Math.max(1, asset.height ?? suggestion.originalHeight);
  return {
    clipPath: `inset(${(crop.y / height) * 100}% ${((width - crop.x - crop.width) / width) * 100}% ${((height - crop.y - crop.height) / height) * 100}% ${(crop.x / width) * 100}%)`
  };
}

function ContextToolbar({
  canvasWidth,
  canvasHeight,
  dpi,
  hasTextStyleClipboard,
  imageEditMode,
  selectedLayer,
  selectedLayers,
  showGrid,
  snapEnabled,
  onAddImage,
  onAddText,
  onApplyPreset,
  onBrowseFonts,
  onCopyTextStyle,
  onDelete,
  onDuplicate,
  onEnterImageEditMode,
  onEnterMaskContentEditMode,
  onExitMaskContentEditMode,
  onImageEditApply,
  onImageEditCancel,
  onImageEditClearSelection,
  onImageEditAiFillSelection,
  onImageEditCopySelection,
  onImageEditCutSelection,
  onImageEditDeleteSelection,
  onImageEditResetCrop,
  onImageEditResetMask,
  onSmartScreenshotCrop,
  onResetSmartScreenshotCrop,
  onAlign,
  onMoveLayer,
  onNotify,
  onPasteTextStyle,
  onPatch,
  onSmartTextFit,
  onToggleGrid,
  onToggleSnap,
  onOpenAiTool,
  onOpenAiStyles
}: {
  canvasWidth: number;
  canvasHeight: number;
  dpi: number;
  hasTextStyleClipboard: boolean;
  imageEditMode: boolean;
  selectedLayer: VisualLayer | null;
  selectedLayers: VisualLayer[];
  showGrid: boolean;
  snapEnabled: boolean;
  onAddImage: () => void;
  onAddText: () => void;
  onApplyPreset: (preset: TextPreset) => void;
  onBrowseFonts: () => void;
  onCopyTextStyle: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onEnterImageEditMode: () => void;
  onEnterMaskContentEditMode: () => void;
  onExitMaskContentEditMode: () => void;
  onImageEditApply: () => void;
  onImageEditCancel: () => void;
  onImageEditClearSelection: () => void;
  onImageEditAiFillSelection: () => void;
  onImageEditCopySelection: () => void;
  onImageEditCutSelection: () => void;
  onImageEditDeleteSelection: () => void;
  onImageEditResetCrop: () => void;
  onImageEditResetMask: () => void;
  onSmartScreenshotCrop: () => void;
  onResetSmartScreenshotCrop: () => void;
  onAlign: (command: AlignmentCommand) => void;
  onMoveLayer: (direction: "forward" | "backward" | "front" | "back") => void;
  onNotify: (message: string) => void;
  onPasteTextStyle: () => void;
  onPatch: (patch: Partial<VisualLayer>) => void;
  onSmartTextFit: (mode: SmartTextFitMode) => void;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
  onOpenAiTool?: (tool: import("@/state/aiToolsStore").AiTool) => void;
  onOpenAiStyles?: () => void;
}): ReactElement {
  if (imageEditMode && (selectedLayer?.type === "image" || selectedLayer?.type === "frame")) {
    return (
      <ImageEditToolbar
        onApply={onImageEditApply}
        onAiFillSelection={onImageEditAiFillSelection}
        onCancel={onImageEditCancel}
        onClearSelection={onImageEditClearSelection}
        onCopySelection={onImageEditCopySelection}
        onCutSelection={onImageEditCutSelection}
        onDeleteSelection={onImageEditDeleteSelection}
        onResetCrop={onImageEditResetCrop}
        onResetMask={onImageEditResetMask}
        onOpenAiTool={onOpenAiTool}
        onOpenAiStyles={onOpenAiStyles}
      />
    );
  }
  if (selectedLayers.length > 1) {
    const allText = selectedLayers.every((layer) => layer.type === "text");
    const sameImageKind = selectedLayer !== null &&
      (selectedLayer.type === "image" || selectedLayer.type === "frame") &&
      selectedLayers.every((layer) => layer.type === selectedLayer.type);

    if (allText && selectedLayer?.type === "text") {
      return (
        <TextContextToolbar
          hasTextStyleClipboard={hasTextStyleClipboard}
          layer={selectedLayer}
          selectionCount={selectedLayers.length}
          onApplyPreset={onApplyPreset}
          onBrowseFonts={onBrowseFonts}
          onCopyTextStyle={onCopyTextStyle}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onMoveLayer={onMoveLayer}
          onNotify={onNotify}
          onPasteTextStyle={onPasteTextStyle}
          onPatch={onPatch}
          onSmartTextFit={onSmartTextFit}
        />
      );
    }

    if (sameImageKind && (selectedLayer?.type === "image" || selectedLayer?.type === "frame")) {
      return (
        <BatchImageSelectionToolbar
          layer={selectedLayer}
          selectedLayers={selectedLayers as Array<Extract<VisualLayer, { type: "image" | "frame" }>>}
          onAlign={onAlign}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onMoveLayer={onMoveLayer}
          onPatch={onPatch}
        />
      );
    }

    return <MixedSelectionToolbar selectedLayers={selectedLayers} onAlign={onAlign} onDelete={onDelete} onDuplicate={onDuplicate} onMoveLayer={onMoveLayer} />;
  }
  if (selectedLayer?.type === "text") {
    return (
      <TextContextToolbar
        hasTextStyleClipboard={hasTextStyleClipboard}
        layer={selectedLayer}
        onApplyPreset={onApplyPreset}
        onBrowseFonts={onBrowseFonts}
        onCopyTextStyle={onCopyTextStyle}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onMoveLayer={onMoveLayer}
        onNotify={onNotify}
        onPasteTextStyle={onPasteTextStyle}
        onPatch={onPatch}
        onSmartTextFit={onSmartTextFit}
      />
    );
  }
  if (selectedLayer?.type === "image" || selectedLayer?.type === "frame") {
    return (
      <ImageContextToolbar
        canvasWidth={canvasWidth}
        canvasHeight={canvasHeight}
        dpi={dpi}
        layer={selectedLayer}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onEnterImageEditMode={onEnterImageEditMode}
        onEnterMaskContentEditMode={onEnterMaskContentEditMode}
        onExitMaskContentEditMode={onExitMaskContentEditMode}
        onMoveLayer={onMoveLayer}
        onPatch={onPatch}
        onResetSmartScreenshotCrop={onResetSmartScreenshotCrop}
        onSmartScreenshotCrop={onSmartScreenshotCrop}
      />
    );
  }
  if (selectedLayer !== null) {
    return <PlaceholderContextToolbar label={`${selectedLayer.type} tools`} onDelete={onDelete} onDuplicate={onDuplicate} onMoveLayer={onMoveLayer} />;
  }
  return <EmptyContextToolbar showGrid={showGrid} snapEnabled={snapEnabled} onAddImage={onAddImage} onAddText={onAddText} onToggleGrid={onToggleGrid} onToggleSnap={onToggleSnap} />;
}

function EmptyContextToolbar({
  showGrid,
  snapEnabled,
  onAddImage,
  onAddText,
  onToggleGrid,
  onToggleSnap
}: {
  showGrid: boolean;
  snapEnabled: boolean;
  onAddImage: () => void;
  onAddText: () => void;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
}): ReactElement {
  const drawingTool = useDrawingToolsStore((s) => s.activeTool);
  const setDrawingTool = useDrawingToolsStore((s) => s.setActiveTool);
  const shapeKind = useDrawingToolsStore((s) => s.shapeKind);
  const setShapeKind = useDrawingToolsStore((s) => s.setShapeKind);
  return (
    <section className="context-toolbar" aria-label="Context toolbar" data-testid="context-toolbar">
      <span className="context-toolbar-label">כלים כלליים</span>
      <div className="context-group">
        <button
          type="button"
          className={`context-eyedropper${drawingTool === "eyedropper" ? " on" : ""}`}
          onClick={() => setDrawingTool(drawingTool === "eyedropper" ? null : "eyedropper")}
          title="טפטפת — דגום צבע מהקנבס (I)"
          data-testid="tool-eyedropper"
        >
          <PipetteIcon size={15} />
          <span>טפטפת</span>
        </button>
      </div>
      <div className="context-group">
        <details className="context-menu">
          <summary title="כלי צורה (U)" className={drawingTool === "shape" ? "on" : ""}>
            <ShapesIcon size={14} /> צורה
          </summary>
          <div className="context-popover shape-popover">
            {([
              ["rect", "מלבן", RectangleHorizontal],
              ["circle", "עיגול", Circle],
              ["ellipse", "אליפסה", Circle],
              ["heart", "לב", HeartIcon],
              ["line", "קו", LineIcon],
              ["arrow", "חץ", ArrowIcon]
            ] as const).map(([kind, label, Icon]) => (
              <button
                key={kind}
                type="button"
                className={shapeKind === kind && drawingTool === "shape" ? "shape-pick on" : "shape-pick"}
                onClick={() => { setShapeKind(kind); setDrawingTool("shape"); }}
              >
                <Icon size={14} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </details>
        {drawingTool === "shape" ? (
          <span className="context-toolbar-label" style={{ fontSize: 11, opacity: 0.7 }}>
            {shapeKind === "rect" && "מלבן"}
            {shapeKind === "circle" && "עיגול"}
            {shapeKind === "ellipse" && "אליפסה"}
            {shapeKind === "heart" && "לב"}
            {shapeKind === "line" && "קו"}
            {shapeKind === "arrow" && "חץ"}
          </span>
        ) : null}
      </div>
      <div className="context-group">
        <ToolbarButton icon={Type} label="הוסף טקסט" onClick={onAddText} />
        <ToolbarButton icon={ImagePlus} label="הוסף תמונה" onClick={onAddImage} />
      </div>
      <div className="context-group">
        <button className={showGrid ? "context-toggle on" : "context-toggle"} onClick={onToggleGrid} title="הצג או הסתר גריד" type="button">Grid</button>
        <button className={snapEnabled ? "context-toggle on" : "context-toggle"} onClick={onToggleSnap} title="הפעל או כבה הצמדה" type="button">Snap</button>
      </div>
    </section>
  );
}

function TextContextToolbar({
  hasTextStyleClipboard,
  layer,
  selectionCount = 1,
  onApplyPreset,
  onBrowseFonts,
  onCopyTextStyle,
  onDelete,
  onDuplicate,
  onMoveLayer,
  onNotify,
  onPasteTextStyle,
  onPatch,
  onSmartTextFit
}: {
  hasTextStyleClipboard: boolean;
  layer: Extract<VisualLayer, { type: "text" }>;
  selectionCount?: number;
  onApplyPreset: (preset: TextPreset) => void;
  onBrowseFonts: () => void;
  onCopyTextStyle: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveLayer: (direction: "forward" | "backward" | "front" | "back") => void;
  onNotify: (message: string) => void;
  onPasteTextStyle: () => void;
  onPatch: (patch: Partial<VisualLayer>) => void;
  onSmartTextFit: (mode: SmartTextFitMode) => void;
}): ReactElement {
  const glow = layer.effects.find((effect) => effect.effectType === "outer_glow");
  const pattern = layer.effects.find((effect) => effect.effectType === "pattern_overlay");
  const sparkle = layer.effects.find((effect) => effect.effectType === "sparkle");
  const bevel = layer.effects.find((effect) => effect.effectType === "bevel_emboss");
  const extrude = layer.effects.find((effect) => effect.effectType === "extrude_3d");
  const [userPresets, setUserPresets] = useState<TextPreset[]>(() => loadUserTextPresets());
  const allPresets = useMemo(() => [...BUILTIN_TEXT_PRESETS, ...userPresets], [userPresets]);

  function patchGlow(patch: Record<string, string | number>): void {
    patchTextEffect(glow, "outer_glow", patch);
  }

  function patchTextEffect(existing: TextEffect | undefined, effectType: TextEffect["effectType"], patch: Record<string, unknown>): void {
    const base = existing ?? createTextEffect(effectType);
    const next = {
      ...base,
      enabled: true,
      opacity: typeof patch["opacity"] === "number" ? patch["opacity"] : base.opacity,
      params: { ...base.params, ...patch }
    };
    onPatch({
      effects: existing === undefined ? [...layer.effects, next] : layer.effects.map((effect) => (effect.id === existing.id ? next : effect))
    } as Partial<VisualLayer>);
  }

  function removeTextEffect(effect: TextEffect | undefined): void {
    if (effect !== undefined) onPatch({ effects: layer.effects.filter((item) => item.id !== effect.id) } as Partial<VisualLayer>);
  }

  function applyPresetWithFontFallback(preset: TextPreset): void {
    const family = preset.style.fontFamily;
    if (family !== undefined && !fontFamilyExists(family)) {
      onNotify(`הפונט "${family}" לא נמצא, ממשיך עם DM Sans`);
      onApplyPreset({ ...preset, style: { ...preset.style, fontFamily: "DM Sans" } });
      return;
    }
    onApplyPreset(preset);
  }

  function saveToolbarPreset(): void {
    const name = window.prompt("שם הפריסט", layer.name || "פריסט מותאם")?.trim();
    if (!name) return;
    const preset = createTextPresetFromLayer(layer, name);
    setUserPresets(saveUserTextPreset(preset));
    onNotify(`הפריסט "${preset.name}" נשמר`);
  }

  function removeToolbarPreset(preset: TextPreset): void {
    setUserPresets(deleteUserTextPreset(preset.presetId));
    onNotify(`הפריסט "${preset.name}" נמחק`);
  }

  async function uploadPatternImage(file: File | undefined): Promise<void> {
    if (file === undefined || pattern === undefined) return;
    let normalizedFile: File;
    try {
      normalizedFile = await normalizeIncomingImage(file);
    } catch (err) {
      onNotify(err instanceof Error && err.message ? err.message : HEIC_CONVERSION_ERROR_MESSAGE);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      patchTextEffect(pattern, "pattern_overlay", {
        patternType: "uploaded_image",
        imageDataUrl: reader.result,
        imageName: normalizedFile.name,
        opacity: Math.max(0.2, Number((pattern.params as Record<string, unknown>)["opacity"] ?? 0.65))
      });
    };
    reader.readAsDataURL(normalizedFile);
  }

  return (
    <section className="context-toolbar text-mode" aria-label="Text context toolbar" data-testid="context-toolbar">
      <span className="context-toolbar-label">{selectionCount > 1 ? `טקסטים (${selectionCount})` : "טקסט"}</span>
      <div className="context-group font-context">
        <FontSelector value={layer.fontFamily} onChange={(family) => onPatch({ fontFamily: family } as Partial<VisualLayer>)} />
        <button className="btn btn-ghost compact" onClick={onBrowseFonts} title="גלישת Google Fonts" type="button">
          Browse Fonts
        </button>
        <input className="context-number" max={240} min={8} onChange={(event) => onPatch({ fontSize: Number(event.target.value) || layer.fontSize } as Partial<VisualLayer>)} title="גודל טקסט" type="number" value={layer.fontSize} />
        <input className="context-color" onChange={(event) => onPatch({ color: event.target.value, autoContrastOverridden: true } as Partial<VisualLayer>)} title="צבע טקסט" type="color" value={layer.color} />
      </div>
      <div className="context-group">
        <ToolbarButton active={layer.fontWeight >= 700} icon={Bold} label="מודגש" onClick={() => onPatch({ fontWeight: layer.fontWeight >= 700 ? 400 : 700 } as Partial<VisualLayer>)} />
        <ToolbarButton active={layer.fontStyle === "italic"} icon={Italic} label="נטוי" onClick={() => onPatch({ fontStyle: layer.fontStyle === "italic" ? "normal" : "italic" } as Partial<VisualLayer>)} />
      </div>
      <div className="context-group">
        <ToolbarButton active={layer.alignment === "right"} icon={AlignRight} label="יישור ימין" onClick={() => onPatch({ alignment: "right" } as Partial<VisualLayer>)} />
        <ToolbarButton active={layer.alignment === "center"} icon={AlignCenter} label="יישור מרכז" onClick={() => onPatch({ alignment: "center" } as Partial<VisualLayer>)} />
        <ToolbarButton active={layer.alignment === "left"} icon={AlignLeft} label="יישור שמאל" onClick={() => onPatch({ alignment: "left" } as Partial<VisualLayer>)} />
      </div>
      <div className="context-group">
        <select className="context-select compact" onChange={(event) => onPatch({ direction: event.target.value as typeof layer.direction } as Partial<VisualLayer>)} title="כיוון טקסט" value={layer.direction}>
          <option value="auto">Auto</option>
          <option value="rtl">RTL</option>
          <option value="ltr">LTR</option>
        </select>
        <CompactRange label="Fill" max={1} min={0} step={0.01} value={layer.fillOpacity} onChange={(value) => onPatch({ fillOpacity: value } as Partial<VisualLayer>)} />
        <CompactRange label="Layer" max={1} min={0} step={0.01} value={layer.opacity} onChange={(value) => onPatch({ opacity: value } as Partial<VisualLayer>)} />
        <BlendModeSelect value={layer.blendMode} onChange={(blendMode) => onPatch({ blendMode } as Partial<VisualLayer>)} />
      </div>
      <ToolbarMenu label="ארגון חכם" title="התאמת טקסט לקנבס">
        <div className="context-menu-actions">
          <button className="context-menu-button" onClick={() => onSmartTextFit("balanced")} type="button">
            <Maximize2 size={13} /> התאמה מלאה
          </button>
          <button className="context-menu-button" onClick={() => onSmartTextFit("shrink")} type="button">
            <Type size={13} /> התאמה חלקית
          </button>
          <button className="context-menu-button" onClick={() => onSmartTextFit("wrap")} type="button">
            <AlignJustify size={13} /> פריסת שורות
          </button>
        </div>
      </ToolbarMenu>
      <ToolbarMenu label="Presets" title="פריסטים לטקסט">
        <div className="context-menu-actions">
          <button className="context-menu-button" onClick={onCopyTextStyle} type="button"><Copy size={13} /> Copy FX</button>
          <button className="context-menu-button" disabled={!hasTextStyleClipboard} onClick={onPasteTextStyle} type="button"><Clipboard size={13} /> Paste FX</button><button className="context-menu-button" onClick={saveToolbarPreset} type="button"><Save size={13} /> Save preset</button>
        </div>
        <div className="context-preset-grid">
          {allPresets.map((preset) => (
            <button className="context-preset-chip" key={preset.presetId} onClick={() => applyPresetWithFontFallback(preset)} type="button">
              <PresetThumb height={68} layer={layer} preset={preset} sample={presetSampleText(layer)} width={68} />
              <strong>{preset.name}</strong>{!preset.isBuiltin ? <em onClick={(event) => { event.stopPropagation(); removeToolbarPreset(preset); }}>Delete</em> : null}
            </button>
          ))}
        </div>
      </ToolbarMenu>
      <ToolbarMenu label="Stroke" title="קו חיצוני">
        <label className="check-line"><input checked={layer.stroke !== undefined} onChange={(event) => onPatch({ stroke: event.target.checked ? { version: 1, color: "#111111", width: 2, opacity: 1, position: "outside" } : undefined } as Partial<VisualLayer>)} type="checkbox" /> הפעלה</label>
        {layer.stroke !== undefined ? <><input className="context-color wide" onChange={(event) => onPatch({ stroke: { ...layer.stroke, color: event.target.value } } as Partial<VisualLayer>)} type="color" value={layer.stroke.color} /><SliderField label="עובי" min={0} max={30} value={layer.stroke.width} onChange={(value) => onPatch({ stroke: { ...layer.stroke, width: value } } as Partial<VisualLayer>)} unit=" px" /><SliderField label="שקיפות" min={0} max={1} step={0.01} decimals={2} value={layer.stroke.opacity} onChange={(value) => onPatch({ stroke: { ...layer.stroke, opacity: value } } as Partial<VisualLayer>)} /><label className="context-menu-section-label" style={{ marginTop: 6 }}>מיקום</label><select className="context-select full" value={layer.stroke.position ?? "outside"} onChange={(event) => onPatch({ stroke: { ...layer.stroke, position: event.target.value as "inside" | "center" | "outside" } } as Partial<VisualLayer>)}><option value="outside">חיצוני</option><option value="center">ממורכז</option><option value="inside">פנימי</option></select></> : null}
      </ToolbarMenu>
      <ToolbarMenu label="Shadow" title="צל">
        <div className="context-menu-actions">
          <button className="context-menu-button" onClick={() => onPatch({ shadow: { version: 1, color: "#000000", blur: 10, offsetX: 0, offsetY: 5, opacity: 0.22 } } as Partial<VisualLayer>)} type="button">Soft</button>
          <button className="context-menu-button" onClick={() => onPatch({ shadow: { version: 1, color: "#000000", blur: 2, offsetX: 4, offsetY: 4, opacity: 0.55 } } as Partial<VisualLayer>)} type="button">Hard</button>
          <button className="context-menu-button" onClick={() => onPatch({ shadow: { version: 1, color: "#111111", blur: 0, offsetX: 8, offsetY: 8, opacity: 0.75 } } as Partial<VisualLayer>)} type="button">Retro</button>
        </div>
        <label className="check-line"><input checked={layer.shadow !== undefined} onChange={(event) => onPatch({ shadow: event.target.checked ? { version: 1, color: "#000000", blur: 8, offsetX: 0, offsetY: 5, opacity: 0.35 } : undefined } as Partial<VisualLayer>)} type="checkbox" /> הפעלה</label>
        {layer.shadow !== undefined ? <><input className="context-color wide" onChange={(event) => onPatch({ shadow: { ...layer.shadow, color: event.target.value } } as Partial<VisualLayer>)} type="color" value={layer.shadow.color} /><SliderField label="שקיפות" min={0} max={1} step={0.01} decimals={2} value={layer.shadow.opacity} onChange={(value) => onPatch({ shadow: { ...layer.shadow, opacity: value } } as Partial<VisualLayer>)} /><SliderField label="טשטוש" min={0} max={80} value={layer.shadow.blur} onChange={(value) => onPatch({ shadow: { ...layer.shadow, blur: value } } as Partial<VisualLayer>)} unit=" px" /><SliderField label="X" min={-80} max={80} value={layer.shadow.offsetX} onChange={(value) => onPatch({ shadow: { ...layer.shadow, offsetX: value } } as Partial<VisualLayer>)} /><SliderField label="Y" min={-80} max={80} value={layer.shadow.offsetY} onChange={(value) => onPatch({ shadow: { ...layer.shadow, offsetY: value } } as Partial<VisualLayer>)} /></> : null}
      </ToolbarMenu>
      <ToolbarMenu label="Glow" title="זוהר חיצוני">
        <label className="check-line"><input checked={glow?.enabled === true} onChange={(event) => event.target.checked ? patchGlow({ color: "#ffffff", outerColor: "#7dd3fc", opacity: 0.8, blur: 28, spread: 8, passes: 3 }) : removeTextEffect(glow)} type="checkbox" /> הפעלה</label>
        {glow?.enabled === true ? <><input className="context-color wide" onChange={(event) => patchGlow({ color: event.target.value })} type="color" value={String((glow.params as Record<string, unknown>)["color"] ?? "#ffffff")} /><SliderField label="טשטוש" min={4} max={90} value={Number((glow.params as Record<string, unknown>)["blur"] ?? 24)} onChange={(value) => patchGlow({ blur: value })} unit=" px" /><SliderField label="Spread" min={0} max={35} value={Number((glow.params as Record<string, unknown>)["spread"] ?? 4)} onChange={(value) => patchGlow({ spread: value })} unit=" px" /><SliderField label="Passes" min={1} max={6} value={Number((glow.params as Record<string, unknown>)["passes"] ?? 3)} onChange={(value) => patchGlow({ passes: value })} /><SliderField label="שקיפות" min={0} max={1} step={0.01} decimals={2} value={glow.opacity} onChange={(value) => patchGlow({ opacity: value })} /></> : null}
      </ToolbarMenu>
      <ToolbarMenu label="Pattern" title="תבנית בתוך הטקסט">
        <label className="check-line"><input checked={pattern?.enabled === true} onChange={(event) => event.target.checked ? patchTextEffect(pattern, "pattern_overlay", { patternType: "diagonal_shine", foreground: "#ffffff", opacity: 0.35, scale: 1, rotation: -18, spacing: 14 }) : removeTextEffect(pattern)} type="checkbox" /> הפעלה</label>
        {pattern?.enabled === true ? <><select className="context-select full" onChange={(event) => patchTextEffect(pattern, "pattern_overlay", { patternType: event.target.value })} value={String((pattern.params as Record<string, unknown>)["patternType"] ?? "stripes")}><option value="stripes">Stripes</option><option value="dots">Dots</option><option value="checker">Checker</option><option value="diagonal_shine">Shine</option><option value="noise">Noise</option><option value="halftone">Halftone</option><option value="brushed_metal">Brushed metal</option><option value="uploaded_image">Uploaded image</option></select><label className="context-upload-button"><ImagePlus size={13} /> Upload pattern<input accept={SUPPORTED_IMAGE_ACCEPT} type="file" onChange={(event) => void uploadPatternImage(event.target.files?.[0])} /></label>{typeof (pattern.params as Record<string, unknown>)["imageName"] === "string" ? <span className="context-menu-section-label">{String((pattern.params as Record<string, unknown>)["imageName"])}</span> : null}<input className="context-color wide" onChange={(event) => patchTextEffect(pattern, "pattern_overlay", { foreground: event.target.value })} type="color" value={String((pattern.params as Record<string, unknown>)["foreground"] ?? "#ffffff")} /><SliderField label="מרווח" min={4} max={40} value={Number((pattern.params as Record<string, unknown>)["spacing"] ?? 10)} onChange={(value) => patchTextEffect(pattern, "pattern_overlay", { spacing: value })} unit=" px" /><SliderField label="זווית" min={-90} max={90} value={Number((pattern.params as Record<string, unknown>)["rotation"] ?? 0)} onChange={(value) => patchTextEffect(pattern, "pattern_overlay", { rotation: value })} unit="°" /><SliderField label="שקיפות" min={0} max={1} step={0.01} decimals={2} value={Number((pattern.params as Record<string, unknown>)["opacity"] ?? pattern.opacity)} onChange={(value) => patchTextEffect(pattern, "pattern_overlay", { opacity: value })} /><label className="context-menu-section-label" style={{ marginTop: 6 }}>החל על</label><select className="context-select full" value={String((pattern.params as Record<string, unknown>)["applyTo"] ?? "fill_only")} onChange={(event) => patchTextEffect(pattern, "pattern_overlay", { applyTo: event.target.value })}><option value="fill_only">מילוי בלבד</option><option value="stroke_only">קו מתאר בלבד</option><option value="all">הכל</option></select></> : null}
      </ToolbarMenu>
      <ToolbarMenu label="3D" title="תלת ממד ותבליט">
        <label className="check-line"><input checked={extrude?.enabled === true} onChange={(event) => event.target.checked ? patchTextEffect(extrude, "extrude_3d", { color: "#333333", depth: 12, offsetX: 1, offsetY: 1, steps: 12, opacity: 0.85 }) : removeTextEffect(extrude)} type="checkbox" /> Extrude</label>
        {extrude?.enabled === true ? <><input className="context-color wide" onChange={(event) => patchTextEffect(extrude, "extrude_3d", { color: event.target.value })} type="color" value={String((extrude.params as Record<string, unknown>)["color"] ?? "#333333")} /><SliderField label="עומק" min={0} max={32} value={Number((extrude.params as Record<string, unknown>)["depth"] ?? 12)} onChange={(value) => patchTextEffect(extrude, "extrude_3d", { depth: value })} unit=" px" /><SliderField label="X" min={-3} max={3} step={0.1} decimals={1} value={Number((extrude.params as Record<string, unknown>)["offsetX"] ?? 1)} onChange={(value) => patchTextEffect(extrude, "extrude_3d", { offsetX: value })} /><SliderField label="Y" min={-3} max={3} step={0.1} decimals={1} value={Number((extrude.params as Record<string, unknown>)["offsetY"] ?? 1)} onChange={(value) => patchTextEffect(extrude, "extrude_3d", { offsetY: value })} /></> : null}
        <label className="check-line"><input checked={bevel?.enabled === true} onChange={(event) => event.target.checked ? patchTextEffect(bevel, "bevel_emboss", { style: "inner_bevel", technique: "smooth", depth: 5, size: 5, soften: 1, highlightColor: "#ffffff", shadowColor: "#000000" }) : removeTextEffect(bevel)} type="checkbox" /> Bevel</label>
        {bevel?.enabled === true ? <><SliderField label="Bevel depth" min={1} max={20} value={Number((bevel.params as Record<string, unknown>)["depth"] ?? 5)} onChange={(value) => patchTextEffect(bevel, "bevel_emboss", { depth: value })} unit=" px" /><SliderField label="Bevel size" min={0} max={20} value={Number((bevel.params as Record<string, unknown>)["size"] ?? 5)} onChange={(value) => patchTextEffect(bevel, "bevel_emboss", { size: value })} unit=" px" /></> : null}
      </ToolbarMenu>
      <ToolbarMenu label="Sparkle" title="נצנוץ סטטי להדפסה">
        <label className="check-line"><input checked={sparkle?.enabled === true} onChange={(event) => event.target.checked ? patchTextEffect(sparkle, "sparkle", { density: 0.24, size: 6, color: "#ffffff", seed: 9, opacity: 0.85, rays: 8, glint: 0.75, halo: 0.7 }) : removeTextEffect(sparkle)} type="checkbox" /> הפעלה</label>
        {sparkle?.enabled === true ? <><input className="context-color wide" onChange={(event) => patchTextEffect(sparkle, "sparkle", { color: event.target.value })} type="color" value={String((sparkle.params as Record<string, unknown>)["color"] ?? "#ffffff")} /><SliderField label="כמות" min={0.02} max={0.8} step={0.01} decimals={2} value={Number((sparkle.params as Record<string, unknown>)["density"] ?? 0.24)} onChange={(value) => patchTextEffect(sparkle, "sparkle", { density: value })} /><SliderField label="גודל" min={1} max={18} value={Number((sparkle.params as Record<string, unknown>)["size"] ?? 6)} onChange={(value) => patchTextEffect(sparkle, "sparkle", { size: value })} unit=" px" /><SliderField label="Glint" min={0} max={1} step={0.01} decimals={2} value={Number((sparkle.params as Record<string, unknown>)["glint"] ?? 0.75)} onChange={(value) => patchTextEffect(sparkle, "sparkle", { glint: value })} /><SliderField label="Halo" min={0} max={1} step={0.01} decimals={2} value={Number((sparkle.params as Record<string, unknown>)["halo"] ?? 0.7)} onChange={(value) => patchTextEffect(sparkle, "sparkle", { halo: value })} /><label className="context-menu-section-label" style={{ marginTop: 6 }}>החל על</label><select className="context-select full" value={String((sparkle.params as Record<string, unknown>)["applyTo"] ?? "fill_only")} onChange={(event) => patchTextEffect(sparkle, "sparkle", { applyTo: event.target.value })}><option value="fill_only">מילוי בלבד</option><option value="stroke_only">קו מתאר בלבד</option><option value="all">הכל</option></select></> : null}
      </ToolbarMenu>
      <ToolbarMenu label="Warp" title="עיוות טקסט">
        <select className="context-select full" onChange={(event) => onPatch({ warpSettings: { ...layer.warpSettings, enabled: event.target.value !== "none", type: event.target.value as typeof layer.warpSettings.type } } as Partial<VisualLayer>)} value={layer.warpSettings.type}>
          {WARP_TYPES.map((warp) => <option key={warp.id} value={warp.id}>{warp.label}</option>)}
        </select>
        <SliderField label="Bend" min={-100} max={100} value={layer.warpSettings.amount} onChange={(value) => onPatch({ warpSettings: { ...layer.warpSettings, amount: value, intensity: value, enabled: value !== 0 || layer.warpSettings.type !== "none" } } as Partial<VisualLayer>)} unit="%" />
        <SliderField label="אופקי" min={-100} max={100} value={layer.warpSettings.horizontalDistortion} onChange={(value) => onPatch({ warpSettings: { ...layer.warpSettings, horizontalDistortion: value } } as Partial<VisualLayer>)} unit="%" />
      </ToolbarMenu>
      <div className="context-group">
        <CompactRange label="Spacing" max={40} min={-10} value={layer.letterSpacing} onChange={(value) => onPatch({ letterSpacing: value } as Partial<VisualLayer>)} />
        <CompactRange label="Line" max={3} min={0.7} step={0.05} value={layer.lineHeight} onChange={(value) => onPatch({ lineHeight: value } as Partial<VisualLayer>)} />
      </div>
      <div className="context-group">
        <ToolbarButton icon={Copy} label="שכפל טקסט" onClick={onDuplicate} />
        <ToolbarButton active={layer.locked} icon={layer.locked ? Lock : Unlock} label={layer.locked ? "שחרר נעילה" : "נעל שכבה"} onClick={() => onPatch({ locked: !layer.locked } as Partial<VisualLayer>)} />
        <ToolbarButton icon={ChevronsUp} label="הבא קדימה" onClick={() => onMoveLayer("forward")} />
        <ToolbarButton icon={ChevronsDown} label="שלח אחורה" onClick={() => onMoveLayer("backward")} />
        <ToolbarButton danger icon={Trash2} label="מחק" onClick={onDelete} />
      </div>
    </section>
  );
}

function BatchImageSelectionToolbar({
  layer,
  selectedLayers,
  onAlign,
  onDelete,
  onDuplicate,
  onMoveLayer,
  onPatch
}: {
  layer: Extract<VisualLayer, { type: "image" | "frame" }>;
  selectedLayers: Array<Extract<VisualLayer, { type: "image" | "frame" }>>;
  onAlign: (command: AlignmentCommand) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveLayer: (direction: "forward" | "backward" | "front" | "back") => void;
  onPatch: (patch: Partial<VisualLayer>) => void;
}): ReactElement {
  const isFrame = layer.type === "frame";
  const radius = isFrame ? layer.cornerRadius ?? 0 : Number(layer.metadata["imageCornerRadius"] ?? 0);
  const flipH = Boolean(layer.metadata["flipH"]);
  const flipV = Boolean(layer.metadata["flipV"]);

  function patchMeta(patch: Record<string, string | number | boolean | null>): void {
    onPatch({ metadata: { ...layer.metadata, ...patch } as Record<string, import("@/types/primitives").JsonValue> });
  }

  function setRadius(value: number): void {
    if (isFrame) {
      onPatch({ cornerRadius: value } as Partial<VisualLayer>);
      return;
    }
    patchMeta({ imageCornerRadius: value });
  }

  return (
    <section className="context-toolbar image-mode batch-mode" aria-label="Batch image toolbar" data-testid="context-toolbar">
      <span className="context-toolbar-label">תמונות ({selectedLayers.length})</span>
      <div className="context-group">
        <ToolbarButton icon={AlignLeft} label="יישור שמאל" onClick={() => onAlign("left")} />
        <ToolbarButton icon={AlignCenter} label="יישור מרכז אופקי" onClick={() => onAlign("centerX")} />
        <ToolbarButton icon={AlignRight} label="יישור ימין" onClick={() => onAlign("right")} />
        <ToolbarButton icon={ChevronsUp} label="יישור למעלה" onClick={() => onAlign("top")} />
        <ToolbarButton icon={AlignCenter} label="יישור מרכז אנכי" onClick={() => onAlign("centerY")} />
        <ToolbarButton icon={ChevronsDown} label="יישור למטה" onClick={() => onAlign("bottom")} />
      </div>
      <div className="context-group">
        <select
          className="context-select compact"
          title="מצב התאמה"
          value={layer.fitMode}
          onChange={(event) => onPatch({ fitMode: event.target.value as "fit" | "fill" | "stretch" } as Partial<VisualLayer>)}
        >
          <option value="fit">Fit</option>
          <option value="fill">Fill</option>
          <option value="stretch">Stretch</option>
        </select>
        <CompactRange label="Radius" min={0} max={80} value={radius} onChange={setRadius} />
      </div>
      <div className="context-group">
        <CompactRange label="Opacity" min={0} max={1} step={0.01} value={layer.opacity} onChange={(value) => onPatch({ opacity: value } as Partial<VisualLayer>)} />
        <BlendModeSelect value={layer.blendMode} onChange={(blendMode) => onPatch({ blendMode } as Partial<VisualLayer>)} />
      </div>
      <ToolbarMenu label="סיבוב והיפוך" title="סיבוב והיפוך">
        <button className="context-menu-button" type="button" onClick={() => rotateSelectionByEvent(90)}><RotateCw size={13} /> סובב 90° עם כיוון השעון</button>
        <button className="context-menu-button" type="button" onClick={() => rotateSelectionByEvent(-90)}><RotateCcw size={13} /> סובב 90° נגד כיוון השעון</button>
        <button className="context-menu-button" type="button" onClick={() => rotateSelectionByEvent(180)}><RotateCw size={13} /> סובב 180°</button>
        <div className="context-divider" />
        <button className={`context-menu-button${flipH ? " on" : ""}`} type="button" onClick={() => patchMeta({ flipH: !flipH })}><FlipHorizontal size={13} /> היפוך אופקי</button>
        <button className={`context-menu-button${flipV ? " on" : ""}`} type="button" onClick={() => patchMeta({ flipV: !flipV })}><FlipVertical size={13} /> היפוך אנכי</button>
      </ToolbarMenu>
      <div className="context-group">
        <ToolbarButton icon={Copy} label="שכפל בחירה" onClick={onDuplicate} />
        <ToolbarButton active={selectedLayers.every((item) => item.locked)} icon={selectedLayers.every((item) => item.locked) ? Lock : Unlock} label="נעל / שחרר בחירה" onClick={() => onPatch({ locked: !selectedLayers.every((item) => item.locked) } as Partial<VisualLayer>)} />
        <ToolbarButton icon={ChevronsUp} label="הבא קדימה" onClick={() => onMoveLayer("forward")} />
        <ToolbarButton icon={ChevronsDown} label="שלח אחורה" onClick={() => onMoveLayer("backward")} />
        <ToolbarButton danger icon={Trash2} label="מחק בחירה" onClick={onDelete} />
      </div>
    </section>
  );
}

function MixedSelectionToolbar({ selectedLayers, onAlign, onDelete, onDuplicate, onMoveLayer }: { selectedLayers: VisualLayer[]; onAlign: (command: AlignmentCommand) => void; onDelete: () => void; onDuplicate: () => void; onMoveLayer: (direction: "forward" | "backward" | "front" | "back") => void; }): ReactElement {
  const imageCount = selectedLayers.filter((layer) => layer.type === "image" || layer.type === "frame").length;
  const textCount = selectedLayers.filter((layer) => layer.type === "text").length;
  return (
    <section className="context-toolbar batch-mode" aria-label="Mixed selection toolbar" data-testid="context-toolbar">
      <span className="context-toolbar-label">בחירה מעורבת ({selectedLayers.length})</span>
      <span className="context-muted">{imageCount} תמונות · {textCount} טקסטים</span>
      <div className="context-group">
        <ToolbarButton icon={AlignLeft} label="יישור שמאל" onClick={() => onAlign("left")} />
        <ToolbarButton icon={AlignCenter} label="יישור מרכז אופקי" onClick={() => onAlign("centerX")} />
        <ToolbarButton icon={AlignRight} label="יישור ימין" onClick={() => onAlign("right")} />
        <ToolbarButton icon={ChevronsUp} label="יישור למעלה" onClick={() => onAlign("top")} />
        <ToolbarButton icon={ChevronsDown} label="יישור למטה" onClick={() => onAlign("bottom")} />
      </div>
      <div className="context-group">
        <ToolbarButton icon={Copy} label="שכפל בחירה" onClick={onDuplicate} />
        <ToolbarButton icon={ChevronsUp} label="הבא קדימה" onClick={() => onMoveLayer("forward")} />
        <ToolbarButton icon={ChevronsDown} label="שלח אחורה" onClick={() => onMoveLayer("backward")} />
        <ToolbarButton danger icon={Trash2} label="מחק בחירה" onClick={onDelete} />
      </div>
    </section>
  );
}

function PlaceholderContextToolbar({ label, onDelete, onDuplicate, onMoveLayer }: { label: string; onDelete: () => void; onDuplicate: () => void; onMoveLayer: (direction: "forward" | "backward" | "front" | "back") => void; }): ReactElement {
  return <section className="context-toolbar" aria-label={`${label} context toolbar`} data-testid="context-toolbar"><span className="context-toolbar-label">{label}</span><span className="context-muted">מוכן להרחבה בשלב הבא</span><div className="context-group"><ToolbarButton icon={Copy} label="שכפל" onClick={onDuplicate} /><ToolbarButton icon={ChevronsUp} label="הבא קדימה" onClick={() => onMoveLayer("forward")} /><ToolbarButton icon={ChevronsDown} label="שלח אחורה" onClick={() => onMoveLayer("backward")} /><ToolbarButton danger icon={Trash2} label="מחק" onClick={onDelete} /></div></section>;
}

// ג”€ג”€ג”€ Image Resize Control ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

type SizeUnit = "mm" | "cm" | "inch";

function ImageResizeControl({
  layer,
  dpi,
  onPatch,
}: {
  layer: Extract<VisualLayer, { type: "image" | "frame" }>;
  dpi: number;
  onPatch: (patch: Partial<VisualLayer>) => void;
}): ReactElement {
  const isFrame = layer.type === "frame";
  const frameLayer = isFrame ? (layer as FrameLayer) : null;
  const contentScale = frameLayer?.contentTransform.scale ?? 1;

  // For frames: "virtual" content size (frame ֳ— scale). For images: actual layer size.
  const pxW = isFrame ? layer.width * contentScale : layer.width;
  const pxH = isFrame ? layer.height * contentScale : layer.height;

  const [unit, setUnit] = useState<SizeUnit>("mm");
  const [lockAspect, setLockAspect] = useState(true);

  const fmtPx = useCallback(
    (px: number): string => {
      const v = unit === "mm" ? pxToMm(px, dpi) : unit === "cm" ? pxToCm(px, dpi) : pxToInch(px, dpi);
      return v.toFixed(unit === "inch" ? 3 : 1);
    },
    [unit, dpi]
  );

  const wFocused = useRef(false);
  const hFocused = useRef(false);
  const [inputW, setInputW] = useState(() => fmtPx(pxW));
  const [inputH, setInputH] = useState(() => fmtPx(pxH));

  useEffect(() => { if (!wFocused.current) setInputW(fmtPx(pxW)); }, [pxW, fmtPx]);
  useEffect(() => { if (!hFocused.current) setInputH(fmtPx(pxH)); }, [pxH, fmtPx]);

  function displayToPx(v: number): number {
    return unit === "mm" ? mmToPx(v, dpi) : unit === "cm" ? cmToPx(v, dpi) : inchToPx(v, dpi);
  }

  function commitWidth(str: string): void {
    const num = parseFloat(str);
    if (!isFinite(num) || num <= 0) return;
    const newPxW = Math.max(8, displayToPx(num));
    const ratio = newPxW / pxW;
    if (isFrame && frameLayer) {
      const newScale = Math.max(0.01, frameLayer.contentTransform.scale * ratio);
      onPatch({ contentTransform: { ...frameLayer.contentTransform, scale: newScale } } as Partial<VisualLayer>);
    } else {
      onPatch((lockAspect
        ? { width: newPxW, height: Math.max(8, pxH * ratio) }
        : { width: newPxW }) as Partial<VisualLayer>);
    }
  }

  function commitHeight(str: string): void {
    const num = parseFloat(str);
    if (!isFinite(num) || num <= 0) return;
    const newPxH = Math.max(8, displayToPx(num));
    const ratio = newPxH / pxH;
    if (isFrame && frameLayer) {
      const newScale = Math.max(0.01, frameLayer.contentTransform.scale * ratio);
      onPatch({ contentTransform: { ...frameLayer.contentTransform, scale: newScale } } as Partial<VisualLayer>);
    } else {
      onPatch((lockAspect
        ? { width: Math.max(8, pxW * ratio), height: newPxH }
        : { height: newPxH }) as Partial<VisualLayer>);
    }
  }

  return (
    <div className="context-group ctx-resize-group">
      <span className="ctx-resize-label">גודל</span>
      <select
        className="context-select compact ctx-resize-unit"
        title="יחידת מידה"
        value={unit}
        onChange={(e) => setUnit(e.target.value as SizeUnit)}
      >
        <option value="mm">מ"מ</option>
        <option value="cm">ס"מ</option>
        <option value="inch">אינץ'</option>
      </select>
      <label className="ctx-resize-dim" title="רוחב">
        <span className="ctx-resize-axis">W</span>
        <input
          className="ctx-resize-input"
          min="0.1"
          step={unit === "inch" ? 0.001 : 0.1}
          type="number"
          value={inputW}
          onFocus={() => { wFocused.current = true; }}
          onChange={(e) => setInputW(e.target.value)}
          onBlur={(e) => { wFocused.current = false; commitWidth(e.target.value); }}
          onKeyDown={(e) => { if (e.key === "Enter") { commitWidth(e.currentTarget.value); e.currentTarget.blur(); } }}
        />
      </label>
      <button
        className={`ctx-aspect-lock${lockAspect ? " on" : ""}${isFrame ? " disabled" : ""}`}
        disabled={isFrame}
        title={lockAspect ? "שמור יחס (פעיל)" : "שמור יחס (כבוי)"}
        type="button"
        onClick={() => setLockAspect((v) => !v)}
      >
        {lockAspect ? <Link2 size={11} /> : <Unlink2 size={11} />}
      </button>
      <label className="ctx-resize-dim" title="גובה">
        <span className="ctx-resize-axis">H</span>
        <input
          className="ctx-resize-input"
          min="0.1"
          step={unit === "inch" ? 0.001 : 0.1}
          type="number"
          value={inputH}
          onFocus={() => { hFocused.current = true; }}
          onChange={(e) => setInputH(e.target.value)}
          onBlur={(e) => { hFocused.current = false; commitHeight(e.target.value); }}
          onKeyDown={(e) => { if (e.key === "Enter") { commitHeight(e.currentTarget.value); e.currentTarget.blur(); } }}
        />
      </label>
    </div>
  );
}

// ג”€ג”€ג”€ Image Context Toolbar ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

function ImageContextToolbar({
  canvasWidth,
  canvasHeight,
  dpi,
  layer,
  onDelete,
  onDuplicate,
  onEnterImageEditMode,
  onEnterMaskContentEditMode,
  onExitMaskContentEditMode,
  onMoveLayer,
  onPatch,
  onResetSmartScreenshotCrop,
  onSmartScreenshotCrop,
}: {
  canvasWidth: number;
  canvasHeight: number;
  dpi: number;
  layer: Extract<VisualLayer, { type: "image" | "frame" }>;
  onDelete: () => void;
  onDuplicate: () => void;
  onEnterImageEditMode: () => void;
  onEnterMaskContentEditMode: () => void;
  onExitMaskContentEditMode: () => void;
  onMoveLayer: (direction: "forward" | "backward" | "front" | "back") => void;
  onPatch: (patch: Partial<VisualLayer>) => void;
  onResetSmartScreenshotCrop: () => void;
  onSmartScreenshotCrop: () => void;
}): ReactElement {
  const isFrame = layer.type === "frame";
  const isCollageFrameProp = isFrame &&
    (layer.metadata["collageFrame"] as { isCollageFrame?: boolean } | undefined)?.isCollageFrame === true;

  // ג”€ג”€ג”€ Visual effects helpers ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
  const vfxStack: VisualEffectStack =
    ("visualEffects" in layer && layer.visualEffects !== undefined)
      ? layer.visualEffects
      : { version: 1, enabled: true, effects: [] };

  function patchVfx(next: VisualEffectStack): void {
    onPatch({ visualEffects: next } as Partial<VisualLayer>);
  }

  const shadowEffect = vfxStack.effects.find((e) => e.params.type === "dropShadow");
  const shadowEnabled = shadowEffect !== undefined && shadowEffect.enabled;
  const shadowParams = shadowEffect?.params as DropShadowEffect | undefined;

  function setShadowEnabled(enabled: boolean): void {
    if (!enabled) {
      patchVfx({ ...vfxStack, effects: vfxStack.effects.filter((e) => e.params.type !== "dropShadow") });
      return;
    }
    if (shadowEffect) {
      patchVfx({ ...vfxStack, effects: vfxStack.effects.map((e) => e.id === shadowEffect.id ? { ...e, enabled: true } : e) });
    } else {
      patchVfx({ ...vfxStack, effects: [...vfxStack.effects, makeDefaultEffect("dropShadow")] });
    }
  }

  function patchShadow(patch: Partial<DropShadowEffect>): void {
    if (!shadowEffect) {
      const newFx = makeDefaultEffect("dropShadow");
      patchVfx({ ...vfxStack, effects: [...vfxStack.effects, { ...newFx, enabled: true, params: { ...newFx.params, ...patch } as VisualEffectParams }] });
      return;
    }
    patchVfx({ ...vfxStack, effects: vfxStack.effects.map((e) => e.id === shadowEffect.id ? { ...e, enabled: true, params: { ...e.params, ...patch } as VisualEffectParams } : e) });
  }

  const strokeEffect = vfxStack.effects.find((e) => e.params.type === "stroke");
  const strokeEnabled = strokeEffect !== undefined && strokeEffect.enabled;
  const strokeParams = strokeEffect?.params as StrokeEffect | undefined;

  function setStrokeEnabled(enabled: boolean): void {
    if (!enabled) {
      patchVfx({ ...vfxStack, effects: vfxStack.effects.filter((e) => e.params.type !== "stroke") });
      return;
    }
    if (strokeEffect) {
      patchVfx({ ...vfxStack, effects: vfxStack.effects.map((e) => e.id === strokeEffect.id ? { ...e, enabled: true } : e) });
    } else {
      patchVfx({ ...vfxStack, effects: [...vfxStack.effects, makeDefaultEffect("stroke")] });
    }
  }

  function patchStroke(patch: Partial<StrokeEffect>): void {
    if (!strokeEffect) {
      const newFx = makeDefaultEffect("stroke");
      patchVfx({ ...vfxStack, effects: [...vfxStack.effects, { ...newFx, enabled: true, params: { ...newFx.params, ...patch } as VisualEffectParams }] });
      return;
    }
    patchVfx({ ...vfxStack, effects: vfxStack.effects.map((e) => e.id === strokeEffect.id ? { ...e, enabled: true, params: { ...e.params, ...patch } as VisualEffectParams } : e) });
  }

  // ג”€ג”€ג”€ Shape / metadata helpers ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
  const imageShape = (layer.metadata["imageShape"] as string | undefined) ?? "rect";
  const cornerRadius = (layer.metadata["imageCornerRadius"] as number | undefined) ?? 0;
  const flipH = (layer.metadata["flipH"] as boolean | undefined) ?? false;
  const flipV = (layer.metadata["flipV"] as boolean | undefined) ?? false;

  // Mask content edit mode — only relevant for free ImageLayer with a mask/clip
  const hasAnyMask = !isFrame && (
    (layer as Extract<VisualLayer, { type: "image" }>).pixelMask !== undefined ||
    imageShape !== "rect"
  );
  const isMaskContentEditMode = useMaskContentEditStore((s) => s.active && s.editingLayerId === layer.id);

  function patchMeta(patch: Record<string, string | number | boolean | null>): void {
    onPatch({ metadata: { ...layer.metadata, ...patch } as Record<string, import("@/types/primitives").JsonValue> });
  }

  // ג”€ג”€ג”€ Fit mode ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
  const fitMode = "fitMode" in layer ? (layer.fitMode as string) : "fit";

  // ג”€ג”€ג”€ Corner radius (FrameLayer has its own field, ImageLayer uses metadata) ג”€ג”€
  const frameCornerRadius = isFrame ? ((layer as Extract<VisualLayer, { type: "frame" }>).cornerRadius ?? 0) : cornerRadius;

  function setCornerRadius(v: number): void {
    if (isFrame) {
      onPatch({ cornerRadius: v } as Partial<VisualLayer>);
    } else {
      patchMeta({ imageCornerRadius: v });
    }
  }

  // ג”€ג”€ג”€ Fit to canvas ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
  function fitToCanvas(mode: "fill" | "fit"): void {
    if (layer.width <= 0 || layer.height <= 0) return;
    // Rotation-aware placement (see placeLayerToCanvas) so a rotated layer stays centered on-canvas.
    onPatch(placeLayerToCanvas(layer, canvasWidth, canvasHeight, mode) as Partial<VisualLayer>);
  }

  return (
    <section className="context-toolbar image-mode" aria-label="Image context toolbar" data-testid="context-toolbar">

      {/* Fit to canvas */}
      <ToolbarMenu label="התאם לקנבס" title="התאם לקנבס">
        <div className="context-menu-actions">
          <button
            className="context-menu-button"
            type="button"
            onClick={(e) => { fitToCanvas("fill"); (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); }}
          >
            התאמה מלאה
          </button>
          <button
            className="context-menu-button"
            type="button"
            onClick={(e) => { fitToCanvas("fit"); (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); }}
          >
            התאמה חלקית
          </button>
        </div>
      </ToolbarMenu>

      {/* Resize */}
      <ImageResizeControl dpi={dpi} layer={layer} onPatch={onPatch} />

      {/* Mask content repositioning — only for images with a mask/clip shape */}
      {hasAnyMask && (
        <div className="context-group">
          <button
            className={`context-toggle${isMaskContentEditMode ? " on" : ""}`}
            type="button"
            title={isMaskContentEditMode
              ? "סיים כוונון תמונה במסיכה (Esc)"
              : "כוונון תמונה בתוך המסיכה — גרירה מזיזה רק את התמונה פנימה"}
            onClick={isMaskContentEditMode ? onExitMaskContentEditMode : onEnterMaskContentEditMode}
          >
            {isMaskContentEditMode ? "סיום כוונון" : "כוונון בתוך מסיכה"}
          </button>
        </div>
      )}

      {/* Fit Mode */}
      <div className="context-group">
        <select
          className="context-select compact"
          title="מצב התאמה"
          value={fitMode}
          onChange={(e) => onPatch({ fitMode: e.target.value as "fit" | "fill" | "stretch" } as Partial<VisualLayer>)}
        >
          <option value="fit">Fit</option>
          <option value="fill">Fill</option>
          <option value="stretch">Stretch</option>
        </select>
      </div>

      {/* Shape (only for free ImageLayer) */}
      {!isFrame && (
        <ToolbarMenu label="Shape" title="צורת תמונה">
          <ShapePickerContent
            imageShape={imageShape}
            imageMaskLibId={(layer.metadata["imageMaskLibId"] as string | undefined) ?? null}
            onBasicShape={(s) => patchMeta({ imageShape: s, imageMaskDataUrl: null, imageMaskLibId: null })}
            onLibraryMask={async (entry) => {
              const processed = await generateMaskThumbnail(
                entry.fileDataUrl ?? "",
                entry.type as "svg" | "png",
                entry.thresholdEnabled,
                entry.thresholdColor,
                entry.thresholdTolerance,
                entry.thresholdFeather,
                1024
              );
              patchMeta({ imageShape: "mask_lib", imageMaskDataUrl: processed, imageMaskLibId: entry.id });
            }}
          />
        </ToolbarMenu>
      )}

      {/* Corner Radius */}
      <div className="context-group">
        <CompactRange label="Radius" min={0} max={80} value={frameCornerRadius} onChange={setCornerRadius} />
      </div>

      {/* Border / Stroke */}
      <ToolbarMenu label="Border" title="מסגרת">
        <label className="check-line">
          <input checked={strokeEnabled} type="checkbox" onChange={(e) => setStrokeEnabled(e.target.checked)} />
          הפעלה
        </label>
        {strokeEnabled && strokeParams !== undefined ? (
          <>
            <input className="context-color wide" type="color" value={strokeParams.color} onChange={(e) => patchStroke({ color: e.target.value })} />
            <SliderField label="עובי" min={0} max={40} value={strokeParams.width} onChange={(v) => patchStroke({ width: v })} unit=" px" />
            <SliderField label="שקיפות" min={0} max={1} step={0.01} decimals={2} value={strokeParams.opacity} onChange={(v) => patchStroke({ opacity: v })} />
          </>
        ) : null}
      </ToolbarMenu>

      {/* Shadow */}
      <ToolbarMenu label="Shadow" title="צל">
        <div className="context-menu-actions">
          <button className="context-menu-button" type="button" onClick={() => patchShadow({ color: "#000000", opacity: 0.22, blur: 16, offsetX: 0, offsetY: 8, spread: 0 })}>Soft</button>
          <button className="context-menu-button" type="button" onClick={() => patchShadow({ color: "#000000", opacity: 0.55, blur: 3, offsetX: 5, offsetY: 5, spread: 0 })}>Hard</button>
          <button className="context-menu-button" type="button" onClick={() => patchShadow({ color: "#111111", opacity: 0.8, blur: 0, offsetX: 8, offsetY: 8, spread: 0 })}>Retro</button>
        </div>
        <label className="check-line">
          <input checked={shadowEnabled} type="checkbox" onChange={(e) => setShadowEnabled(e.target.checked)} />
          הפעלה
        </label>
        {shadowEnabled && shadowParams !== undefined ? (
          <>
            <input className="context-color wide" type="color" value={shadowParams.color} onChange={(e) => patchShadow({ color: e.target.value })} />
            <SliderField label="שקיפות" min={0} max={1} step={0.01} decimals={2} value={shadowParams.opacity} onChange={(v) => patchShadow({ opacity: v })} />
            <SliderField label="טשטוש" min={0} max={80} value={shadowParams.blur} onChange={(v) => patchShadow({ blur: v })} unit=" px" />
            <SliderField label="X" min={-80} max={80} value={shadowParams.offsetX} onChange={(v) => patchShadow({ offsetX: v })} />
            <SliderField label="Y" min={-80} max={80} value={shadowParams.offsetY} onChange={(v) => patchShadow({ offsetY: v })} />
          </>
        ) : null}
      </ToolbarMenu>

      {/* Opacity + Rotate + Flip */}
      <div className="context-group">
        <CompactRange label="Opacity" min={0} max={1} step={0.01} value={layer.opacity} onChange={(v) => onPatch({ opacity: v } as Partial<VisualLayer>)} />
        <BlendModeSelect value={layer.blendMode} onChange={(blendMode) => onPatch({ blendMode } as Partial<VisualLayer>)} />
      </div>
      <ToolbarMenu label="Image" title="Image">
        <div className="context-menu-actions">
          <button className="context-menu-button" type="button" onClick={onSmartScreenshotCrop}>
            <Scissors size={13} /> חתוך שוליים שחורים
          </button>
          <button className="context-menu-button" type="button" onClick={onResetSmartScreenshotCrop}>
            <RotateCcw size={13} /> אפס חיתוך שוליים
          </button>
        </div>
      </ToolbarMenu>
      <ToolbarMenu label="סיבוב והיפוך" title="סיבוב והיפוך">
        <button className="context-menu-button" type="button" onClick={() => rotateSelectionByEvent(90)}><RotateCw size={13} /> סובב 90° עם כיוון השעון</button>
        <button className="context-menu-button" type="button" onClick={() => rotateSelectionByEvent(-90)}><RotateCcw size={13} /> סובב 90° נגד כיוון השעון</button>
        <button className="context-menu-button" type="button" onClick={() => rotateSelectionByEvent(180)}><RotateCw size={13} /> סובב 180°</button>
        <div className="context-divider" />
        <button className={`context-menu-button${flipH ? " on" : ""}`} type="button" onClick={() => patchMeta({ flipH: !flipH })}><FlipHorizontal size={13} /> היפוך אופקי</button>
        <button className={`context-menu-button${flipV ? " on" : ""}`} type="button" onClick={() => patchMeta({ flipV: !flipV })}><FlipVertical size={13} /> היפוך אנכי</button>
      </ToolbarMenu>

      {/* Image Edit Mode entry — only for free ImageLayer */}
      {layer.type === "image" && (
        <div className="context-group">
          <button className="context-icon" title="עריכת תמונה — קרופ, מחיקה, שרביט קסם" type="button" onClick={onEnterImageEditMode}>
            <Eraser size={14} />
            <span className="ctx-btn-label">עריכה</span>
          </button>
        </div>
      )}

      {/* Arrange + Actions */}
      <div className="context-group">
        <ToolbarButton icon={Copy} label="שכפל" onClick={onDuplicate} />
        <ToolbarButton active={layer.locked} icon={layer.locked ? Lock : Unlock} label={layer.locked ? "שחרר נעילה" : "נעל שכבה"} onClick={() => onPatch({ locked: !layer.locked } as Partial<VisualLayer>)} />
        <ToolbarButton icon={ChevronsUp} label="הבא קדימה" onClick={() => onMoveLayer("forward")} />
        <ToolbarButton icon={ChevronsDown} label="שלח אחורה" onClick={() => onMoveLayer("backward")} />
        <ToolbarButton danger icon={Trash2} label="מחק" onClick={onDelete} />
      </div>
    </section>
  );
}

function ToolbarButton({ active = false, danger = false, icon: Icon, label, onClick }: { active?: boolean; danger?: boolean; icon: LucideIcon; label: string; onClick: () => void; }): ReactElement {
  return <button className={`context-icon ${active ? "on" : ""} ${danger ? "danger" : ""}`} onClick={onClick} title={label} type="button"><Icon size={14} /></button>;
}

function ToolbarMenu({ children, label, title }: { children: ReactNode; label: string; title: string }): ReactElement {
  const [open, setOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
  const menuRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(`menu_${Math.random().toString(36).slice(2)}`);

  const positionPopover = useCallback(() => {
    const node = menuRef.current;
    if (node === null) return;
    const button = node.querySelector<HTMLButtonElement>(".context-menu-summary");
    if (button === null) return;
    const rect = button.getBoundingClientRect();
    const width = Math.min(336, Math.max(260, window.innerWidth - 16));
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width));
    const top = Math.min(window.innerHeight - 96, rect.bottom + 8);
    setPopoverStyle({
      left,
      top,
      width,
      maxHeight: Math.max(180, window.innerHeight - top - 12)
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    positionPopover();
    const closeOnPointer = (event: MouseEvent): void => {
      if (menuRef.current?.contains(event.target as Node) !== true) setOpen(false);
    };
    const closeOnKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    const closeFromSibling = (event: Event): void => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      if (detail?.id !== idRef.current) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnPointer);
    document.addEventListener("keydown", closeOnKey);
    window.addEventListener("resize", positionPopover);
    window.addEventListener("scroll", positionPopover, true);
    window.addEventListener("spp2:close-context-menus", closeFromSibling);
    return () => {
      document.removeEventListener("mousedown", closeOnPointer);
      document.removeEventListener("keydown", closeOnKey);
      window.removeEventListener("resize", positionPopover);
      window.removeEventListener("scroll", positionPopover, true);
      window.removeEventListener("spp2:close-context-menus", closeFromSibling);
    };
  }, [open, positionPopover]);

  function toggle(): void {
    setOpen((current) => {
      const next = !current;
      if (next) {
        window.dispatchEvent(new CustomEvent("spp2:close-context-menus", { detail: { id: idRef.current } }));
        requestAnimationFrame(positionPopover);
      }
      return next;
    });
  }

  return (
    <div className={`context-menu${open ? " open" : ""}`} ref={menuRef}>
      <button className="context-menu-summary" title={title} type="button" aria-expanded={open} onClick={toggle}>
        {label}
      </button>
      {open ? <div className="context-popover" style={popoverStyle}>{children}</div> : null}
    </div>
  );
}

function BlendModeSelect({ value, onChange }: { value: BlendMode; onChange: (value: BlendMode) => void }): ReactElement {
  return (
    <label className="blend-mode-control" title="Blend mode">
      <span>Blend</span>
      <select value={value} onChange={(event) => onChange(event.target.value as BlendMode)}>
        {BLEND_MODE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function ShapePickerContent({
  imageShape,
  imageMaskLibId,
  onBasicShape,
  onLibraryMask
}: {
  imageShape: string;
  imageMaskLibId: string | null;
  onBasicShape: (shape: "rect" | "rounded" | "circle" | "ellipse") => void;
  onLibraryMask: (entry: import("@/state/maskLibraryStore").MaskLibraryEntry) => Promise<void>;
}): ReactElement {
  const libraryEntries = useMaskLibraryStore((s) => s.entries);
  const [applying, setApplying] = useState<string | null>(null);

  async function handleLibraryMask(entry: import("@/state/maskLibraryStore").MaskLibraryEntry): Promise<void> {
    setApplying(entry.id);
    try {
      await onLibraryMask(entry);
    } finally {
      setApplying(null);
    }
  }

  return (
    <>
      <div className="context-menu-actions shape-picker">
        {(["rect", "rounded", "circle", "ellipse"] as const).map((s) => (
          <button
            className={`context-menu-button${imageShape === s ? " on" : ""}`}
            key={s}
            type="button"
            onClick={() => onBasicShape(s)}
          >
            {s === "rect" && <><Square size={13} /> מרובע</>}
            {s === "rounded" && <><SquareRoundCorner size={13} /> עגול</>}
            {s === "circle" && <><Circle size={13} /> עיגול</>}
            {s === "ellipse" && <><Circle size={13} /> אליפסה</>}
          </button>
        ))}
      </div>

      {libraryEntries.length > 0 && (
        <>
          <div className="context-menu-section-label">ספריית מסיכות</div>
          <div className="shape-lib-grid">
            {libraryEntries.map((entry) => {
              const isActive = imageShape === "mask_lib" && imageMaskLibId === entry.id;
              const isLoading = applying === entry.id;
              return (
                <button
                  key={entry.id}
                  className={`shape-lib-item${isActive ? " on" : ""}`}
                  title={entry.name}
                  type="button"
                  disabled={isLoading}
                  onClick={() => void handleLibraryMask(entry)}
                >
                  <div className="shape-lib-thumb">
                    {isLoading ? (
                      <div className="shape-lib-spinner" />
                    ) : entry.thumbnailDataUrl ? (
                      <img src={entry.thumbnailDataUrl} alt={entry.name} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", background: "var(--bg-surface)" }} />
                    )}
                  </div>
                  <span className="shape-lib-name">{entry.name}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function CompactRange({ label, min, max, step = 1, value, onChange }: { label: string; min: number; max: number; step?: number; value: number; onChange: (value: number) => void; }): ReactElement {
  const [localValue, setLocalValue] = useState(value);
  const isDragging = useRef(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isDragging.current) setLocalValue(value);
  }, [value]);

  function commit(v: number): void {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => { rafRef.current = null; onChange(v); });
  }

  return (
    <label className="compact-range" title={label}>
      <span>{label}</span>
      <input
        max={max}
        min={min}
        step={step}
        type="range"
        value={localValue}
        onPointerDown={() => { isDragging.current = true; }}
        onPointerUp={(e) => {
          isDragging.current = false;
          const v = Number(e.currentTarget.value);
          setLocalValue(v);
          if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
          onChange(v);
        }}
        onChange={(e) => { const v = Number(e.target.value); setLocalValue(v); commit(v); }}
      />
    </label>
  );
}

function createTextEffect(effectType: TextEffect["effectType"]): TextEffect {
  const id = `${effectType}_${Date.now()}`;
  const defaults: TextEffect["params"] =
    effectType === "outer_glow"
      ? { color: "#ffffff", outerColor: "#7dd3fc", opacity: 0.8, angle: 0, distance: 0, blur: 24, spread: 6, passes: 3 }
      : effectType === "pattern_overlay"
      ? { patternType: "diagonal_shine", foreground: "#ffffff", opacity: 0.35, scale: 1, rotation: -18, spacing: 14 }
      : effectType === "sparkle"
      ? { density: 0.24, size: 6, color: "#ffffff", seed: 9, opacity: 0.85, rays: 8, glint: 0.75, halo: 0.7 }
      : effectType === "extrude_3d"
      ? { color: "#333333", depth: 12, offsetX: 1, offsetY: 1, steps: 12, opacity: 0.85 }
      : effectType === "bevel_emboss"
      ? { style: "inner_bevel", technique: "smooth", depth: 5, size: 5, soften: 1, highlightColor: "#ffffff", shadowColor: "#000000" }
      : {};
  return { version: 1, id, effectId: id, effectType, enabled: true, opacity: 0.8, blendMode: "normal", params: defaults };
}

function ToolButton({
  active,
  icon: Icon,
  label,
  onClick,
  testId
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  testId: string;
}): ReactElement {
  return (
    <button className={`tool ${active ? "active" : ""}`} data-testid={testId} onClick={onClick} type="button">
      <Icon size={18} strokeWidth={1.8} />
      <span className="tip">{label}</span>
    </button>
  );
}

// ג”€ג”€ג”€ Panel header ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

function PanelHeader({ selectedLayer }: { selectedLayer: VisualLayer | null }): ReactElement {
  return (
    <header className="panel-header">
      <h2 className="panel-title">{selectedLayer === null ? "מסמך" : selectedLayer.name}</h2>
      <span className="panel-pill">{selectedLayer === null ? "ללא בחירה" : selectedLayer.type}</span>
    </header>
  );
}

// ג”€ג”€ג”€ Accordion section ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

function AccordionSection({
  title,
  children,
  defaultOpen = true
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}): ReactElement {
  return (
    <details className="accordion-section" open={defaultOpen}>
      <summary>
        {title}
        <ChevronDown className="accordion-chevron" size={14} />
      </summary>
      <div className="accordion-content">
        {children}
      </div>
    </details>
  );
}

// ג”€ג”€ג”€ Template Save Modal ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

function TemplateSaveModal({
  initialName,
  onConfirm,
  onCancel,
}: {
  initialName: string;
  onConfirm: (name: string) => void | Promise<void>;
  onCancel: () => void;
}): ReactElement {
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === "Enter" && name.trim()) onConfirm(name);
    if (e.key === "Escape") onCancel();
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "var(--color-surface, #17233d)",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 14, padding: "26px 28px", width: 340,
          display: "flex", flexDirection: "column", gap: 14, direction: "rtl",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Zap size={16} style={{ color: "#c084fc", flexShrink: 0 }} />
          <strong style={{ fontSize: 15 }}>שמירה כתבנית ייצור</strong>
        </div>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--color-text-secondary, #aebbd0)", lineHeight: 1.5 }}>
          התבנית תישמר בספריית ייצור סדרתי ותהיה זמינה להפקה.
        </p>
        <input
          ref={inputRef}
          dir="auto"
          placeholder="שם התבנית"
          style={{
            padding: "8px 10px",
            borderRadius: 8, border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.06)", color: "inherit",
            fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box",
          }}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 13 }}
            onClick={onCancel}
            type="button"
          >
            ביטול
          </button>
          <button
            disabled={!name.trim()}
            style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "#a855f7", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: name.trim() ? 1 : 0.5 }}
            onClick={() => name.trim() && onConfirm(name)}
            type="button"
          >
            שמור תבנית
          </button>
        </div>
      </div>
    </div>
  );
}

function CloudSaveAsModal({
  initialName,
  onConfirm,
  onCancel,
}: {
  initialName: string;
  onConfirm: (name: string) => void | Promise<void>;
  onCancel: () => void;
}): ReactElement {
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === "Enter" && name.trim()) void onConfirm(name);
    if (e.key === "Escape") onCancel();
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "var(--color-surface, #17233d)",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 14, padding: "26px 28px", width: 340,
          display: "flex", flexDirection: "column", gap: 14, direction: "rtl",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CloudUpload size={16} style={{ color: "#60a5fa", flexShrink: 0 }} />
          <strong style={{ fontSize: 15 }}>שמירה בענן בשם</strong>
        </div>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--color-text-secondary, #aebbd0)", lineHeight: 1.5 }}>
          בחרו שם לפרויקט שיישמר בענן.
        </p>
        <input
          ref={inputRef}
          dir="auto"
          placeholder="שם הפרויקט"
          style={{
            padding: "8px 10px",
            borderRadius: 8, border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.06)", color: "inherit",
            fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box",
          }}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 13 }}
            onClick={onCancel}
            type="button"
          >
            ביטול
          </button>
          <button
            disabled={!name.trim()}
            style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: name.trim() ? 1 : 0.5 }}
            onClick={() => name.trim() && void onConfirm(name)}
            type="button"
          >
            שמור בענן
          </button>
        </div>
      </div>
    </div>
  );
}

// ג”€ג”€ג”€ Batch Variable Section ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

function BatchVariableSection({
  layerId,
  layerType,
  batchField,
  onFieldChange,
}: {
  layerId: string;
  layerType: "frame" | "text";
  batchField: BatchVariableField | undefined;
  onFieldChange: (field: BatchVariableField | null) => void;
}): ReactElement {
  const isEnabled = batchField !== undefined;

  function toggle(): void {
    if (isEnabled) {
      onFieldChange(null);
      return;
    }
    if (layerType === "frame") {
      onFieldChange({
        id: "photo",
        type: "image",
        layerId,
        label: "תמונה",
        fitMode: "cover",
        smartCrop: false,
        preserveMask: true,
        applyImageAdjustmentsByDefault: false,
      });
    } else {
      onFieldChange({
        id: "name",
        type: "text",
        layerId,
        label: "שם",
        sourceField: "name",
        preserveTextStyle: true,
        autoResize: true,
        minFontScale: 0.7,
      });
    }
  }

  return (
    <AccordionSection title="ייצור סדרתי" defaultOpen={isEnabled}>
      <div className="batch-var-enabled-row">
        <button
          className={isEnabled ? "toggle on" : "toggle"}
          onClick={toggle}
          type="button"
        >
          <Zap size={13} />
          שדה משתנה
        </button>
        {isEnabled && (
          <span className="batch-var-badge-inline">
            {batchField!.type === "image" ? "VAR IMG" : "VAR TXT"}
          </span>
        )}
      </div>

      {isEnabled && batchField && (
        <div className="batch-variable-fields">
          <label>
            מזהה שדה
            <input
              type="text"
              value={batchField.id}
              onChange={(e) => onFieldChange({ ...batchField, id: e.target.value })}
            />
          </label>
          <label>
            תווית
            <input
              type="text"
              value={batchField.label}
              onChange={(e) => onFieldChange({ ...batchField, label: e.target.value })}
            />
          </label>

          {batchField.type === "image" && (
            <>
              <label>
                התאמת תמונה
                <select
                  value={batchField.fitMode}
                  onChange={(e) =>
                    onFieldChange({
                      ...batchField,
                      fitMode: e.target.value as "cover" | "contain" | "fill",
                    })
                  }
                >
                  <option value="cover">Cover (מלא)</option>
                  <option value="contain">Contain (כולל)</option>
                  <option value="fill">Fill (נמתח)</option>
                </select>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={batchField.applyImageAdjustmentsByDefault}
                  onChange={(e) =>
                    onFieldChange({ ...batchField, applyImageAdjustmentsByDefault: e.target.checked })
                  }
                />
                העבר כוונוני תמונה לכל הרשומות
              </label>
            </>
          )}

          {batchField.type === "text" && (
            <>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={batchField.autoResize}
                  onChange={(e) => onFieldChange({ ...batchField, autoResize: e.target.checked })}
                />
                התאמת גודל אוטומטית
              </label>
              <label>
                גודל פונט מינימלי
                <div className="range-row">
                  <input
                    type="range"
                    min={0.5}
                    max={1}
                    step={0.05}
                    value={batchField.minFontScale}
                    onChange={(e) =>
                      onFieldChange({ ...batchField, minFontScale: Number(e.target.value) })
                    }
                  />
                  <span>{Math.round(batchField.minFontScale * 100)}%</span>
                </div>
              </label>
            </>
          )}
        </div>
      )}
    </AccordionSection>
  );
}

// ג”€ג”€ג”€ Empty inspector state ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

function EmptyInspectorState(): ReactElement {
  return (
    <div className="empty-inspector">
      <Layers className="empty-inspector-icon" size={32} />
      <strong>לא נבחרה שכבה</strong>
      <p>בחר אובייקט בקנבס<br />כדי לערוך את מאפייניו.</p>
    </div>
  );
}

// ג”€ג”€ג”€ Text Studio ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

function TextStudio({
  hasTextStyleClipboard,
  layer,
  batchField,
  onApplyPreset,
  onBatchFieldChange,
  onCopyTextStyle,
  onDelete,
  onNotify,
  onPatch,
  onPasteTextStyle,
  selectedTextRange,
  onTextSelectionChange,
  onTextChange
}: {
  hasTextStyleClipboard: boolean;
  layer: Extract<VisualLayer, { type: "text" }>;
  batchField?: BatchVariableField;
  onApplyPreset: (preset: TextPreset) => void;
  onBatchFieldChange: (field: BatchVariableField | null) => void;
  onCopyTextStyle: () => void;
  onDelete: () => void;
  onNotify?: (message: string) => void;
  onPatch: (patch: Partial<VisualLayer>) => void;
  onPasteTextStyle: () => void;
  selectedTextRange: TextSelectionRange | null;
  onTextSelectionChange: (selection: TextSelectionRange | null) => void;
  onTextChange: (text: string) => void;
}): ReactElement {
  return (
    <>
      <AccordionSection title="טיפוגרפיה" defaultOpen={true}>
        <TextControls
          hasTextStyleClipboard={hasTextStyleClipboard}
          layer={layer}
          onApplyPreset={onApplyPreset}
          onCopyTextStyle={onCopyTextStyle}
          onNotify={onNotify}
          onPasteTextStyle={onPasteTextStyle}
          onPatch={onPatch}
          selectedTextRange={selectedTextRange}
          onTextSelectionChange={onTextSelectionChange}
          onTextChange={onTextChange}
        />
      </AccordionSection>
      <AccordionSection title="מיקום ונעילה" defaultOpen={false}>
        <div className="field-grid">
          <Metric label="X" value={layer.x} />
          <Metric label="Y" value={layer.y} />
          <Metric label="W" value={layer.width} />
          <Metric label="H" value={layer.height} />
        </div>
        <div className="quick-controls">
          <button
            className={layer.visible ? "toggle on" : "toggle"}
            onClick={() => onPatch({ visible: !layer.visible } as Partial<VisualLayer>)}
            type="button"
          >
            {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
            תצוגה
          </button>
          <button
            className={layer.locked ? "toggle on" : "toggle"}
            onClick={() => onPatch({ locked: !layer.locked } as Partial<VisualLayer>)}
            type="button"
          >
            {layer.locked ? <Lock size={14} /> : <Unlock size={14} />}
            נעילה
          </button>
        </div>
      </AccordionSection>
      <BatchVariableSection
        layerId={layer.id}
        layerType="text"
        batchField={batchField}
        onFieldChange={onBatchFieldChange}
      />
      <div className="accordion-content">
        <button className="btn-block btn-danger" onClick={onDelete} type="button">
          <Trash2 size={14} />
          מחק שכבה
        </button>
      </div>
    </>
  );
}

// ג”€ג”€ג”€ Smart Tips Panel ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

import { PHOTO_TIPS, TIP_CATEGORIES, CATEGORY_LABELS, PARAM_MAP } from "@/data/photoTipsData";
import type { PhotoTip } from "@/data/photoTipsData";

const TIP_TEXT_HE: Record<string, { title: string; problem: string; symptoms: string[] }> = {
  dark_photo: {
    title: "התמונה כהה מדי",
    problem: "חסר אור בתמונה ופרטים חשובים של הנושא נבלעים בצללים.",
    symptoms: ["התמונה נראית עמומה", "פנים לא מספיק ברורות", "ההיסטוגרמה נוטה שמאלה"],
  },
  too_bright: {
    title: "התמונה בהירה מדי",
    problem: "אזורים בהירים משתלטים ועלולים לאבד פרטים.",
    symptoms: ["אזורים לבנים כמעט בלי פרטים", "פנים נראות שטופות", "ההיסטוגרמה נוטה ימינה"],
  },
  flat_photo: {
    title: "תמונה שטוחה / עומק נמוך",
    problem: "ההפרדה בין כהים, ביניים ובהירים חלשה.",
    symptoms: ["אין תחושת עומק", "הכול נראה אפור או דהוי", "קצוות מרגישים חלשים"],
  },
  too_much_contrast: {
    title: "הקונטרסט חזק מדי",
    problem: "התמונה נראית קשה, עם צללים חסומים או אורות שרופים.",
    symptoms: ["אזורים כהים מאבדים פרטים", "אורות נראים קשים", "פנים נראות דרמטיות מדי"],
  },
  red_photo: {
    title: "התמונה אדומה מדי",
    problem: "התמונה חמה מדי או גווני עור אדומים/כתומים מדי.",
    symptoms: ["עור נראה אדום או כתום", "כל התמונה מרגישה חמה מדי", "לבנים מקבלים גוון"],
  },
  cold_blue_photo: {
    title: "התמונה כחולה או קרה מדי",
    problem: "התמונה קרה וחסרה חמימות טבעית.",
    symptoms: ["עור נראה חיוור או כחול", "תאורת פנים לא טבעית", "לבנים נראים כחולים"],
  },
  weak_colors: {
    title: "צבעים חלשים או דהויים",
    problem: "לתמונה חסרה חיות צבע.",
    symptoms: ["צבעים נראים דהויים", "התמונה מרגישה חסרת חיים", "בהדפסה התוצאה עלולה להיות עמומה"],
  },
  oversaturated_colors: {
    title: "צבעים חזקים מדי",
    problem: "הצבעים נראים לא טבעיים או זרחניים.",
    symptoms: ["דשא או בגדים נראים זרחניים", "עור נראה כתום", "בהדפסה הצבע עלול להיות רווי מדי"],
  },
  dark_faces: {
    title: "פנים כהות מדי",
    problem: "הפנים אינן מקבלות מספיק אור ביחס לשאר התמונה.",
    symptoms: ["העיניים לא ברורות", "הפנים בצל", "הרקע בהיר יותר מהנושא"],
  },
  red_skin: {
    title: "עור אדום מדי",
    problem: "גווני העור נוטים לאדום או כתום.",
    symptoms: ["לחיים אדומות מדי", "עור נראה כתום", "הלבן בעיניים מקבל גוון"],
  },
  soft_faces: {
    title: "פנים רכות או מטושטשות",
    problem: "הפנים חסרות חדות או פרטים.",
    symptoms: ["עיניים לא חדות", "פרטי שיער חלשים", "הפנים נראות רכות מדי"],
  },
  soft_photo: {
    title: "התמונה רכה מדי",
    problem: "לתמונה חסרה חדות כללית.",
    symptoms: ["קצוות לא חדים", "פרטים עדינים נעלמים", "הדפסה עלולה להיראות רכה"],
  },
  noisy_photo: {
    title: "רעש או גרעיניות",
    problem: "בתמונה יש רעש דיגיטלי או גרעיניות בולטת.",
    symptoms: ["רעש באזורים כהים", "שמיים או קירות מגורענים", "פרטים נראים מלוכלכים"],
  },
  too_small_for_print: {
    title: "קטנה מדי להדפסה",
    problem: "רזולוציית התמונה נמוכה ביחס לגודל ההדפסה.",
    symptoms: ["מעט פיקסלים", "התמונה נראית מפוקסלת בזום", "גודל ההדפסה גדול"],
  },
  off_center_photo: {
    title: "הנושא לא ממורכז",
    problem: "הקומפוזיציה משאירה את הנושא במקום פחות מאוזן.",
    symptoms: ["יותר מדי שטח ריק בצד אחד", "הנושא קרוב מדי לקצה", "הפריים מרגיש לא מאוזן"],
  },
  crooked_photo: {
    title: "התמונה עקומה",
    problem: "האופק או קווים אנכיים אינם ישרים.",
    symptoms: ["האופק נטוי", "מבנים נראים עקומים", "הקומפוזיציה מרגישה לא יציבה"],
  },
  subject_focus: {
    title: "הדגשת הנושא",
    problem: "הנושא לא מספיק נפרד מהרקע.",
    symptoms: ["הרקע מתחרה בנושא", "אין מוקד ברור", "העין לא יודעת איפה להתמקד"],
  },
  depth_bokeh: {
    title: "הוספת עומק / תחושת בוקה",
    problem: "התמונה מרגישה שטוחה והרקע מושך תשומת לב.",
    symptoms: ["הרקע חד מדי", "אין הפרדה בין שכבות", "התמונה פחות מקצועית"],
  },
  cinematic_look: {
    title: "מראה קולנועי / מקצועי",
    problem: "התמונה תקינה אבל חסר לה אופי עיבודי.",
    symptoms: ["הצבעים פשוטים מדי", "אין עומק טונאלי", "התוצאה מרגישה רגילה"],
  },
  print_dark: {
    title: "ההדפסה יוצאת כהה מדי",
    problem: "בהדפסה התמונה עלולה להיראות כהה יותר מהמסך.",
    symptoms: ["פרטים בצללים נעלמים", "התוצאה פחות פתוחה", "נייר מט או קנבס מכהים את התמונה"],
  },
  print_red_skin: {
    title: "עור מודפס אדום מדי",
    problem: "גווני עור עלולים לצאת חמים/אדומים בהדפסה.",
    symptoms: ["לחיים יוצאות אדומות", "עור נראה כתום", "תאורת פנים חמה מדי"],
  },
  print_weak_colors: {
    title: "צבעים חלשים בהדפסה",
    problem: "הפלט המודפס נראה פחות חי מהמסך.",
    symptoms: ["צבעים דהויים", "מוצרים חסרי נוכחות", "קנבס או מט מורידים רוויה"],
  },
  canvas_prep: {
    title: "הכנה לקנבס",
    problem: "הדפסה על קנבס דורשת הגנה על אורות וחיזוק עדין.",
    symptoms: ["פרטים בהירים עלולים להישרף", "המרקם מרכך פרטים", "צבעים נראים פחות חדים"],
  },
  sublimation_prep: {
    title: "הכנה לסובלימציה",
    problem: "סובלימציה דורשת צבע וקונטרסט מבוקרים יותר.",
    symptoms: ["צבעים יכולים לצאת חלשים", "פרטים קטנים מתרככים", "גווני עור צריכים הגנה"],
  },
};

const TOOL_LABEL_HE: Record<string, string> = {
  Exposure: "חשיפה",
  Shadows: "צללים",
  Brightness: "בהירות",
  Contrast: "קונטרסט",
  Highlights: "אורות",
  Whites: "לבנים",
  Blacks: "שחורים",
  Clarity: "בהירות מקומית",
  Temperature: "טמפרטורה",
  Tint: "גוון",
  Saturation: "רוויה",
  Vibrance: "חיות צבע",
  Upscale: "הגדלת רזולוציה",
  "Print Mode": "מצב הדפסה",
  "Print Sharpness": "חדות להדפסה",
  HSL: "HSL",
  "HSL Red/Orange": "HSL אדום/כתום",
};

const ACTION_LABEL_HE: Record<string, string> = {
  "Raise gently": "להעלות בעדינות",
  "Lower gently": "להוריד בעדינות",
  "Open dark areas": "לפתוח אזורים כהים",
  "Use only if it is still dark": "להשתמש רק אם עדיין כהה",
  "Add a little if the image becomes flat": "להוסיף מעט אם התמונה נהיית שטוחה",
  "Recover bright areas": "להחזיר פרטים באזורים בהירים",
  "Lower if clipping remains": "להוריד אם עדיין יש שריפה",
  "Add a little if needed": "להוסיף מעט לפי הצורך",
  "Raise slightly": "להעלות מעט",
  "Raise first": "להעלות קודם",
  "Add subtle depth": "להוסיף עומק עדין",
  "Reduce contrast": "להפחית קונטרסט",
  "Reduce bright regions": "להפחית אזורים בהירים",
  "Lift black point a little": "להרים מעט את נקודת השחור",
  "Cool the image slightly": "לקרר מעט את התמונה",
  "Move slightly toward green": "להזיז מעט לכיוון ירוק",
  "Warm the image": "לחמם את התמונה",
  "Add a small magenta correction if needed": "להוסיף מעט מג׳נטה אם צריך",
  "Recover weak colors gently": "להחזיר צבעים חלשים בעדינות",
  "Reduce gently": "להפחית בעדינות",
  "Lower globally": "להוריד באופן כללי",
  "Lower if weak colors also look too strong": "להוריד אם גם צבעים חלשים נראים חזקים מדי",
  "Reduce only the problem color": "להפחית רק את הצבע הבעייתי",
  "Use AI upscaling": "להשתמש בהגדלת AI",
  "Use General Print Safe": "להשתמש במצב הדפסה בטוח",
  "Use material-specific boost": "להשתמש בחיזוק לפי חומר",
  "Use Canvas Print Boost": "להשתמש בחיזוק לקנבס",
  "Use Sublimation Boost": "להשתמש בחיזוק לסובלימציה",
  "Use gently": "להשתמש בעדינות",
};

const TIP_TEXT_HE_DISPLAY: Record<string, { title: string; problem: string; symptoms: string[] }> = {
  ...TIP_TEXT_HE,
  dark_photo: {
    title: "התמונה כהה מדי",
    problem: "התמונה חסרה אור ופרטים חשובים בנושא נבלעים בצללים.",
    symptoms: ["התמונה נראית עמומה", "פנים לא ברורות", "ההיסטוגרמה נוטה שמאלה"]
  },
  too_bright: {
    title: "התמונה בהירה מדי",
    problem: "אזורים בהירים מדי מאבדים פרטים ויכולים להיראות שרופים.",
    symptoms: ["שמיים או חולצות לבנות נשרפים", "פנים נראות שטוחות", "הקונטרסט מרגיש חלש"]
  },
  flat_photo: {
    title: "תמונה שטוחה / עומק נמוך",
    problem: "התמונה חסרה הפרדה בין האזורים הבהירים והכהים.",
    symptoms: ["המראה אפרפר", "אין תחושת עומק", "הנושא לא קופץ קדימה"]
  },
  too_much_contrast: {
    title: "קונטרסט חזק מדי",
    problem: "הפער בין אור לצל אגרסיבי מדי ומסתיר פרטים.",
    symptoms: ["צללים חסומים", "אזורים בהירים קשים", "פנים נראות דרמטיות מדי"]
  },
  red_photo: {
    title: "התמונה אדמדמה",
    problem: "איזון הצבעים חם מדי וגורם לעור וללבן להיראות אדומים.",
    symptoms: ["עור אדום", "לבן נראה ורוד", "כל התמונה חמה מדי"]
  },
  cold_blue_photo: {
    title: "התמונה קרה / כחולה",
    problem: "איזון הצבעים קר מדי והצילום מאבד חמימות טבעית.",
    symptoms: ["עור נראה חיוור", "לבן נוטה לכחול", "האווירה קרה מדי"]
  },
  weak_colors: {
    title: "צבעים חלשים",
    problem: "הצבעים חסרי חיים וההדפסה עלולה לצאת דהויה.",
    symptoms: ["צבעים דהויים", "שמיים או בגדים חסרי עומק", "התמונה נראית ישנה"]
  },
  oversaturated_colors: {
    title: "צבעים רוויים מדי",
    problem: "הצבעים חזקים מדי ופוגעים במראה טבעי, בעיקר בפנים.",
    symptoms: ["עור כתום", "ירוקים זוהרים", "אדומים משתלטים"]
  },
  dark_faces: {
    title: "פנים כהות",
    problem: "הפנים חשוכות יחסית לרקע וצריכות פתיחה עדינה.",
    symptoms: ["עיניים לא ברורות", "צללים על הפנים", "הרקע נראה תקין אבל הפנים כהות"]
  },
  red_skin: {
    title: "עור אדום מדי",
    problem: "גווני העור נוטים לאדום או כתום וצריכים איזון ממוקד.",
    symptoms: ["לחיים אדומות מדי", "עור כתום", "פנים לא טבעיות"]
  },
  soft_faces: {
    title: "פנים רכות",
    problem: "פרטי הפנים חסרים חדות או מיקרו-קונטרסט.",
    symptoms: ["עיניים רכות", "שיער חסר פירוט", "הפנים נראות מעט מטושטשות"]
  },
  soft_photo: {
    title: "התמונה רכה",
    problem: "כל התמונה חסרה חדות וצריכה חיזוק עדין או הגדלת AI.",
    symptoms: ["קצוות לא חדים", "טקסטורה חלשה", "הדפסה גדולה תדגיש את הרכות"]
  },
  noisy_photo: {
    title: "רעש בתמונה",
    problem: "גרעיניות או רעש דיגיטלי מורידים איכות, במיוחד באזורים כהים.",
    symptoms: ["נקודות צבע", "צללים מלוכלכים", "שמיים לא חלקים"]
  },
  too_small_for_print: {
    title: "קטנה מדי להדפסה",
    problem: "הרזולוציה לא מספיקה לגודל ההדפסה הרצוי.",
    symptoms: ["פיקסלים בולטים", "קצוות משוננים", "איכות יורדת בהגדלה"]
  },
  off_center_photo: {
    title: "קומפוזיציה לא ממורכזת",
    problem: "הנושא לא יושב טוב בתוך המסגרת או קרוב מדי לקצה.",
    symptoms: ["מרווח לא מאוזן", "חלק חשוב קרוב לחיתוך", "התמונה מרגישה לא יציבה"]
  },
  crooked_photo: {
    title: "התמונה עקומה",
    problem: "קו האופק או אלמנטים אנכיים לא מיושרים.",
    symptoms: ["אופק נוטה", "מבנים עקומים", "תחושה שהתמונה נופלת לצד"]
  },
  subject_focus: {
    title: "הנושא לא בולט",
    problem: "הרקע מתחרה בנושא המרכזי וצריך הפרדה עדינה.",
    symptoms: ["העין לא יודעת לאן להסתכל", "רקע עמוס", "הנושא נטמע בתמונה"]
  },
  depth_bokeh: {
    title: "הוספת עומק",
    problem: "התמונה יכולה להרוויח מטשטוש רקע עדין או מיקוד בנושא.",
    symptoms: ["הרקע חד מדי", "אין הפרדה", "התמונה מרגישה שטוחה"]
  },
  cinematic_look: {
    title: "מראה קולנועי",
    problem: "אפשר לתת לתמונה אופי מסוגנן יותר בלי לפגוע בטבעיות.",
    symptoms: ["מראה רגיל מדי", "צבעים חסרי אופי", "האווירה לא מודגשת"]
  },
  print_dark: {
    title: "הדפסה יוצאת כהה",
    problem: "תמונות רבות נראות כהות יותר בהדפסה מאשר במסך.",
    symptoms: ["המסך נראה תקין אבל ההדפסה כהה", "פרטים בצללים נעלמים", "פנים יוצאות עמומות"]
  },
  print_red_skin: {
    title: "עור אדום בהדפסה",
    problem: "בהדפסה גווני עור אדומים או כתומים עלולים להתחזק.",
    symptoms: ["לחיים אדומות בהדפסה", "עור כתום", "לבן ליד פנים נראה ורוד"]
  },
  print_weak_colors: {
    title: "צבעים חלשים בהדפסה",
    problem: "חומרים מסוימים דורשים חיזוק צבע לפני הדפסה.",
    symptoms: ["הדפסה דהויה", "צבעי מוצר לא בולטים", "התמונה פחות חיה מהמסך"]
  },
  canvas_prep: {
    title: "הכנה לקנבס",
    problem: "קנבס צריך חידוד וצבע מאוזנים יחד עם מרווח גלישה.",
    symptoms: ["הטקסטורה בולעת פרטים", "הקצוות מיועדים לקיפול", "צריך להגן על פנים בקצוות"]
  },
  sublimation_prep: {
    title: "הכנה לסובלימציה",
    problem: "סובלימציה דורשת איזון צבע וזהירות מגוונים זוהרים מדי.",
    symptoms: ["צבעים עלולים להתחזק", "עור יכול להפוך כתום", "צריך לבדוק התאמה לחומר"]
  }
};

const TOOL_LABEL_HE_DISPLAY: Record<string, string> = {
  ...TOOL_LABEL_HE,
  Exposure: "חשיפה",
  Shadows: "צללים",
  Brightness: "בהירות",
  Contrast: "קונטרסט",
  Highlights: "אזורים בהירים",
  Whites: "לבנים",
  Blacks: "שחורים",
  Clarity: "בהירות מקומית",
  Temperature: "טמפרטורה",
  Tint: "גוון",
  Saturation: "רוויה",
  Vibrance: "חיות צבע",
  Upscale: "הגדלה",
  "Print Mode": "מצב הדפסה",
  "Print Sharpness": "חדות להדפסה",
  HSL: "HSL",
  "HSL Red/Orange": "HSL אדום/כתום"
};

const ACTION_LABEL_HE_DISPLAY: Record<string, string> = {
  ...ACTION_LABEL_HE,
  "Raise gently": "להעלות בעדינות",
  "Open dark areas": "לפתוח אזורים כהים",
  "Use only if it is still dark": "להשתמש רק אם עדיין חשוך",
  "Add a little if the image becomes flat": "להוסיף מעט אם התמונה נהיית שטוחה",
  "Lower only until highlight detail returns": "להוריד רק עד שפרטי האור חוזרים",
  "Reduce slightly if skin is washed out": "להפחית מעט אם העור נשטף",
  "Lower gently": "להוריד בעדינות",
  "Recover bright areas first": "לשחזר קודם אזורים בהירים",
  "Reduce if the photo feels harsh": "להפחית אם התמונה מרגישה קשה",
  "Lift only blocked shadows": "להרים רק צללים חסומים",
  "Warm the image": "לחמם את התמונה",
  "Fine tune away from green/magenta": "לאזן ירוק/מג'נטה בעדינות",
  "Reduce red/orange if available": "להפחית אדום/כתום אם זמין",
  "Cool the image": "לקרר את התמונה",
  "Correct green or magenta cast": "לתקן סטייה ירוקה או מג'נטה",
  "Raise first for natural color": "להעלות קודם לצבע טבעי",
  "Raise carefully": "להעלות בזהירות",
  "Lower if weak colors also look too strong": "להוריד אם גם צבעים חלשים נראים חזקים מדי",
  "Reduce only the problem color": "להפחית רק את הצבע הבעייתי",
  "Use AI upscaling": "להשתמש בהגדלת AI",
  "Use General Print Safe": "להשתמש במצב הדפסה בטוח",
  "Use material-specific boost": "להשתמש בחיזוק לפי חומר",
  "Use Canvas Print Boost": "להשתמש בחיזוק לקנבס",
  "Use Sublimation Boost": "להשתמש בחיזוק לסובלימציה",
  "Use gently": "להשתמש בעדינות"
};

const WARNING_LABEL_HE: Record<string, string> = {
  "Do not burn bright areas": "לא לשרוף אזורים בהירים",
  "Do not open shadows until the image looks gray": "לא לפתוח צללים עד שהתמונה נראית אפורה",
  "Do not darken the whole image too much": "לא להכהות את כל התמונה יותר מדי",
  "Protect skin and skies from grayness": "להגן על עור ושמיים מאפרוריות",
  "Do not crush blacks": "לא לחסום שחורים",
  "Avoid harsh skin texture": "להימנע מטקסטורת עור קשה",
  "Do not make the image muddy": "לא להפוך את התמונה לבוצית",
  "Keep a clear black and white point": "לשמור על נקודת שחור ולבן ברורה",
  "Do not make skin pale or green": "לא להפוך עור לחיוור או ירקרק",
  "Prefer HSL over global saturation for portraits": "בפורטרטים עדיף HSL על רוויה כללית",
  "Do not over-warm whites": "לא לחמם לבנים יותר מדי",
  "Check skin tones after temperature changes": "לבדוק גווני עור אחרי שינוי טמפרטורה",
  "Do not push skin into orange": "לא לדחוף עור לכתום",
  "Prefer vibrance before saturation": "להעדיף חיות צבע לפני רוויה",
  "Do not remove all color life": "לא להוציא את כל החיות מהצבע",
  "Use HSL for one problematic color": "להשתמש ב-HSL לצבע בעייתי יחיד",
  "Do not brighten until skin loses shape": "לא להבהיר עד שהפנים מאבדות צורה",
  "Watch highlight clipping on forehead and cheeks": "לשים לב לשריפת אור במצח ובלחיים",
  "Do not make skin gray": "לא להפוך עור לאפור",
  "Avoid green tint": "להימנע מגוון ירוק",
  "Do not create halos around faces": "לא ליצור הילות סביב פנים",
  "Do not oversharpen for print": "לא לחדד יתר על המידה להדפסה",
  "Watch for bright edge halos": "לשים לב להילות בהירות בקצוות",
  "Do not smooth away real detail": "לא להחליק פרטים אמיתיים",
  "Use less sharpening after denoise": "להשתמש בפחות חידוד אחרי ניקוי רעש",
  "Do not rely on sharpening as an upscale replacement": "לא להסתמך על חידוד במקום הגדלת רזולוציה",
  "Warn before large prints": "להתריע לפני הדפסות גדולות",
  "Do not crop important body parts": "לא לחתוך חלקי גוף חשובים",
  "Keep enough bleed for print": "להשאיר גלישה מספקת להדפסה",
  "Straightening crops edges": "יישור חותך קצוות",
  "Check faces and product edges after rotation": "לבדוק פנים וקצוות מוצר אחרי סיבוב",
  "Do not make corners visibly black": "לא להשאיר פינות שחורות בולטות",
  "Keep product colors accurate": "לשמור על צבעי מוצר מדויקים",
  "Avoid blurring the subject": "להימנע מטשטוש הנושא",
  "Radial blur is only a temporary approximation": "טשטוש רדיאלי הוא קירוב זמני בלבד",
  "Do not over-style family or product photos": "לא לסגנן מדי תמונות משפחה או מוצר",
  "Keep skin tones believable": "לשמור על גווני עור אמינים",
  "Do not rely only on monitor brightness": "לא להסתמך רק על בהירות המסך",
  "Use a print preset for the material": "להשתמש בפריסט הדפסה לפי החומר",
  "Use test print for recurring jobs": "לעבוד עם הדפסת בדיקה לעבודות חוזרות",
  "Avoid neon colors": "להימנע מצבעי ניאון",
  "Different materials need different compensation": "חומרים שונים דורשים פיצוי שונה",
  "Do not oversharpen canvas": "לא לחדד קנבס יותר מדי",
  "Leave room for wrap/bleed": "להשאיר מקום לקיפול או גלישה",
  "Do not oversaturate skin": "לא להרוות עור יותר מדי",
  "Mirror warning is informational in this version": "אזהרת המראה היא מידע בלבד בגרסה הזו"
};

function SmartTipsPanel({
  layer,
  onPatch
}: {
  layer: VisualLayer;
  onPatch: (patch: Partial<VisualLayer>) => void;
}): ReactElement {
  const [selectedCategory, setSelectedCategory] = useState(TIP_CATEGORIES[0] ?? "Light");
  const [selectedTipId, setSelectedTipId] = useState<string | null>(null);

  const imageLayer = layerHasEditableImage(layer) ? layer : null;

  const tipsInCategory = PHOTO_TIPS.filter((t) => t.category === selectedCategory);
  const tip = PHOTO_TIPS.find((t) => t.id === selectedTipId) ?? tipsInCategory[0] ?? null;
  const tipText = tip !== null ? (TIP_TEXT_HE_DISPLAY[tip.id] ?? { title: tip.title, problem: tip.problem, symptoms: tip.symptoms }) : null;

  // Select first tip of new category
  useEffect(() => {
    setSelectedTipId(tipsInCategory[0]?.id ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory]);

  function applyFix(params: Record<string, unknown>): void {
    if (imageLayer === null) return;
    const basicTone: Partial<{ brightness: number; contrast: number; exposure: number }> = {};
    const highlightsShadows: Partial<{ highlights: number; shadows: number; whites: number; blacks: number }> = {};
    const color: Partial<{ saturation: number; vibrance: number; temperature: number; tint: number }> = {};
    const detail: Partial<{ sharpness: number; clarity: number }> = {};
    const extras = { ...((layer.metadata["imageEditParams"] as Record<string, number> | undefined) ?? {}) };

    for (const [key, raw] of Object.entries(params)) {
      const mapping = PARAM_MAP[key];
      if (mapping === undefined) continue;
      const numVal = typeof raw === "number" ? raw : 0;
      const scaled = mapping.scale !== undefined ? numVal * mapping.scale : numVal;
      const rounded = Math.round(scaled);
      if (key === "brightness") basicTone.brightness = rounded;
      else if (key === "contrast") basicTone.contrast = rounded;
      else if (key === "exposure") basicTone.exposure = numVal;
      else if (key === "highlights") highlightsShadows.highlights = rounded;
      else if (key === "shadows") highlightsShadows.shadows = rounded;
      else if (key === "whites") highlightsShadows.whites = rounded;
      else if (key === "blacks") highlightsShadows.blacks = rounded;
      else if (key === "saturation") color.saturation = rounded;
      else if (key === "vibrance") color.vibrance = rounded;
      else if (key === "temperature") color.temperature = rounded;
      else if (key === "tint") color.tint = rounded;
      else if (key === "clarity") detail.clarity = rounded;
      else if (key === "sharpness" || key === "texture") detail.sharpness = rounded;
      extras[mapping.key] = rounded;
    }

    const templates: ImageAdjustmentTemplate[] = [];
    if (Object.keys(basicTone).length > 0) templates.push({ type: "basicTone", ...basicTone });
    if (Object.keys(highlightsShadows).length > 0) templates.push({ type: "highlightsShadows", ...highlightsShadows });
    if (Object.keys(color).length > 0) templates.push({ type: "color", ...color });
    if (Object.keys(detail).length > 0) templates.push({ type: "detail", ...detail });
    const generatedAdjustments = templates.map((template) => createImageAdjustment(template));
    const previousStack = imageLayer.imageAdjustments?.stack ?? [];

    onPatch({
      imageAdjustments: generatedAdjustments.length > 0
        ? { enabled: true, stack: [...previousStack, ...generatedAdjustments] }
        : imageLayer.imageAdjustments,
      metadata: { ...layer.metadata, imageEditParams: extras as Record<string, import("@/types/primitives").JsonValue> }
    } as Partial<VisualLayer>);
  }

  const canApply = tip !== null && tip.future_auto_fix.enabled && imageLayer !== null;

  return (
    <div className="smart-tips-panel">
      {/* Category tabs */}
      <div className="tips-categories">
        {TIP_CATEGORIES.map((cat) => (
          <button
            className={`tips-cat-btn${selectedCategory === cat ? " active" : ""}`}
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
          >
            {CATEGORY_LABELS[cat] ?? cat}
          </button>
        ))}
      </div>

      {/* Tip list */}
      <div className="tips-list">
        {tipsInCategory.map((t) => (
          <button
            className={`tips-item${(selectedTipId ?? tipsInCategory[0]?.id) === t.id ? " active" : ""}`}
            key={t.id}
            type="button"
            onClick={() => setSelectedTipId(t.id)}
          >
            {TIP_TEXT_HE_DISPLAY[t.id]?.title ?? t.title}
          </button>
        ))}
      </div>

      {/* Tip detail */}
      {tip !== null && (
        <div className="tip-detail">
          <h4 className="tip-title">{tipText?.title ?? tip.title}</h4>
          {tipText?.problem && <p className="tip-problem">{tipText.problem}</p>}

          <div className="tip-section-label">תסמינים</div>
          <ul className="tip-list-items">
            {(tipText?.symptoms ?? tip.symptoms).map((s, i) => <li key={i}>{s}</li>)}
          </ul>

          <div className="tip-section-label">סדר תיקון מומלץ</div>
          <ol className="tip-steps">
            {tip.recommended_steps.map((step, i) => (
              <li key={i}>
                <strong>{TOOL_LABEL_HE_DISPLAY[step.tool] ?? step.tool}</strong>: {ACTION_LABEL_HE_DISPLAY[step.action] ?? step.action}
                {step.suggested_range && (
                  <span className="tip-range"> ({step.suggested_range})</span>
                )}
              </li>
            ))}
          </ol>

          {tip.warnings.length > 0 && (
            <>
              <div className="tip-section-label">אזהרות</div>
              <ul className="tip-list-items warnings">
                {tip.warnings.map((w, i) => <li key={i}>{WARNING_LABEL_HE[w] ?? w}</li>)}
              </ul>
            </>
          )}

          {canApply && (
            <button
              className="apply-fix-btn"
              type="button"
              onClick={() => applyFix(tip.future_auto_fix.params)}
            >
              <Sparkles size={13} />
              החל תיקון מהיר
            </button>
          )}
          {!canApply && imageLayer === null && (
            <p className="tip-no-image">בחר שכבת תמונה כדי להחיל תיקון</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Image Studio — Fast React/Konva Quick Adjustments ───────────────────────

function ImageAiToolsPanel({
  layer,
  onOpenAiTool,
  onOpenAiStyles
}: {
  layer: VisualLayer;
  onOpenAiTool?: (tool: import("@/state/aiToolsStore").AiTool) => void;
  onOpenAiStyles?: () => void;
}): ReactElement {
  const hasEditableImage = layerHasEditableImage(layer);
  const aiToolDisabled = !hasEditableImage || onOpenAiTool === undefined;
  const aiStylesDisabled = !hasEditableImage || onOpenAiStyles === undefined;
  const tools: Array<{
    tool: import("@/state/aiToolsStore").AiTool;
    title: string;
    description: string;
    icon: LucideIcon;
  }> = [
    {
      tool: "expand",
      title: "הרחבת תמונה",
      description: "הגדלת הקנבס ויצירת המשך טבעי לתמונה.",
      icon: Maximize2
    },
    {
      tool: "remove",
      title: "הסרת אובייקט",
      description: "סימון אזור להסרה ומילוי הרקע סביבו.",
      icon: Eraser
    },
    {
      tool: "upscale",
      title: "שיפור רזולוציה",
      description: "Topaz / ESRGAN להגדלה וחידוד.",
      icon: Zap
    },
    {
      tool: "restore",
      title: "שחזור תמונה",
      description: "שיפור תמונות ישנות, רכות או פגומות.",
      icon: Sparkles
    }
  ];

  return (
    <div className="image-ai-tools-panel">
      <div className="image-ai-tool-grid">
        <button
            className="image-ai-tool-btn"
            disabled={!hasEditableImage}
            type="button"
            onClick={() => useSmartExpandStore.getState().open({ kind: "canvas", layerId: layer.id })}
          >
            <Maximize2 size={15} />
            <span>
              <strong>✨ מלא קנבס בעזרת AI</strong>
              <small>הרחבה חכמה — השלמת השטח הריק סביב התמונה.</small>
            </span>
          </button>
        <button
            className="image-ai-tool-btn"
            disabled={aiStylesDisabled}
            type="button"
            onClick={() => onOpenAiStyles?.()}
          >
            <Sparkles size={15} />
            <span>
              <strong>ספריית אפקטים AI</strong>
              <small>ספריית פריסטים מסחריים, מקומי עכשיו ו-cloud בהמשך.</small>
            </span>
          </button>
        {tools.map(({ tool, title, description, icon: Icon }) => (
          <button
            className="image-ai-tool-btn"
            disabled={aiToolDisabled}
            key={tool}
            type="button"
            onClick={() => onOpenAiTool?.(tool)}
          >
            <Icon size={15} />
            <span>
              <strong>{title}</strong>
              <small>{description}</small>
            </span>
          </button>
        ))}
      </div>

      {!hasEditableImage && (
        <p className="tip-no-image">
          כלי AI זמינים כרגע לשכבות תמונה חופשיות. למסגרות, בחר את התמונה עצמה או פתח עריכה פנימית.
        </p>
      )}

      <div className="image-ai-effects-placeholder">
        <strong>ספריית אפקטים</strong>
        <span>בקרוב: קריקטורה, איור קו, סקיצה, פוסטר ועוד.</span>
      </div>
    </div>
  );
}

type EngineParams = Record<string, number | boolean | string>;

type QuickSliderParam = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  decimals?: number;
  hint: string;
};

const QUICK_LIGHT_PARAMS: QuickSliderParam[] = [
  {
    key: "exposure",
    label: "חשיפה",
    min: -25,
    max: 25,
    step: 0.1,
    default: 0,
    hint: "תיקון חשיפה עדין — לא שורף לבן ולא מחשיך מדי"
  },
  {
    key: "brightness",
    label: "בהירות",
    min: -28,
    max: 28,
    step: 0.1,
    default: 0,
    hint: "בהירות כללית בטווח נורמלי להדפסה"
  },
  {
    key: "contrast",
    label: "קונטרסט",
    min: -35,
    max: 35,
    step: 0.1,
    default: 0,
    hint: "קונטרסט מתון, בלי תוצאה שרופה או קשה מדי"
  },
  {
    key: "luminance",
    label: "לומיננס",
    min: -25,
    max: 25,
    step: 0.1,
    default: 0,
    hint: "הבהרה/הכהיה עדינה דרך HSL"
  }
];

const QUICK_COLOR_PARAMS: QuickSliderParam[] = [
  {
    key: "saturation",
    label: "רוויה",
    min: -60,
    max: 60,
    step: 0.5,
    default: 0,
    hint: "חיזוק או החלשה של צבעים — 0 = ניטרלי, שלילי מחוויר"
  },
  {
    key: "hue",
    label: "גוון",
    min: -40,
    max: 40,
    step: 0.5,
    default: 0,
    hint: "סיבוב גוון הצבעים"
  },
  {
    key: "blur",
    label: "טשטוש קל",
    min: 0,
    max: 5,
    step: 0.1,
    default: 0,
    hint: "טשטוש קל ומהיר — לטשטוש חזק עדיף עורך מתקדם"
  }
];

const QUICK_EFFECT_PARAMS: QuickSliderParam[] = [
  {
    key: "threshold",
    label: "סף שחור/לבן",
    min: 0,
    max: 100,
    step: 1,
    default: 0,
    hint: "0 = כבוי. שימושי להכנה לחריטה/לייזר"
  },
  {
    key: "posterize",
    label: "פוסטר / פחות צבעים",
    min: 0,
    max: 6,
    step: 1,
    default: 0,
    hint: "0 = כבוי. ערכים נמוכים שומרים על אפקט עדין"
  }
];

const QUICK_CHECKBOXES = [
  { key: "black_white", label: "שחור לבן" },
  { key: "sepia", label: "ספיה / וינטג׳" },
  { key: "invert", label: "היפוך צבעים" },
  { key: "remove_white", label: "הסרת רקע לבן/בהיר" },
  { key: "color_pop", label: "השארת צבע נבחר" }
] as const;

function imageParamValue(params: EngineParams, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function imageParamBool(params: EngineParams, key: string): boolean {
  return params[key] === true;
}

function imageParamString(params: EngineParams, key: string, fallback: string): string {
  const value = params[key];
  return typeof value === "string" ? value : fallback;
}

function normalizedEdgeFade(settings: EdgeFadeSettings | undefined): EdgeFadeSettings {
  return {
    ...DEFAULT_EDGE_FADE_SETTINGS,
    ...(settings ?? {}),
    depth: clampQuickValue(settings?.depth ?? DEFAULT_EDGE_FADE_SETTINGS.depth, 0, 1),
    softness: clampQuickValue(settings?.softness ?? DEFAULT_EDGE_FADE_SETTINGS.softness, 0, 1),
    strength: clampQuickValue(settings?.strength ?? DEFAULT_EDGE_FADE_SETTINGS.strength, 0, 1),
    shape: settings?.shape === "roundedRect" || settings?.shape === "ellipse" || settings?.shape === "rect"
      ? settings.shape
      : DEFAULT_EDGE_FADE_SETTINGS.shape
  };
}

function clampQuickValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function decimalsFromStep(step: number): number {
  const text = String(step);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

function formatQuickValue(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals);
  return fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function cleanImageParams(params: EngineParams): EngineParams {
  const cleaned: EngineParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "boolean") {
      if (value) cleaned[key] = value;
      continue;
    }
    if (typeof value === "number") {
      if (value !== 0) cleaned[key] = value;
      continue;
    }
    if (typeof value === "string") {
      if (value.trim() !== "") cleaned[key] = value;
    }
  }
  return cleaned;
}

function QuickSlider({
  param,
  params,
  onChange,
  onReset
}: {
  param: QuickSliderParam;
  params: EngineParams;
  onChange: (key: string, value: number) => void;
  onReset?: (key: string) => void;
}): ReactElement {
  const value = imageParamValue(params, param.key, param.default);
  const isDirty = value !== param.default;
  const decimals = param.decimals ?? decimalsFromStep(param.step);
  const displayValue = formatQuickValue(value, decimals);
  const [manualDraft, setManualDraft] = useState(displayValue);
  const [manualEditing, setManualEditing] = useState(false);

  // Live drag value: dragging the range fires onChange on every pixel, and each
  // commit re-rasterises the Konva node. We keep the thumb responsive via local
  // state but coalesce store commits to one per animation frame, then flush the
  // final value on release — removing the lag without dropping the last value.
  const [liveValue, setLiveValue] = useState<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<number | null>(null);
  const sliderValue = liveValue ?? value;

  const flushPending = useCallback(() => {
    rafRef.current = null;
    if (pendingRef.current !== null) {
      onChange(param.key, pendingRef.current);
      pendingRef.current = null;
    }
  }, [onChange, param.key]);

  const handleRangeChange = useCallback((next: number) => {
    setLiveValue(next);
    pendingRef.current = next;
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(flushPending);
    }
  }, [flushPending]);

  const handleRangeRelease = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (pendingRef.current !== null) {
      onChange(param.key, pendingRef.current);
      pendingRef.current = null;
    }
    setLiveValue(null);
  }, [onChange, param.key]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    if (!manualEditing) setManualDraft(displayValue);
  }, [displayValue, manualEditing]);

  function commitManualValue(raw: string): void {
    const parsed = Number(raw.replace(",", "."));
    if (!Number.isFinite(parsed)) {
      setManualDraft(displayValue);
      return;
    }
    const nextValue = Number(clampQuickValue(parsed, param.min, param.max).toFixed(decimals));
    setManualDraft(formatQuickValue(nextValue, decimals));
    onChange(param.key, nextValue);
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, marginBottom: 3 }}>
        <span title={param.hint} style={{ color: isDirty ? "var(--color-accent,#7C6FE0)" : "inherit" }}>
          {param.label}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, opacity: 0.7 }}>
          <input
            aria-label={`${param.label} value`}
            max={param.max}
            min={param.min}
            onBlur={() => {
              setManualEditing(false);
              commitManualValue(manualDraft);
            }}
            onChange={(event) => setManualDraft(event.target.value)}
            onFocus={() => setManualEditing(true)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                setManualDraft(displayValue);
                event.currentTarget.blur();
              }
            }}
            step={param.step}
            style={{
              width: 54,
              minWidth: 54,
              padding: "2px 5px",
              borderRadius: 4,
              border: "1px solid var(--color-border,#2a2a3e)",
              background: "var(--color-panel,#15151f)",
              color: "inherit",
              fontSize: 11,
              textAlign: "center"
            }}
            type="number"
            value={manualDraft}
          />
          {isDirty && onReset !== undefined && (
            <button
              aria-label="אפס ערך"
              onClick={() => onReset(param.key)}
              style={{ lineHeight: 1, padding: 0, fontSize: 10, color: "var(--color-accent,#7C6FE0)", background: "none", border: "none", cursor: "pointer" }}
              title="אפס"
              type="button"
            >
              ֳ—
            </button>
          )}
        </span>
      </div>
      <input
        type="range"
        min={param.min}
        max={param.max}
        step={param.step}
        value={sliderValue}
        onChange={(event) => handleRangeChange(Number(event.target.value))}
        onPointerUp={handleRangeRelease}
        onPointerCancel={handleRangeRelease}
        onKeyUp={handleRangeRelease}
        style={{ width: "100%", accentColor: isDirty ? "#7C6FE0" : undefined }}
      />
    </div>
  );
}

function EdgeFadeControls({
  layer,
  onPatch
}: {
  layer: ImageLayer;
  onPatch: (patch: Partial<VisualLayer>) => void;
}): ReactElement {
  const fade = normalizedEdgeFade(layer.edgeFade);
  const params: EngineParams = {
    depth: fade.depth,
    softness: fade.softness,
    strength: fade.strength
  };
  const isDirty =
    fade.enabled !== DEFAULT_EDGE_FADE_SETTINGS.enabled ||
    fade.depth !== DEFAULT_EDGE_FADE_SETTINGS.depth ||
    fade.softness !== DEFAULT_EDGE_FADE_SETTINGS.softness ||
    fade.strength !== DEFAULT_EDGE_FADE_SETTINGS.strength ||
    fade.shape !== DEFAULT_EDGE_FADE_SETTINGS.shape;

  function patchEdgeFade(patch: Partial<EdgeFadeSettings>): void {
    onPatch({ edgeFade: { ...fade, ...patch } });
  }

  function resetEdgeFade(): void {
    onPatch({ edgeFade: { ...DEFAULT_EDGE_FADE_SETTINGS } });
  }

  return (
    <AccordionSection title="Edge Fade" defaultOpen={fade.enabled}>
      <label className="edge-fade-toggle">
        <input
          checked={fade.enabled}
          onChange={(event) => patchEdgeFade({ enabled: event.target.checked })}
          type="checkbox"
        />
        <span>Enabled</span>
      </label>

      <QuickSlider
        param={{ key: "depth", label: "Depth", min: 0, max: 0.5, step: 0.01, default: DEFAULT_EDGE_FADE_SETTINGS.depth, decimals: 2, hint: "How far the transparent fade reaches inward from the image edges." }}
        params={params}
        onChange={(_key, value) => patchEdgeFade({ depth: value })}
      />
      <QuickSlider
        param={{ key: "softness", label: "Softness", min: 0, max: 1, step: 0.01, default: DEFAULT_EDGE_FADE_SETTINGS.softness, decimals: 2, hint: "How gradual the alpha transition feels." }}
        params={params}
        onChange={(_key, value) => patchEdgeFade({ softness: value })}
      />
      <QuickSlider
        param={{ key: "strength", label: "Strength", min: 0, max: 1, step: 0.01, default: DEFAULT_EDGE_FADE_SETTINGS.strength, decimals: 2, hint: "How transparent the outer edge becomes." }}
        params={params}
        onChange={(_key, value) => patchEdgeFade({ strength: value })}
      />

      <label className="edge-fade-shape">
        <span>Shape</span>
        <select value={fade.shape} onChange={(event) => patchEdgeFade({ shape: event.target.value as EdgeFadeShape })}>
          <option value="rect">Rectangle</option>
          <option value="roundedRect">Rounded Rectangle</option>
          <option value="ellipse">Ellipse</option>
        </select>
      </label>

      <button className="btn btn-ghost edge-fade-reset" disabled={!isDirty} onClick={resetEdgeFade} type="button">
        <RotateCcw size={13} /> Reset
      </button>
    </AccordionSection>
  );
}

type ImageBarMenu = "edgeFade" | "rotate" | "transform" | "more" | null;
type ImagePopoverPlacement = "right" | "left" | "bottom" | "top";

function ContextualImageBar({
  canvasAreaRef,
  layer,
  stageRef,
  viewportSignature,
  onEdit,
  onPatch,
  onSmartExpand,
  onSelectObject,
  onRemoveBackground,
  onRotate,
  onFitCanvasFill,
  onFitCanvasFit,
  onCenterCanvas,
  onResetTransform,
  onFlipHorizontal,
  onFlipVertical,
  onOpenAdvancedEditor,
  onReplaceImage,
  onDuplicate,
  onDelete
}: {
  canvasAreaRef: RefObject<HTMLDivElement | null>;
  layer: ImageLayer;
  stageRef: RefObject<Konva.Stage | null>;
  viewportSignature: string;
  onEdit: () => void;
  onPatch: (patch: Partial<ImageLayer>) => void;
  onSmartExpand: () => void;
  onSelectObject: () => void;
  onRemoveBackground: () => void;
  onRotate: (delta: number) => void;
  onFitCanvasFill: () => void;
  onFitCanvasFit: () => void;
  onCenterCanvas: () => void;
  onResetTransform: () => void;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  onOpenAdvancedEditor: () => void;
  onReplaceImage: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}): ReactElement | null {
  const [openMenu, setOpenMenu] = useState<ImageBarMenu>(null);
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const [popoverPlacement, setPopoverPlacement] = useState<ImagePopoverPlacement>("bottom");
  const [popoverOffset, setPopoverOffset] = useState({ x: 0, y: 0 });
  const popoverDragRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const fade = normalizedEdgeFade(layer.edgeFade);

  const updatePosition = useCallback(() => {
    const stage = stageRef.current;
    const canvasArea = canvasAreaRef.current;
    if (stage === null || canvasArea === null) {
      setStyle(null);
      return;
    }
    const node = stage.findOne(`#${layer.id}`);
    const container = stage.container();
    if (node === undefined || node === null || container === null) {
      setStyle(null);
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const areaRect = canvasArea.getBoundingClientRect();
    const barWidth = 344;
    const barHeight = 38;
    const transform = node.getAbsoluteTransform().copy();
    const points = [
      transform.point({ x: 0, y: 0 }),
      transform.point({ x: layer.width, y: 0 }),
      transform.point({ x: layer.width, y: layer.height }),
      transform.point({ x: 0, y: layer.height })
    ];
    const minX = Math.min(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxX = Math.max(...points.map((point) => point.x));
    const maxY = Math.max(...points.map((point) => point.y));
    const screenLeft = containerRect.left - areaRect.left + minX;
    const screenTop = containerRect.top - areaRect.top + minY;
    const screenRight = containerRect.left - areaRect.left + maxX;
    const screenBottom = containerRect.top - areaRect.top + maxY;
    const centerX = (screenLeft + screenRight) / 2;
    const areaWidth = Math.max(1, areaRect.width);
    const areaHeight = Math.max(1, areaRect.height);
    const maxLeft = Math.max(8, areaWidth - barWidth - 8);
    const left = Math.max(8, Math.min(maxLeft, centerX - barWidth / 2));
    const aboveTop = screenTop - barHeight - 10;
    const belowTop = screenBottom + 10;
    const maxTop = Math.max(8, areaHeight - barHeight - 8);
    const insideBottomTop = screenBottom - barHeight - 10;
    const top = aboveTop >= 8
      ? Math.min(maxTop, aboveTop)
      : belowTop <= maxTop
        ? Math.max(8, belowTop)
        : Math.max(8, Math.min(maxTop, insideBottomTop));
    setStyle({
      left: left + canvasArea.scrollLeft,
      top: top + canvasArea.scrollTop
    });
    const popoverWidth = 260;
    const popoverHeight = 236;
    const rightSpace = areaWidth - screenRight;
    const leftSpace = screenLeft;
    const bottomSpace = areaHeight - screenBottom;
    const topSpace = screenTop;
    const nextPlacement: ImagePopoverPlacement =
      rightSpace >= popoverWidth + 16 ? "right"
        : leftSpace >= popoverWidth + 16 ? "left"
          : bottomSpace >= popoverHeight + 16 ? "bottom"
            : topSpace >= popoverHeight + 16 ? "top"
              : top > areaHeight * 0.58 ? "top" : "bottom";
    setPopoverPlacement(nextPlacement);
  }, [canvasAreaRef, layer.height, layer.id, layer.width, stageRef]);

  useEffect(() => {
    const canvasArea = canvasAreaRef.current;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    canvasArea?.addEventListener("scroll", updatePosition, { passive: true });
    return () => {
      window.removeEventListener("resize", updatePosition);
      canvasArea?.removeEventListener("scroll", updatePosition);
    };
  }, [
    canvasAreaRef,
    updatePosition,
    viewportSignature,
    layer.x,
    layer.y,
    layer.width,
    layer.height,
    layer.rotation
  ]);

  useEffect(() => {
    setOpenMenu(null);
  }, [layer.id]);

  useEffect(() => {
    setPopoverOffset({ x: 0, y: 0 });
  }, [layer.id, openMenu, popoverPlacement]);

  useEffect(() => {
    function handleMove(event: MouseEvent): void {
      const drag = popoverDragRef.current;
      if (drag === null) return;
      setPopoverOffset({
        x: drag.originX + event.clientX - drag.startX,
        y: drag.originY + event.clientY - drag.startY
      });
    }

    function handleUp(): void {
      popoverDragRef.current = null;
    }

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, []);

  if (style === null) return null;

  function patchEdgeFade(patch: Partial<EdgeFadeSettings>): void {
    onPatch({ edgeFade: { ...fade, ...patch } });
  }

  function closeThen(action: () => void): void {
    setOpenMenu(null);
    action();
  }

  function beginPopoverDrag(event: ReactMouseEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    popoverDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: popoverOffset.x,
      originY: popoverOffset.y
    };
  }

  const popoverStyle: CSSProperties | undefined = popoverOffset.x !== 0 || popoverOffset.y !== 0
    ? { transform: `translate(${popoverOffset.x}px, ${popoverOffset.y}px)` }
    : undefined;

  const popoverClass = `contextual-image-popover placement-${popoverPlacement}`;

  return (
    <div
      className="contextual-image-bar"
      style={style}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      data-testid="contextual-image-bar"
    >
      <IconOnlyButton icon={Crop} label="Image Edit" onClick={onEdit} />
      <IconOnlyButton active={fade.enabled} icon={SquareRoundCorner} label="Edge Fade" onClick={() => setOpenMenu(openMenu === "edgeFade" ? null : "edgeFade")} />
      <span className="contextual-image-separator" />
      <IconOnlyButton icon={Maximize2} label="Smart Expand" onClick={onSmartExpand} />
      <IconOnlyButton icon={MousePointer2} label="Select Object" onClick={onSelectObject} />
      <IconOnlyButton icon={Eraser} label="Remove Background" onClick={onRemoveBackground} />
      <span className="contextual-image-separator" />
      <IconOnlyButton icon={RotateCw} label="Rotate" onClick={() => setOpenMenu(openMenu === "rotate" ? null : "rotate")} />
      <IconOnlyButton icon={MoveHorizontal} label="Transform" onClick={() => setOpenMenu(openMenu === "transform" ? null : "transform")} />
      <IconOnlyButton icon={MoreVertical} label="More" onClick={() => setOpenMenu(openMenu === "more" ? null : "more")} />

      {openMenu === "edgeFade" && (
        <div className={`${popoverClass} edge-fade-popover`} style={popoverStyle}>
          <div className="ctx-popover-drag-handle" onMouseDown={beginPopoverDrag}>
            <span>Edge Fade</span>
            <MoveHorizontal size={13} />
          </div>
          <label className="ctx-mini-check">
            <input checked={fade.enabled} onChange={(event) => patchEdgeFade({ enabled: event.target.checked })} type="checkbox" />
            Enabled
          </label>
          <MiniRange label="Depth" max={0.5} min={0} step={0.01} value={fade.depth} onChange={(value) => patchEdgeFade({ depth: value })} />
          <MiniRange label="Softness" max={1} min={0} step={0.01} value={fade.softness} onChange={(value) => patchEdgeFade({ softness: value })} />
          <MiniRange label="Strength" max={1} min={0} step={0.01} value={fade.strength} onChange={(value) => patchEdgeFade({ strength: value })} />
          <div className="ctx-icon-seg" aria-label="Edge Fade shape">
            <button className={fade.shape === "rect" ? "on" : ""} title="Rectangle" type="button" onClick={() => patchEdgeFade({ shape: "rect" })}><Square size={15} /></button>
            <button className={fade.shape === "roundedRect" ? "on" : ""} title="Rounded Rectangle" type="button" onClick={() => patchEdgeFade({ shape: "roundedRect" })}><SquareRoundCorner size={15} /></button>
            <button className={fade.shape === "ellipse" ? "on" : ""} title="Ellipse" type="button" onClick={() => patchEdgeFade({ shape: "ellipse" })}><Circle size={15} /></button>
          </div>
            <button className="ctx-mini-command" type="button" onClick={() => onPatch({ edgeFade: { ...DEFAULT_EDGE_FADE_SETTINGS } })}>
            <RotateCcw size={13} /> Reset
          </button>
        </div>
      )}

      {openMenu === "rotate" && (
        <div className={`${popoverClass} compact-popover`} style={popoverStyle}>
          <div className="ctx-popover-drag-handle" onMouseDown={beginPopoverDrag}>
            <span>Rotate</span>
            <MoveHorizontal size={13} />
          </div>
          <button type="button" onClick={() => closeThen(() => onRotate(-90))}><RotateCcw size={14} /> Rotate left</button>
          <button type="button" onClick={() => closeThen(() => onRotate(90))}><RotateCw size={14} /> Rotate right</button>
          <button type="button" onClick={() => closeThen(() => onRotate(180))}><RotateCw size={14} /> Rotate 180</button>
        </div>
      )}

      {openMenu === "transform" && (
        <div className={`${popoverClass} compact-popover`} style={popoverStyle}>
          <div className="ctx-popover-drag-handle" onMouseDown={beginPopoverDrag}>
            <span>Transform</span>
            <MoveHorizontal size={13} />
          </div>
          <button type="button" onClick={() => closeThen(onFitCanvasFit)}><Minimize2Icon /> Fit to canvas</button>
          <button type="button" onClick={() => closeThen(onFitCanvasFill)}><Maximize2 size={14} /> Fill canvas</button>
          <button type="button" onClick={() => closeThen(onCenterCanvas)}><Crosshair size={14} /> Center</button>
          <button type="button" onClick={() => closeThen(onFlipHorizontal)}><FlipHorizontal size={14} /> Flip horizontal</button>
          <button type="button" onClick={() => closeThen(onFlipVertical)}><FlipVertical size={14} /> Flip vertical</button>
          <button type="button" onClick={() => closeThen(onResetTransform)}><RotateCcw size={14} /> Reset transform</button>
        </div>
      )}

      {openMenu === "more" && (
        <div className={`${popoverClass} compact-popover`} style={popoverStyle}>
          <div className="ctx-popover-drag-handle" onMouseDown={beginPopoverDrag}>
            <span>More</span>
            <MoveHorizontal size={13} />
          </div>
          <button type="button" onClick={() => closeThen(onOpenAdvancedEditor)}><Sparkles size={14} /> Advanced editor</button>
          <button type="button" onClick={() => closeThen(onReplaceImage)}><Replace size={14} /> Replace image</button>
          <button type="button" onClick={() => closeThen(onDuplicate)}><Copy size={14} /> Duplicate</button>
          <button className="danger" type="button" onClick={() => closeThen(onDelete)}><Trash2 size={14} /> Delete</button>
        </div>
      )}
    </div>
  );
}

function IconOnlyButton({
  active = false,
  icon: Icon,
  label,
  onClick
}: {
  active?: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      aria-label={label}
      className={`contextual-image-btn${active ? " on" : ""}`}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon size={15} />
    </button>
  );
}

function MiniRange({
  label,
  max,
  min,
  onChange,
  step = 1,
  value
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step?: number;
  value: number;
}): ReactElement {
  return (
    <label className="ctx-mini-range">
      <span>{label}</span>
      <input max={max} min={min} onChange={(event) => onChange(Number(event.target.value))} step={step} type="range" value={value} />
      <output>{value.toFixed(step < 1 ? 2 : 0)}</output>
    </label>
  );
}

function Minimize2Icon(): ReactElement {
  return <Maximize2 size={14} style={{ transform: "rotate(180deg)" }} />;
}

function ManagedImageFrameInspector({
  activeTab,
  assets,
  batchField,
  layer,
  modePanel,
  onBatchFieldChange,
  onDelete,
  onOpenAiTool,
  onOpenAiStyles,
  onPatch,
  onTabChange,
  onUpdateAsset
}: {
  activeTab: "image" | "mode";
  assets: Asset[];
  batchField?: BatchVariableField;
  layer: Extract<VisualLayer, { type: "frame" }>;
  modePanel: ReactNode;
  onBatchFieldChange?: (field: BatchVariableField | null) => void;
  onDelete: () => void;
  onOpenAiTool?: (tool: import("@/state/aiToolsStore").AiTool) => void;
  onOpenAiStyles?: () => void;
  onPatch: (patch: Partial<VisualLayer>) => void;
  onTabChange: (tab: "image" | "mode") => void;
  onUpdateAsset: (asset: Asset) => void;
}): ReactElement {
  return (
    <div className="text-pro-controls managed-image-inspector">
      <div className="text-tabs" role="tablist" aria-label="Managed image tools">
        <button className={activeTab === "image" ? "on" : ""} onClick={() => onTabChange("image")} type="button">
          כוונון תמונה
        </button>
        <button className={activeTab === "mode" ? "on" : ""} onClick={() => onTabChange("mode")} type="button">
          כלי מצב
        </button>
      </div>

      {activeTab === "image" ? (
        <ImageStudio
          layer={layer}
          assets={assets}
          batchField={batchField}
          onBatchFieldChange={onBatchFieldChange}
          onDelete={onDelete}
          onOpenAiTool={onOpenAiTool}
          onOpenAiStyles={onOpenAiStyles}
          onPatch={onPatch}
          onUpdateAsset={onUpdateAsset}
        />
      ) : (
        <div className="text-tab-panel managed-mode-panel">
          {modePanel ?? <p className="empty-panel-note">אין כלי מצב זמינים לשכבה הזו.</p>}
        </div>
      )}
    </div>
  );
}

function ImageStudio({
  layer,
  assets,
  batchField,
  onBatchFieldChange,
  onConvertAlphaToFrame,
  onDelete,
  onOpenAiTool,
  onOpenAiStyles,
  onPatch,
  onUpdateAsset,
}: {
  layer: VisualLayer;
  assets: Asset[];
  batchField?: BatchVariableField;
  onBatchFieldChange?: (field: BatchVariableField | null) => void;
  onConvertAlphaToFrame?: () => void;
  onDelete: () => void;
  onOpenAiTool?: (tool: import("@/state/aiToolsStore").AiTool) => void;
  onOpenAiStyles?: () => void;
  onPatch: (patch: Partial<VisualLayer>) => void;
  onUpdateAsset: (asset: Asset) => void;
}): ReactElement {
  const [studioTab, setStudioTab] = useState<"quick" | "tips" | "ai">("quick");
  const [advancedBusy, setAdvancedBusy] = useState(false);

  // For ImageLayer: read from layer.effects; for FrameLayer: read from metadata["imageEditParams"]
  const savedParams = useMemo((): EngineParams => {
    if (layer.type === "image") {
      const e = layer.effects;
      return {
        exposure: e.exposure,
        brightness: e.brightness,
        contrast: e.contrast,
        saturation: e.saturation,
        hue: e.hue,
        blur: e.blur,
        black_white: e.grayscale,
        luminance: e.luminance ?? 0,
        sepia: e.sepia ?? false,
        invert: e.invert ?? false,
        threshold: e.threshold ?? 0,
        posterize: e.posterize ?? 0,
        remove_white: e.remove_white ?? false,
        remove_white_tolerance: e.remove_white_tolerance ?? 22,
        color_pop: e.color_pop ?? false,
        color_pop_color: e.color_pop_color ?? "#ff0000",
        color_pop_tolerance: e.color_pop_tolerance ?? 28,
        color_pop_background: e.color_pop_background ?? 100
      };
    }
    return ((layer.metadata["imageEditParams"] ?? layer.metadata["collageImageEditParams"]) ?? {}) as EngineParams;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer]);

  const assetId = layer.type === "image" ? layer.assetId : (layer.type === "frame" ? layer.imageAssetId : undefined);
  const asset = assets.find((a) => a.id === assetId);

  function patchQuickParams(params: EngineParams): void {
    onPatch({
      metadata: {
        ...layer.metadata,
        imageEditParams: cleanImageParams(params) as unknown as import("@/types/primitives").JsonValue
      }
    });
  }

  function updateParam(key: string, value: number | boolean | string): void {
    if (layer.type === "image") {
      const effectsKey = key === "black_white" ? "grayscale" : key;
      onPatch({ effects: { ...layer.effects, [effectsKey]: value } } as Partial<VisualLayer>);
    } else {
      patchQuickParams({ ...savedParams, [key]: value });
    }
  }

  function resetQuickParams(): void {
    if (layer.type === "image") {
      onPatch({ effects: { ...DEFAULT_IMAGE_LAYER_EFFECTS } } as Partial<VisualLayer>);
    } else {
      patchQuickParams({});
    }
  }

  function resetSingleParam(key: string): void {
    if (layer.type === "image") {
      const effectsKey = key === "black_white" ? "grayscale" : (key as keyof ImageLayerEffects);
      const defaultVal = DEFAULT_IMAGE_LAYER_EFFECTS[effectsKey as keyof ImageLayerEffects];
      onPatch({ effects: { ...layer.effects, [effectsKey]: defaultVal } } as Partial<VisualLayer>);
    } else {
      const nextParams = { ...savedParams };
      delete nextParams[key];
      patchQuickParams(nextParams);
    }
  }

  async function openAdvancedEditor(): Promise<void> {
    if (!asset || advancedBusy) return;

    setAdvancedBusy(true);
    try {
      const updatedAsset = await openImageEditorForAsset(asset);
      if (updatedAsset) {
        onUpdateAsset(updatedAsset);

        // The advanced editor bakes its changes into the image pixels.
        // Reset quick Konva filters so they do not keep altering the edited result.
        patchQuickParams({});
      }
    } finally {
      setAdvancedBusy(false);
    }
  }

  const hasAnyQuickAdjustments = layer.type === "image"
    ? (layer.effects.brightness !== 0 || layer.effects.contrast !== 0 || layer.effects.saturation !== 0 ||
       layer.effects.exposure !== 0 || layer.effects.hue !== 0 || layer.effects.grayscale || layer.effects.blur > 0 ||
       (layer.effects.luminance ?? 0) !== 0 || (layer.effects.sepia ?? false) || (layer.effects.invert ?? false) ||
       (layer.effects.threshold ?? 0) !== 0 || (layer.effects.posterize ?? 0) !== 0 ||
       (layer.effects.remove_white ?? false) || (layer.effects.color_pop ?? false) ||
       layer.effects.shadow !== null || layer.effects.outline !== null)
    : Object.values(savedParams).some((value) => value !== 0 && value !== false && value !== "");
  const colorPopEnabled = imageParamBool(savedParams, "color_pop");
  const removeWhiteEnabled = imageParamBool(savedParams, "remove_white");

  return (
    <>
      <div className="studio-tab-bar">
        <button
          className={`studio-tab${studioTab === "quick" ? " active" : ""}`}
          type="button"
          onClick={() => setStudioTab("quick")}
        >
          <SlidersHorizontal size={12} /> עריכה מהירה
        </button>
        <button
          className={`studio-tab${studioTab === "tips" ? " active" : ""}`}
          type="button"
          onClick={() => setStudioTab("tips")}
        >
          <Sparkles size={12} /> טיפים
        </button>
        <button
          className={`studio-tab${studioTab === "ai" ? " active" : ""}`}
          type="button"
          onClick={() => setStudioTab("ai")}
        >
          <Zap size={12} /> AI
        </button>
      </div>

      {studioTab === "tips" && <SmartTipsPanel layer={layer} onPatch={onPatch} />}

      {studioTab === "ai" && <ImageAiToolsPanel layer={layer} onOpenAiTool={onOpenAiTool} onOpenAiStyles={onOpenAiStyles} />}

      {studioTab === "quick" && (
        <>
          <AccordionSection title="שכבה" defaultOpen={true}>
            <div className="field-grid">
              <Metric label="X" value={layer.x} />
              <Metric label="Y" value={layer.y} />
              <Metric label="W" value={layer.width} />
              <Metric label="H" value={layer.height} />
            </div>
            <div className="quick-controls">
              <button
                className={layer.visible ? "toggle on" : "toggle"}
                onClick={() => onPatch({ visible: !layer.visible })}
                type="button"
              >
                {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />} תצוגה
              </button>
              <button
                className={layer.locked ? "toggle on" : "toggle"}
                onClick={() => onPatch({ locked: !layer.locked })}
                type="button"
              >
                {layer.locked ? <Lock size={14} /> : <Unlock size={14} />} נעילה
              </button>
              {layer.type === "image" && onConvertAlphaToFrame !== undefined && (
                <button
                  className="toggle"
                  onClick={onConvertAlphaToFrame}
                  title="Use this layer alpha as an empty image frame mask"
                  type="button"
                >
                  <Frame size={14} /> Use Alpha as Mask
                </button>
              )}
              {(layer.type === "image" || (layer.type === "frame" && layer.imageAssetId !== undefined)) && (
                <button
                  className="toggle"
                  onClick={() => useAutoFixStore.getState().open(layer.id)}
                  title="תיקון אוטומטי של תאורה, צבע וניגודיות"
                  type="button"
                >
                  <Sparkles size={14} /> תיקון אוטומטי
                </button>
              )}
              {(layer.type === "image" || (layer.type === "frame" && layer.imageAssetId !== undefined)) && (
                <button
                  className="toggle"
                  onClick={() => useCurvesStore.getState().open(layer.id)}
                  title="עריכת עקומות טונאליות (Curves)"
                  type="button"
                >
                  <LineChart size={14} /> עקומות
                </button>
              )}
              {(layer.type === "image" || (layer.type === "frame" && layer.imageAssetId !== undefined)) && (
                <button
                  className="toggle"
                  onClick={() => useShadowHighlightsStore.getState().open(layer.id)}
                  title="שחזור צללים ואורות מקומי חכם (Shadow/Highlights)"
                  type="button"
                >
                  <Contrast size={14} /> צללים / אורות
                </button>
              )}
            </div>
            <SliderField
              decimals={2}
              label="שקיפות"
              max={1}
              min={0}
              step={0.01}
              value={layer.opacity}
              onChange={(value) => onPatch({ opacity: value } as Partial<VisualLayer>)}
            />
          </AccordionSection>

          <AccordionSection title="תאורה וצבע — React / Konva" defaultOpen={true}>
            <p style={{ margin: "0 0 10px", fontSize: 11, color: "var(--color-text-secondary,#888)", lineHeight: 1.5 }}>
              הכלים כאן עובדים מיידית על הקנבס, בלי Python. הטווחים מוגבלים בכוונה כדי לקבל תוצאה טבעית ולא קיצונית.
            </p>

            {QUICK_LIGHT_PARAMS.map((param) => (
              <QuickSlider key={param.key} param={param} params={savedParams} onChange={updateParam} onReset={resetSingleParam} />
            ))}

            {QUICK_COLOR_PARAMS.map((param) => (
              <QuickSlider key={param.key} param={param} params={savedParams} onChange={updateParam} onReset={resetSingleParam} />
            ))}
          </AccordionSection>

          {layer.type === "image" && (
            <EdgeFadeControls layer={layer} onPatch={onPatch} />
          )}

          {layerHasEditableImage(layer) && (
            <AccordionSection title="התאמות תמונה (חכם)" defaultOpen={false}>
              <ImageAdjustmentsPanel layer={layer} />
            </AccordionSection>
          )}

          <AccordionSection title="אפקטים מהירים" defaultOpen={false}>
            {QUICK_CHECKBOXES.map((checkbox) => {
              const checked = imageParamBool(savedParams, checkbox.key);
              return (
                <label key={checkbox.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => updateParam(checkbox.key, event.target.checked)}
                  />
                  {checkbox.label}
                </label>
              );
            })}

            {QUICK_EFFECT_PARAMS.map((param) => (
              <QuickSlider key={param.key} param={param} params={savedParams} onChange={updateParam} onReset={resetSingleParam} />
            ))}

            {removeWhiteEnabled && (
              <QuickSlider
                param={{
                  key: "remove_white_tolerance",
                  label: "רגישות רקע לבן",
                  min: 5,
                  max: 55,
                  step: 0.1,
                  default: 22,
                  hint: "כמה גוונים בהירים יוסרו. לשמור מתון כדי לא לפגוע בפרטים בהירים"
                }}
                params={savedParams}
                onChange={updateParam}
                onReset={resetSingleParam}
              />
            )}

            {colorPopEnabled && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--color-border,#2a2a3e)" }}>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 12, marginBottom: 8 }}>
                  צבע להשארה
                  <input
                    type="color"
                    value={imageParamString(savedParams, "color_pop_color", "#ff0000")}
                    onChange={(event) => updateParam("color_pop_color", event.target.value)}
                    style={{ width: 42, height: 28 }}
                  />
                </label>
                <QuickSlider
                  param={{
                    key: "color_pop_tolerance",
                    label: "רגישות צבע",
                    min: 5,
                    max: 85,
                    step: 0.1,
                    default: 28,
                    hint: "כמה צבעים קרובים לצבע הנבחר יישארו צבעוניים"
                  }}
                  params={savedParams}
                  onChange={updateParam}
                  onReset={resetSingleParam}
                />
                <QuickSlider
                  param={{
                    key: "color_pop_background",
                    label: "דהיית שאר הצבעים",
                    min: 50,
                    max: 100,
                    step: 1,
                    default: 100,
                    hint: "100 = שאר התמונה שחור־לבן מלא, ערך נמוך משאיר מעט צבע"
                  }}
                  params={savedParams}
                  onChange={updateParam}
                  onReset={resetSingleParam}
                />
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={!hasAnyQuickAdjustments}
                onClick={resetQuickParams}
              >
                ↺ איפוס מהיר
              </button>
            </div>
          </AccordionSection>

          <AccordionSection title="עריכה מתקדמת" defaultOpen={false}>
            <p style={{ margin: "0 0 10px", fontSize: 11, color: "var(--color-text-secondary,#888)", lineHeight: 1.5 }}>
              לכלים כבדים כמו AI, הסרת רקע חכמה, שחזור פנים, LUT, ניקוי רעש ועיבוד איכותי — פתח את עורך התמונות המלא.
            </p>
            <button
              className="btn-block btn-primary"
              type="button"
              disabled={!asset || advancedBusy}
              onClick={() => void openAdvancedEditor()}
            >
              <Sparkles size={14} />
              {advancedBusy ? "פותח עורך…" : "פתח עריכה מתקדמת"}
            </button>
          </AccordionSection>

          <AccordionSection title="אפקטים ויזואליים (FX)" defaultOpen={false}>
            <VisualEffectsControls layer={layer} onPatch={onPatch} />
          </AccordionSection>

          {onBatchFieldChange !== undefined && (
            <BatchVariableSection
              layerId={layer.id}
              layerType="frame"
              batchField={batchField}
              onFieldChange={onBatchFieldChange}
            />
          )}

          <div className="accordion-content">
            <button className="btn-block btn-danger" onClick={onDelete} type="button">
              <Trash2 size={14} /> מחק שכבה
            </button>
          </div>
        </>
      )}
    </>
  );
}



// ג”€ג”€ג”€ Pages panel (left sidebar pages tab) ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

function PageThumbButton({
  active,
  index,
  pageId,
  onSelectPage
}: {
  active: boolean;
  index: number;
  pageId: string;
  onSelectPage: (pageId: string) => void;
}): ReactElement {
  useEffect(() => trackDebugMount("PageThumb", { pageId, index }), [pageId, index]);

  return (
    <button
      className={`page-thumb-btn ${active ? "active" : ""}`}
      onClick={() => onSelectPage(pageId)}
      type="button"
    >
      <div className="page-thumb-preview">{index + 1}</div>
      <span>עמוד {index + 1}</span>
    </button>
  );
}

function PageThumbMount({ index, pageId }: { index: number; pageId: string }): null {
  useEffect(() => trackDebugMount("PageThumb", { pageId, index }), [pageId, index]);
  return null;
}

function PagesPanel({
  activePageId,
  document,
  onAddPage,
  onDuplicatePage,
  onRemovePage,
  onSelectPage
}: {
  activePageId: string;
  document: Document;
  onAddPage: () => void;
  onDuplicatePage: () => void;
  onRemovePage: () => void;
  onSelectPage: (pageId: string) => void;
}): ReactElement {
  return (
    <div className="pages-panel">
      <div className="page-panel-section-title">עמודים</div>
      <div className="page-thumbs-list">
        {document.pages.map((page, index) => (
          <Fragment key={page.id}>
          <PageThumbMount index={index} pageId={page.id} />
          <button
            className={`page-thumb-btn ${page.id === activePageId ? "active" : ""}`}
            onClick={() => onSelectPage(page.id)}
            type="button"
          >
            <div className="page-thumb-preview">{index + 1}</div>
            <span>עמוד {index + 1}</span>
          </button>
          </Fragment>
        ))}
      </div>
      <div className="button-row">
        <button className="toggle" onClick={onAddPage} type="button"><Plus size={14} />חדש</button>
        <button className="toggle" onClick={onDuplicatePage} type="button"><Copy size={14} />שכפל</button>
        <button className="toggle" disabled={document.pages.length <= 1} onClick={onRemovePage} type="button"><Trash2 size={14} />מחק</button>
      </div>
    </div>
  );
}

// ג”€ג”€ג”€ Page settings panel (left sidebar settings tab) ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

function PageSettingsPanel({
  activePage,
  document,
  viewport,
  onAddGuide,
  onApplyPageSetup
}: {
  activePage: Document["pages"][number];
  document: Document;
  viewport: ViewportStore;
  onAddGuide: (axis: "x" | "y") => void;
  onApplyPageSetup: (setup: PageSetup) => void;
}): ReactElement {
  const [presetId, setPresetId] = useState(String(activePage.setup.metadata?.presetId ?? "a4"));
  const [units, setUnits] = useState<Unit>(activePage.setup.units);
  const [dpi, setDpi] = useState(activePage.setup.dpi);
  const [orientation, setOrientation] = useState(activePage.orientation);
  const [customSize, setCustomSize] = useState(String(activePage.setup.metadata?.presetId ?? "a4") === "custom");
  const [customWidth, setCustomWidth] = useState(pxToUnit(activePage.width, activePage.setup.units, activePage.setup.dpi));
  const [customHeight, setCustomHeight] = useState(pxToUnit(activePage.height, activePage.setup.units, activePage.setup.dpi));
  const [bleed, setBleed] = useState(pxToUnit(activePage.bleed.top, activePage.setup.units, activePage.setup.dpi));
  const [margins, setMargins] = useState(pxToUnit(activePage.margins.top, activePage.setup.units, activePage.setup.dpi));
  const [safeArea, setSafeArea] = useState(pxToUnit(activePage.setup.safeArea.top, activePage.setup.units, activePage.setup.dpi));

  useEffect(() => {
    setPresetId(String(activePage.setup.metadata?.presetId ?? "a4"));
    setCustomSize(String(activePage.setup.metadata?.presetId ?? "a4") === "custom");
    setUnits(activePage.setup.units);
    setDpi(activePage.setup.dpi);
    setOrientation(activePage.orientation);
    setCustomWidth(pxToUnit(activePage.width, activePage.setup.units, activePage.setup.dpi));
    setCustomHeight(pxToUnit(activePage.height, activePage.setup.units, activePage.setup.dpi));
    setBleed(pxToUnit(activePage.bleed.top, activePage.setup.units, activePage.setup.dpi));
    setMargins(pxToUnit(activePage.margins.top, activePage.setup.units, activePage.setup.dpi));
    setSafeArea(pxToUnit(activePage.setup.safeArea.top, activePage.setup.units, activePage.setup.dpi));
  }, [activePage.id]);

  function handlePresetChange(nextPresetId: string): void {
    const preset = PAGE_PRESETS.find((item) => item.id === nextPresetId) ?? PAGE_PRESETS[1];
    setPresetId(nextPresetId);
    setCustomSize(preset.id === "custom");
    setUnits(preset.units);
    setDpi(preset.dpi);
    setCustomWidth(preset.width);
    setCustomHeight(preset.height);
    setBleed(preset.bleed ?? 0);
    setMargins(preset.margins ?? 0);
    setSafeArea(preset.margins ?? 0);
  }

  function applySettings(): void {
    const preset = PAGE_PRESETS.find((item) => item.id === presetId) ?? PAGE_PRESETS[1];
    const sourcePreset = customSize
      ? { ...preset, width: customWidth, height: customHeight, units, dpi }
      : { ...preset, dpi };
    const nextSetup = pageSetupFromPreset(sourcePreset, orientation);
    const bleedPx = unitToPx(bleed, units, dpi);
    const marginsPx = unitToPx(margins, units, dpi);
    const safeAreaPx = unitToPx(safeArea, units, dpi);
    onApplyPageSetup({
      ...nextSetup,
      units,
      dpi,
      bleed: { top: bleedPx, right: bleedPx, bottom: bleedPx, left: bleedPx },
      margins: { top: marginsPx, right: marginsPx, bottom: marginsPx, left: marginsPx },
      safeArea: { top: safeAreaPx, right: safeAreaPx, bottom: safeAreaPx, left: safeAreaPx }
    });
  }

  return (
    <div className="page-settings-panel">
      <div className="page-panel-section-title">הגדרות עמוד</div>

      <label className="field">
        <span className="field-label">מידת עמוד</span>
        <select className="text-input" onChange={(event) => handlePresetChange(event.target.value)} value={presetId}>
          {PAGE_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>{preset.name}</option>
          ))}
        </select>
      </label>

      <div className="seg">
        <button className={orientation === "portrait" ? "on" : ""} onClick={() => setOrientation("portrait")} type="button">לאורך</button>
        <button className={orientation === "landscape" ? "on" : ""} onClick={() => setOrientation("landscape")} type="button">לרוחב</button>
        <button disabled type="button">כפולה</button>
      </div>

      <label className="check-line">
        <input checked={customSize} onChange={(event) => setCustomSize(event.target.checked)} type="checkbox" />
        מידה מותאמת אישית
      </label>

      <div className="field-grid">
        <label className="field">
          <span className="field-label">יחידות</span>
          <select className="text-input" onChange={(event) => setUnits(event.target.value as Unit)} value={units}>
            <option value="mm">מ״מ</option>
            <option value="cm">ס״מ</option>
            <option value="inch">אינץ׳</option>
            <option value="px">פיקסלים</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">DPI</span>
          <input className="text-input" max={1200} min={72} onChange={(event) => setDpi(Number(event.target.value) || 300)} type="number" value={dpi} />
        </label>
        <label className="field">
          <span className="field-label">רוחב</span>
          <input className="text-input" disabled={!customSize} min={1} onChange={(event) => setCustomWidth(Number(event.target.value) || 1)} type="number" value={Math.round(customWidth * 100) / 100} />
        </label>
        <label className="field">
          <span className="field-label">גובה</span>
          <input className="text-input" disabled={!customSize} min={1} onChange={(event) => setCustomHeight(Number(event.target.value) || 1)} type="number" value={Math.round(customHeight * 100) / 100} />
        </label>
        <label className="field">
          <span className="field-label">בליד</span>
          <input className="text-input" min={0} onChange={(event) => setBleed(Number(event.target.value) || 0)} type="number" value={bleed} />
        </label>
        <label className="field">
          <span className="field-label">שוליים</span>
          <input className="text-input" min={0} onChange={(event) => setMargins(Number(event.target.value) || 0)} type="number" value={margins} />
        </label>
        <label className="field">
          <span className="field-label">אזור בטוח</span>
          <input className="text-input" min={0} onChange={(event) => setSafeArea(Number(event.target.value) || 0)} type="number" value={safeArea} />
        </label>
      </div>

      <button className="btn-block" onClick={applySettings} type="button">החלת הגדרות</button>

      <div className="page-panel-section-title" style={{ marginTop: 6 }}>תצוגה</div>
      <div className="button-row">
        <button className={viewport.showRulers ? "toggle on" : "toggle"} onClick={viewport.toggleRulers} type="button">סרגלים</button>
        <button className={viewport.showGrid ? "toggle on" : "toggle"} onClick={viewport.toggleGrid} type="button">גריד</button>
        <button className={viewport.showGuides ? "toggle on" : "toggle"} onClick={viewport.toggleGuides} type="button">קווי עזר</button>
        <button className={viewport.snapEnabled ? "toggle on" : "toggle"} onClick={viewport.toggleSnap} type="button">הצמדה</button>
      </div>
      <div className="button-row">
        <button className="toggle" onClick={() => onAddGuide("x")} type="button">קו אנכי</button>
        <button className="toggle" onClick={() => onAddGuide("y")} type="button">קו אופקי</button>
      </div>

      <div className="page-panel-section-title" style={{ marginTop: 6 }}>מראה עמוד (Page Look)</div>
      <PageLookPanel />
    </div>
  );
}

// ג”€ג”€ג”€ Slider field ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

function GridModePanel({
  assignmentCount,
  rule,
  selectedLayer,
  onAddFilenameText,
  onAddImages,
  onApplyFit,
  onApplyFaceCrop,
  onApplySelectedText,
  onDeleteSelectedImage,
  onRegenerate,
  onResetCrops
}: {
  assignmentCount: number;
  rule: GridLayoutRule;
  selectedLayer: VisualLayer | null;
  onAddFilenameText: () => void;
  onAddImages: () => void;
  onApplyFit: (rule: GridLayoutRule, fitMode: GridLayoutRule["fitMode"]) => void;
  onApplyFaceCrop: () => void;
  onApplySelectedText: () => void;
  onDeleteSelectedImage: () => void;
  onRegenerate: (rule: GridLayoutRule, patch: Partial<GridLayoutRule>) => void;
  onResetCrops: () => void;
}): ReactElement {
  const [rows, setRows] = useState(rule.rows);
  const [columns, setColumns] = useState(rule.columns);
  const [spacingX, setSpacingX] = useState(rule.spacingX);
  const [spacingY, setSpacingY] = useState(rule.spacingY);
  const selectedIsGridCell = selectedLayer?.type === "frame" && selectedLayer.metadata["gridCell"] !== undefined;
  const selectedIsText = selectedLayer?.type === "text";

  useEffect(() => {
    setRows(rule.rows);
    setColumns(rule.columns);
    setSpacingX(rule.spacingX);
    setSpacingY(rule.spacingY);
  }, [rule.id, rule.rows, rule.columns, rule.spacingX, rule.spacingY]);

  return (
    <section className="panel-card grid-mode-panel">
      <div className="panel-section-title">מצב גריד</div>
      <div className="metrics-grid">
        <Metric label="שורות" value={rule.rows} />
        <Metric label="עמודות" value={rule.columns} />
        <Metric label="תמונות" value={assignmentCount} />
      </div>
      {selectedIsGridCell ? <p className="panel-note">התא מנוהל על ידי הגריד. מזיזים רק את התמונה שבתוכו.</p> : null}
      <button className="btn btn-accent wide" onClick={onAddImages} type="button">
        <ImagePlus size={14} />
        הוספת תמונות
      </button>
      <div className="field-grid">
        <NumberField label="שורות" min={1} max={40} value={rows} onChange={setRows} />
        <NumberField label="עמודות" min={1} max={40} value={columns} onChange={setColumns} />
        <NumberField label="ריווח X" min={0} max={400} value={Math.round(spacingX)} onChange={setSpacingX} />
        <NumberField label="ריווח Y" min={0} max={400} value={Math.round(spacingY)} onChange={setSpacingY} />
      </div>
      <button className="btn btn-ghost wide" onClick={onApplyFaceCrop} type="button">
        <Sparkles size={14} />
        התאמה לפי פנים
      </button>
      <button className="mini-action success" onClick={() => onRegenerate(rule, { rows, columns, spacingX, spacingY })} type="button">
        בניית גריד מחדש
      </button>
      <div className="field">
        <span className="field-label">התאמת תמונה</span>
        <div className="seg">
          {(["fit", "fill", "smartCrop", "stretch"] as const).map((mode) => (
            <button className={rule.fitMode === mode ? "on" : ""} key={mode} onClick={() => onApplyFit(rule, mode)} type="button">
              {fitModeLabel(mode)}
            </button>
          ))}
        </div>
      </div>
      <div className="button-row">
        <button className="mini-action" onClick={onResetCrops} type="button">איפוס חיתוכים</button>
        <button className="mini-action" onClick={onAddFilenameText} type="button">טקסט משמות קבצים</button>
      </div>
      <button className="mini-action success" disabled={!selectedIsText} onClick={onApplySelectedText} type="button">
        החל טקסט נבחר על כל התאים
      </button>
      <button className="mini-action danger" disabled={!selectedIsGridCell} onClick={onDeleteSelectedImage} type="button">
        מחיקת תמונה ומילוי מהסוף
      </button>
    </section>
  );
}

function MaskShapeIcon({ shape, size = 28 }: { shape: string; size?: number }): ReactElement {
  const s = size;
  if (shape === "circle") {
    return <svg width={s} height={s} viewBox="0 0 40 40" style={{ fill: "var(--accent)", opacity: 0.8 }}><circle cx="20" cy="20" r="18" /></svg>;
  }
  if (shape === "heart") {
    return <svg width={s} height={s} viewBox="0 0 40 40" style={{ fill: "var(--accent)", opacity: 0.8 }}><path d="M20 34 C20 34 4 24 4 14 C4 9 8 6 12 6 C15 6 18 8 20 11 C22 8 25 6 28 6 C32 6 36 9 36 14 C36 24 20 34 20 34Z" /></svg>;
  }
  if (shape === "star") {
    return <svg width={s} height={s} viewBox="0 0 40 40" style={{ fill: "var(--accent)", opacity: 0.8 }}><polygon points="20,3 25,15 38,15 28,24 32,36 20,28 8,36 12,24 2,15 15,15" /></svg>;
  }
  return <svg width={s} height={s} viewBox="0 0 40 40" style={{ fill: "var(--accent)", opacity: 0.8 }}><rect x="4" y="4" width="32" height="32" rx="8" ry="8" /></svg>;
}

function MaskModePanel({
  assignmentCount,
  dpi,
  rule,
  selectedLayer,
  onAddFilenameText,
  onAddImages,
  onApplyFit,
  onApplyFaceCrop,
  onApplySelectedText,
  onDeleteSelectedImage,
  onRegenerate,
  onResetCrops,
  onChangePreset
}: {
  assignmentCount: number;
  dpi: number;
  rule: MaskLayoutRule;
  selectedLayer: VisualLayer | null;
  onAddFilenameText: () => void;
  onAddImages: () => void;
  onApplyFit: (rule: MaskLayoutRule, fitMode: MaskLayoutRule["fitMode"]) => void;
  onApplyFaceCrop: () => void;
  onApplySelectedText: () => void;
  onDeleteSelectedImage: () => void;
  onRegenerate: (rule: MaskLayoutRule, patch: Partial<MaskLayoutRule>) => void;
  onResetCrops: () => void;
  onChangePreset: (entry: import("@/state/maskLibraryStore").MaskLibraryEntry) => void;
}): ReactElement {
  const initialSpacingMM = typeof rule.spacingMM === "number" ? rule.spacingMM : pxToMm(Math.max(rule.spacingX, rule.spacingY), dpi);
  const [maskWidth, setMaskWidth] = useState(rule.maskWidth);
  const [maskHeight, setMaskHeight] = useState(rule.maskHeight);
  const [spacingMM, setSpacingMM] = useState<number>(initialSpacingMM);
  const [spacingUnit, setSpacingUnit] = useState<"mm" | "cm" | "inch">(rule.spacingUnit === "cm" || rule.spacingUnit === "inch" ? rule.spacingUnit : "mm");
  const [spacingDraft, setSpacingDraft] = useState("");
  const [maskUnit, setMaskUnit] = useState<MaskDimensionUnit>("mm");
  const [widthDraft, setWidthDraft] = useState("");
  const [heightDraft, setHeightDraft] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const maskStyle: import("@/types/mask").MaskStyle = rule.maskStyle ?? {
    border: { enabled: false, color: "#1f2937", widthMm: 1 },
    shadow: { enabled: false, color: "#000000", blur: 12, opacity: 0.35, offsetX: 0, offsetY: 4 }
  };
  const libraryEntries = useMaskLibraryStore((s) => s.entries);
  const selectedIsMaskFrame = selectedLayer?.type === "frame" && selectedLayer.metadata["maskFrame"] !== undefined;
  const selectedIsText = selectedLayer?.type === "text";

  const BUILT_IN: { shape: string; label: string }[] = [
    { shape: "circle", label: "עיגול" },
    { shape: "heart", label: "לב" },
    { shape: "roundedRect", label: "מלבן" },
    { shape: "star", label: "כוכב" }
  ];

  useEffect(() => {
    setMaskWidth(rule.maskWidth);
    setMaskHeight(rule.maskHeight);
    const nextMM = typeof rule.spacingMM === "number" ? rule.spacingMM : pxToMm(Math.max(rule.spacingX, rule.spacingY), dpi);
    setSpacingMM(nextMM);
  }, [dpi, rule.id, rule.maskWidth, rule.maskHeight, rule.spacingMM, rule.spacingX, rule.spacingY]);

  useEffect(() => {
    setWidthDraft(formatDimension(pxToUnit(maskWidth, maskUnit, dpi), maskUnit));
    setHeightDraft(formatDimension(pxToUnit(maskHeight, maskUnit, dpi), maskUnit));
  }, [dpi, maskUnit, maskWidth, maskHeight]);

  useEffect(() => {
    const displayed = spacingUnit === "mm" ? spacingMM : spacingUnit === "cm" ? spacingMM / 10 : spacingMM / 25.4;
    setSpacingDraft(formatDimension(displayed, spacingUnit));
  }, [spacingMM, spacingUnit]);

  function commitSpacingDraft(): void {
    const parsed = parseFloat(spacingDraft.replace(",", "."));
    const safe = Number.isFinite(parsed) && parsed >= 0 ? parsed : (spacingUnit === "mm" ? spacingMM : spacingUnit === "cm" ? spacingMM / 10 : spacingMM / 25.4);
    const mm = spacingUnit === "mm" ? safe : spacingUnit === "cm" ? safe * 10 : safe * 25.4;
    setSpacingMM(mm);
  }

  function updateMaskStyle(next: import("@/types/mask").MaskStyle): void {
    onRegenerate(rule, { maskStyle: next });
  }

  function updateWidth(value: number): void {
    setMaskWidth(value);
    if (rule.keepProportions) setMaskHeight(value);
  }

  function updateHeight(value: number): void {
    setMaskHeight(value);
    if (rule.keepProportions) setMaskWidth(value);
  }

  function selectBuiltIn(shape: string): void {
    onRegenerate(rule, { maskShape: shape as import("@/types/mask").MaskShape, metadata: { ...rule.metadata, maskAssetId: null } });
    setPickerOpen(false);
  }

  function unitBounds(unit: MaskDimensionUnit): { min: number; max: number } {
    if (unit === "cm") return { min: 0.1, max: 50 };
    if (unit === "mm") return { min: 1, max: 500 };
    return { min: 0.05, max: 20 };
  }

  function commitDimensionDraft(axis: "width" | "height"): void {
    const { min, max } = unitBounds(maskUnit);
    const fallbackPx = axis === "width" ? maskWidth : maskHeight;
    const fallbackUnit = pxToUnit(fallbackPx, maskUnit, dpi);
    const committedUnit = commitDraftDimension(axis === "width" ? widthDraft : heightDraft, fallbackUnit, min, max);
    const committedPx = unitToPx(committedUnit, maskUnit, dpi);
    if (axis === "width") {
      setMaskWidth(committedPx);
      if (rule.keepProportions) setMaskHeight(committedPx);
    } else {
      setMaskHeight(committedPx);
      if (rule.keepProportions) setMaskWidth(committedPx);
    }
  }

  function commitAndRegenerate(): void {
    const { min, max } = unitBounds(maskUnit);
    const widthUnit = commitDraftDimension(widthDraft, pxToUnit(maskWidth, maskUnit, dpi), min, max);
    const heightUnit = commitDraftDimension(heightDraft, pxToUnit(maskHeight, maskUnit, dpi), min, max);
    const nextWidth = unitToPx(widthUnit, maskUnit, dpi);
    const nextHeight = unitToPx(rule.keepProportions ? widthUnit : heightUnit, maskUnit, dpi);
    setMaskWidth(nextWidth);
    setMaskHeight(nextHeight);
    const spacingPx = mmToPx(spacingMM, dpi);
    onRegenerate(rule, { maskWidth: nextWidth, maskHeight: nextHeight, spacingX: spacingPx, spacingY: spacingPx, spacingMM, spacingUnit });
  }

  return (
    <section className="panel-card grid-mode-panel">
      <div className="panel-section-title">מצב מסיכה</div>
      <div className="metrics-grid">
        <span className="metric">
          <span>צורה</span>
          <strong>{rule.maskShape === "custom" ? "מותאם" : rule.maskShape}</strong>
        </span>
        <Metric label="תמונות" value={assignmentCount} />
        <Metric label="דפים" value={rule.pageIds.length} />
      </div>

      {/* Preset picker */}
      <div style={{ position: "relative" }}>
        <button
          className="btn btn-ghost wide"
          onClick={() => setPickerOpen((v) => !v)}
          type="button"
        >
          <Layers size={13} />
          שנה מסיכה
          <ChevronDown size={11} style={{ marginRight: "auto" }} />
        </button>

        {pickerOpen && (
          <div className="mask-picker-dropdown">
            {/* Built-in shapes */}
            {BUILT_IN.map(({ shape, label }) => (
              <button
                key={shape}
                className={`mask-picker-item ${rule.maskShape === shape ? "selected" : ""}`}
                onClick={() => selectBuiltIn(shape)}
                type="button"
              >
                <div className="mask-picker-thumb-shape">
                  <MaskShapeIcon shape={shape} size={28} />
                </div>
                <span className="mask-picker-label">{label}</span>
              </button>
            ))}
            {/* Library entries */}
            {libraryEntries.map((entry) => (
              <button
                key={entry.id}
                className="mask-picker-item"
                onClick={() => { onChangePreset(entry); setPickerOpen(false); }}
                type="button"
              >
                <div className="mask-picker-thumb">
                  {entry.thumbnailDataUrl
                    ? <img src={entry.thumbnailDataUrl} alt={entry.name} />
                    : <div style={{ width: 44, height: 44 }} />}
                </div>
                <span className="mask-picker-label">{entry.name}</span>
              </button>
            ))}
            {libraryEntries.length === 0 && (
              <span style={{ fontSize: 11, color: "var(--text-muted)", padding: "6px", gridColumn: "1/-1" }}>
                אין מסיכות בספרייה
              </span>
            )}
          </div>
        )}
      </div>

      {selectedIsMaskFrame ? <p className="panel-note">מסיכה זו מנוהלת אוטומטית. ניתן לחתוך, לסובב ולשנות גודל התמונה בפנים.</p> : null}
      <button className="btn btn-accent wide" onClick={onAddImages} type="button">
        <ImagePlus size={14} />
        הוסף תמונות
      </button>
      <div className="field">
        <span className="field-label">יחידות מידה</span>
        <div className="seg">
          {MASK_DIMENSION_UNITS.map((unit) => (
            <button className={maskUnit === unit ? "on" : ""} key={unit} onClick={() => setMaskUnit(unit)} type="button">
              {MASK_DIMENSION_LABELS[unit]}
            </button>
          ))}
        </div>
      </div>
      <div className="field-grid">
        <DraftNumberField label="רוחב" value={widthDraft} onChange={setWidthDraft} onCommit={() => commitDimensionDraft("width")} />
        <DraftNumberField label="גובה" value={heightDraft} onChange={setHeightDraft} onCommit={() => commitDimensionDraft("height")} />
      </div>
      <div className="field">
        <span className="field-label">ריווח בין מסיכות</span>
        <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
          <DraftNumberField label="" value={spacingDraft} onChange={setSpacingDraft} onCommit={commitSpacingDraft} />
          <div className="seg" style={{ alignSelf: "end" }}>
            {(["mm", "cm", "inch"] as const).map((u) => (
              <button className={spacingUnit === u ? "on" : ""} key={u} onClick={() => setSpacingUnit(u)} type="button">
                {u === "inch" ? "in" : u}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button className="btn btn-ghost wide" onClick={onApplyFaceCrop} type="button">
        <Sparkles size={14} />
        התאמה לפי פנים
      </button>
      <button className="mini-action success" onClick={commitAndRegenerate} type="button">
        בנה מחדש
      </button>

      {/* Mask-wide style: border + shadow */}
      <div className="panel-section-title" style={{ marginTop: 12 }}>סגנון מסכה</div>
      <div className="field">
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={maskStyle.border.enabled} onChange={(e) => updateMaskStyle({ ...maskStyle, border: { ...maskStyle.border, enabled: e.target.checked } })} />
          <span>מסגרת</span>
        </label>
        {maskStyle.border.enabled ? (
          <div className="field-grid" style={{ marginTop: 4 }}>
            <label className="field">
              <span className="field-label">עובי (מ"מ)</span>
              <input className="text-input" type="number" min={0} max={20} step={0.1}
                value={maskStyle.border.widthMm}
                onChange={(e) => updateMaskStyle({ ...maskStyle, border: { ...maskStyle.border, widthMm: Math.max(0, Number(e.target.value) || 0) } })} />
            </label>
            <label className="field">
              <span className="field-label">צבע</span>
              <input type="color" value={maskStyle.border.color}
                onChange={(e) => updateMaskStyle({ ...maskStyle, border: { ...maskStyle.border, color: e.target.value } })} />
            </label>
          </div>
        ) : null}
      </div>
      <div className="field">
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={maskStyle.shadow.enabled} onChange={(e) => updateMaskStyle({ ...maskStyle, shadow: { ...maskStyle.shadow, enabled: e.target.checked } })} />
          <span>צל</span>
        </label>
        {maskStyle.shadow.enabled ? (
          <div className="field-grid" style={{ marginTop: 4 }}>
            <label className="field">
              <span className="field-label">צבע</span>
              <input type="color" value={maskStyle.shadow.color}
                onChange={(e) => updateMaskStyle({ ...maskStyle, shadow: { ...maskStyle.shadow, color: e.target.value } })} />
            </label>
            <label className="field">
              <span className="field-label">טשטוש</span>
              <input className="text-input" type="number" min={0} max={80} step={1}
                value={maskStyle.shadow.blur}
                onChange={(e) => updateMaskStyle({ ...maskStyle, shadow: { ...maskStyle.shadow, blur: Math.max(0, Number(e.target.value) || 0) } })} />
            </label>
            <label className="field">
              <span className="field-label">שקיפות</span>
              <input className="text-input" type="number" min={0} max={1} step={0.05}
                value={maskStyle.shadow.opacity}
                onChange={(e) => updateMaskStyle({ ...maskStyle, shadow: { ...maskStyle.shadow, opacity: Math.max(0, Math.min(1, Number(e.target.value) || 0)) } })} />
            </label>
            <label className="field">
              <span className="field-label">היסט X</span>
              <input className="text-input" type="number" step={1}
                value={maskStyle.shadow.offsetX}
                onChange={(e) => updateMaskStyle({ ...maskStyle, shadow: { ...maskStyle.shadow, offsetX: Number(e.target.value) || 0 } })} />
            </label>
            <label className="field">
              <span className="field-label">היסט Y</span>
              <input className="text-input" type="number" step={1}
                value={maskStyle.shadow.offsetY}
                onChange={(e) => updateMaskStyle({ ...maskStyle, shadow: { ...maskStyle.shadow, offsetY: Number(e.target.value) || 0 } })} />
            </label>
          </div>
        ) : null}
      </div>
      <div className="field">
        <span className="field-label">התאמת תמונה</span>
        <div className="seg">
          {(["fit", "fill", "smartCrop", "stretch"] as const).map((mode) => (
            <button className={rule.fitMode === mode ? "on" : ""} key={mode} onClick={() => onApplyFit(rule, mode)} type="button">
              {fitModeLabel(mode)}
            </button>
          ))}
        </div>
      </div>
      <div className="button-row">
        <button className="mini-action" onClick={onResetCrops} type="button">איפוס חיתוכים</button>
        <button className="mini-action" onClick={onAddFilenameText} type="button">טקסט משמות קבצים</button>
      </div>
      <button className="mini-action success" disabled={!selectedIsText} onClick={onApplySelectedText} type="button">
        החל טקסט נבחר על כל המסיכות
      </button>
      <button className="mini-action danger" disabled={!selectedIsMaskFrame} onClick={onDeleteSelectedImage} type="button">
        מחק תמונה ומלא מהסוף
      </button>
    </section>
  );
}

function fitModeLabel(mode: GridLayoutRule["fitMode"]): string {
  const labels: Record<GridLayoutRule["fitMode"], string> = {
    fit: "התאם",
    fill: "מלא",
    smartCrop: "חכם",
    stretch: "מתח"
  };
  return labels[mode];
}

function NumberField({
  label,
  max,
  min,
  onChange,
  value
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}): ReactElement {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input className="text-input" max={max} min={min} onChange={(event) => onChange(Math.max(min, Math.min(max, Number(event.target.value) || min)))} type="number" value={value} />
    </label>
  );
}

function MaskOverflowPrompt({
  available,
  required,
  resizedTo,
  onCancel,
  onContinue,
  onResizePage
}: {
  available: string;
  required: string;
  resizedTo: string;
  onCancel: () => void;
  onContinue: () => void;
  onResizePage: () => void;
}): ReactElement {
  return (
    <div className="mask-overflow-overlay" role="dialog" aria-modal="true" aria-label="אזהרת גודל מסיכה">
      <div className="mask-overflow-dialog">
        <div className="mask-overflow-icon">!</div>
        <div className="mask-overflow-copy">
          <strong>גודל המסיכה גדול משטח הדף</strong>
          <span>נדרש: {required}</span>
          <span>זמין: {available}</span>
          <span>שינוי גודל דף יעד: {resizedTo}</span>
        </div>
        <div className="mask-overflow-actions">
          <button className="btn btn-ghost" onClick={onCancel} type="button">ביטול</button>
          <button className="btn btn-ghost" onClick={onContinue} type="button">המשך בכל זאת</button>
          <button className="btn btn-accent" onClick={onResizePage} type="button">שנה גודל דף</button>
        </div>
      </div>
    </div>
  );
}

function DraftNumberField({
  label,
  onChange,
  onCommit,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  value: string;
}): ReactElement {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="text-input"
        inputMode="decimal"
        onBlur={onCommit}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") onCommit(); }}
        type="text"
        value={value}
      />
    </label>
  );
}

function DocumentEnvironmentPanel({
  activePage,
  activePageId,
  document,
  onAddGuide,
  onAddPage,
  onApplyPageSetup,
  onDuplicatePage,
  onRemovePage,
  onSelectPage,
  viewport
}: {
  activePage: Document["pages"][number];
  activePageId: string;
  document: Document;
  onAddGuide: (axis: "x" | "y") => void;
  onAddPage: () => void;
  onApplyPageSetup: (setup: PageSetup) => void;
  onDuplicatePage: () => void;
  onRemovePage: () => void;
  onSelectPage: (pageId: string) => void;
  viewport: ViewportStore;
}): ReactElement {
  const [presetId, setPresetId] = useState(String(activePage.setup.metadata?.presetId ?? "a4"));
  const [units, setUnits] = useState<Unit>(activePage.setup.units);
  const [dpi, setDpi] = useState(activePage.setup.dpi);
  const [orientation, setOrientation] = useState(activePage.orientation);
  const [customSize, setCustomSize] = useState(String(activePage.setup.metadata?.presetId ?? "a4") === "custom");
  const [customWidth, setCustomWidth] = useState(pxToUnit(activePage.width, activePage.setup.units, activePage.setup.dpi));
  const [customHeight, setCustomHeight] = useState(pxToUnit(activePage.height, activePage.setup.units, activePage.setup.dpi));
  const [bleed, setBleed] = useState(pxToUnit(activePage.bleed.top, activePage.setup.units, activePage.setup.dpi));
  const [margins, setMargins] = useState(pxToUnit(activePage.margins.top, activePage.setup.units, activePage.setup.dpi));
  const [safeArea, setSafeArea] = useState(pxToUnit(activePage.setup.safeArea.top, activePage.setup.units, activePage.setup.dpi));

  useEffect(() => {
    setPresetId(String(activePage.setup.metadata?.presetId ?? "a4"));
    setCustomSize(String(activePage.setup.metadata?.presetId ?? "a4") === "custom");
    setUnits(activePage.setup.units);
    setDpi(activePage.setup.dpi);
    setOrientation(activePage.orientation);
    setCustomWidth(pxToUnit(activePage.width, activePage.setup.units, activePage.setup.dpi));
    setCustomHeight(pxToUnit(activePage.height, activePage.setup.units, activePage.setup.dpi));
    setBleed(pxToUnit(activePage.bleed.top, activePage.setup.units, activePage.setup.dpi));
    setMargins(pxToUnit(activePage.margins.top, activePage.setup.units, activePage.setup.dpi));
    setSafeArea(pxToUnit(activePage.setup.safeArea.top, activePage.setup.units, activePage.setup.dpi));
  }, [activePage.id]);

  function handlePresetChange(nextPresetId: string): void {
    const preset = PAGE_PRESETS.find((item) => item.id === nextPresetId) ?? PAGE_PRESETS[1];
    setPresetId(nextPresetId);
    setCustomSize(preset.id === "custom");
    setUnits(preset.units);
    setDpi(preset.dpi);
    setCustomWidth(preset.width);
    setCustomHeight(preset.height);
    setBleed(preset.bleed ?? 0);
    setMargins(preset.margins ?? 0);
    setSafeArea(preset.margins ?? 0);
  }

  function applySizeChange(): void {
    const preset = PAGE_PRESETS.find((item) => item.id === presetId) ?? PAGE_PRESETS[1];
    const sourcePreset = customSize
      ? {
          ...preset,
          width: customWidth,
          height: customHeight,
          units,
          dpi
        }
      : {
          ...preset,
          dpi
        };
    const nextSetup = pageSetupFromPreset(sourcePreset, orientation);
    const bleedPx = unitToPx(bleed, units, dpi);
    const marginsPx = unitToPx(margins, units, dpi);
    const safeAreaPx = unitToPx(safeArea, units, dpi);
    onApplyPageSetup({
      ...nextSetup,
      units,
      dpi,
      bleed: {
        top: bleedPx,
        right: bleedPx,
        bottom: bleedPx,
        left: bleedPx
      },
      margins: {
        top: marginsPx,
        right: marginsPx,
        bottom: marginsPx,
        left: marginsPx
      },
      safeArea: {
        top: safeAreaPx,
        right: safeAreaPx,
        bottom: safeAreaPx,
        left: safeAreaPx
      }
    });
  }

  return (
    <section className="document-env">
      <h3>מסמך</h3>
      <div className="button-row">
        <button className="toggle" onClick={onAddPage} type="button"><Plus size={14} />עמוד</button>
        <button className="toggle" onClick={onDuplicatePage} type="button"><Copy size={14} />שכפל</button>
        <button className="toggle" disabled={document.pages.length <= 1} onClick={onRemovePage} type="button"><Trash2 size={14} />מחק</button>
      </div>
      <div className="page-strip">
        {document.pages.map((page, index) => (
          <button className={page.id === activePageId ? "on" : ""} key={page.id} onClick={() => onSelectPage(page.id)} type="button">
            {index + 1}
          </button>
        ))}
      </div>
      <label className="field">
        <span className="field-label">מידת עמוד</span>
        <select className="text-input" onChange={(event) => handlePresetChange(event.target.value)} value={presetId}>
          {PAGE_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>{preset.name}</option>
          ))}
        </select>
      </label>
      <div className="seg">
        <button className={orientation === "portrait" ? "on" : ""} onClick={() => setOrientation("portrait")} type="button">לאורך</button>
        <button className={orientation === "landscape" ? "on" : ""} onClick={() => setOrientation("landscape")} type="button">לרוחב</button>
        <button disabled type="button">כפולה</button>
      </div>
      <label className="check-line">
        <input checked={customSize} onChange={(event) => setCustomSize(event.target.checked)} type="checkbox" />
        מידה מותאמת אישית
      </label>
      <div className="field-grid">
        <label className="field">
          <span className="field-label">יחידות</span>
          <select className="text-input" onChange={(event) => setUnits(event.target.value as Unit)} value={units}>
            <option value="mm">מ״מ</option>
            <option value="cm">ס״מ</option>
            <option value="inch">אינץ׳</option>
            <option value="px">פיקסלים</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">DPI</span>
          <input className="text-input" max={1200} min={72} onChange={(event) => setDpi(Number(event.target.value) || 300)} type="number" value={dpi} />
        </label>
        <label className="field">
          <span className="field-label">רוחב</span>
          <input className="text-input" disabled={!customSize} min={1} onChange={(event) => setCustomWidth(Number(event.target.value) || 1)} type="number" value={Math.round(customWidth * 100) / 100} />
        </label>
        <label className="field">
          <span className="field-label">גובה</span>
          <input className="text-input" disabled={!customSize} min={1} onChange={(event) => setCustomHeight(Number(event.target.value) || 1)} type="number" value={Math.round(customHeight * 100) / 100} />
        </label>
        <label className="field">
          <span className="field-label">בליד</span>
          <input className="text-input" min={0} onChange={(event) => setBleed(Number(event.target.value) || 0)} type="number" value={bleed} />
        </label>
        <label className="field">
          <span className="field-label">שוליים</span>
          <input className="text-input" min={0} onChange={(event) => setMargins(Number(event.target.value) || 0)} type="number" value={margins} />
        </label>
        <label className="field">
          <span className="field-label">אזור בטוח</span>
          <input className="text-input" min={0} onChange={(event) => setSafeArea(Number(event.target.value) || 0)} type="number" value={safeArea} />
        </label>
      </div>
      <button className="btn-block" onClick={applySizeChange} type="button">החלפת מידת קנבס</button>
      <div className="button-row">
        <button className={viewport.showRulers ? "toggle on" : "toggle"} onClick={viewport.toggleRulers} type="button">סרגלים</button>
        <button className={viewport.showGrid ? "toggle on" : "toggle"} onClick={viewport.toggleGrid} type="button">גריד</button>
        <button className={viewport.showGuides ? "toggle on" : "toggle"} onClick={viewport.toggleGuides} type="button">קווי עזר</button>
        <button className={viewport.snapEnabled ? "toggle on" : "toggle"} onClick={viewport.toggleSnap} type="button">הצמדה</button>
      </div>
      <div className="button-row">
        <button className="toggle" onClick={() => onAddGuide("x")} type="button">קו אנכי</button>
        <button className="toggle" onClick={() => onAddGuide("y")} type="button">קו אופקי</button>
      </div>
    </section>
  );
}

function SliderField({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
  decimals = 0,
  unit = ""
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  decimals?: number;
  unit?: string;
}): ReactElement {
  // Local state for immediate visual feedback — avoids the store round-trip lag.
  const [localValue, setLocalValue] = useState(value);
  const isDragging = useRef(false);
  const rafRef = useRef<number | null>(null);

  // Sync from external value only when the user is not dragging.
  useEffect(() => {
    if (!isDragging.current) setLocalValue(value);
  }, [value]);

  function commit(v: number): void {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      onChange(v);
    });
  }

  return (
    <label className="field slider-field">
      <div className="slider-header">
        <span className="field-label">{label}</span>
        <span className="slider-value">{localValue.toFixed(decimals)}{unit}</span>
      </div>
      <input
        className="slider"
        max={max}
        min={min}
        step={step}
        type="range"
        value={localValue}
        onPointerDown={() => { isDragging.current = true; }}
        onPointerUp={(e) => {
          isDragging.current = false;
          const v = Number(e.currentTarget.value);
          setLocalValue(v);
          if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
          onChange(v);
        }}
        onChange={(e) => {
          const v = Number(e.target.value);
          setLocalValue(v);
          commit(v);
        }}
      />
    </label>
  );
}

// ג”€ג”€ג”€ Font selector ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

function getBrightnessContrastOperation(layer: AdjustmentLayer): { type: "brightnessContrast"; brightness: number; contrast: number } {
  const operation = layer.adjustments.find((item) => item.type === "brightnessContrast");
  return operation ?? { type: "brightnessContrast", brightness: 0, contrast: 0 };
}

function AdjustmentLayerControls({
  layer,
  onPatch
}: {
  layer: AdjustmentLayer;
  onPatch: (patch: Partial<VisualLayer>) => void;
}): ReactElement {
  const operation = getBrightnessContrastOperation(layer);
  const blendModeOptions: BlendMode[] = ["normal", "multiply", "screen", "overlay", "darken", "lighten"];

  function patchOperation(patch: Partial<typeof operation>): void {
    const nextOperation = { ...operation, ...patch };
    onPatch({
      adjustments: layer.adjustments.some((item) => item.type === "brightnessContrast")
        ? layer.adjustments.map((item) => item.type === "brightnessContrast" ? nextOperation : item)
        : [nextOperation, ...layer.adjustments]
    } as Partial<VisualLayer>);
  }

  return (
    <section className="adjustment-layer-controls">
      <label className="field">
        <span className="field-label">שם שכבה</span>
        <input className="text-input" onChange={(event) => onPatch({ name: event.target.value } as Partial<VisualLayer>)} value={layer.name} />
      </label>
      <div className="quick-controls">
        <button className={layer.visible ? "toggle on" : "toggle"} onClick={() => onPatch({ visible: !layer.visible } as Partial<VisualLayer>)} type="button">
          {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
          תצוגה
        </button>
        <button className={layer.locked ? "toggle on" : "toggle"} onClick={() => onPatch({ locked: !layer.locked } as Partial<VisualLayer>)} type="button">
          {layer.locked ? <Lock size={14} /> : <Unlock size={14} />}
          נעילה
        </button>
      </div>
      <SliderField label="אטימות שכבה" min={0} max={1} step={0.01} value={layer.opacity} onChange={(v) => onPatch({ opacity: v } as Partial<VisualLayer>)} decimals={2} />
      <label className="field">
        <span className="field-label">Blend mode</span>
        <select className="text-input" onChange={(event) => onPatch({ blendMode: event.target.value as BlendMode } as Partial<VisualLayer>)} value={layer.blendMode}>
          {blendModeOptions.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="field-label">משפיעה על</span>
        <select className="text-input" onChange={(event) => onPatch({ targetMode: event.target.value as AdjustmentLayer["targetMode"] } as Partial<VisualLayer>)} value={layer.targetMode}>
          <option value="below">כל השכבות שמתחת</option>
          <option value="clipped-to-layer">רק השכבה שמתחת</option>
        </select>
      </label>
      <SliderField label="בהירות" min={-100} max={100} value={operation.brightness} onChange={(v) => patchOperation({ brightness: v })} />
      <SliderField label="ניגודיות" min={-100} max={100} value={operation.contrast} onChange={(v) => patchOperation({ contrast: v })} />
      <button className="mini-action" onClick={() => patchOperation({ brightness: 0, contrast: 0 })} type="button">
        <RotateCcw size={13} />
        איפוס
      </button>
    </section>
  );
}

type AdjustmentOperationType = AdjustmentOperation["type"];

function defaultAdjustmentOperation(type: AdjustmentOperationType): AdjustmentOperation {
  if (type === "brightnessContrast") return { type, brightness: 0, contrast: 0 };
  if (type === "exposure") return { type, exposure: 0, gamma: 1, offset: 0 };
  if (type === "hueSaturation") return { type, hue: 0, saturation: 0, lightness: 0 };
  if (type === "blackWhite") return { type, enabled: true };
  if (type === "invert") return { type, enabled: true };
  if (type === "sepia") return { type, intensity: 80, warmth: 100 };
  return { type, black: 0, mid: 1, white: 255 };
}

function adjustmentOperationLabel(operation: AdjustmentOperation): string {
  if (operation.type === "brightnessContrast") return "בהירות/ניגודיות";
  if (operation.type === "exposure") return "חשיפה";
  if (operation.type === "hueSaturation") return "גוון/רוויה";
  if (operation.type === "blackWhite") return "שחור לבן";
  if (operation.type === "invert") return "היפוך צבעים";
  if (operation.type === "sepia") return "ספיה";
  return "Levels";
}

function primaryAdjustmentOperation(layer: AdjustmentLayer): AdjustmentOperation {
  return layer.adjustments[0] ?? defaultAdjustmentOperation("brightnessContrast");
}

function AdjustmentLayerControlsV2({
  layer,
  onPatch
}: {
  layer: AdjustmentLayer;
  onPatch: (patch: Partial<VisualLayer>) => void;
}): ReactElement {
  const operation = primaryAdjustmentOperation(layer);
  const blendModeOptions: BlendMode[] = ["normal", "multiply", "screen", "overlay", "darken", "lighten"];

  function replaceOperation(nextOperation: AdjustmentOperation): void {
    onPatch({
      adjustments: [nextOperation, ...layer.adjustments.slice(1)]
    } as Partial<VisualLayer>);
  }

  function resetOperation(): void {
    replaceOperation(defaultAdjustmentOperation(operation.type));
  }

  return (
    <section className="adjustment-layer-controls">
      <label className="field">
        <span className="field-label">שם שכבה</span>
        <input className="text-input" onChange={(event) => onPatch({ name: event.target.value } as Partial<VisualLayer>)} value={layer.name} />
      </label>
      <div className="quick-controls">
        <button className={layer.visible ? "toggle on" : "toggle"} onClick={() => onPatch({ visible: !layer.visible } as Partial<VisualLayer>)} type="button">
          {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
          תצוגה
        </button>
        <button className={layer.locked ? "toggle on" : "toggle"} onClick={() => onPatch({ locked: !layer.locked } as Partial<VisualLayer>)} type="button">
          {layer.locked ? <Lock size={14} /> : <Unlock size={14} />}
          נעילה
        </button>
      </div>
      <SliderField label="אטימות שכבה" min={0} max={1} step={0.01} value={layer.opacity} onChange={(v) => onPatch({ opacity: v } as Partial<VisualLayer>)} decimals={2} />
      <label className="field">
        <span className="field-label">Blend mode</span>
        <select className="text-input" onChange={(event) => onPatch({ blendMode: event.target.value as BlendMode } as Partial<VisualLayer>)} value={layer.blendMode}>
          {blendModeOptions.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="field-label">משפיעה על</span>
        <select className="text-input" onChange={(event) => onPatch({ targetMode: event.target.value as AdjustmentLayer["targetMode"] } as Partial<VisualLayer>)} value={layer.targetMode}>
          <option value="below">כל השכבות שמתחת</option>
          <option value="clipped-to-layer">רק השכבה שמתחת</option>
        </select>
      </label>

      {operation.type === "brightnessContrast" ? (
        <>
          <SliderField label="בהירות" min={-100} max={100} value={operation.brightness} onChange={(v) => replaceOperation({ ...operation, brightness: v })} />
          <SliderField label="ניגודיות" min={-100} max={100} value={operation.contrast} onChange={(v) => replaceOperation({ ...operation, contrast: v })} />
        </>
      ) : null}
      {operation.type === "exposure" ? (
        <>
          <SliderField label="חשיפה" min={-5} max={5} step={0.05} value={operation.exposure} onChange={(v) => replaceOperation({ ...operation, exposure: v })} decimals={2} />
          <SliderField label="Gamma" min={0.1} max={3} step={0.05} value={operation.gamma} onChange={(v) => replaceOperation({ ...operation, gamma: v })} decimals={2} />
          <SliderField label="Offset" min={-1} max={1} step={0.01} value={operation.offset} onChange={(v) => replaceOperation({ ...operation, offset: v })} decimals={2} />
        </>
      ) : null}
      {operation.type === "hueSaturation" ? (
        <>
          <SliderField label="גוון" min={-180} max={180} value={operation.hue} onChange={(v) => replaceOperation({ ...operation, hue: v })} />
          <SliderField label="רוויה" min={-100} max={100} value={operation.saturation} onChange={(v) => replaceOperation({ ...operation, saturation: v })} />
          <SliderField label="בהירות" min={-100} max={100} value={operation.lightness} onChange={(v) => replaceOperation({ ...operation, lightness: v })} />
        </>
      ) : null}
      {operation.type === "blackWhite" ? (
        <label className="toggle-row">
          <input checked={operation.enabled} onChange={(event) => replaceOperation({ ...operation, enabled: event.target.checked })} type="checkbox" />
          <span>הפעל שחור לבן</span>
        </label>
      ) : null}
      {operation.type === "invert" ? (
        <label className="toggle-row">
          <input checked={operation.enabled} onChange={(event) => replaceOperation({ ...operation, enabled: event.target.checked })} type="checkbox" />
          <span>הפעל היפוך צבעים</span>
        </label>
      ) : null}
      {operation.type === "levels" ? (
        <>
          <SliderField label="Black" min={0} max={254} value={operation.black} onChange={(v) => replaceOperation({ ...operation, black: Math.min(v, operation.white - 1) })} />
          <SliderField label="Mid" min={0.1} max={5} step={0.05} value={operation.mid} onChange={(v) => replaceOperation({ ...operation, mid: v })} decimals={2} />
          <SliderField label="White" min={1} max={255} value={operation.white} onChange={(v) => replaceOperation({ ...operation, white: Math.max(v, operation.black + 1) })} />
        </>
      ) : null}
      {operation.type === "sepia" ? (
        <>
          <SliderField label="עוצמה" min={0} max={100} value={operation.intensity} onChange={(v) => replaceOperation({ ...operation, intensity: v })} />
          <SliderField label="חמימות" min={0} max={100} value={operation.warmth} onChange={(v) => replaceOperation({ ...operation, warmth: v })} />
        </>
      ) : null}

      <button className="mini-action" onClick={resetOperation} type="button">
        <RotateCcw size={13} />
        איפוס {adjustmentOperationLabel(operation)}
      </button>
    </section>
  );
}

function FontSelector({
  value,
  onChange
}: {
  value: string;
  onChange: (family: string) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(() => getFontFavorites());
  const [fontRevision, setFontRevision] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // The dropdown is rendered in a portal with fixed positioning so it escapes
  // toolbar clipping (`.context-toolbar` has overflow-x:hidden, which forces
  // overflow-y to auto and clips an absolutely-positioned menu to 84px).
  const [menuPos, setMenuPos] = useState<{ top: number; right: number; minWidth: number } | null>(null);

  const groups = useMemo(() => getGroupedFonts(favorites, query), [favorites, query, fontRevision]);

  const updateMenuPos = useCallback(() => {
    const el = triggerRef.current;
    if (el === null) return;
    const rect = el.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 4,
      right: Math.max(8, window.innerWidth - rect.right),
      minWidth: Math.max(rect.width, 240)
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateMenuPos();
    const handler = (): void => updateMenuPos();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [open, updateMenuPos]);

  useEffect(() => {
    let cancelled = false;
    void loadSystemFonts().then(() => {
      if (!cancelled) setFontRevision((revision) => revision + 1);
    });
    return () => { cancelled = true; };
  }, []);

  function handleSelect(family: string): void {
    onChange(family);
    setOpen(false);
    setQuery("");
  }

  function handleToggleFavorite(e: React.MouseEvent, family: string): void {
    e.stopPropagation();
    const next = toggleFontFavorite(family);
    setFavorites(new Set(next));
  }

  function renderGroup(title: string, list: FontEntry[]): ReactElement | null {
    if (list.length === 0) return null;
    return (
      <div className="font-group" key={title}>
        <div className="font-group-label">{title}</div>
        {list.map((f) => (
          <button
            className={`font-option ${f.family === value ? "active" : ""}`}
            key={f.family}
            onClick={() => handleSelect(f.family)}
            style={{ fontFamily: `"${f.family}", sans-serif` }}
            title={f.family}
            type="button"
          >
            <span className="font-option-label">{f.label}</span>
            <button
              className={`font-star ${favorites.has(f.family) ? "starred" : ""}`}
              onClick={(e) => handleToggleFavorite(e, f.family)}
              title={favorites.has(f.family) ? "הסר ממועדפים" : "הוסף למועדפים"}
              type="button"
            >
              <Star size={11} />
            </button>
          </button>
        ))}
      </div>
    );
  }

  function closeMenu(): void {
    setOpen(false);
    setQuery("");
  }

  return (
    <div className={`font-selector ${open ? "open" : ""}`}>
      <button
        ref={triggerRef}
        className="font-trigger"
        onClick={() => setOpen((v) => !v)}
        style={{ fontFamily: `"${value}", sans-serif` }}
        type="button"
      >
        <span className="font-trigger-label">{value}</span>
        <span className="font-trigger-arrow">▾</span>
      </button>

      {open && menuPos !== null && createPortal(
        <>
          <div className="font-overlay" style={{ zIndex: 3999 }} onClick={closeMenu} />
          <div
            className="font-dropdown"
            style={{ position: "fixed", top: menuPos.top, right: menuPos.right, left: "auto", minWidth: menuPos.minWidth, zIndex: 4000 }}
          >
            <div className="font-search-wrap">
              <input
                autoFocus
                className="font-search"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") closeMenu(); }}
                placeholder="חפש גופן…"
                type="text"
                value={query}
              />
            </div>
            <div className="font-list">
              {renderGroup("★ מועדפים", groups.favorites)}
              {renderGroup("עברית", groups.hebrew)}
              {renderGroup("לטינית", groups.latin)}
              {/* System fonts flood the list, so only show them once the user searches. */}
              {query.trim() !== "" && renderGroup("מותקנים במחשב", groups.system)}
              {groups.favorites.length === 0 && groups.hebrew.length === 0 && groups.latin.length === 0 &&
                (query.trim() === "" || groups.system.length === 0) && (
                <div className="font-empty">לא נמצאו גופנים</div>
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

// ג”€ג”€ג”€ Layer inspector ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
// For text layers: coordinates + visibility/lock live inside the Type tab.
// For non-text layers: they stay at the top here.

function LayerInspector({
  selectedLayer,
  hasTextStyleClipboard,
  onDelete,
  onApplyPreset,
  onCopyTextStyle,
  onNotify,
  onPatch,
  onPasteTextStyle,
  selectedTextRange = null,
  onTextSelectionChange = () => undefined,
  onTextChange
}: {
  selectedLayer: VisualLayer | null;
  hasTextStyleClipboard: boolean;
  onDelete: () => void;
  onApplyPreset: (preset: TextPreset) => void;
  onCopyTextStyle: () => void;
  onNotify?: (message: string) => void;
  onPatch: (patch: Partial<VisualLayer>) => void;
  onPasteTextStyle: () => void;
  selectedTextRange?: TextSelectionRange | null;
  onTextSelectionChange?: (selection: TextSelectionRange | null) => void;
  onTextChange: (text: string) => void;
}): ReactElement {
  if (selectedLayer === null) {
    return (
      <div className="empty-panel">
        <strong>לא נבחרה שכבה</strong>
        <span>בחר שכבה בקנבס או ברשימה כדי לערוך מאפיינים.</span>
      </div>
    );
  }

  const isText = selectedLayer.type === "text";
  const isAdjustment = selectedLayer.type === "adjustment-layer";
  const isVisualNonText =
    selectedLayer.type === "frame" ||
    selectedLayer.type === "image" ||
    selectedLayer.type === "shape" ||
    selectedLayer.type === "mask";

  return (
    <div className="inspector">
      {/* Metrics + quick controls shown at top ONLY for non-text layers */}
      {!isText && !isAdjustment ? (
        <>
          <div className="field-grid">
            <Metric label="X" value={selectedLayer.x} />
            <Metric label="Y" value={selectedLayer.y} />
            <Metric label="W" value={selectedLayer.width} />
            <Metric label="H" value={selectedLayer.height} />
          </div>
          <div className="quick-controls">
            <button
              className={selectedLayer.visible ? "toggle on" : "toggle"}
              onClick={() => onPatch({ visible: !selectedLayer.visible })}
              type="button"
            >
              {selectedLayer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
              תצוגה
            </button>
            <button
              className={selectedLayer.locked ? "toggle on" : "toggle"}
              onClick={() => onPatch({ locked: !selectedLayer.locked })}
              type="button"
            >
              {selectedLayer.locked ? <Lock size={14} /> : <Unlock size={14} />}
              נעילה
            </button>
          </div>
        </>
      ) : null}

      {isText ? (
        <TextControls
          hasTextStyleClipboard={hasTextStyleClipboard}
          layer={selectedLayer}
          onApplyPreset={onApplyPreset}
          onCopyTextStyle={onCopyTextStyle}
          onNotify={onNotify}
          onPasteTextStyle={onPasteTextStyle}
          onPatch={onPatch}
          selectedTextRange={selectedTextRange}
          onTextSelectionChange={onTextSelectionChange}
          onTextChange={onTextChange}
        />
      ) : null}

      {isAdjustment ? (
        <AdjustmentLayerControlsV2 layer={selectedLayer} onPatch={onPatch} />
      ) : null}

      {isVisualNonText ? (
        <NonTextLayerControls layer={selectedLayer} onPatch={onPatch} />
      ) : null}

      <button className="btn-block btn-danger" onClick={onDelete} type="button">
        <Trash2 size={14} />
        מחק שכבה
      </button>
    </div>
  );
}

// ג”€ג”€ג”€ Non-text layer tabs: Edit | FX ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

function NonTextLayerControls({
  layer,
  onPatch
}: {
  layer: VisualLayer;
  onPatch: (patch: Partial<VisualLayer>) => void;
}): ReactElement {
  const [tab, setTab] = useState<"edit" | "fx">("edit");

  return (
    <div className="text-pro-controls">
      <div className="text-tabs" role="tablist">
        <button className={tab === "edit" ? "on" : ""} onClick={() => setTab("edit")} type="button">עריכה</button>
        <button className={tab === "fx" ? "on" : ""} onClick={() => setTab("fx")} type="button">FX</button>
      </div>

      {tab === "edit" ? (
        <div className="text-tab-panel">
          {layer.type === "frame" && (layer.contentType === "image" || layer.imageAssetId !== undefined) ? (
            <CropUI
              layer={layer as Extract<VisualLayer, { type: "frame" }>}
              onPatch={(patch) => onPatch(patch as Partial<VisualLayer>)}
            />
          ) : layer.type === "frame" ? (
            <div className="field">
              <span className="field-label">פריים ריק</span>
              <p className="empty-panel-note">גרור תמונה אל הפריים כדי למלא אותו.</p>
            </div>
          ) : (
            <p className="empty-panel-note">אין הגדרות עריכה לשכבה זו.</p>
          )}
          <SliderField
            label="שקיפות שכבה"
            min={0}
            max={1}
            step={0.01}
            value={layer.opacity}
            onChange={(v) => onPatch({ opacity: v } as Partial<VisualLayer>)}
            decimals={2}
          />
        </div>
      ) : null}

      {tab === "fx" ? (
        <div className="text-tab-panel">
          <VisualEffectsControls layer={layer} onPatch={onPatch} />
        </div>
      ) : null}
    </div>
  );
}

// ג”€ג”€ג”€ Visual effects controls ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function makeDefaultEffect(type: VisualEffectParams["type"]): VisualEffect {
  const defaults: Record<string, VisualEffectParams> = {
    stroke: { type: "stroke", color: "#ffffff", width: 4, position: "outside", opacity: 1 },
    dropShadow: { type: "dropShadow", color: "#000000", opacity: 0.35, offsetX: 0, offsetY: 6, blur: 12, spread: 0 },
    outerGlow: { type: "outerGlow", color: "#ffffff", opacity: 0.8, blur: 20, spread: 0 },
    softEdge: { type: "softEdge", radius: 20, shape: "uniform" },
    colorOverlay: { type: "colorOverlay", color: "#000000", opacity: 0.4, blendMode: "normal" },
    gradientOverlay: {
      type: "gradientOverlay",
      gradientType: "linear",
      stops: [{ color: "#000000", position: 0 }, { color: "#ffffff", position: 1 }],
      angle: 90,
      opacity: 0.6,
      blendMode: "normal"
    }
  };
  return {
    version: 1,
    id: makeId(type),
    enabled: true,
    params: (defaults[type] ?? { type }) as VisualEffectParams
  };
}

function VisualEffectsControls({
  layer,
  onPatch
}: {
  layer: VisualLayer;
  onPatch: (patch: Partial<VisualLayer>) => void;
}): ReactElement {
  const stack: VisualEffectStack =
    ("visualEffects" in layer && layer.visualEffects !== undefined)
      ? layer.visualEffects
      : { version: 1, enabled: true, effects: [] };

  function updateStack(next: VisualEffectStack): void {
    onPatch({ visualEffects: next } as Partial<VisualLayer>);
  }

  function addEffect(type: VisualEffectParams["type"]): void {
    updateStack({ ...stack, enabled: true, effects: [...stack.effects, makeDefaultEffect(type)] });
  }

  function toggleEffect(id: string, enabled: boolean): void {
    updateStack({ ...stack, effects: stack.effects.map((e) => (e.id === id ? { ...e, enabled } : e)) });
  }

  function patchEffectParams(id: string, patch: Partial<VisualEffectParams>): void {
    updateStack({
      ...stack,
      effects: stack.effects.map((e) =>
        e.id === id ? { ...e, params: { ...e.params, ...patch } as VisualEffectParams } : e
      )
    });
  }

  function removeEffect(id: string): void {
    updateStack({ ...stack, effects: stack.effects.filter((e) => e.id !== id) });
  }

  const presentTypes = new Set(stack.effects.map((e) => e.params.type));
  const mvpTypes: VisualEffectParams["type"][] = ["stroke", "dropShadow", "outerGlow", "softEdge", "colorOverlay", "gradientOverlay"];
  const addableTypes = mvpTypes.filter((t) => !presentTypes.has(t));

  const addLabels: Record<string, string> = {
    stroke: "+ מסגרת",
    dropShadow: "+ צל",
    outerGlow: "+ זוהר",
    softEdge: "+ קצוות רכות",
    colorOverlay: "+ כיסוי צבע",
    gradientOverlay: "+ גרדיאנט"
  };

  return (
    <section className="visual-fx-panel">
      <label className="check-line fx-stack-toggle">
        <input
          checked={stack.enabled}
          onChange={(e) => updateStack({ ...stack, enabled: e.target.checked })}
          type="checkbox"
        />
        <strong>אפקטים ויזואליים</strong>
      </label>

      {stack.effects.map((effect) => (
        <VisualEffectCard
          key={effect.id}
          effect={effect}
          onPatchParams={(patch) => patchEffectParams(effect.id, patch)}
          onRemove={() => removeEffect(effect.id)}
          onToggle={(enabled) => toggleEffect(effect.id, enabled)}
        />
      ))}

      {addableTypes.length > 0 && (
        <div className="add-fx-row">
          {addableTypes.map((t) => (
            <button className="toggle" key={t} onClick={() => addEffect(t)} type="button">
              {addLabels[t] ?? `+ ${t}`}
            </button>
          ))}
        </div>
      )}

      <div className="preset-grid">
        {VISUAL_EFFECT_PRESETS.map((preset) => (
          <button
            className="preset-chip"
            key={preset.id}
            onClick={() => updateStack(preset.stack)}
            type="button"
          >
            <strong>{preset.name}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

function VisualEffectCard({
  effect,
  onToggle,
  onPatchParams,
  onRemove
}: {
  effect: VisualEffect;
  onToggle: (enabled: boolean) => void;
  onPatchParams: (patch: Partial<VisualEffectParams>) => void;
  onRemove: () => void;
}): ReactElement {
  const p = effect.params;
  const label = VISUAL_EFFECT_LABELS[p.type] ?? p.type;

  return (
    <div className="effect-card">
      <div className="effect-card-header">
        <label className="check-line">
          <input
            checked={effect.enabled}
            onChange={(e) => onToggle(e.target.checked)}
            type="checkbox"
          />
          {label}
        </label>
        <button className="icon-btn icon-btn-xs" onClick={onRemove} title="הסר אפקט" type="button">
          <X size={12} />
        </button>
      </div>

      {effect.enabled ? (
        <div className="effect-card-body">
          {p.type === "stroke" && (
            <>
              <div className="field-row">
                <label className="field">
                  <span className="field-label">צבע</span>
                  <input className="color-input" onChange={(e) => onPatchParams({ color: e.target.value })} type="color" value={p.color} />
                </label>
              </div>
              <SliderField label="עובי" min={1} max={60} value={p.width} onChange={(v) => onPatchParams({ width: v })} unit=" px" />
              <SliderField label="שקיפות" min={0} max={1} step={0.01} decimals={2} value={p.opacity} onChange={(v) => onPatchParams({ opacity: v })} />
            </>
          )}
          {p.type === "dropShadow" && (
            <>
              <div className="field-row">
                <label className="field">
                  <span className="field-label">צבע</span>
                  <input className="color-input" onChange={(e) => onPatchParams({ color: e.target.value })} type="color" value={p.color} />
                </label>
              </div>
              <SliderField label="שקיפות" min={0} max={1} step={0.01} decimals={2} value={p.opacity} onChange={(v) => onPatchParams({ opacity: v })} />
              <SliderField label="מרחק X" min={-80} max={80} value={p.offsetX} onChange={(v) => onPatchParams({ offsetX: v })} unit=" px" />
              <SliderField label="מרחק Y" min={-80} max={80} value={p.offsetY} onChange={(v) => onPatchParams({ offsetY: v })} unit=" px" />
              <SliderField label="טשטוש" min={0} max={80} value={p.blur} onChange={(v) => onPatchParams({ blur: v })} unit=" px" />
            </>
          )}
          {p.type === "outerGlow" && (
            <>
              <div className="field-row">
                <label className="field">
                  <span className="field-label">צבע זוהר</span>
                  <input className="color-input" onChange={(e) => onPatchParams({ color: e.target.value })} type="color" value={p.color} />
                </label>
              </div>
              <SliderField label="שקיפות" min={0} max={1} step={0.01} decimals={2} value={p.opacity} onChange={(v) => onPatchParams({ opacity: v })} />
              <SliderField label="עוצמה" min={4} max={80} value={p.blur} onChange={(v) => onPatchParams({ blur: v })} unit=" px" />
            </>
          )}
          {p.type === "softEdge" && (
            <>
              <SliderField label="רדיוס" min={0} max={80} value={p.radius} onChange={(v) => onPatchParams({ radius: v })} unit=" px" />
              <div className="field">
                <span className="field-label">צורה</span>
                <div className="seg">
                  <button className={p.shape === "uniform" ? "on" : ""} onClick={() => onPatchParams({ shape: "uniform" })} type="button">אחיד</button>
                  <button className={p.shape === "horizontal" ? "on" : ""} onClick={() => onPatchParams({ shape: "horizontal" })} type="button">אופקי</button>
                  <button className={p.shape === "vertical" ? "on" : ""} onClick={() => onPatchParams({ shape: "vertical" })} type="button">אנכי</button>
                </div>
              </div>
            </>
          )}
          {p.type === "colorOverlay" && (
            <>
              <div className="field-row">
                <label className="field">
                  <span className="field-label">צבע</span>
                  <input className="color-input" onChange={(e) => onPatchParams({ color: e.target.value })} type="color" value={p.color} />
                </label>
              </div>
              <SliderField label="שקיפות" min={0} max={1} step={0.01} decimals={2} value={p.opacity} onChange={(v) => onPatchParams({ opacity: v })} />
              <div className="field">
                <span className="field-label">Blend Mode</span>
                <select
                  className="text-input"
                  onChange={(e) => onPatchParams({ blendMode: e.target.value as BlendMode })}
                  value={p.blendMode}
                >
                  <option value="normal">Normal</option>
                  <option value="multiply">Multiply</option>
                  <option value="screen">Screen</option>
                  <option value="overlay">Overlay</option>
                  <option value="darken">Darken</option>
                  <option value="lighten">Lighten</option>
                </select>
              </div>
            </>
          )}
          {p.type === "gradientOverlay" && (
            <>
              <div className="field">
                <span className="field-label">סוג</span>
                <div className="seg">
                  <button className={p.gradientType === "linear" ? "on" : ""} onClick={() => onPatchParams({ gradientType: "linear" })} type="button">לינארי</button>
                  <button className={p.gradientType === "radial" ? "on" : ""} onClick={() => onPatchParams({ gradientType: "radial" })} type="button">רדיאלי</button>
                </div>
              </div>
              <div className="field-row">
                <label className="field">
                  <span className="field-label">צבע 1</span>
                  <input
                    className="color-input"
                    onChange={(e) => onPatchParams({ stops: [{ ...p.stops[0], color: e.target.value }, ...(p.stops.slice(1))] })}
                    type="color"
                    value={p.stops[0]?.color ?? "#000000"}
                  />
                </label>
                <label className="field">
                  <span className="field-label">צבע 2</span>
                  <input
                    className="color-input"
                    onChange={(e) => onPatchParams({ stops: [...p.stops.slice(0, 1), { ...p.stops[1], color: e.target.value }] })}
                    type="color"
                    value={p.stops[1]?.color ?? "#ffffff"}
                  />
                </label>
              </div>
              {p.gradientType === "linear" && (
                <SliderField label="זווית" min={0} max={360} value={p.angle} onChange={(v) => onPatchParams({ angle: v })} unit="°" />
              )}
              <SliderField label="שקיפות" min={0} max={1} step={0.01} decimals={2} value={p.opacity} onChange={(v) => onPatchParams({ opacity: v })} />
              <div className="field">
                <span className="field-label">Blend Mode</span>
                <select
                  className="text-input"
                  onChange={(e) => onPatchParams({ blendMode: e.target.value as BlendMode })}
                  value={p.blendMode}
                >
                  <option value="normal">Normal</option>
                  <option value="multiply">Multiply</option>
                  <option value="screen">Screen</option>
                  <option value="overlay">Overlay</option>
                  <option value="darken">Darken</option>
                  <option value="lighten">Lighten</option>
                </select>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ג”€ג”€ג”€ Text controls ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

const WARP_TYPES = [
  { id: "none", label: "ללא" },
  { id: "arc", label: "קשת (Arc)" },
  { id: "arch", label: "קמרון (Arch)" },
  { id: "bulge", label: "בליטה (Bulge)" },
  { id: "wave", label: "גל (Wave)" },
  { id: "flag", label: "דגל (Flag)" },
  { id: "fisheye", label: "עין דג (Fisheye)" },
  { id: "inflate", label: "ניפוח (Inflate)" },
  { id: "squeeze", label: "לחיצה (Squeeze)" },
  { id: "rise", label: "עלייה (Rise)" },
  { id: "fish", label: "דג (Fish)" },
  { id: "shell_lower", label: "קונכייה תחתית" },
  { id: "shell_upper", label: "קונכייה עליונה" },
  { id: "twist", label: "ספירלה (Twist)" },
] as const;

function TextControls({
  hasTextStyleClipboard,
  layer,
  onApplyPreset,
  onCopyTextStyle,
  onNotify,
  onPasteTextStyle,
  onPatch,
  selectedTextRange,
  onTextSelectionChange,
  onTextChange
}: {
  hasTextStyleClipboard: boolean;
  layer: Extract<VisualLayer, { type: "text" }>;
  onApplyPreset: (preset: TextPreset) => void;
  onCopyTextStyle: () => void;
  onNotify?: (message: string) => void;
  onPasteTextStyle: () => void;
  onPatch: (patch: Partial<VisualLayer>) => void;
  selectedTextRange: TextSelectionRange | null;
  onTextSelectionChange: (selection: TextSelectionRange | null) => void;
  onTextChange: (text: string) => void;
}): ReactElement {
  const [tab, setTab] = useState<"type" | "effects" | "warp" | "presets">("type");
  const [userPresets, setUserPresets] = useState<TextPreset[]>(() => loadUserTextPresets());
  const [presetName, setPresetName] = useState("");
  const allPresets = useMemo(() => [...BUILTIN_TEXT_PRESETS, ...userPresets], [userPresets]);
  const smartBlockSettings = readSmartTextBlockSettings(layer);

  function activeTextSelection(): TextSelectionRange | null {
    return selectedTextRange === null ? null : clampTextSelection(selectedTextRange, layer.text.length);
  }

  function applyInlineStyleOrLayerPatch(stylePatch: Parameters<typeof applyRichTextStyleToRange>[2], layerPatch: Partial<VisualLayer>): void {
    const selection = activeTextSelection();
    if (selection === null) {
      onPatch(layerPatch);
      return;
    }
    const nextLayer = applyRichTextStyleToRange(layer, selection, stylePatch);
    onPatch({ richText: nextLayer.richText } as Partial<VisualLayer>);
  }

  function captureTextSelection(target: HTMLTextAreaElement): void {
    onTextSelectionChange({ start: target.selectionStart, end: target.selectionEnd });
  }

  function patchSmartTextBlock(patch: Partial<SmartTextBlockSettings>): void {
    const nextLayer = patch.enabled === false
      ? withoutSmartTextBlock(layer)
      : withSmartTextBlockSettings(layer, {
          ...(smartBlockSettings ?? DEFAULT_SMART_TEXT_BLOCK_SETTINGS),
          ...patch,
          enabled: true
        });
    onPatch({
      alignment: nextLayer.alignment,
      metadata: nextLayer.metadata
    } as Partial<VisualLayer>);
  }

  function notify(message: string): void {
    onNotify?.(message);
  }

  function applyPresetWithFontFallback(preset: TextPreset): void {
    const family = preset.style.fontFamily;
    if (family !== undefined && !fontFamilyExists(family)) {
      notify(`הפונט "${family}" לא נמצא, ממשיך עם DM Sans`);
      onApplyPreset({ ...preset, style: { ...preset.style, fontFamily: "DM Sans" } });
      return;
    }
    onApplyPreset(preset);
  }

  function saveCurrentPreset(): void {
    const name = presetName.trim() || layer.name || "Custom text preset";
    const next = saveUserTextPreset(createTextPresetFromLayer(layer, name));
    setUserPresets(next);
    setPresetName("");
    notify(`הפריסט "${name}" נשמר`);
  }

  function updatePresetFromCurrent(preset: TextPreset): void {
    const nextPreset = { ...createTextPresetFromLayer(layer, preset.name), presetId: preset.presetId };
    const next = updateUserTextPreset(nextPreset);
    setUserPresets(next);
    notify(`הפריסט "${preset.name}" עודכן`);
  }

  function renamePreset(preset: TextPreset): void {
    const name = window.prompt("Preset name", preset.name)?.trim();
    if (!name) return;
    const next = updateUserTextPreset({ ...preset, name });
    setUserPresets(next);
    notify(`הפריסט שונה ל-"${name}"`);
  }

  function removeUserPreset(preset: TextPreset): void {
    const next = deleteUserTextPreset(preset.presetId);
    setUserPresets(next);
    notify(`הפריסט "${preset.name}" נמחק`);
  }

  return (
    <div className="text-pro-controls">
      {/* ג”€ג”€ Tabs are at the TOP so options are immediately visible ג”€ג”€ */}
      <div className="text-tabs" role="tablist" aria-label="Text controls">
        <button className={tab === "type" ? "on" : ""} onClick={() => setTab("type")} type="button">Type</button>
        <button className={tab === "effects" ? "on" : ""} onClick={() => setTab("effects")} type="button">FX</button>
        <button className={tab === "warp" ? "on" : ""} onClick={() => setTab("warp")} type="button">Warp</button>
        <button className={tab === "presets" ? "on" : ""} onClick={() => setTab("presets")} type="button">Presets</button>
      </div>

      {/* ג”€ג”€ Type Tab ג”€ג”€ */}
      {tab === "type" ? (
        <div className="text-tab-panel">
          <div className="field">
            <span className="field-label">גופן</span>
            <FontSelector
              value={layer.fontFamily}
              onChange={(family) => applyInlineStyleOrLayerPatch({ fontFamily: family }, { fontFamily: family } as Partial<VisualLayer>)}
            />
          </div>

          <SliderField
            label="גודל"
            min={8}
            max={240}
            value={layer.fontSize}
            onChange={(v) => applyInlineStyleOrLayerPatch({ fontSize: v }, { fontSize: v } as Partial<VisualLayer>)}
            unit=" px"
          />
          <SliderField
            label="משקל"
            min={100}
            max={900}
            step={100}
            value={layer.fontWeight}
            onChange={(v) => applyInlineStyleOrLayerPatch({ fontWeight: v }, { fontWeight: v } as Partial<VisualLayer>)}
          />
          <SliderField
            label="גובה שורה"
            min={0.7}
            max={3}
            step={0.05}
            value={layer.lineHeight}
            onChange={(v) => onPatch({ lineHeight: v } as Partial<VisualLayer>)}
            decimals={2}
            unit="ֳ—"
          />
          <SliderField
            label="ריווח אותיות"
            min={-10}
            max={40}
            value={layer.letterSpacing}
            onChange={(v) => applyInlineStyleOrLayerPatch({ letterSpacing: v }, { letterSpacing: v } as Partial<VisualLayer>)}
            unit=" px"
          />

          <div className="effect-card">
            <label className="check-line">
              <input
                checked={smartBlockSettings?.enabled === true}
                onChange={(e) => patchSmartTextBlock({ enabled: e.target.checked })}
                type="checkbox"
              />
              Smart Text Block
            </label>
            {smartBlockSettings?.enabled === true ? (
              <>
                <SliderField
                  label="Smart Block Strength"
                  min={0}
                  max={100}
                  value={smartBlockSettings.strength}
                  onChange={(v) => patchSmartTextBlock({ strength: v })}
                />
                <label className="check-line">
                  <input
                    checked={smartBlockSettings.autoEmphasis}
                    onChange={(e) => patchSmartTextBlock({ autoEmphasis: e.target.checked })}
                    type="checkbox"
                  />
                  Auto Emphasis
                </label>
              </>
            ) : null}
          </div>

          <div className="button-row">
            <button
              className={layer.fontWeight >= 700 ? "toggle on" : "toggle"}
              onClick={() => {
                const fontWeight = layer.fontWeight >= 700 ? 400 : 700;
                applyInlineStyleOrLayerPatch({ fontWeight }, { fontWeight } as Partial<VisualLayer>);
              }}
              type="button"
              title="Bold"
            >
              <Bold size={14} />
            </button>
            <button
              className={layer.fontStyle === "italic" ? "toggle on" : "toggle"}
              onClick={() => {
                const fontStyle = layer.fontStyle === "italic" ? "normal" : "italic";
                applyInlineStyleOrLayerPatch({ fontStyle }, { fontStyle } as Partial<VisualLayer>);
              }}
              type="button"
              title="Italic"
            >
              <Italic size={14} />
            </button>
            <span className="btn-divider" />
            <button className={layer.alignment === "right" ? "toggle on" : "toggle"} onClick={() => onPatch({ alignment: "right" } as Partial<VisualLayer>)} type="button"><AlignRight size={14} /></button>
            <button className={layer.alignment === "center" ? "toggle on" : "toggle"} onClick={() => onPatch({ alignment: "center" } as Partial<VisualLayer>)} type="button"><AlignCenter size={14} /></button>
            <button className={layer.alignment === "left" ? "toggle on" : "toggle"} onClick={() => onPatch({ alignment: "left" } as Partial<VisualLayer>)} type="button"><AlignLeft size={14} /></button>
            <button className={layer.alignment === "justify" ? "toggle on" : "toggle"} onClick={() => onPatch({ alignment: "justify" } as Partial<VisualLayer>)} type="button"><AlignJustify size={14} /></button>
          </div>

          <div className="field-row">
            <label className="field">
              <span className="field-label">צבע</span>
              <input
                className="color-input"
                onChange={(e) => applyInlineStyleOrLayerPatch({ color: e.target.value }, { color: e.target.value, autoContrastOverridden: true } as Partial<VisualLayer>)}
                type="color"
                value={layer.color}
              />
            </label>
            <div className="seg">
              <button className={layer.direction === "rtl" ? "on" : ""} onClick={() => onPatch({ direction: "rtl" } as Partial<VisualLayer>)} type="button">RTL</button>
              <button className={layer.direction === "auto" ? "on" : ""} onClick={() => onPatch({ direction: "auto" } as Partial<VisualLayer>)} type="button">Auto</button>
              <button className={layer.direction === "ltr" ? "on" : ""} onClick={() => onPatch({ direction: "ltr" } as Partial<VisualLayer>)} type="button">LTR</button>
            </div>
          </div>

          <SliderField
            label="שקיפות טקסט (Fill Opacity)"
            min={0}
            max={1}
            step={0.01}
            value={layer.fillOpacity}
            onChange={(v) => applyInlineStyleOrLayerPatch({ fillOpacity: v }, { fillOpacity: v } as Partial<VisualLayer>)}
            decimals={2}
          />
          <SliderField
            label="שקיפות שכבה (Layer Opacity)"
            min={0}
            max={1}
            step={0.01}
            value={layer.opacity}
            onChange={(v) => onPatch({ opacity: v } as Partial<VisualLayer>)}
            decimals={2}
          />

          {/* ── Coordinates, lock and textarea — bottom of Type tab ── */}
          <div className="type-tab-footer">
            <div className="field-grid">
              <Metric label="X" value={layer.x} />
              <Metric label="Y" value={layer.y} />
              <Metric label="W" value={layer.width} />
              <Metric label="H" value={layer.height} />
            </div>
            <div className="quick-controls">
              <button
                className={layer.visible ? "toggle on" : "toggle"}
                onClick={() => onPatch({ visible: !layer.visible } as Partial<VisualLayer>)}
                type="button"
              >
                {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                תצוגה
              </button>
              <button
                className={layer.locked ? "toggle on" : "toggle"}
                onClick={() => onPatch({ locked: !layer.locked } as Partial<VisualLayer>)}
                type="button"
              >
                {layer.locked ? <Lock size={14} /> : <Unlock size={14} />}
                נעילה
              </button>
            </div>
            <label className="field">
              <span className="field-label">תוכן הטקסט</span>
              <textarea
                className="text-area"
                dir="auto"
                value={layer.text}
                onChange={(e) => {
                  captureTextSelection(e.currentTarget);
                  onTextChange(e.target.value);
                }}
                onFocus={(e) => captureTextSelection(e.currentTarget)}
                onKeyUp={(e) => captureTextSelection(e.currentTarget)}
                onMouseUp={(e) => captureTextSelection(e.currentTarget)}
                onSelect={(e) => captureTextSelection(e.currentTarget)}
              />
            </label>
          </div>
        </div>
      ) : null}

      {/* ג”€ג”€ Effects Tab ג”€ג”€ */}
      {tab === "effects" ? (
        <div className="text-tab-panel">
          {/* Stroke */}
          <div className="effect-card">
            <label className="check-line">
              <input
                checked={layer.stroke !== undefined}
                onChange={(e) =>
                  onPatch({
                    stroke: e.target.checked
                      ? { version: 1, color: "#111111", width: 2, opacity: 1 }
                      : undefined
                  } as Partial<VisualLayer>)
                }
                type="checkbox"
              />
              Stroke — קו
            </label>
            {layer.stroke !== undefined ? (
              <>
                <div className="field-row">
                  <label className="field">
                    <span className="field-label">צבע קו</span>
                    <input
                      className="color-input"
                      onChange={(e) => onPatch({ stroke: { ...layer.stroke, color: e.target.value } } as Partial<VisualLayer>)}
                      type="color"
                      value={layer.stroke.color}
                    />
                  </label>
                </div>
                <SliderField
                  label="עובי"
                  min={0}
                  max={30}
                  value={layer.stroke.width}
                  onChange={(v) => onPatch({ stroke: { ...layer.stroke, width: v } } as Partial<VisualLayer>)}
                  unit=" px"
                />
                <SliderField
                  label="שקיפות Stroke"
                  min={0}
                  max={1}
                  step={0.01}
                  value={layer.stroke.opacity}
                  onChange={(v) => onPatch({ stroke: { ...layer.stroke, opacity: v } } as Partial<VisualLayer>)}
                  decimals={2}
                />
              </>
            ) : null}
          </div>

          {/* Drop Shadow */}
          <div className="effect-card">
            <label className="check-line">
              <input
                checked={layer.shadow !== undefined}
                onChange={(e) =>
                  onPatch({
                    shadow: e.target.checked
                      ? { version: 1, color: "#000000", blur: 8, offsetX: 0, offsetY: 5, opacity: 0.35 }
                      : undefined
                  } as Partial<VisualLayer>)
                }
                type="checkbox"
              />
              Drop Shadow — צל
            </label>
            {layer.shadow !== undefined ? (
              <>
                <div className="field-row">
                  <label className="field">
                    <span className="field-label">צבע</span>
                    <input
                      className="color-input"
                      onChange={(e) => onPatch({ shadow: { ...layer.shadow, color: e.target.value } } as Partial<VisualLayer>)}
                      type="color"
                      value={layer.shadow.color}
                    />
                  </label>
                </div>
                <SliderField
                  label="טשטוש"
                  min={0}
                  max={80}
                  value={layer.shadow.blur}
                  onChange={(v) => onPatch({ shadow: { ...layer.shadow, blur: v } } as Partial<VisualLayer>)}
                  unit=" px"
                />
                <SliderField
                  label="מרחק X"
                  min={-80}
                  max={80}
                  value={layer.shadow.offsetX}
                  onChange={(v) => onPatch({ shadow: { ...layer.shadow, offsetX: v } } as Partial<VisualLayer>)}
                  unit=" px"
                />
                <SliderField
                  label="מרחק Y"
                  min={-80}
                  max={80}
                  value={layer.shadow.offsetY}
                  onChange={(v) => onPatch({ shadow: { ...layer.shadow, offsetY: v } } as Partial<VisualLayer>)}
                  unit=" px"
                />
                <SliderField
                  label="שקיפות"
                  min={0}
                  max={1}
                  step={0.01}
                  value={layer.shadow.opacity}
                  onChange={(v) => onPatch({ shadow: { ...layer.shadow, opacity: v } } as Partial<VisualLayer>)}
                  decimals={2}
                />
              </>
            ) : null}
          </div>

          {/* Outer Glow — uses shadow with zero offset */}
          <div className="effect-card">
            <label className="check-line">
              <input
                checked={
                  layer.effects.some((e) => e.enabled && e.effectType === "outer_glow") ||
                  (layer.shadow !== undefined && layer.shadow.offsetX === 0 && layer.shadow.offsetY === 0)
                }
                onChange={(e) => {
                  if (e.target.checked) {
                    // Add glow: set shadow to glow mode
                    onPatch({
                      shadow: { version: 1, color: "#ffffff", blur: 24, offsetX: 0, offsetY: 0, opacity: 0.8 }
                    } as Partial<VisualLayer>);
                  } else {
                    onPatch({ shadow: undefined } as Partial<VisualLayer>);
                  }
                }}
                type="checkbox"
              />
              Outer Glow — זוהר חיצוני
            </label>
            {layer.shadow !== undefined && layer.shadow.offsetX === 0 && layer.shadow.offsetY === 0 ? (
              <>
                <div className="field-row">
                  <label className="field">
                    <span className="field-label">צבע זוהר</span>
                    <input
                      className="color-input"
                      onChange={(e) => onPatch({ shadow: { ...layer.shadow, color: e.target.value } } as Partial<VisualLayer>)}
                      type="color"
                      value={layer.shadow.color}
                    />
                  </label>
                  <label className="check-line neon-check">
                    <input
                      checked={layer.shadow.blur >= 30}
                      onChange={(e) =>
                        onPatch({
                          shadow: { ...layer.shadow, blur: e.target.checked ? 40 : 18, opacity: e.target.checked ? 0.95 : 0.8 }
                        } as Partial<VisualLayer>)
                      }
                      type="checkbox"
                    />
                    Neon
                  </label>
                </div>
                <SliderField
                  label="עוצמת זוהר"
                  min={4}
                  max={80}
                  value={layer.shadow.blur}
                  onChange={(v) => onPatch({ shadow: { ...layer.shadow, blur: v } } as Partial<VisualLayer>)}
                  unit=" px"
                />
                <SliderField
                  label="שקיפות"
                  min={0}
                  max={1}
                  step={0.01}
                  value={layer.shadow.opacity}
                  onChange={(v) => onPatch({ shadow: { ...layer.shadow, opacity: v } } as Partial<VisualLayer>)}
                  decimals={2}
                />
              </>
            ) : null}
          </div>

          {/* Inner Shadow — basic, using canvas warp renderer when warp is active */}
          <div className="effect-card">
            <label className="check-line">
              <input
                checked={layer.effects.some((e) => e.enabled && e.effectType === "inner_shadow")}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [
                        ...layer.effects,
                        {
                          version: 1,
                          id: `is_${Date.now()}`,
                          effectId: `is_${Date.now()}`,
                          effectType: "inner_shadow" as const,
                          enabled: true,
                          opacity: 0.6,
                          blendMode: "normal" as const,
                          params: { color: "#000000", opacity: 0.6, angle: 135, distance: 4, blur: 6 }
                        }
                      ]
                    : layer.effects.filter((ef) => ef.effectType !== "inner_shadow");
                  onPatch({ effects: next } as Partial<VisualLayer>);
                }}
                type="checkbox"
              />
              Inner Shadow — צל פנימי
            </label>
            {layer.effects
              .filter((e) => e.enabled && e.effectType === "inner_shadow")
              .map((e) => {
                const p = e.params as Record<string, unknown>;
                return (
                  <div key={e.id}>
                    <div className="field-row">
                      <label className="field">
                        <span className="field-label">צבע</span>
                        <input
                          className="color-input"
                          onChange={(ev) =>
                            onPatch({
                              effects: layer.effects.map((ef) =>
                                ef.id === e.id ? { ...ef, params: { ...ef.params, color: ev.target.value } } : ef
                              )
                            } as Partial<VisualLayer>)
                          }
                          type="color"
                          value={typeof p["color"] === "string" ? p["color"] : "#000000"}
                        />
                      </label>
                    </div>
                    <SliderField
                      label="טשטוש"
                      min={0}
                      max={40}
                      value={typeof p["blur"] === "number" ? p["blur"] : 6}
                      onChange={(v) =>
                        onPatch({
                          effects: layer.effects.map((ef) =>
                            ef.id === e.id ? { ...ef, params: { ...ef.params, blur: v } } : ef
                          )
                        } as Partial<VisualLayer>)
                      }
                      unit=" px"
                    />
                    <SliderField
                      label="מרחק"
                      min={0}
                      max={30}
                      value={typeof p["distance"] === "number" ? p["distance"] : 4}
                      onChange={(v) =>
                        onPatch({
                          effects: layer.effects.map((ef) =>
                            ef.id === e.id ? { ...ef, params: { ...ef.params, distance: v } } : ef
                          )
                        } as Partial<VisualLayer>)
                      }
                      unit=" px"
                    />
                    <SliderField
                      label="שקיפות"
                      min={0}
                      max={1}
                      step={0.01}
                      value={e.opacity}
                      onChange={(v) =>
                        onPatch({
                          effects: layer.effects.map((ef) =>
                            ef.id === e.id ? { ...ef, opacity: v } : ef
                          )
                        } as Partial<VisualLayer>)
                      }
                      decimals={2}
                    />
                    <div className="field">
                      <span className="field-label">Blend Mode</span>
                      <select
                        className="text-input"
                        onChange={(ev) =>
                          onPatch({
                            effects: layer.effects.map((ef) =>
                              ef.id === e.id ? { ...ef, blendMode: ev.target.value as "normal" | "multiply" | "screen" | "overlay" } : ef
                            )
                          } as Partial<VisualLayer>)
                        }
                        value={e.blendMode}
                      >
                        <option value="normal">Normal</option>
                        <option value="multiply">Multiply</option>
                        <option value="screen">Screen</option>
                        <option value="overlay">Overlay</option>
                      </select>
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Bevel & Emboss */}
          <div className="effect-card">
            <label className="check-line">
              <input
                checked={layer.effects.some((e) => e.enabled && e.effectType === "bevel_emboss")}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [
                        ...layer.effects,
                        {
                          version: 1,
                          id: `be_${Date.now()}`,
                          effectId: `be_${Date.now()}`,
                          effectType: "bevel_emboss" as const,
                          enabled: true,
                          opacity: 1,
                          blendMode: "normal" as const,
                          params: {
                            style: "inner_bevel",
                            technique: "smooth",
                            depth: 5,
                            size: 5,
                            soften: 0,
                            highlightColor: "#ffffff",
                            shadowColor: "#000000"
                          }
                        }
                      ]
                    : layer.effects.filter((ef) => ef.effectType !== "bevel_emboss");
                  onPatch({ effects: next } as Partial<VisualLayer>);
                }}
                type="checkbox"
              />
              Bevel & Emboss — תבליט
              <span className="effect-note">מוצג בייצוא Python</span>
            </label>
            {layer.effects
              .filter((e) => e.enabled && e.effectType === "bevel_emboss")
              .map((e) => {
                const p = e.params as Record<string, unknown>;
                return (
                  <div key={e.id}>
                    <div className="field">
                      <span className="field-label">סגנון</span>
                      <select
                        className="text-input"
                        onChange={(ev) =>
                          onPatch({ effects: layer.effects.map((ef) => ef.id === e.id ? { ...ef, params: { ...ef.params, style: ev.target.value } } : ef) } as Partial<VisualLayer>)
                        }
                        value={typeof p["style"] === "string" ? p["style"] : "inner_bevel"}
                      >
                        <option value="inner_bevel">Inner Bevel</option>
                        <option value="outer_bevel">Outer Bevel</option>
                        <option value="emboss">Emboss</option>
                        <option value="pillow_emboss">Pillow Emboss</option>
                      </select>
                    </div>
                    <SliderField
                      label="עומק"
                      min={1}
                      max={20}
                      value={typeof p["depth"] === "number" ? p["depth"] : 5}
                      onChange={(v) => onPatch({ effects: layer.effects.map((ef) => ef.id === e.id ? { ...ef, params: { ...ef.params, depth: v } } : ef) } as Partial<VisualLayer>)}
                      unit=" px"
                    />
                    <SliderField
                      label="גודל"
                      min={0}
                      max={20}
                      value={typeof p["size"] === "number" ? p["size"] : 5}
                      onChange={(v) => onPatch({ effects: layer.effects.map((ef) => ef.id === e.id ? { ...ef, params: { ...ef.params, size: v } } : ef) } as Partial<VisualLayer>)}
                      unit=" px"
                    />
                    <div className="field-row">
                      <label className="field">
                        <span className="field-label">הייליט</span>
                        <input className="color-input" type="color" value={typeof p["highlightColor"] === "string" ? p["highlightColor"] : "#ffffff"}
                          onChange={(ev) => onPatch({ effects: layer.effects.map((ef) => ef.id === e.id ? { ...ef, params: { ...ef.params, highlightColor: ev.target.value } } : ef) } as Partial<VisualLayer>)} />
                      </label>
                      <label className="field">
                        <span className="field-label">צל</span>
                        <input className="color-input" type="color" value={typeof p["shadowColor"] === "string" ? p["shadowColor"] : "#000000"}
                          onChange={(ev) => onPatch({ effects: layer.effects.map((ef) => ef.id === e.id ? { ...ef, params: { ...ef.params, shadowColor: ev.target.value } } : ef) } as Partial<VisualLayer>)} />
                      </label>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ) : null}

      {/* ג”€ג”€ Warp Tab ג”€ג”€ */}
      {tab === "warp" ? (
        <div className="text-tab-panel">
          <div className="field">
            <span className="field-label">סוג עיוות</span>
            <select
              className="text-input"
              onChange={(e) =>
                onPatch({
                  warpSettings: {
                    ...layer.warpSettings,
                    enabled: e.target.value !== "none",
                    type: e.target.value as typeof layer.warpSettings.type
                  }
                } as Partial<VisualLayer>)
              }
              value={layer.warpSettings.type}
            >
              {WARP_TYPES.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>

          {layer.warpSettings.type !== "none" ? (
            <>
              <SliderField
                label="עוצמה (Bend)"
                min={-100}
                max={100}
                value={layer.warpSettings.amount}
                onChange={(v) =>
                  onPatch({
                    warpSettings: {
                      ...layer.warpSettings,
                      amount: v,
                      intensity: v,
                      enabled: v !== 0 || layer.warpSettings.type !== "none"
                    }
                  } as Partial<VisualLayer>)
                }
                unit="%"
              />
              <SliderField
                label="עיוות אופקי"
                min={-100}
                max={100}
                value={layer.warpSettings.horizontalDistortion}
                onChange={(v) =>
                  onPatch({ warpSettings: { ...layer.warpSettings, horizontalDistortion: v } } as Partial<VisualLayer>)
                }
                unit="%"
              />
              <SliderField
                label="עיוות אנכי"
                min={-100}
                max={100}
                value={layer.warpSettings.verticalDistortion}
                onChange={(v) =>
                  onPatch({ warpSettings: { ...layer.warpSettings, verticalDistortion: v } } as Partial<VisualLayer>)
                }
                unit="%"
              />
              <button
                className="mini-action"
                onClick={() =>
                  onPatch({
                    warpSettings: { ...layer.warpSettings, amount: 0, horizontalDistortion: 0, verticalDistortion: 0, enabled: false, type: "none" }
                  } as Partial<VisualLayer>)
                }
                type="button"
              >
                איפוס עיוות
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {/* ג”€ג”€ Presets Tab ג”€ג”€ */}
      {tab === "presets" ? (
        <div className="text-tab-panel">
          <div className="button-row">
            <button className="toggle" onClick={onCopyTextStyle} type="button">
              <Copy size={14} />
              Copy FX
            </button>
            <button className="toggle" disabled={!hasTextStyleClipboard} onClick={onPasteTextStyle} type="button">
              <Clipboard size={14} />
              Paste FX
            </button>
          </div>
          <div className="preset-save-row">
            <input className="text-input" onChange={(event) => setPresetName(event.target.value)} placeholder="Preset name" value={presetName} />
            <button className="toggle on" onClick={saveCurrentPreset} type="button"><Save size={14} /> Save preset</button>
          </div>
          <div className="preset-grid">
            {allPresets.map((preset) => (
              <div className="preset-chip-wrap" key={preset.presetId}>
                <button className="preset-chip" onClick={() => applyPresetWithFontFallback(preset)} type="button">
                  <PresetThumb height={44} layer={layer} preset={preset} sample={presetSampleText(layer)} width={240} />
                  <strong>{preset.name}</strong>
                </button>
                {!preset.isBuiltin ? (
                  <div className="preset-chip-actions">
                    <button onClick={() => updatePresetFromCurrent(preset)} type="button">Update</button>
                    <button onClick={() => renamePreset(preset)} type="button">Rename</button>
                    <button onClick={() => removeUserPreset(preset)} type="button">Delete</button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Renders an accurate preset preview by applying the preset to the current text
 * layer and rasterising it through the SAME engine the canvas uses
 * (renderTextToAlphaCanvas). This makes the thumbnail match how the text will
 * actually look — gradients, stroke, 3D, bevel, sparkle, pattern and all — instead
 * of the old CSS approximation that ignored most effects.
 */
function PresetThumb({
  layer,
  preset,
  sample,
  width,
  height
}: {
  layer: Extract<VisualLayer, { type: "text" }>;
  preset: TextPreset;
  sample: string;
  width: number;
  height: number;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const el = canvasRef.current;
    if (el === null) return;
    const ctx = el.getContext("2d");
    if (ctx === null) return;
    ctx.clearRect(0, 0, width, height);
    const applied = applyTextPresetToLayer(layer, preset);
    const previewLayer = {
      ...applied,
      text: sample,
      fontSize: 44,
      x: 0,
      y: 0,
      rotation: 0,
      // Preview the preset's look, not the layer's current warp.
      warpSettings: { ...applied.warpSettings, enabled: false, type: "none" as const }
    };
    const rendered = renderTextToAlphaCanvas(previewLayer);
    if (rendered === null || rendered.width === 0 || rendered.height === 0) return;
    const scale = Math.min(width / rendered.width, height / rendered.height);
    const dw = rendered.width * scale;
    const dh = rendered.height * scale;
    ctx.drawImage(rendered, (width - dw) / 2, (height - dh) / 2, dw, dh);
  }, [layer, preset, sample, width, height]);
  return <canvas className="preset-thumb" height={height} ref={canvasRef} width={width} />;
}

/** Short sample text for preset previews — the user's own text when available. */
function presetSampleText(layer: Extract<VisualLayer, { type: "text" }>): string {
  const firstLine = layer.text.split(/\r?\n/)[0]?.trim() ?? "";
  return firstLine.slice(0, 10) || "אבג";
}

function Metric({ label, value }: { label: string; value: number }): ReactElement {
  return (
    <span className="metric">
      <span>{label}</span>
      <strong>{Math.round(value)}</strong>
    </span>
  );
}

// ג”€ג”€ג”€ Layer list ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

function buildGroupDisplayOrder(
  filtered: VisualLayer[],
  groupChildMap: Map<string, VisualLayer[]>,
  childLayerIds: Set<string>
): string[] {
  const ids: string[] = [];
  for (const layer of filtered) {
    if (childLayerIds.has(layer.id)) continue;
    ids.push(layer.id);
    if (layer.type === "group") {
      const children = groupChildMap.get(layer.id) ?? [];
      for (const child of children) ids.push(child.id);
    }
  }
  return ids;
}

function LayerList({
  assets,
  layers,
  renamingLayerId,
  selectedLayerIds,
  selectedLayerId,
  variableLayerIds,
  onRename,
  onRenameComplete,
  onAddAdjustmentLayer,
  onAddGroup,
  onAddImageLayer,
  onAddShapeLayer,
  onAddTextLayer,
  onStartRename,
  onReorder,
  onSmartArrange,
  onSelect,
  onSelectMany,
  onPatchLayer,
  onToggleLock,
  onToggleVisibility,
  onLayerContextMenu,
  onOpenLayerEdits,
  onHoverLayer,
  onMoveImageIntoFrame,
  onMoveLayerIntoGroup,
  onDeleteGroup,
  onDuplicateGroup,
  onMergeLayers,
  onFlattenVisible
}: {
  assets: Asset[];
  layers: VisualLayer[];
  renamingLayerId: string | null;
  selectedLayerIds: string[];
  selectedLayerId: string | null;
  variableLayerIds: Set<string>;
  onRename: (layerId: string, name: string) => void;
  onRenameComplete: () => void;
  onAddAdjustmentLayer: (operation: AdjustmentOperation) => void;
  onAddGroup: () => void;
  onAddImageLayer: () => void;
  onAddShapeLayer: () => void;
  onAddTextLayer: () => void;
  onStartRename: (layerId: string) => void;
  onReorder: (layerIdsTopToBottom: string[]) => void;
  onSmartArrange: (mode: SmartArrangeMode) => void;
  onSelect: (layerId: string) => void;
  onSelectMany: (layerIds: string[]) => void;
  onPatchLayer: (layer: VisualLayer) => void;
  onToggleLock: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onLayerContextMenu: (layerId: string, screenX: number, screenY: number) => void;
  onOpenLayerEdits?: (layerId: string) => void;
  onHoverLayer?: (layerId: string | null) => void;
  onMoveImageIntoFrame?: (imageLayerId: string, frameId: string) => void;
  onMoveLayerIntoGroup?: (layerId: string, groupId: string | null) => void;
  onDeleteGroup?: (groupId: string, deleteChildren: boolean) => void;
  onDuplicateGroup?: (groupId: string) => void;
  onMergeLayers: () => void;
  onFlattenVisible: () => void;
}): ReactElement {
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "images" | "text" | "frames" | "framesMasks" | "shapes" | "adjustments" | "hidden" | "locked">("all");
  const [draftName, setDraftName] = useState("");
  const [pendingGroupDelete, setPendingGroupDelete] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  // Tool Library access straight from the Layers panel "+" menu. Targets the
  // selected image layer when one is active (image context), otherwise applies
  // as a page-level look. Replaces the old "disconnected" legacy adjustment layers.
  const activePageId = useDocumentStore((s) => s.activePageId);
  const pageCount = useDocumentStore((s) => s.document?.pages.length ?? 1);
  const applyPresetToImage = useDocumentStore((s) => s.applyPresetToImage);
  const applyPresetToAllImagesOnPage = useDocumentStore((s) => s.applyPresetToAllImagesOnPage);
  const applyPresetToAllImagesOnAllPages = useDocumentStore((s) => s.applyPresetToAllImagesOnAllPages);
  const applyPresetToDuplicatedImage = useDocumentStore((s) => s.applyPresetToDuplicatedImage);
  const applyPresetAsPageLook = useDocumentStore((s) => s.applyPresetAsPageLook);
  const applyPresetAsPageLookToAllPages = useDocumentStore((s) => s.applyPresetAsPageLookToAllPages);
  const addImageAdjustment = useDocumentStore((s) => s.addImageAdjustment);
  const applyAdjustmentToAllImagesOnPage = useDocumentStore((s) => s.applyAdjustmentToAllImagesOnPage);
  const applyAdjustmentToAllImagesOnAllPages = useDocumentStore((s) => s.applyAdjustmentToAllImagesOnAllPages);
  const addPageLook = useDocumentStore((s) => s.addPageLook);
  const addPageLookToAllPages = useDocumentStore((s) => s.addPageLookToAllPages);

  const selectedLayer = layers.find((l) => l.id === selectedLayerId);
  const selectedImageLayer = selectedLayer?.type === "image" ? (selectedLayer as ImageLayer) : undefined;
  // A collage/photo-print/mask cell that currently holds an image is also a valid
  // Tool Library target — adjustments apply to the image inside the frame.
  const selectedFrameWithImage =
    selectedLayer?.type === "frame" && (selectedLayer as FrameLayer).imageAssetId !== undefined
      ? (selectedLayer as FrameLayer)
      : undefined;
  // Unified adjustable target (plain image layer OR frame cell with an image).
  const libraryTargetId = selectedImageLayer?.id ?? selectedFrameWithImage?.id;
  const libraryTargetAssetId = selectedImageLayer?.assetId ?? selectedFrameWithImage?.imageAssetId;
  const libraryTargetName = selectedImageLayer?.name ?? selectedFrameWithImage?.name;
  const libraryContext: LibraryContext = libraryTargetId !== undefined ? "image" : "page";
  const librarySrc =
    libraryTargetAssetId !== undefined
      ? resolveCanvasAssetPath(assets.find((a) => a.id === libraryTargetAssetId))
      : undefined;

  const handleLibraryApply = (
    item: LibraryItem,
    strength: number,
    applyToAll: boolean,
    duplicate: boolean,
    extra: ImageAdjustmentTemplate[],
    applyToAllPages: boolean
  ): void => {
    if (activePageId === null) return;
    if (item.kind === "tool" || item.kind === "aiTool") {
      // `extra` carries the concrete, edited recipe (tool sliders / AI analysis).
      if (applyToAllPages) {
        for (const template of extra) applyAdjustmentToAllImagesOnAllPages(template);
      } else if (applyToAll) {
        for (const template of extra) applyAdjustmentToAllImagesOnPage(activePageId, template);
      } else if (libraryTargetId !== undefined) {
        for (const template of extra) addImageAdjustment(activePageId, libraryTargetId, template);
      }
    } else if (item.kind === "imagePreset" && item.presetId !== undefined) {
      if (applyToAllPages) {
        void runWithBusy("מחיל פריסט על כל התמונות בכל העמודים...", () =>
          applyPresetToAllImagesOnAllPages(item.presetId!, strength, extra)
        );
      } else if (applyToAll || libraryTargetId === undefined) {
        void runWithBusy("מחיל פריסט על כל תמונות העמוד…", () =>
          applyPresetToAllImagesOnPage(activePageId, item.presetId!, strength, extra)
        );
      } else if (duplicate && selectedImageLayer !== undefined) {
        // Duplicate-and-apply only makes sense for standalone image layers; a frame
        // cell can't be cloned in place, so it falls through to in-place apply.
        applyPresetToDuplicatedImage(activePageId, selectedImageLayer.id, item.presetId, strength, extra);
      } else {
        applyPresetToImage(activePageId, libraryTargetId, item.presetId, strength, extra);
      }
    } else if (item.kind === "pageLookPreset" && item.presetId !== undefined) {
      if (applyToAllPages) applyPresetAsPageLookToAllPages(item.presetId, strength);
      else applyPresetAsPageLook(activePageId, item.presetId, strength);
    } else if (item.kind === "effect" && item.effectKind !== undefined) {
      if (applyToAllPages) addPageLookToAllPages({ kind: item.effectKind });
      else addPageLook(activePageId, createPageLookLayer({ kind: item.effectKind }));
    }
    setLibraryOpen(false);
  };
  const ordered = [...layers].sort((a, b) => b.zIndex - a.zIndex);
  const filtered = ordered.filter((layer) => {
    if (filter === "images") return layer.type === "image";
    if (filter === "text") return layer.type === "text";
    if (filter === "frames") return layer.type === "frame" && !isFrameMaskLayer(layer);
    if (filter === "framesMasks") return isFrameMaskLayer(layer);
    if (filter === "shapes") return layer.type === "shape";
    if (filter === "adjustments") return layer.type === "adjustment-layer";
    if (filter === "hidden") return !layer.visible;
    if (filter === "locked") return layer.locked;
    return true;
  });
  const canReorder = filter === "all";

  // Build a map from groupId → children (sorted top-to-bottom by zIndex desc)
  const groupChildMap = new Map<string, VisualLayer[]>();
  const childLayerIds = new Set<string>();
  for (const layer of ordered) {
    if (layer.type === "group") {
      const group = layer as GroupLayer;
      const children = group.childIds
        .map((id) => layers.find((l) => l.id === id))
        .filter((l): l is VisualLayer => l !== undefined)
        .sort((a, b) => b.zIndex - a.zIndex);
      groupChildMap.set(group.id, children);
      for (const child of children) childLayerIds.add(child.id);
    }
  }

  useEffect(() => {
    const layer = layers.find((item) => item.id === renamingLayerId);
    if (layer !== undefined) setDraftName(layer.name);
  }, [layers, renamingLayerId]);

  useEffect(() => {
    if (selectedLayerId === null) return;
    if (!filtered.some((layer) => layer.id === selectedLayerId)) {
      setFilter("all");
      return;
    }
    const row = rowRefs.current.get(selectedLayerId);
    if (row === undefined) return;
    row.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [filter, selectedLayerId]);

  function handleDrop(event: React.DragEvent<HTMLDivElement>, targetLayerId: string): void {
    event.preventDefault();
    event.stopPropagation();
    if (draggingLayerId === null || draggingLayerId === targetLayerId) {
      setDraggingLayerId(null);
      return;
    }
    const draggedLayer = layers.find((l) => l.id === draggingLayerId);
    const targetLayer = layers.find((l) => l.id === targetLayerId);

    // Image into frame (existing behavior)
    if (
      onMoveImageIntoFrame !== undefined
      && draggedLayer?.type === "image"
      && targetLayer?.type === "frame"
    ) {
      onMoveImageIntoFrame(draggingLayerId, targetLayerId);
      setDraggingLayerId(null);
      return;
    }

    // Drop non-group layer onto a group header → move into group
    if (
      onMoveLayerIntoGroup !== undefined
      && targetLayer?.type === "group"
      && draggedLayer?.type !== "group"
    ) {
      onMoveLayerIntoGroup(draggingLayerId, targetLayerId);
      setDraggingLayerId(null);
      return;
    }

    if (!canReorder) {
      setDraggingLayerId(null);
      return;
    }

    // Build display order (groups + their children as a block, then ungrouped)
    const displayIds = buildGroupDisplayOrder(filtered, groupChildMap, childLayerIds);
    const nextIds = displayIds.filter((id) => id !== draggingLayerId);

    if (draggedLayer?.type === "group") {
      // Dragging a group: remove children too, then insert group+children at target
      const group = draggedLayer as GroupLayer;
      const childIds = group.childIds;
      const withoutChildren = nextIds.filter((id) => !childIds.includes(id));
      const targetIndex = withoutChildren.indexOf(targetLayerId);
      withoutChildren.splice(targetIndex < 0 ? 0 : targetIndex, 0, draggingLayerId, ...childIds);
      onReorder(withoutChildren);
    } else {
      const targetIndex = nextIds.indexOf(targetLayerId);
      nextIds.splice(targetIndex < 0 ? 0 : targetIndex, 0, draggingLayerId);
      // If dragged layer moves outside its group, remove it from that group
      if (onMoveLayerIntoGroup !== undefined && draggedLayer?.parentId !== undefined) {
        const targetParentId = targetLayer?.parentId;
        if (draggedLayer.parentId !== targetParentId) {
          onMoveLayerIntoGroup(draggingLayerId, targetParentId ?? null);
        }
      }
      onReorder(nextIds);
    }
    setDraggingLayerId(null);
  }

  function handleLayerClick(e: React.MouseEvent, layerId: string): void {
    if (e.ctrlKey || e.metaKey) {
      const next = selectedLayerIds.includes(layerId)
        ? selectedLayerIds.filter((id) => id !== layerId)
        : [...selectedLayerIds, layerId];
      onSelectMany(next);
    } else if (e.shiftKey) {
      const ids = filtered.map((l) => l.id);
      const anchorId = selectedLayerId ?? layerId;
      const anchorIdx = ids.indexOf(anchorId);
      const targetIdx = ids.indexOf(layerId);
      const [from, to] = anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
      onSelectMany(ids.slice(from, to + 1));
    } else {
      onSelect(layerId);
    }
  }

  function handleRowContextMenu(e: React.MouseEvent, layerId: string): void {
    e.preventDefault();
    e.stopPropagation();
    onLayerContextMenu(layerId, e.clientX, e.clientY);
  }

  function commitRename(layer: VisualLayer): void {
    const nextName = draftName.trim();
    if (nextName !== "" && nextName !== layer.name) {
      onRename(layer.id, nextName);
    }
    onRenameComplete();
  }

  const filterOptions: Array<{ id: typeof filter; label: string }> = [
    { id: "all", label: "All" },
    { id: "images", label: "Images" },
    { id: "text", label: "Text" },
    { id: "frames", label: "Frames" },
    { id: "framesMasks", label: "Frames-Masks" },
    { id: "shapes", label: "Shapes" },
    { id: "adjustments", label: "Adj" },
    { id: "hidden", label: "Hidden" },
    { id: "locked", label: "Locked" }
  ];

  function renderLayerRow(layer: VisualLayer, isChild = false): ReactElement {
    const isFM = isFrameMaskLayer(layer);
    const fmFrame = isFM ? (layer as FrameLayer) : null;
    const fmAsset = fmFrame !== null && fmFrame.imageAssetId !== undefined
      ? assets.find((a) => a.id === fmFrame.imageAssetId)
      : undefined;
    return (
      <Fragment key={layer.id}>
        <div
          className={`layer-row${isChild ? " layer-row--child" : ""} ${selectedLayerIds.includes(layer.id) ? "active" : ""} ${draggingLayerId === layer.id ? "dragging" : ""} ${!layer.visible ? "hidden" : ""} ${layer.locked ? "locked" : ""}`}
          draggable
          ref={(node) => {
            if (node === null) rowRefs.current.delete(layer.id);
            else rowRefs.current.set(layer.id, node);
          }}
          onContextMenu={(e) => handleRowContextMenu(e, layer.id)}
          onDragEnd={() => setDraggingLayerId(null)}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", layer.id);
            setDraggingLayerId(layer.id);
          }}
          onDrop={(e) => handleDrop(e, layer.id)}
          onMouseEnter={() => onHoverLayer?.(layer.id)}
          onMouseLeave={() => onHoverLayer?.(null)}
        >
          <GripVertical className="layer-drag-handle" size={14} />
          <div
            className="layer-main"
            onClick={(e) => handleLayerClick(e, layer.id)}
            onDoubleClick={(event) => {
              event.stopPropagation();
              setDraftName(layer.name);
              onStartRename(layer.id);
            }}
            role="button"
            tabIndex={0}
          >
            <span
              className="layer-thumb-wrap"
              title="פתח עריכות שכבה"
              onDoubleClick={(e) => { e.stopPropagation(); onOpenLayerEdits?.(layer.id); }}
            >
              <LayerThumbnail assets={assets} layer={layer} />
            </span>
            <span className="layer-type-icon">{layerTypeIcon(layer)}</span>
            {renamingLayerId === layer.id ? (
              <input
                autoFocus
                className="layer-name-input"
                value={draftName}
                onBlur={() => commitRename(layer)}
                onChange={(event) => setDraftName(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") { event.preventDefault(); commitRename(layer); }
                  else if (event.key === "Escape") { event.preventDefault(); onRenameComplete(); }
                }}
              />
            ) : (
              <strong>{layer.name}</strong>
            )}
            {layer.type === "adjustment-layer" ? <em className="layer-legacy-pill" title="שכבת התאמה ישנה — מושבתת, תומר אוטומטית">Legacy — מושבת</em> : null}
            {(() => {
              // Compact, generic "has edits" indicator for ANY layer type. Click
              // opens the unified Layer Edits panel; keeps the row uncluttered.
              const total = countLayerEdits(layer);
              if (total === 0) return null;
              const someOff = hasDisabledLayerEdits(layer);
              return (
                <em
                  className={`layer-edits-dot${someOff ? " has-disabled" : ""}`}
                  title={`${total} עריכות על השכבה${someOff ? " (חלקן מוסתרות)" : ""} — לחץ לניהול`}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onOpenLayerEdits?.(layer.id); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onOpenLayerEdits?.(layer.id); } }}
                  style={{ cursor: "pointer" }}
                >
                  {total}
                </em>
              );
            })()}
            {layer.opacity < 0.995 ? <em className="layer-opacity-badge">{Math.round(layer.opacity * 100)}%</em> : null}
            {layer.blendMode !== "normal" ? <em className="layer-blend-badge">{layer.blendMode}</em> : null}
            {hasLayerFx(layer) ? <em className="layer-fx-pill">fx</em> : null}
            {variableLayerIds.has(layer.id) ? <em className="layer-var-pill">VAR</em> : null}
          </div>
          <button
            aria-label={layer.visible ? "הסתר שכבה" : "הצג שכבה"}
            className={`layer-eye-btn ${!layer.visible ? "hidden" : ""}`}
            onClick={(e) => { e.stopPropagation(); onToggleVisibility(layer.id); }}
            title={layer.visible ? "הסתר שכבה" : "הצג שכבה"}
            type="button"
          >
            {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
          <button
            aria-label={layer.locked ? "Unlock layer" : "Lock layer"}
            className={`layer-lock-btn ${layer.locked ? "locked" : ""}`}
            onClick={(e) => { e.stopPropagation(); onToggleLock(layer.id); }}
            title={layer.locked ? "Unlock layer" : "Lock layer"}
            type="button"
          >
            {layer.locked ? <Lock size={13} /> : <Unlock size={13} />}
          </button>
          <span className="layer-actions">
            <button aria-label="Layer menu" onClick={(event) => handleRowContextMenu(event, layer.id)} type="button">
              <MoreVertical size={12} />
            </button>
          </span>
        </div>
        {isFM && fmFrame !== null ? (
          <div
            className={`layer-row-child ${fmAsset === undefined ? "empty" : ""}`}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => handleDrop(e, fmFrame.id)}
            onClick={() => onSelect(fmFrame.id)}
          >
            {fmAsset?.previewPath !== undefined ? (
              <>
                <img alt="" className="layer-row-child-thumb" src={fmAsset.previewPath} />
                <span className="layer-row-child-label">{fmAsset.name ?? "תמונה"}</span>
              </>
            ) : (
              <span className="layer-row-child-empty">שחרר תמונה כאן</span>
            )}
          </div>
        ) : null}
      </Fragment>
    );
  }

  function renderGroupRow(group: GroupLayer): ReactElement {
    const children = groupChildMap.get(group.id) ?? [];
    const isSelected = selectedLayerIds.includes(group.id);
    return (
      <Fragment key={group.id}>
        <div
          className={`layer-row layer-row--group${isSelected ? " active" : ""}${draggingLayerId === group.id ? " dragging" : ""}${!group.visible ? " hidden" : ""}`}
          draggable
          onContextMenu={(e) => handleRowContextMenu(e, group.id)}
          onDragEnd={() => setDraggingLayerId(null)}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", group.id);
            setDraggingLayerId(group.id);
          }}
          onDrop={(e) => handleDrop(e, group.id)}
          onMouseEnter={() => onHoverLayer?.(group.id)}
          onMouseLeave={() => onHoverLayer?.(null)}
        >
          <button
            className="layer-group-collapse-btn"
            onClick={(e) => {
              e.stopPropagation();
              onPatchLayer({ ...group, collapsed: !group.collapsed });
            }}
            title={group.collapsed ? "펼치기" : "접기"}
            type="button"
          >
            {group.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          </button>
          <div
            className="layer-main"
            onClick={(e) => handleLayerClick(e, group.id)}
            onDoubleClick={(event) => {
              event.stopPropagation();
              setDraftName(group.name);
              onStartRename(group.id);
            }}
            role="button"
            tabIndex={0}
          >
            <FolderPlus size={13} className="layer-group-icon" />
            {renamingLayerId === group.id ? (
              <input
                autoFocus
                className="layer-name-input"
                value={draftName}
                onBlur={() => commitRename(group)}
                onChange={(event) => setDraftName(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") { event.preventDefault(); commitRename(group); }
                  else if (event.key === "Escape") { event.preventDefault(); onRenameComplete(); }
                }}
              />
            ) : (
              <strong>{group.name}</strong>
            )}
            <em className="layer-group-count">{children.length}</em>
            {group.opacity < 0.995 ? (
              <em className="layer-opacity-badge">{Math.round(group.opacity * 100)}%</em>
            ) : null}
          </div>
          <input
            aria-label="Group opacity"
            className="layer-group-opacity"
            max={100}
            min={0}
            step={1}
            title="Group opacity"
            type="range"
            value={Math.round(group.opacity * 100)}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              e.stopPropagation();
              onPatchLayer({ ...group, opacity: Number(e.target.value) / 100 });
            }}
          />
          <button
            aria-label={group.visible ? "הסתר קבוצה" : "הצג קבוצה"}
            className={`layer-eye-btn ${!group.visible ? "hidden" : ""}`}
            onClick={(e) => { e.stopPropagation(); onToggleVisibility(group.id); }}
            title={group.visible ? "הסתר קבוצה" : "הצג קבוצה"}
            type="button"
          >
            {group.visible ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
          <span className="layer-actions">
            {pendingGroupDelete === group.id ? (
              <span className="layer-group-delete-confirm">
                <button
                  className="layer-group-delete-btn"
                  onClick={(e) => { e.stopPropagation(); setPendingGroupDelete(null); onDeleteGroup?.(group.id, false); }}
                  title="מחק קבוצה בלבד"
                  type="button"
                >
                  קבוצה בלבד
                </button>
                <button
                  className="layer-group-delete-btn layer-group-delete-btn--all"
                  onClick={(e) => { e.stopPropagation(); setPendingGroupDelete(null); onDeleteGroup?.(group.id, true); }}
                  title="מחק קבוצה עם תוכן"
                  type="button"
                >
                  עם תוכן
                </button>
                <button
                  className="layer-group-delete-btn--cancel"
                  onClick={(e) => { e.stopPropagation(); setPendingGroupDelete(null); }}
                  type="button"
                >
                  <X size={11} />
                </button>
              </span>
            ) : (
              <>
                <button
                  aria-label="שכפל קבוצה"
                  onClick={(e) => { e.stopPropagation(); onDuplicateGroup?.(group.id); }}
                  title="שכפל קבוצה"
                  type="button"
                >
                  <Copy size={11} />
                </button>
                <button
                  aria-label="מחק קבוצה"
                  onClick={(e) => { e.stopPropagation(); setPendingGroupDelete(group.id); }}
                  title="מחק קבוצה"
                  type="button"
                >
                  <Trash2 size={11} />
                </button>
              </>
            )}
          </span>
        </div>
        {!group.collapsed && children.map((child) => renderLayerRow(child, true))}
      </Fragment>
    );
  }

  // Build display list: top-level items in order (groups + ungrouped layers, no standalone children)
  const displayLayers = filtered.filter((l) => !childLayerIds.has(l.id));

  return (
    <section className="layer-list" aria-label="שכבות">
      <div className="layer-add-menu">
        <button
          aria-label="הוסף קבוצה"
          className="layer-group-btn"
          onClick={onAddGroup}
          title="הוסף קבוצה"
          type="button"
        >
          <FolderPlus size={13} />
        </button>
        <button
          aria-expanded={addMenuOpen}
          aria-label="הוסף שכבה"
          className="layer-add-btn"
          onClick={() => setAddMenuOpen((open) => !open)}
          title="הוסף שכבה"
          type="button"
        >
          <Plus size={13} />
        </button>
        {addMenuOpen ? (
          <>
            <div className="layer-add-backdrop" onClick={() => setAddMenuOpen(false)} />
            <div className="layer-add-popover">
              <button onClick={() => { onAddImageLayer(); setAddMenuOpen(false); }} type="button"><ImagePlus size={12} />תמונה</button>
              <button onClick={() => { onAddTextLayer(); setAddMenuOpen(false); }} type="button"><Type size={12} />טקסט</button>
              <button onClick={() => { onAddShapeLayer(); setAddMenuOpen(false); }} type="button"><Square size={12} />צורה</button>
              {(ENABLE_IMAGE_LEVEL_ADJUSTMENTS || ENABLE_PAGE_LOOK_LAYERS) && (
                <>
                  <div className="ctx-divider" />
                  <button onClick={() => { setLibraryOpen(true); setAddMenuOpen(false); }} type="button"><SlidersHorizontal size={12} />ספריית כלים ופריסטים</button>
                </>
              )}
              {ENABLE_LEGACY_ADJUSTMENT_LAYER_CREATION && (
                <>
                  <div className="ctx-divider" />
                  <button onClick={() => { onAddAdjustmentLayer(defaultAdjustmentOperation("brightnessContrast")); setAddMenuOpen(false); }} type="button"><SlidersHorizontal size={12} />בהירות/ניגודיות (Legacy)</button>
                  <button onClick={() => { onAddAdjustmentLayer(defaultAdjustmentOperation("exposure")); setAddMenuOpen(false); }} type="button"><SlidersHorizontal size={12} />חשיפה (Legacy)</button>
                  <button onClick={() => { onAddAdjustmentLayer(defaultAdjustmentOperation("hueSaturation")); setAddMenuOpen(false); }} type="button"><SlidersHorizontal size={12} />גוון/רוויה (Legacy)</button>
                  <button onClick={() => { onAddAdjustmentLayer(defaultAdjustmentOperation("blackWhite")); setAddMenuOpen(false); }} type="button"><SlidersHorizontal size={12} />שחור לבן (Legacy)</button>
                  <button onClick={() => { onAddAdjustmentLayer(defaultAdjustmentOperation("invert")); setAddMenuOpen(false); }} type="button"><SlidersHorizontal size={12} />היפוך צבעים (Legacy)</button>
                  <button onClick={() => { onAddAdjustmentLayer(defaultAdjustmentOperation("levels")); setAddMenuOpen(false); }} type="button"><SlidersHorizontal size={12} />Levels (Legacy)</button>
                  <button onClick={() => { onAddAdjustmentLayer(defaultAdjustmentOperation("sepia")); setAddMenuOpen(false); }} type="button"><SlidersHorizontal size={12} />ספיה (Legacy)</button>
                </>
              )}
            </div>
          </>
        ) : null}
        <SmartArrangeControl onArrange={onSmartArrange} />
        <button
          aria-label="איחוד שכבות"
          className="layer-group-btn"
          disabled={selectedLayerIds.length < 2}
          onClick={onMergeLayers}
          title="איחוד השכבות שנבחרו לשכבה אחת"
          type="button"
        >
          <Layers size={13} />
        </button>
        <button
          aria-label="שיטוח התמונה"
          className="layer-group-btn"
          onClick={onFlattenVisible}
          title="שיטוח כל השכבות הגלויות לשכבה אחת"
          type="button"
        >
          <Combine size={13} />
        </button>
      </div>
      {libraryOpen && (
        <ToolLibrary
          context={libraryContext}
          previewSrc={librarySrc}
          previewLabel={libraryTargetName}
          selectedCount={libraryTargetId !== undefined ? 1 : 0}
          pageCount={pageCount}
          onApply={handleLibraryApply}
          onClose={() => setLibraryOpen(false)}
        />
      )}
      <PageAdjustmentsSection />
      <h3>שכבות</h3>
      {ordered.length === 0 ? <p>אין שכבות עדיין.</p> : null}
      <div className="layer-filter-bar" aria-label="Layer filters">
        {filterOptions.map((option) => (
          <button
            aria-pressed={filter === option.id}
            className={filter === option.id ? "active" : ""}
            key={option.id}
            onClick={() => { setFilter(option.id); setDraggingLayerId(null); }}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="layer-list-count">{filtered.length}/{ordered.length}</div>
      {ordered.length > 0 && filtered.length === 0 ? <p>No layers match this filter.</p> : null}
      {displayLayers.map((layer) =>
        layer.type === "group"
          ? renderGroupRow(layer as GroupLayer)
          : renderLayerRow(layer)
      )}
    </section>
  );
}

// ג”€ג”€ג”€ Layer Panel Context Menu ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

function layerTypeIcon(layer: VisualLayer): ReactElement {
  if (layer.type === "image") return <ImagePlus size={12} />;
  if (layer.type === "text") return <Type size={12} />;
  if (layer.type === "frame") return <Frame size={12} />;
  if (layer.type === "shape") return <Square size={12} />;
  if (layer.type === "adjustment-layer") return <SlidersHorizontal size={12} />;
  if (layer.type === "group") return <FolderPlus size={12} />;
  return <Layers size={12} />;
}

function LayerContextMenu({
  target,
  layer,
  canUseEffects,
  hasEffectsClipboard,
  isVariableLayer,
  onClose,
  onRename,
  onToggleVisibility,
  onToggleLock,
  onSetBlendMode,
  onMoveForward,
  onMoveBackward,
  onMoveToFront,
  onMoveToBack,
  onDuplicate,
  onDelete,
  onMergeLayers,
  onFlatten,
  onToggleBatchVariable,
  onConvertAlphaToFrame,
  onInsertImageIntoFrame,
  onClearFrameImage,
  onEditInsideFrame,
  onConvertFrameBackToImage,
  frameHasImage,
  onCopyEffects,
  onPasteEffects,
  onOpenLayerEdits,
  onToggleBeforeAfter,
  onDisableAllEdits,
  onResetAllEdits
}: {
  target: { layerId: string; screenX: number; screenY: number };
  layer: VisualLayer | undefined;
  canUseEffects: boolean;
  hasEffectsClipboard: boolean;
  isVariableLayer?: boolean;
  onClose: () => void;
  onRename: () => void;
  onToggleVisibility: () => void;
  onToggleLock: () => void;
  onSetBlendMode: (mode: BlendMode) => void;
  onMoveForward: () => void;
  onMoveBackward: () => void;
  onMoveToFront: () => void;
  onMoveToBack: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMergeLayers?: () => void;
  onFlatten: () => void;
  onToggleBatchVariable?: () => void;
  onConvertAlphaToFrame?: () => void;
  onInsertImageIntoFrame?: () => void;
  onClearFrameImage?: () => void;
  onEditInsideFrame?: () => void;
  onConvertFrameBackToImage?: () => void;
  frameHasImage?: boolean;
  onCopyEffects: () => void;
  onPasteEffects: () => void;
  onOpenLayerEdits?: () => void;
  onToggleBeforeAfter?: () => void;
  onDisableAllEdits?: () => void;
  onResetAllEdits?: () => void;
}): ReactElement {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: target.screenX, top: target.screenY });

  useEffect(() => {
    const menu = menuRef.current;
    if (menu === null) return;
    const rect = menu.getBoundingClientRect();
    const pad = 8;
    setPosition({
      left: Math.max(pad, Math.min(target.screenX, window.innerWidth - rect.width - pad)),
      top: Math.max(pad, Math.min(target.screenY, window.innerHeight - rect.height - pad))
    });
  }, [target.screenX, target.screenY]);

  useEffect(() => {
    function handleClick(event: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function action(fn: () => void): () => void {
    return () => { fn(); onClose(); };
  }

  return (
    <div
      ref={menuRef}
      className="canvas-context-menu"
      style={{ left: position.left, top: position.top }}
    >
      <div className="ctx-title">{layer?.name ?? "Layer"}</div>
      <button className="ctx-item" onClick={action(onRename)} type="button">
        Rename
      </button>
      <button className="ctx-item" onClick={action(onToggleVisibility)} type="button">
        {layer?.visible === false ? "Show Layer" : "Hide Layer"}
      </button>
      <button className="ctx-item" onClick={action(onToggleLock)} type="button">
        {layer?.locked === true ? "Unlock Layer" : "Lock Layer"}
      </button>
      {(onOpenLayerEdits !== undefined || onToggleBeforeAfter !== undefined) && (
        <>
          <div className="ctx-divider" />
          {onOpenLayerEdits !== undefined && (
            <button className="ctx-item" onClick={onOpenLayerEdits} type="button">
              <SlidersHorizontal size={12} style={{ display: "inline", marginInlineEnd: 5 }} />
              ערוך עריכות שכבה
            </button>
          )}
          {onToggleBeforeAfter !== undefined && (
            <button className="ctx-item" onClick={onToggleBeforeAfter} type="button">
              <Eye size={12} style={{ display: "inline", marginInlineEnd: 5 }} />
              השוואה לפני / אחרי
            </button>
          )}
          {onDisableAllEdits !== undefined && (
            <button className="ctx-item" onClick={onDisableAllEdits} type="button">
              <EyeOff size={12} style={{ display: "inline", marginInlineEnd: 5 }} />
              כבה את כל העריכות
            </button>
          )}
          {onResetAllEdits !== undefined && (
            <button className="ctx-item" onClick={onResetAllEdits} type="button">
              <RotateCcw size={12} style={{ display: "inline", marginInlineEnd: 5 }} />
              אפס עריכות
            </button>
          )}
        </>
      )}
      <div className="ctx-blend-row">
        <span className="ctx-blend-label">מצב מיזוג</span>
        <select
          aria-label="Blend mode"
          className="ctx-blend-select"
          value={layer?.blendMode ?? "normal"}
          onChange={(event) => { onSetBlendMode(event.target.value as BlendMode); }}
          onClick={(event) => event.stopPropagation()}
        >
          {BLEND_MODE_OPTIONS.map((mode) => (
            <option key={mode.value} value={mode.value}>{mode.label}</option>
          ))}
        </select>
      </div>
      <div className="ctx-divider" />
      <button className="ctx-item" onClick={action(onMoveForward)} type="button">
        Bring Forward
      </button>
      <button className="ctx-item" onClick={action(onMoveBackward)} type="button">
        Send Backward
      </button>
      <button className="ctx-item" onClick={action(onMoveToFront)} type="button">
        העבר לעליון
      </button>
      <button className="ctx-item" onClick={action(onMoveToBack)} type="button">
        העבר לתחתון
      </button>
      <div className="ctx-divider" />
      <button className="ctx-item" onClick={action(onDuplicate)} type="button">
        שכפל
      </button>
      <button className="ctx-item" onClick={action(onDelete)} type="button">
        מחק
      </button>
      <div className="ctx-divider" />
      {onMergeLayers !== undefined && (
        <button className="ctx-item" onClick={action(onMergeLayers)} type="button">
          <Layers size={12} style={{ display: "inline", marginInlineEnd: 5 }} />
          איחוד שכבות
        </button>
      )}
      <button className="ctx-item" onClick={action(onFlatten)} type="button">
        <Layers size={12} style={{ display: "inline", marginInlineEnd: 5 }} />
        שיטוח התמונה
      </button>
      {onToggleBatchVariable !== undefined && (
        <>
          <div className="ctx-divider" />
          <button
            className="ctx-item"
            onClick={action(onToggleBatchVariable)}
            type="button"
            style={{ color: isVariableLayer ? "#f87171" : "#c084fc" }}
          >
            <Zap size={12} style={{ display: "inline", marginInlineEnd: 5 }} />
            {isVariableLayer ? "בטל שדה משתנה" : "הפוך לאלמנט מתחלף"}
          </button>
        </>
      )}
      {onConvertAlphaToFrame !== undefined && (
        <>
          <div className="ctx-divider" />
          <button className="ctx-item" onClick={action(onConvertAlphaToFrame)} type="button">
            <Frame size={12} style={{ display: "inline", marginInlineEnd: 5 }} />
            Use Alpha as Mask
          </button>
        </>
      )}
      {onInsertImageIntoFrame !== undefined && (
        <>
          <div className="ctx-divider" />
          <button className="ctx-item" onClick={action(onInsertImageIntoFrame)} type="button">
            <ImagePlus size={12} style={{ display: "inline", marginInlineEnd: 5 }} />
            {frameHasImage === true ? "Replace image..." : "Insert image..."}
          </button>
          {frameHasImage === true && onClearFrameImage !== undefined && (
            <button className="ctx-item" onClick={action(onClearFrameImage)} type="button">
              <X size={12} style={{ display: "inline", marginInlineEnd: 5 }} />
              Clear image
            </button>
          )}
          {frameHasImage === true && onEditInsideFrame !== undefined && (
            <button className="ctx-item" onClick={action(onEditInsideFrame)} type="button">
              <Maximize2 size={12} style={{ display: "inline", marginInlineEnd: 5 }} />
              Edit image inside frame
            </button>
          )}
          {frameHasImage === true && onConvertFrameBackToImage !== undefined && (
            <button className="ctx-item" onClick={action(onConvertFrameBackToImage)} type="button">
              <Replace size={12} style={{ display: "inline", marginInlineEnd: 5 }} />
              Convert back to normal image
            </button>
          )}
        </>
      )}
      {canUseEffects && (
        <>
          <div className="ctx-divider" />
          <button className="ctx-item" onClick={action(onCopyEffects)} type="button">
            העתק אפקטים
          </button>
          <button
            className="ctx-item"
            disabled={!hasEffectsClipboard}
            onClick={action(onPasteEffects)}
            type="button"
          >
            הדבק אפקטים
          </button>
        </>
      )}
    </div>
  );
}

// ג”€ג”€ג”€ Canvas Context Menu ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

function CanvasContextMenu({
  target,
  imageEditorAvailable,
  imageEditorBusy,
  photoshopConfigured,
  colorLabConfigured,
  onClose,
  onSelectObject,
  onRemoveBackground,
  onAutoFix,
  onCurves,
  onShadowHighlights,
  onOpenIsolatedImageEditor,
  onConvertAlphaToFrame,
  onMoveForward,
  onMoveBackward,
  onMoveToFront,
  onMoveToBack,
  onFitCanvasFill,
  onFitCanvasFit,
  onCenterCanvas,
  onResetTransform,
  onRotate90,
  onRotate180,
  onFlipHorizontal,
  onFlipVertical,
  onWhiteBorder,
  onBlackBorder,
  onReplaceImage,
  onDuplicate,
  onSmartRepeat,
  onDeleteTarget,
  onToggleLock,
  onToggleVisibility,
  onAddToFavorites,
  hasTextStyleClipboard,
  onTextMaskPlaceholder,
  onSaveAsCollageTemplate,
  onTextCenterCanvas,
  onTextCenterX,
  onTextCenterY,
  onTextBold,
  onTextItalic,
  onTextAlignLeft,
  onTextAlignCenter,
  onTextAlignRight,
  onTextDirectionAuto,
  onTextDirectionRtl,
  onTextDirectionLtr,
  onTextIncreaseSize,
  onTextDecreaseSize,
  onTextSmartBlock,
  onTextSmartFitFull,
  onTextSmartFitPartial,
  onTextSmartFitWrap,
  onTextStrokeWhite,
  onTextStrokeBlack,
  onTextShadowSoft,
  onTextShadowHard,
  onTextRemoveEffects,
  onTextCopyEffects,
  onTextPasteEffects,
  onOpenImageEditor,
  onOpenInPhotoshop,
  onOpenInColorLab,
  onHarmonize,
  onAiExpand,
  onSmartExpand,
  onAiRemove,
  onContentFill,
  onAiUpscale,
  onAiRestore
}: {
  target: CanvasContextMenuTarget;
  imageEditorAvailable: boolean;
  imageEditorBusy: boolean;
  photoshopConfigured: boolean;
  colorLabConfigured: boolean;
  onClose: () => void;
  onSelectObject: () => void;
  onRemoveBackground: () => void;
  onAutoFix?: () => void;
  onCurves?: () => void;
  onShadowHighlights?: () => void;
  onOpenIsolatedImageEditor: () => void;
  onConvertAlphaToFrame: () => void;
  onMoveForward: () => void;
  onMoveBackward: () => void;
  onMoveToFront: () => void;
  onMoveToBack: () => void;
  onFitCanvasFill: () => void;
  onFitCanvasFit: () => void;
  onCenterCanvas: () => void;
  onResetTransform: () => void;
  onRotate90: () => void;
  onRotate180: () => void;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  onWhiteBorder: () => void;
  onBlackBorder: () => void;
  onReplaceImage: () => void;
  onDuplicate: () => void;
  onSmartRepeat: () => void;
  onDeleteTarget: () => void;
  onToggleLock: () => void;
  onToggleVisibility: () => void;
  onAddToFavorites: () => void;
  hasTextStyleClipboard: boolean;
  onTextMaskPlaceholder: () => void;
  onSaveAsCollageTemplate: () => void;
  onTextCenterCanvas: () => void;
  onTextCenterX: () => void;
  onTextCenterY: () => void;
  onTextBold: () => void;
  onTextItalic: () => void;
  onTextAlignLeft: () => void;
  onTextAlignCenter: () => void;
  onTextAlignRight: () => void;
  onTextDirectionAuto: () => void;
  onTextDirectionRtl: () => void;
  onTextDirectionLtr: () => void;
  onTextIncreaseSize: () => void;
  onTextDecreaseSize: () => void;
  onTextSmartBlock: () => void;
  onTextSmartFitFull: () => void;
  onTextSmartFitPartial: () => void;
  onTextSmartFitWrap: () => void;
  onTextStrokeWhite: () => void;
  onTextStrokeBlack: () => void;
  onTextShadowSoft: () => void;
  onTextShadowHard: () => void;
  onTextRemoveEffects: () => void;
  onTextCopyEffects: () => void;
  onTextPasteEffects: () => void;
  onOpenImageEditor: () => void;
  onOpenInPhotoshop: () => void;
  onOpenInColorLab: () => void;
  onHarmonize?: () => void;
  onAiExpand?: () => void;
  onSmartExpand?: () => void;
  onAiRemove?: () => void;
  onContentFill?: () => void;
  onAiUpscale?: () => void;
  onAiRestore?: () => void;
}): ReactElement {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: target.screenX, top: target.screenY });
  const smartSelectionEnabled = target.layerType === "image" && target.hasImage;

  useEffect(() => {
    const menu = menuRef.current;
    if (menu === null) return;
    const rect = menu.getBoundingClientRect();
    const pad = 8;
    setPosition({
      left: Math.max(pad, Math.min(target.screenX, window.innerWidth - rect.width - pad)),
      top: Math.max(pad, Math.min(target.screenY, window.innerHeight - rect.height - pad))
    });
  }, [target.screenX, target.screenY]);

  useEffect(() => {
    function handleClick(event: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (target.layerType === "text") {
    return (
      <div
        ref={menuRef}
        className="canvas-context-menu"
        style={{ left: position.left, top: position.top }}
      >
        <button className="ctx-item" onClick={onTextMaskPlaceholder} type="button">הפוך למסיכה</button>
        <button className="ctx-item" onClick={onSaveAsCollageTemplate} type="button">שמור כתבנית קולאג'</button>
        <div className="ctx-divider" />
        <details className="ctx-submenu">
          <summary>מהיר</summary>
          <button className="ctx-item" onClick={onDuplicate} type="button">שכפל טקסט</button>
          <button className="ctx-item" onClick={onSmartRepeat} type="button">שכפול חכם לדף…</button>
          <button className="ctx-item" onClick={onToggleLock} type="button">נעל / שחרר</button>
          <button className="ctx-item" onClick={onToggleVisibility} type="button">הסתר / הצג</button>
          <button className="ctx-item" onClick={onDeleteTarget} type="button">מחק</button>
        </details>
        <details className="ctx-submenu">
          <summary>שכבות</summary>
          <button className="ctx-item" onClick={onMoveToFront} type="button">העבר לשכבה עליונה</button>
          <button className="ctx-item" onClick={onMoveToBack} type="button">העבר לרקע</button>
          <button className="ctx-item" onClick={onMoveForward} type="button">העבר קדימה</button>
          <button className="ctx-item" onClick={onMoveBackward} type="button">העבר אחורה</button>
        </details>
        <details className="ctx-submenu">
          <summary>יישור לקנבס</summary>
          <button className="ctx-item" onClick={onTextCenterCanvas} type="button">מרכז בקנבס</button>
          <button className="ctx-item" onClick={onTextCenterX} type="button">יישור אופקי למרכז</button>
          <button className="ctx-item" onClick={onTextCenterY} type="button">יישור אנכי למרכז</button>
        </details>
        <details className="ctx-submenu">
          <summary>ארגון חכם</summary>
          <button className="ctx-item" onClick={onTextSmartBlock} type="button">Smart Text Block</button>
          <button className="ctx-item" onClick={onTextSmartFitFull} type="button">התאמה מלאה</button>
          <button className="ctx-item" onClick={onTextSmartFitPartial} type="button">התאמה חלקית</button>
          <button className="ctx-item" onClick={onTextSmartFitWrap} type="button">פריסת שורות</button>
        </details>
        <details className="ctx-submenu">
          <summary>טיפוגרפיה</summary>
          <button className="ctx-item" onClick={onTextBold} type="button">Bold</button>
          <button className="ctx-item" onClick={onTextItalic} type="button">Italic</button>
          <button className="ctx-item" onClick={onTextIncreaseSize} type="button">הגדל טקסט</button>
          <button className="ctx-item" onClick={onTextDecreaseSize} type="button">הקטן טקסט</button>
          <button className="ctx-item" onClick={onTextAlignLeft} type="button">יישור שמאל</button>
          <button className="ctx-item" onClick={onTextAlignCenter} type="button">יישור מרכז</button>
          <button className="ctx-item" onClick={onTextAlignRight} type="button">יישור ימין</button>
          <button className="ctx-item" onClick={onTextDirectionAuto} type="button">כיוון Auto</button>
          <button className="ctx-item" onClick={onTextDirectionRtl} type="button">כיוון RTL</button>
          <button className="ctx-item" onClick={onTextDirectionLtr} type="button">כיוון LTR</button>
        </details>
        <details className="ctx-submenu">
          <summary>אפקטים מהירים</summary>
          <button className="ctx-item" onClick={onTextStrokeWhite} type="button">Stroke לבן</button>
          <button className="ctx-item" onClick={onTextStrokeBlack} type="button">Stroke שחור</button>
          <button className="ctx-item" onClick={onTextShadowSoft} type="button">Shadow רך</button>
          <button className="ctx-item" onClick={onTextShadowHard} type="button">Shadow חזק</button>
          <button className="ctx-item" onClick={onTextRemoveEffects} type="button">הסר אפקטים</button>
          <button className="ctx-item" onClick={onTextCopyEffects} type="button">העתק אפקטים</button>
          <button className="ctx-item" disabled={!hasTextStyleClipboard} onClick={onTextPasteEffects} type="button">הדבק אפקטים</button>
        </details>
      </div>
    );
  }

  return (
    <div
      ref={menuRef}
      className="canvas-context-menu"
      style={{ left: position.left, top: position.top }}
    >
      <button className="ctx-item" disabled={!smartSelectionEnabled} onClick={onSelectObject} type="button">
        Select Object
      </button>
      <button className="ctx-item" disabled={!smartSelectionEnabled} onClick={onRemoveBackground} type="button">
        הסרת רקע
      </button>
      {onAutoFix !== undefined && target.hasImage && (
        <button className="ctx-item" onClick={onAutoFix} type="button">
          ✨ תיקון אוטומטי…
        </button>
      )}
      {onCurves !== undefined && target.hasImage && (
        <button className="ctx-item" onClick={onCurves} type="button">
          עקומות…
        </button>
      )}
      {onShadowHighlights !== undefined && target.hasImage && (
        <button className="ctx-item" onClick={onShadowHighlights} type="button">
          צללים / אורות…
        </button>
      )}
      {target.layerType === "frame" && target.hasImage ? (
        <button className="ctx-item" onClick={onOpenIsolatedImageEditor} type="button">
          עריכת תמונה מבודדת
        </button>
      ) : null}
      <button className="ctx-item" disabled={target.layerType !== "image"} onClick={onConvertAlphaToFrame} type="button">
        Alpha Mask
      </button>
      <button className="ctx-item" onClick={onSaveAsCollageTemplate} type="button">
        שמור כתבנית קולאג'
      </button>
      <div className="ctx-divider" />
      <details className="ctx-submenu">
        <summary>התאמה לקנבס</summary>
        <button className="ctx-item" onClick={onFitCanvasFill} type="button">מלא קנבס</button>
        <button className="ctx-item" onClick={onFitCanvasFit} type="button">התאמה חלקית</button>
        <button className="ctx-item" onClick={onCenterCanvas} type="button">מרכז בקנבס</button>
        <button className="ctx-item" onClick={onResetTransform} type="button">איפוס טרנספורמציה</button>
      </details>
      <details className="ctx-submenu">
        <summary>שכבות</summary>
        <button className="ctx-item" onClick={onMoveToFront} type="button">העבר לשכבה עליונה</button>
        <button className="ctx-item" onClick={onMoveToBack} type="button">העבר לרקע</button>
        <button className="ctx-item" onClick={onMoveForward} type="button">העבר קדימה</button>
        <button className="ctx-item" onClick={onMoveBackward} type="button">העבר אחורה</button>
        <button className="ctx-item" onClick={onToggleLock} type="button">נעל / שחרר</button>
        <button className="ctx-item" onClick={onToggleVisibility} type="button">הסתר / הצג</button>
      </details>
      <details className="ctx-submenu">
        <summary>טרנספורמציה</summary>
        <button className="ctx-item" onClick={onRotate90} type="button">סיבוב 90 מעלות</button>
        <button className="ctx-item" onClick={onRotate180} type="button">סיבוב 180 מעלות</button>
        <button className="ctx-item" onClick={onFlipHorizontal} type="button">היפוך מראה אופקי</button>
        <button className="ctx-item" onClick={onFlipVertical} type="button">היפוך מראה אנכי</button>
      </details>
      <details className="ctx-submenu">
        <summary>סגנון מהיר</summary>
        <button className="ctx-item" onClick={onWhiteBorder} type="button">מסגרת לבנה 20px</button>
        <button className="ctx-item" onClick={onBlackBorder} type="button">מסגרת שחורה 20px</button>
      </details>
      <details className="ctx-submenu">
        <summary>עריכה</summary>
        <button className="ctx-item" onClick={onReplaceImage} type="button">החלף תמונה</button>
        <button className="ctx-item" onClick={onDuplicate} type="button">שכפל תמונה</button>
        <button className="ctx-item" onClick={onSmartRepeat} type="button">שכפול חכם לדף…</button>
        {onHarmonize && target.hasImage && (
          <button className="ctx-item" onClick={onHarmonize} type="button">מיזוג סגנון</button>
        )}
      </details>
      {target.hasImage && (onSmartExpand ?? onAiExpand ?? onAiRemove ?? onContentFill ?? onAiUpscale ?? onAiRestore) && (
        <details className="ctx-submenu">
          <summary>✨ כלי AI</summary>
          {onSmartExpand && <button className="ctx-item" onClick={onSmartExpand} type="button">✨ הרחבה חכמה</button>}
          {onAiExpand && <button className="ctx-item" onClick={onAiExpand} type="button">הרחב תמונה</button>}
          {onAiRemove && <button className="ctx-item" onClick={onAiRemove} type="button">הסר אובייקט</button>}
          {onContentFill && <button className="ctx-item" onClick={onContentFill} type="button">מחיקה / מילוי חכם ✨</button>}
          {onAiUpscale && <button className="ctx-item" onClick={onAiUpscale} type="button">שפר רזולוציה</button>}
          {onAiRestore && <button className="ctx-item" onClick={onAiRestore} type="button">שחזר תמונה</button>}
        </details>
      )}
      <div className="ctx-divider" />
      <button
        className="ctx-item"
        disabled={imageEditorBusy || !imageEditorAvailable}
        title={imageEditorAvailable ? undefined : "עורך התמונות לא זמין (נדרש Electron + Python)"}
        onClick={imageEditorAvailable ? onOpenImageEditor : undefined}
      >
        <span className="ctx-icon">🎨</span>
        {imageEditorBusy ? "פותח עורך…" : "ערוך בעורך התמונות"}
      </button>
      {target.hasImage && (
        <>
          <div className="ctx-divider" />
          <button
            className="ctx-item"
            disabled={!photoshopConfigured}
            title={photoshopConfigured ? "ערוך בפוטושופ" : "Photoshop לא מוגדר — הגדר ב'כלי עזר'"}
            onClick={onOpenInPhotoshop}
          >
            <span className="ctx-icon">Ps</span>
            ערוך ב-Photoshop
          </button>
          <button
            className="ctx-item"
            disabled={!colorLabConfigured}
            title={colorLabConfigured ? "פתח ב-ColorLab" : "ColorLab לא מוגדר — הגדר ב'כלי עזר'"}
            onClick={onOpenInColorLab}
          >
            <span className="ctx-icon">🎨</span>
            פתח ב-ColorLab
          </button>
        </>
      )}
      <div className="ctx-divider" />
      <button className="ctx-item" onClick={onAddToFavorites} type="button">
        הוסף לספרייה המקומית
      </button>
    </div>
  );
}

function hasAnyImageEffect(effects: ImageLayerEffects): boolean {
  return (
    effects.brightness !== 0 || effects.contrast !== 0 || effects.saturation !== 0 ||
    effects.exposure !== 0 || effects.hue !== 0 || effects.grayscale || effects.blur > 0 ||
    effects.shadow !== null || effects.outline !== null
  );
}

interface PsdTextMetadata {
  text: string;
  fontNames: string[];
  fontSize: number | null;
  color: string | null;
}

function readPsdTextMetadata(value: unknown): PsdTextMetadata | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text : "";
  const fontNames = Array.isArray(record.fontNames)
    ? record.fontNames.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
  const fontSize = typeof record.fontSize === "number" && Number.isFinite(record.fontSize) ? record.fontSize : null;
  const color = typeof record.color === "string" && /^#[0-9a-f]{6}$/i.test(record.color) ? record.color : null;
  return { text, fontNames, fontSize, color };
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function LayerThumbnail({ assets, layer }: { assets: Asset[]; layer: VisualLayer }): ReactElement {
  useEffect(() => trackDebugMount("LayerThumbnail", { layerId: layer.id, type: layer.type }), [layer.id, layer.type]);

  if (layer.type === "image") {
    const asset = assets.find((item) => item.id === layer.assetId);
    const hasFx = hasAnyImageEffect(layer.effects);
    if (asset?.previewPath !== undefined) {
      return (
        <span className="layer-thumb image-wrap">
          <img alt="" className="layer-thumb image" src={asset.previewPath} />
          {hasFx ? <em className="fx-badge">fx</em> : null}
        </span>
      );
    }
  }

  if (layer.type === "frame" && layer.contentType === "image") {
    const asset = assets.find((item) => item.id === layer.imageAssetId);
    if (asset?.previewPath !== undefined) {
      return <img alt="" className="layer-thumb image" src={asset.previewPath} />;
    }
  }

  if (layer.type === "frame" && layer.maskSource?.type === "alphaAsset") {
    const asset = assets.find((item) => item.id === layer.maskSource?.assetId);
    if (asset?.previewPath !== undefined) {
      return (
        <span className="layer-thumb image-wrap">
          <img alt="" className="layer-thumb image" src={asset.previewPath} />
          <em className="fx-badge">mask</em>
        </span>
      );
    }
  }

  if (layer.type === "text") {
    const effectCount = layer.effects.filter((e) => e.enabled).length;
    const hasWarp = layer.warpSettings.enabled && layer.warpSettings.type !== "none";
    return (
      <span className="layer-thumb text" style={{ color: layer.color }}>
        {layer.text.trim().charAt(0) || "T"}
        {effectCount > 0 ? <em>{effectCount}</em> : null}
        {hasWarp ? <em className="warp-badge">W</em> : null}
      </span>
    );
  }

  if (layer.type === "adjustment-layer") {
    return (
      <span className="layer-thumb adjustment">
        <SlidersHorizontal size={15} />
        <em>Adj</em>
      </span>
    );
  }

  return <span className="layer-thumb">{layer.type.slice(0, 3).toUpperCase()}</span>;
}
