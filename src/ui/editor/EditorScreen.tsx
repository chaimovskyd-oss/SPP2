import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Boxes,
  ChevronDown,
  Circle,
  Clipboard,
  Copy,
  Eraser,
  Download,
  FileDown,
  FileText,
  FileUp,
  ChevronsDown,
  ChevronsUp,
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
  RectangleHorizontal
} from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
  type ReactElement,
  type ReactNode
} from "react";
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
  createFrameLayer,
  createImageLayer,
  createMaskTextOverlay,
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
  type AlignmentCommand,
  type AutosaveResult
} from "@/core";
import { MASK_DIMENSION_LABELS, MASK_DIMENSION_UNITS, type MaskDimensionUnit } from "@/core/mask/maskDimensions";
import { importImageAsset, createMaskAsset, resolveCanvasAssetPath } from "@/core/assets/assetManager";
import { analyzeScreenshotCrop } from "@/core/image/screenshotCropDetector";
import {
  applyScreenshotCropToAsset,
  getAppliedScreenshotCrop,
  getEffectiveSourceSize,
  getScreenshotCropSuggestion,
  ignoreScreenshotCropForAsset,
  resetScreenshotCropForAsset,
  type ScreenshotCropSuggestionMetadata
} from "@/core/image/screenshotCropMetadata";
import { measureTextLayerSize } from "@/core/text/measurement";
import {
  BUILTIN_TEXT_PRESETS,
  createTextPresetFromLayer,
  deleteUserTextPreset,
  loadUserTextPresets,
  saveUserTextPreset,
  updateUserTextPreset
} from "@/core/text/presets";
import { useDocumentStore } from "@/state/documentStore";
import { generateMaskThumbnail, useMaskLibraryStore } from "@/state/maskLibraryStore";
import { useSelectionStore } from "@/state/selectionStore";
import { useImageEditStore } from "@/state/imageEditStore";
import { useDrawingToolsStore } from "@/state/drawingToolsStore";
import { useColorStore } from "@/state/colorStore";
import { useMaskContentEditStore } from "@/state/maskContentEditStore";
import { ImageEditToolbar } from "./ImageEditToolbar";
import { ImageEditFloatingBar } from "./ImageEditFloatingBar";
import { CropUI } from "./CropUI";
import { useViewportStore, type ViewportStore } from "@/state/viewportStore";
import type { Asset, Document } from "@/types/document";
import type { BlendMode, FrameLayer, ImageLayer, ImageLayerEffects, VisualLayer } from "@/types/layers";
import { DEFAULT_IMAGE_LAYER_EFFECTS } from "@/types/layers";
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
  downloadRenderedPagesAsImages,
  loadProject,
  savePortableProject,
  saveProject
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
import { ColorPanel } from "./ColorPanel";
import { CanvasErrorBoundary } from "./CanvasErrorBoundary";
import { CollageGridOverlay } from "./CollageGridOverlay";
import type { CanvasContextMenuTarget } from "./KonvaLayerNode";
import { isImageEditorAvailable, openImageEditorForAsset } from "@/services/imageEditorService";
import { isPrintPreviewAvailable, openPrintPreviewForRenderedPage, openPrintPreviewForPages } from "@/services/printPreviewService";
import {
  maskResultToSelectionMask,
  runSmartAutoSegment,
  runSmartInpaintRemove,
  runSmartRefineMask
} from "@/services/ai/smartSelectionService";
import { PrintRangeDialog } from "@/ui/print/PrintRangeDialog";
import type { PrintRangeMode } from "@/ui/print/printRangeUtils";
import { getPagesForPrint } from "@/ui/print/printRangeUtils";
import { loadLastPrintSettings, saveLastPrintSettings } from "@/ui/print/lastPrintSettings";
import { useProjectLifecycleStore } from "@/state/projectLifecycleStore";
import { CollageModePanel } from "@/ui/collage/CollageModePanel";
import { PhotoPrintModePanel } from "@/ui/photoPrint/PhotoPrintModePanel";
import { ClassPhotoModePanel } from "@/ui/classPhoto/ClassPhotoModePanel";
import { ProductDefinitionPanel } from "./panels/ProductDefinitionPanel";
import { useProductStore } from "@/state/productStore";
import { regeneratePhotoPrint } from "@/core/photoPrint/photoPrintModeEngine";
import type { PhotoPrintRule } from "@/types/photoPrint";
import { CollageLayoutsPanel } from "@/ui/collage/CollageLayoutsPanel";
import { UtilitiesMenu } from "@/ui/utilities/UtilitiesMenu";
import { GoogleFontsBrowser } from "@/ui/utilities/GoogleFontsBrowser";
import { openInPhotoshop, stopPhotoshopWatch } from "@/integrations/photoshopIntegration";
import { openInColorLab, stopColorLabWatch } from "@/integrations/colorLabIntegration";
import { useUtilitiesSettings } from "@/utilities/settingsStore";
import { isEditableShortcutTarget, matchShortcut, shortcutBindingsToShortcuts } from "@/core/input/inputSystem";
import { useAppSettings } from "@/settings";
import { syncFrameLayersToPage } from "@/core/collage/collageModeEngine";
import {
  fontFamilyExists,
  getFontFavorites,
  getGroupedFonts,
  toggleFontFavorite,
  type FontEntry
} from "./fonts";
import { GraphicsLibraryPanel } from "@/ui/emoji/EmojiLibraryPanel";
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

interface EditorScreenProps {
  onBackHome: () => void;
  onOpenClassPhotoWizard?: () => void;
  onOpenSettings?: () => void;
}

export function EditorScreen({ onBackHome, onOpenClassPhotoWizard, onOpenSettings }: EditorScreenProps): ReactElement {
  const stageRef = useRef<Konva.Stage | null>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const replaceImageInputRef = useRef<HTMLInputElement>(null);
  const classPhotoAddInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const lastAutosavedRevisionRef = useRef(0);
  const aiFillInFlightRef = useRef(false);
  const [tool, setTool] = useState<ToolId>("move");
  const [leftTab, setLeftTab] = useState<"layers" | "pages" | "settings" | "collage" | "emoji">("layers");
  const [collageSwapSourceSlotId, setCollageSwapSourceSlotId] = useState<string | null>(null);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [status, setStatus] = useState("שמירה אוטומטית מוכנה");
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
  const [canvasContextMenu, setCanvasContextMenu] = useState<CanvasContextMenuTarget | null>(null);
  const [layerContextMenu, setLayerContextMenu] = useState<{ layerId: string; screenX: number; screenY: number } | null>(null);
  const [effectsClipboard, setEffectsClipboard] = useState<LayerEffectsClipboard | null>(null);
  const [layerClipboard, setLayerClipboard] = useState<VisualLayer[] | null>(null);
  const [selectionClipboard, setSelectionClipboard] = useState<SelectionClipboard | null>(null);
  const [renamingLayerId, setRenamingLayerId] = useState<string | null>(null);
  const [hoveredLayerId, setHoveredLayerId] = useState<string | null>(null);
  const [imageEditorBusy, setImageEditorBusy] = useState(false);
  const [showFontsBrowser, setShowFontsBrowser] = useState(false);
  const [extWatchId, setExtWatchId] = useState<string | null>(null);
  const [showBackHomeDialog, setShowBackHomeDialog] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [isPrintBusy, setIsPrintBusy] = useState(false);
  const [saveDropdownOpen, setSaveDropdownOpen] = useState(false);
  const [exportScope, setExportScope] = useState<"current" | "all">("all");
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
  const [dynamicGridMode, setDynamicGridMode] = useState(false);
  const utilSettings = useUtilitiesSettings();
  const shortcutSettings = useAppSettings((state) => state.settings.shortcuts.shortcuts);
  const document = useDocumentStore((state) => state.document);
  const activePageId = useDocumentStore((state) => state.activePageId);
  const setDocument = useDocumentStore((state) => state.setDocument);
  const addLayer = useDocumentStore((state) => state.addLayer);
  const addAssetAndLayer = useDocumentStore((state) => state.addAssetAndLayer);
  const updateLayer = useDocumentStore((state) => state.updateLayer);
  const removeLayer = useDocumentStore((state) => state.removeLayer);
  const moveLayer = useDocumentStore((state) => state.moveLayer);
  const reorderLayers = useDocumentStore((state) => state.reorderLayers);
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
  const cropPreview = useImageEditStore((s) => s.cropPreview);
  const whiteBackgroundThreshold = useImageEditStore((s) => s.whiteBackgroundThreshold);
  const setWhiteBackgroundThreshold = useImageEditStore((s) => s.setWhiteBackgroundThreshold);
  const enterImageEditMode = useImageEditStore((s) => s.enterImageEditMode);
  const exitImageEditMode = useImageEditStore((s) => s.exitImageEditMode);
  const maskContentEditActive = useMaskContentEditStore((s) => s.active);
  const maskContentEditLayerId = useMaskContentEditStore((s) => s.editingLayerId);
  const enterMaskContentEdit = useMaskContentEditStore((s) => s.enter);
  const exitMaskContentEdit = useMaskContentEditStore((s) => s.exit);
  const viewport = useViewportStore();
  const lifecycle = useProjectLifecycleStore();

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
  const activePhotoPrintRule = useMemo((): PhotoPrintRule | null => {
    if (!document || !isPhotoPrintMode) return null;
    const ruleId = document.metadata["activePhotoPrintId"];
    if (typeof ruleId !== "string") return document.photoPrintRules[0] ?? null;
    return document.photoPrintRules.find((r) => r.id === ruleId) ?? null;
  }, [document, isPhotoPrintMode]);

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
        "toggleGrid", "toggleRulers", "settings"
      ]);
      if (!handledActions.has(action)) return;

      event.preventDefault();
      event.stopPropagation();

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
        return;
      }

      switch (action) {
        case "save":
          handleSaveLifecycle();
          break;
        case "saveAs":
          void handleSavePortableLifecycle();
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
          handlePasteLayers();
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
    undo,
    redo,
    clearSelection,
    viewport,
    onOpenSettings
  ]);

  // Drawing tool shortcuts: I/B/G/U/M/L toggle their respective tools
  useEffect(() => {
    const KEY_TO_TOOL: Record<string, "eyedropper" | "brush" | "bucket" | "shape" | "marquee" | "lasso"> = {
      i: "eyedropper", I: "eyedropper",
      b: "brush", B: "brush",
      g: "bucket", G: "bucket",
      u: "shape", U: "shape",
      m: "marquee", M: "marquee",
      l: "lasso", L: "lasso"
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
        const { asset } = await importImageAsset(file, currentDocument.assets, { createPreview: true });
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
        const { asset } = await importImageAsset(file, currentDocument.assets, { createPreview: true });
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
                manualContentTransform: nextLayer.contentTransform,
                manualFitModeOverride: nextLayer.fitMode,
                hasManualCropOverride: true,
                hasManualRotationOverride: nextLayer.contentTransform.rotation !== 0
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
        updateCollageImageTransform(activeCollageRule.id, collageMeta.slotId, nextLayer.contentTransform);
        updateLayer(currentPage.id, nextLayer);
      }
      return;
    }

    if (isPhotoPrintMode && activePhotoPrintRule !== null && layer.type === "frame" && layer.metadata["photoPrintSlot"] !== undefined) {
      const asset = currentDocument.assets.find((item) => item.id === layer.imageAssetId);
      const nextLayer = clampFrameLayerToAssetCrop(layer, asset);
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
                manualContentTransform: nextLayer.contentTransform,
                manualFitModeOverride: nextLayer.fitMode,
                hasManualCropOverride: true,
                hasManualRotationOverride: nextLayer.contentTransform.rotation !== 0
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
                manualContentTransform: nextLayer.contentTransform,
                manualFitModeOverride: nextLayer.fitMode,
                hasManualCropOverride: true,
                hasManualRotationOverride: nextLayer.contentTransform.rotation !== 0
              }
            : assignment)
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
      (doc) => ({
        ...doc,
        assets: doc.assets.map((asset) => {
          if (!ids.has(asset.id)) return asset;
          if (mode === "reset") return resetScreenshotCropForAsset(asset);
          if (mode === "ignore") return ignoreScreenshotCropForAsset(asset);
          const suggestion = getScreenshotCropSuggestion(asset);
          return suggestion === null ? asset : applyScreenshotCropToAsset(asset, suggestion);
        })
      }),
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
      const suggestion: ScreenshotCropSuggestionMetadata = {
        ...analysis,
        originalWidth: asset.width ?? image.naturalWidth,
        originalHeight: asset.height ?? image.naturalHeight
      };
      applyDocumentChange(
        "ApplyManualSmartScreenshotCropCommand",
        (doc) => ({
          ...doc,
          assets: doc.assets.map((item) =>
            item.id === asset.id
              ? applyScreenshotCropToAsset(
                  {
                    ...item,
                    metadata: {
                    ...item.metadata,
                      screenshotCropSuggestion: suggestion as unknown as import("@/types/primitives").JsonValue
                    }
                  },
                  suggestion
                )
              : item
          )
        }),
        currentPage.id
      );
      setStatus("השוליים השחורים נחתכו בצורה לא הרסנית");
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

  async function handleImageFiles(files: FileList | File[], targetFrameId?: string): Promise<void> {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (targetFrameId !== undefined && imageFiles.length > 0) {
      const file = imageFiles[0];
      const { asset } = await importImageAsset(file, currentDocument.assets, { createPreview: true });
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
        const { asset } = await importImageAsset(file, currentDocument.assets, { createPreview: true });
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
        const { asset } = await importImageAsset(file, currentDocument.assets, { createPreview: true });
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
      const { asset } = await importImageAsset(file, currentDocument.assets, { createPreview: true });
      const layer = createFreeImageLayer(asset, currentPage.width, currentPage.height);
      addAssetAndLayer(currentPage.id, asset, layer);
      setSelection([layer.id]);
    }
    if (imageFiles.length > 0) {
      setTool("image");
      setStatus(`נוספו ${imageFiles.length} תמונות`);
    }
  }

  async function handleProjectLoad(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    const envelope = await loadProject(file);
    setDocument(withProjectMetadata(envelope.document, envelope.metadata));
    viewport.setViewport(envelope.document.viewport);
    clearSelection();
    setStatus("הפרויקט נטען");
    event.target.value = "";
  }

  function handleImageInput(event: ChangeEvent<HTMLInputElement>): void {
    const files = event.target.files;
    if (files !== null) void handleImageFiles(files);
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

    const { asset } = await importImageAsset(file, currentDocument.assets, { createPreview: true });
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
      const targetFrame = findFrameAtClientPoint(event.clientX, event.clientY);
      setDropTargetFrame(null);
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

  function handleSaveLifecycle(): void {
    try {
      const stage = stageRef.current;
      const thumbnail = stage === null ? undefined : safeCaptureThumbnail(stage, currentPage);
      const saved = saveProject(withViewport(currentDocument, viewport), {
        filePath: lifecycle.currentFilePath ?? undefined,
        thumbnailPath: thumbnail
      });
      lifecycle.markSaved(saved, saved.metadata.currentFilePath, thumbnail);
      setDocument(withProjectMetadata(saved.document, saved.metadata));
      setStatus("Project saved");
    } catch (error) {
      lifecycle.markSaveFailed(error instanceof Error ? error.message : "Save failed");
      setStatus("Save failed");
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

  function handleBackHome(): void {
    if (lifecycle.isDirty) {
      setShowBackHomeDialog(true);
    } else {
      onBackHome();
    }
  }

  function confirmBackHome(action: "save" | "discard" | "cancel"): void {
    setShowBackHomeDialog(false);
    if (action === "cancel") return;
    if (action === "save") {
      handleSaveLifecycle();
    }
    onBackHome();
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

  async function renderPagesForExport(mimeType: "image/png" | "image/jpeg"): Promise<PrintableStageImage[]> {
    const stage = stageRef.current;
    if (stage === null) return [];
    const allPages = currentDocument.pages;
    const originalPageId = currentPage.id;
    const rendered: PrintableStageImage[] = [];
    for (const page of allPages) {
      if (page.id !== useDocumentStore.getState().activePageId) {
        setActivePage(page.id);
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      }
      rendered.push(exportStagePrintImage(stage, page, mimeType));
    }
    if (useDocumentStore.getState().activePageId !== originalPageId) {
      setActivePage(originalPageId);
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    }
    return rendered;
  }

  async function handleExportPng(): Promise<void> {
    const stage = stageRef.current;
    if (stage === null) return;
    if (exportScope === "all" && currentDocument.pages.length > 1) {
      const pages = await renderPagesForExport("image/png");
      downloadRenderedPagesAsImages(pages, currentDocument.name);
      setStatus(`יוצאו ${pages.length} עמודי PNG`);
    } else {
      exportStagePng(stage, currentDocument.name, currentPage);
      setStatus("PNG יוצא");
    }
  }

  async function handleExportPdf(): Promise<void> {
    const stage = stageRef.current;
    if (stage === null) return;
    if (exportScope === "all" && currentDocument.pages.length > 1) {
      const pages = await renderPagesForExport("image/png");
      await exportRenderedPagesAsPdf(pages, currentDocument.name);
      setStatus(`PDF יוצא (${pages.length} עמודים)`);
    } else {
      await exportStagePdf(stage, currentDocument.name, currentPage);
      setStatus("PDF יוצא");
    }
  }

  async function handleExportJpg(): Promise<void> {
    const stage = stageRef.current;
    if (stage === null) return;
    if (exportScope === "all" && currentDocument.pages.length > 1) {
      const pages = await renderPagesForExport("image/jpeg");
      downloadRenderedPagesAsImages(pages, currentDocument.name);
      setStatus(`יוצאו ${pages.length} עמודי JPEG`);
    } else {
      exportStageJpg(stage, currentDocument.name, currentPage);
      setStatus("JPG exported");
    }
  }

  function handlePrintPreview(): void {
    if (!isPrintPreviewAvailable()) {
      setStatus("מודול ההדפסה זמין רק בהרצה דרך Electron");
      return;
    }
    setShowPrintDialog(true);
  }

  async function handlePrintFromDialog(mode: PrintRangeMode, customRange: string | undefined): Promise<void> {
    const stage = stageRef.current;
    if (!stage) return;

    const allPages = currentDocument.pages;
    const rangeResult = getPagesForPrint(mode, customRange, allPages.length, currentPageIndex);

    if ("error" in rangeResult) {
      setStatus(rangeResult.error);
      return;
    }

    const pageIndices = rangeResult;
    saveLastPrintSettings({ printRangeMode: mode, customPageRange: customRange });
    setIsPrintBusy(true);
    markDebugEvent("print:prepare", { mode, customRange, pageCount: pageIndices.length });
    setStatus("מכין עמודים להדפסה…");

    try {
      if (pageIndices.length === 1) {
        // Single page → Python print preview (existing flow)
        const page = allPages[pageIndices[0]];
        if (!page) { setStatus("עמוד לא נמצא"); return; }

        if (page.id !== currentPage.id) {
          markDebugEvent("print:page-switch-for-render", { from: currentPage.id, to: page.id });
          setActivePage(page.id);
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        }

        markDebugEvent("print:render-single-start", { pageId: page.id });
        const rendered = exportStagePrintImage(stage, page, "image/png");
        markDebugEvent("print:render-single-end", { pageId: page.id, dataUrlLength: rendered.dataUrl.length });
        const pageName = typeof page.metadata["name"] === "string" ? page.metadata["name"] : undefined;

        setShowPrintDialog(false);
        const result = await openPrintPreviewForRenderedPage({
          ...rendered,
          documentName: currentDocument.name,
          pageName
        });

        if (!result.success) {
          setStatus(`שגיאה בפתיחת הדפסה: ${result.error ?? "לא ידוע"}`);
          return;
        }
        setStatus("חלון הדפסה נפתח");

      } else {
        // Multi-page → render all pages sequentially → Python print preview (multi-page mode)
        const originalPageId = currentPage.id;
        const renderedPages: PrintableStageImage[] = [];
        const renderedPageNames: string[] = [];

        for (const idx of pageIndices) {
          const page = allPages[idx];
          if (!page) continue;
          markDebugEvent("print:page-switch-for-render", { from: useDocumentStore.getState().activePageId, to: page.id, index: idx });
          setActivePage(page.id);
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          markDebugEvent("print:render-page-start", { pageId: page.id, index: idx });
          renderedPages.push(exportStagePrintImage(stage, page, "image/png"));
          markDebugEvent("print:render-page-end", { pageId: page.id, index: idx, renderedCount: renderedPages.length });
          const name = typeof page.metadata["name"] === "string" ? page.metadata["name"] : `עמוד ${idx + 1}`;
          renderedPageNames.push(name);
        }

        markDebugEvent("print:restore-original-page", { originalPageId });
        setActivePage(originalPageId);

        if (renderedPages.length === 0) {
          setStatus("לא נמצאו עמודים להדפסה");
          return;
        }

        setShowPrintDialog(false);
        markDebugEvent("print:open-preview-pages", { pageCount: renderedPages.length });
        const result = await openPrintPreviewForPages(renderedPages, currentDocument.name, renderedPageNames);

        if (!result.success) {
          // Fallback: open the first page image with the OS default app (Windows print tool)
          setStatus(`שגיאה במודול ההדפסה — פותח בכלי Windows: ${result.error ?? ""}`);
          const sppFallback = (window as unknown as { spp?: { openPath?: (p: string) => Promise<{ error?: string }> } }).spp;
          if (sppFallback?.openPath) {
            // open first temp image so user can print from OS viewer
            const sppWrite = (window as unknown as { spp?: { writeTempImage?: (d: string, e: string) => Promise<string> } }).spp;
            if (sppWrite?.writeTempImage) {
              const p = renderedPages[0];
              const fp = await sppWrite.writeTempImage(p.dataUrl, p.mimeType === "image/jpeg" ? "jpg" : "png");
              await sppFallback.openPath(fp);
            }
          }
          return;
        }

        setStatus(`נשלחו ${renderedPages.length} עמודים לתצוגת ההדפסה`);
      }
    } catch (err) {
      setStatus(`שגיאה בהדפסה: ${err instanceof Error ? err.message : "לא ידוע"}`);
    } finally {
      setIsPrintBusy(false);
    }
  }

  async function handlePrintOneCopy(): Promise<void> {
    if (!isPrintPreviewAvailable()) {
      setStatus("מודול ההדפסה זמין רק בהרצה דרך Electron");
      return;
    }
    const last = loadLastPrintSettings();
    if (!last) {
      setShowPrintDialog(true);
      return;
    }
    await handlePrintFromDialog(last.printRangeMode, last.customPageRange);
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

  function handleCopySelectedLayers(): void {
    if (selectedLayers.length === 0) return;
    setLayerClipboard(selectedLayers.map((layer) => structuredClone(layer) as VisualLayer));
    setStatus("Selection copied");
  }

  function handlePasteLayers(): void {
    if (layerClipboard === null || layerClipboard.length === 0) return;
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

    // Render the layer's *current visible alpha* (image alpha ∩ shape clip ∩
    // pixelMask ∩ library mask, with crop/flip/imageScale/imageOffset) into a
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
      contentType: "empty",
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
    setStatus("Converted layer alpha to an empty image frame");
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

  async function handleSmartRefineSelection(): Promise<void> {
    const target = getSmartSelectionTarget();
    const store = useImageEditStore.getState();
    const selection = store.selectionMask;
    if (target === null || selection === null) return;
    store.setSmartSelectionStatus("working", "Refining edges...");
    store.setSmartSelectionProgress({ phase: "refine", message: "Refining edges...", percent: null });
    setStatus("Refining selection edges...");
    try {
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
      const result = await runSmartInpaintRemove(target.asset, target.layer, selection, renderedDataUrl);
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
    const nextLayer = { ...selectedLayer, text };
    const size = measureTextLayerSize(nextLayer);
    updateLayer(currentPage.id, { ...nextLayer, width: size.width, height: size.height });
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
      updateLayer(activePage.id, { ...layer, crop: cropPreview });
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

  function patchSelectedLayer(patch: Partial<VisualLayer>): void {
    if (selectedLayer === null) return;

    // Single selection: existing behavior unchanged
    if (selectedLayerIds.length <= 1) {
      const nextLayer = { ...selectedLayer, ...patch } as VisualLayer;
      if (nextLayer.type === "text") {
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

  function handleAlign(command: AlignmentCommand): void {
    if (selectedLayerIds.length === 0) return;
    const alignedLayers = alignLayers({
      page: currentPage,
      layers: currentPage.layers,
      selectedLayerIds,
      command
    });
    alignedLayers.forEach((layer) => {
      const original = currentPage.layers.find((item) => item.id === layer.id);
      if (original !== undefined && (original.x !== layer.x || original.y !== layer.y)) {
        updateLayer(currentPage.id, layer);
      }
    });
    setStatus("Alignment updated");
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

  async function handleClassPhotoAddFiles(files: FileList): Promise<void> {
    if (!activeClassPhotoRule) return;
    const { createClassPhotoPersonRecord: makeRecord } = await import("@/core/classPhoto/classPhotoFactory");
    const { addPeopleToClassPhoto } = useDocumentStore.getState();
    const fileArr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const imported: import("@/types/document").Asset[] = [];
    const newRecords: import("@/types/classPhoto").ClassPhotoPersonRecord[] = [];
    const maxOrder = activeClassPhotoRule.personRecords.reduce((m, r) => Math.max(m, r.orderIndex), -1);
    for (let i = 0; i < fileArr.length; i++) {
      const file = fileArr[i];
      if (!file) continue;
      try {
        const { asset } = await importImageAsset(file, [], { createPreview: true });
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
      {/* Print range dialog */}
      {showPrintDialog && (
        <PrintRangeDialog
          totalPages={currentDocument.pages.length}
          currentPageIndex={currentPageIndex}
          onPrint={(mode, range) => { void handlePrintFromDialog(mode, range); }}
          onPrintOneCopy={() => { void handlePrintOneCopy(); }}
          onCancel={() => { if (!isPrintBusy) setShowPrintDialog(false); }}
          isBusy={isPrintBusy}
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
            available={`${Math.round(overflow.availableWidth)} × ${Math.round(overflow.availableHeight)} px`}
            required={`${Math.round(overflow.requiredWidth)} × ${Math.round(overflow.requiredHeight)} px`}
            resizedTo={`${fitSize.width} × ${fitSize.height} px`}
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
              שמירה אוטומטית היא גיבוי בלבד. האם לשמור לפני החזרה לדף הבית?
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button className="btn btn-primary" type="button" onClick={() => confirmBackHome("save")}>
                <Save size={14} /> שמור וצא
              </button>
              <button className="btn btn-ghost" type="button" style={{ color: "#e53e3e" }} onClick={() => confirmBackHome("discard")}>
                צא ללא שמירה
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => confirmBackHome("cancel")}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
      <header className="topbar">
        <div className="topbar-side">
          <button className="icon-btn" onClick={handleBackHome} title="בית" type="button">
            <Home size={16} />
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
          <span className="project-name">{currentDocument.name}</span>
        </div>

        <div className="topbar-center">
          <span className="mode-label">עיצוב חופשי</span>
          <span className="mode-chip">
            <span />
            Free Mode
          </span>
          <button
            className={`btn btn-ghost ${layoutEditMode ? "btn-accent" : ""}`}
            onClick={toggleLayoutEditMode}
            title="מצב עריכת פריסה — מאפשר הזזה ושינוי גודל של פריימים"
            type="button"
          >
            {layoutEditMode ? "✏️ עריכת פריסה פעילה" : "עריכת פריסה"}
          </button>
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
          <button className="icon-btn" onClick={viewport.zoomOut} title="Zoom out" type="button">
            <ZoomOut size={15} />
          </button>
          <span className="zoom-readout">{Math.round(viewport.zoom * 100)}%</span>
          <button className="icon-btn" onClick={viewport.zoomIn} title="הגדל תצוגה" type="button">
            <ZoomIn size={15} />
          </button>
          <button className="icon-btn" onClick={viewport.fitPage} title="התאם דף" type="button">
            <Maximize2 size={15} />
          </button>
        </div>

        <div className="topbar-side topbar-actions">
          <button
            type="button"
            className="icon-btn"
            title="הגדרות (Ctrl+,)"
            onClick={onOpenSettings}
          >
            <Settings size={15} />
          </button>
          <span className="topbar-divider" />
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
                    onClick={() => { handleSaveLifecycle(); setSaveDropdownOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text-primary)" }}
                  >
                    <Save size={13} /> שמירה (JSON)
                  </button>
                  <button
                    className="save-dropdown-item"
                    type="button"
                    onClick={() => { void handleSavePortableLifecycle(); setSaveDropdownOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 14px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--text-primary)" }}
                  >
                    <FileDown size={13} /> שמירה SPP
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
          {/* Print Preview */}
          <button
            className="btn btn-ghost"
            type="button"
            title="הדפסה — בחר עמודים להדפסה"
            onClick={handlePrintPreview}
          >
            <FileText size={14} />
            הדפסה
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            title="הדפס עותק אחד לפי הגדרות אחרונות"
            onClick={() => { void handlePrintOneCopy(); }}
            style={{ fontSize: 12, opacity: 0.8 }}
          >
            <Zap size={13} />
            עותק אחד
          </button>
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
            applyTextPreset(currentPage.id, selectedLayer.id, preset);
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
            enterImageEditMode(selectedLayer.id, selectedLayer.crop ?? undefined);
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
        onMoveLayer={(direction) => {
          if (selectedLayer !== null) {
            moveLayer(currentPage.id, selectedLayer.id, direction);
          }
        }}
        onNotify={setStatus}
        onPasteTextStyle={() => {
          if (selectedLayer?.type === "text") {
            pasteTextStyle(currentPage.id, [selectedLayer.id]);
            setStatus("Text style pasted");
          }
        }}
        onPatch={patchSelectedLayer}
        onToggleGrid={viewport.toggleGrid}
        onToggleSnap={viewport.toggleSnap}
      />

      <section className="stage">
        <aside className="left-sidebar" aria-label="ניווט">
          <div className="ls-tools">
            <ToolButton active={tool === "move"} icon={MousePointer2} label="הזזה" onClick={() => setTool("move")} testId="tool-move" />
            <ToolButton active={tool === "text"} icon={Type} label="טקסט" onClick={handleAddText} testId="tool-text" />
            <ToolButton active={tool === "image"} icon={ImagePlus} label="תמונה" onClick={() => imageInputRef.current?.click()} testId="tool-image" />
            <ToolButton
              active={layoutEditMode}
              icon={Frame}
              label="עריכת פריסה"
              onClick={toggleLayoutEditMode}
              testId="tool-layout-edit"
            />
            {isCollageMode && (
              <ToolButton
                active={dynamicGridMode}
                icon={LayoutGrid}
                label="גריד דינמי"
                onClick={() => setDynamicGridMode((v) => !v)}
                testId="tool-dynamic-grid"
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
                onRenameComplete={() => setRenamingLayerId(null)}
                onStartRename={(layerId) => setRenamingLayerId(layerId)}
                onReorder={(layerIdsTopToBottom) => reorderLayers(currentPage.id, layerIdsTopToBottom)}
                onSelect={(layerId) => setSelection([layerId])}
                onSelectMany={(layerIds) => setSelection(layerIds)}
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
              hoveredLayerId={hoveredLayerId}
              stageRef={stageRef}
              onBeginTextEdit={(layerId) => {
                setSelection([layerId]);
                setEditingLayerId(layerId);
                setTool("text");
              }}
              onEndTextEdit={() => setEditingLayerId(null)}
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
          {/* Dynamic collage grid overlay */}
          {isCollageMode && dynamicGridMode && activeCollageRule !== null && (
            <CollageGridOverlay
              rule={activeCollageRule}
              page={currentPage}
              viewport={viewport}
              onUpdateSlots={(newSlots) => updateCollageCachedSlots(activeCollageRule.id, newSlots)}
            />
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
          {canvasContextMenu !== null && (
            <CanvasContextMenu
              target={canvasContextMenu}
              imageEditorAvailable={isImageEditorAvailable() && canvasContextMenu.hasImage}
              imageEditorBusy={imageEditorBusy}
              photoshopConfigured={!!utilSettings.photoshopPath}
              colorLabConfigured={!!utilSettings.colorLabPath}
              onClose={() => setCanvasContextMenu(null)}
              onOpenImageEditor={() => void handleOpenImageEditor(canvasContextMenu)}
              onOpenInPhotoshop={() => void handleOpenInPhotoshop(canvasContextMenu)}
              onOpenInColorLab={() => void handleOpenInColorLab(canvasContextMenu)}
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
                onMoveForward={() => moveLayer(currentPage.id, layerContextMenu.layerId, "forward")}
                onMoveBackward={() => moveLayer(currentPage.id, layerContextMenu.layerId, "backward")}
                onMoveToFront={() => moveLayer(currentPage.id, layerContextMenu.layerId, "front")}
                onMoveToBack={() => moveLayer(currentPage.id, layerContextMenu.layerId, "back")}
                onDuplicate={handleDuplicateSelected}
                onDelete={handleDeleteSelected}
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
              />
            );
          })()}
        </div>

        <aside className="right-sidebar">
          <ColorPanel getStageCanvas={() => stageRef.current?.toCanvas({ pixelRatio: 1 }) ?? null} />
          {/* Mode-specific panel at top */}
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
                onBackToWizard={() => onOpenClassPhotoWizard?.()}
              />
            </div>
          ) : null}

          {/* Contextual inspector body */}
          <div className="rs-body">
            {selectedLayer === null ? (
              <EmptyInspectorState />
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
                  </div>
                )}
                <ImageStudio
                  layer={selectedLayer}
                  assets={currentDocument.assets}
                  batchField={(selectedLayer.type === "frame" || selectedLayer.type === "image") ? batchProductionMeta?.variableFields.find((f) => f.layerId === selectedLayer.id) : undefined}
                  onBatchFieldChange={(selectedLayer.type === "frame" || selectedLayer.type === "image") ? (field) => handleBatchFieldChange(selectedLayer.id, field) : undefined}
                  onConvertAlphaToFrame={selectedLayer.type === "image" ? handleConvertAlphaToFrameMask : undefined}
                  onDelete={handleDeleteSelected}
                  onPatch={patchSelectedLayer}
                  onUpdateAsset={updateAsset}
                />
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
          </div>
        </aside>
      </section>

      <footer className="bottombar">
        <div className="bottom-side">
          <span className="current-page-label">עמוד {currentPageIndex + 1} מתוך {currentDocument.pages.length}</span>
          <span>עמוד 1 מתוך {currentDocument.pages.length}</span>
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
              ‹
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
              ›
            </button>
          </div>
          <span className="progress-pill">{status}</span>
        </div>
        <div className="bottom-side bottom-left">
          <span>
            {Math.round(currentPage.width)} x {Math.round(currentPage.height)} px
          </span>
          <span>התאמה למסך</span>
        </div>
      </footer>

      <input ref={imageInputRef} accept="image/*" hidden multiple onChange={handleImageInput} type="file" />
      <input ref={replaceImageInputRef} accept="image/*" hidden onChange={(e) => void handleReplaceImageInput(e)} type="file" />
      <input ref={projectInputRef} accept=".json,.spp.json,.spp" hidden onChange={(event) => void handleProjectLoadLifecycle(event)} type="file" />
      <input ref={classPhotoAddInputRef} accept="image/*" hidden multiple onChange={(e) => { if (e.target.files) void handleClassPhotoAddFiles(e.target.files); e.target.value = ""; }} type="file" />

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

// ─── Tool button ──────────────────────────────────────────────────────────────

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
  onMoveLayer,
  onNotify,
  onPasteTextStyle,
  onPatch,
  onToggleGrid,
  onToggleSnap
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
  onMoveLayer: (direction: "forward" | "backward" | "front" | "back") => void;
  onNotify: (message: string) => void;
  onPasteTextStyle: () => void;
  onPatch: (patch: Partial<VisualLayer>) => void;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
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
      />
    );
  }
  if (selectedLayers.length > 1) {
    return <MixedSelectionToolbar selectedLayers={selectedLayers} onDelete={onDelete} onDuplicate={onDuplicate} onMoveLayer={onMoveLayer} />;
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
        <button
          type="button"
          className={`context-icon${drawingTool === "marquee" ? " on" : ""}`}
          onClick={() => setDrawingTool(drawingTool === "marquee" ? null : "marquee")}
          title="בחירת מלבן (M)"
          data-testid="tool-marquee"
        >
          <RectangleHorizontal size={14} />
        </button>
        <button
          type="button"
          className={`context-icon${drawingTool === "lasso" ? " on" : ""}`}
          onClick={() => setDrawingTool(drawingTool === "lasso" ? null : "lasso")}
          title="לאסו (L)"
          data-testid="tool-lasso"
        >
          <span style={{ fontSize: 11, fontWeight: 700 }}>⌒</span>
        </button>
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
  onApplyPreset,
  onBrowseFonts,
  onCopyTextStyle,
  onDelete,
  onDuplicate,
  onMoveLayer,
  onNotify,
  onPasteTextStyle,
  onPatch
}: {
  hasTextStyleClipboard: boolean;
  layer: Extract<VisualLayer, { type: "text" }>;
  onApplyPreset: (preset: TextPreset) => void;
  onBrowseFonts: () => void;
  onCopyTextStyle: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveLayer: (direction: "forward" | "backward" | "front" | "back") => void;
  onNotify: (message: string) => void;
  onPasteTextStyle: () => void;
  onPatch: (patch: Partial<VisualLayer>) => void;
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
    const preset = createTextPresetFromLayer(layer, layer.name || "Custom text preset");
    setUserPresets(saveUserTextPreset(preset));
    onNotify(`הפריסט "${preset.name}" נשמר`);
  }

  function removeToolbarPreset(preset: TextPreset): void {
    setUserPresets(deleteUserTextPreset(preset.presetId));
    onNotify(`הפריסט "${preset.name}" נמחק`);
  }

  function uploadPatternImage(file: File | undefined): void {
    if (file === undefined || pattern === undefined) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      patchTextEffect(pattern, "pattern_overlay", {
        patternType: "uploaded_image",
        imageDataUrl: reader.result,
        imageName: file.name,
        opacity: Math.max(0.2, Number((pattern.params as Record<string, unknown>)["opacity"] ?? 0.65))
      });
    };
    reader.readAsDataURL(file);
  }

  return (
    <section className="context-toolbar text-mode" aria-label="Text context toolbar" data-testid="context-toolbar">
      <span className="context-toolbar-label">טקסט</span>
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
      <ToolbarMenu label="Presets" title="פריסטים לטקסט">
        <div className="context-menu-actions">
          <button className="context-menu-button" onClick={onCopyTextStyle} type="button"><Copy size={13} /> Copy FX</button>
          <button className="context-menu-button" disabled={!hasTextStyleClipboard} onClick={onPasteTextStyle} type="button"><Clipboard size={13} /> Paste FX</button><button className="context-menu-button" onClick={saveToolbarPreset} type="button"><Save size={13} /> Save preset</button>
        </div>
        <div className="context-preset-grid">
          {allPresets.map((preset) => (
            <button className="context-preset-chip" key={preset.presetId} onClick={() => applyPresetWithFontFallback(preset)} type="button">
              <span style={presetPreviewStyle(preset)}>{layer.text.trim().slice(0, 2) || "טק"}</span>
              <strong>{preset.name}</strong>{!preset.isBuiltin ? <em onClick={(event) => { event.stopPropagation(); removeToolbarPreset(preset); }}>Delete</em> : null}
            </button>
          ))}
        </div>
      </ToolbarMenu>
      <ToolbarMenu label="Stroke" title="קו חיצוני">
        <label className="check-line"><input checked={layer.stroke !== undefined} onChange={(event) => onPatch({ stroke: event.target.checked ? { version: 1, color: "#111111", width: 2, opacity: 1 } : undefined } as Partial<VisualLayer>)} type="checkbox" /> הפעלה</label>
        {layer.stroke !== undefined ? <><input className="context-color wide" onChange={(event) => onPatch({ stroke: { ...layer.stroke, color: event.target.value } } as Partial<VisualLayer>)} type="color" value={layer.stroke.color} /><SliderField label="עובי" min={0} max={30} value={layer.stroke.width} onChange={(value) => onPatch({ stroke: { ...layer.stroke, width: value } } as Partial<VisualLayer>)} unit=" px" /><SliderField label="שקיפות" min={0} max={1} step={0.01} decimals={2} value={layer.stroke.opacity} onChange={(value) => onPatch({ stroke: { ...layer.stroke, opacity: value } } as Partial<VisualLayer>)} /></> : null}
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
        {pattern?.enabled === true ? <><select className="context-select full" onChange={(event) => patchTextEffect(pattern, "pattern_overlay", { patternType: event.target.value })} value={String((pattern.params as Record<string, unknown>)["patternType"] ?? "stripes")}><option value="stripes">Stripes</option><option value="dots">Dots</option><option value="checker">Checker</option><option value="diagonal_shine">Shine</option><option value="noise">Noise</option><option value="halftone">Halftone</option><option value="brushed_metal">Brushed metal</option><option value="uploaded_image">Uploaded image</option></select><label className="context-upload-button"><ImagePlus size={13} /> Upload pattern<input accept="image/*" type="file" onChange={(event) => uploadPatternImage(event.target.files?.[0])} /></label>{typeof (pattern.params as Record<string, unknown>)["imageName"] === "string" ? <span className="context-menu-section-label">{String((pattern.params as Record<string, unknown>)["imageName"])}</span> : null}<input className="context-color wide" onChange={(event) => patchTextEffect(pattern, "pattern_overlay", { foreground: event.target.value })} type="color" value={String((pattern.params as Record<string, unknown>)["foreground"] ?? "#ffffff")} /><SliderField label="מרווח" min={4} max={40} value={Number((pattern.params as Record<string, unknown>)["spacing"] ?? 10)} onChange={(value) => patchTextEffect(pattern, "pattern_overlay", { spacing: value })} unit=" px" /><SliderField label="זווית" min={-90} max={90} value={Number((pattern.params as Record<string, unknown>)["rotation"] ?? 0)} onChange={(value) => patchTextEffect(pattern, "pattern_overlay", { rotation: value })} unit="°" /><SliderField label="שקיפות" min={0} max={1} step={0.01} decimals={2} value={Number((pattern.params as Record<string, unknown>)["opacity"] ?? pattern.opacity)} onChange={(value) => patchTextEffect(pattern, "pattern_overlay", { opacity: value })} /></> : null}
      </ToolbarMenu>
      <ToolbarMenu label="3D" title="תלת ממד ותבליט">
        <label className="check-line"><input checked={extrude?.enabled === true} onChange={(event) => event.target.checked ? patchTextEffect(extrude, "extrude_3d", { color: "#333333", depth: 12, offsetX: 1, offsetY: 1, steps: 12, opacity: 0.85 }) : removeTextEffect(extrude)} type="checkbox" /> Extrude</label>
        {extrude?.enabled === true ? <><input className="context-color wide" onChange={(event) => patchTextEffect(extrude, "extrude_3d", { color: event.target.value })} type="color" value={String((extrude.params as Record<string, unknown>)["color"] ?? "#333333")} /><SliderField label="עומק" min={0} max={32} value={Number((extrude.params as Record<string, unknown>)["depth"] ?? 12)} onChange={(value) => patchTextEffect(extrude, "extrude_3d", { depth: value })} unit=" px" /><SliderField label="X" min={-3} max={3} step={0.1} decimals={1} value={Number((extrude.params as Record<string, unknown>)["offsetX"] ?? 1)} onChange={(value) => patchTextEffect(extrude, "extrude_3d", { offsetX: value })} /><SliderField label="Y" min={-3} max={3} step={0.1} decimals={1} value={Number((extrude.params as Record<string, unknown>)["offsetY"] ?? 1)} onChange={(value) => patchTextEffect(extrude, "extrude_3d", { offsetY: value })} /></> : null}
        <label className="check-line"><input checked={bevel?.enabled === true} onChange={(event) => event.target.checked ? patchTextEffect(bevel, "bevel_emboss", { style: "inner_bevel", technique: "smooth", depth: 5, size: 5, soften: 1, highlightColor: "#ffffff", shadowColor: "#000000" }) : removeTextEffect(bevel)} type="checkbox" /> Bevel</label>
        {bevel?.enabled === true ? <><SliderField label="Bevel depth" min={1} max={20} value={Number((bevel.params as Record<string, unknown>)["depth"] ?? 5)} onChange={(value) => patchTextEffect(bevel, "bevel_emboss", { depth: value })} unit=" px" /><SliderField label="Bevel size" min={0} max={20} value={Number((bevel.params as Record<string, unknown>)["size"] ?? 5)} onChange={(value) => patchTextEffect(bevel, "bevel_emboss", { size: value })} unit=" px" /></> : null}
      </ToolbarMenu>
      <ToolbarMenu label="Sparkle" title="נצנוץ סטטי להדפסה">
        <label className="check-line"><input checked={sparkle?.enabled === true} onChange={(event) => event.target.checked ? patchTextEffect(sparkle, "sparkle", { density: 0.24, size: 6, color: "#ffffff", seed: 9, opacity: 0.85, rays: 8, glint: 0.75, halo: 0.7 }) : removeTextEffect(sparkle)} type="checkbox" /> הפעלה</label>
        {sparkle?.enabled === true ? <><input className="context-color wide" onChange={(event) => patchTextEffect(sparkle, "sparkle", { color: event.target.value })} type="color" value={String((sparkle.params as Record<string, unknown>)["color"] ?? "#ffffff")} /><SliderField label="כמות" min={0.02} max={0.8} step={0.01} decimals={2} value={Number((sparkle.params as Record<string, unknown>)["density"] ?? 0.24)} onChange={(value) => patchTextEffect(sparkle, "sparkle", { density: value })} /><SliderField label="גודל" min={1} max={18} value={Number((sparkle.params as Record<string, unknown>)["size"] ?? 6)} onChange={(value) => patchTextEffect(sparkle, "sparkle", { size: value })} unit=" px" /><SliderField label="Glint" min={0} max={1} step={0.01} decimals={2} value={Number((sparkle.params as Record<string, unknown>)["glint"] ?? 0.75)} onChange={(value) => patchTextEffect(sparkle, "sparkle", { glint: value })} /><SliderField label="Halo" min={0} max={1} step={0.01} decimals={2} value={Number((sparkle.params as Record<string, unknown>)["halo"] ?? 0.7)} onChange={(value) => patchTextEffect(sparkle, "sparkle", { halo: value })} /></> : null}
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

function MixedSelectionToolbar({ selectedLayers, onDelete, onDuplicate, onMoveLayer }: { selectedLayers: VisualLayer[]; onDelete: () => void; onDuplicate: () => void; onMoveLayer: (direction: "forward" | "backward" | "front" | "back") => void; }): ReactElement {
  const allText = selectedLayers.every((layer) => layer.type === "text");
  return <section className="context-toolbar" aria-label="Mixed selection toolbar" data-testid="context-toolbar"><span className="context-toolbar-label">{allText ? "בחירת טקסטים" : "בחירה מרובה"} ({selectedLayers.length})</span><div className="context-group"><ToolbarButton icon={Copy} label="שכפל בחירה" onClick={onDuplicate} /><ToolbarButton icon={ChevronsUp} label="הבא קדימה" onClick={() => onMoveLayer("forward")} /><ToolbarButton icon={ChevronsDown} label="שלח אחורה" onClick={() => onMoveLayer("backward")} /><ToolbarButton danger icon={Trash2} label="מחק בחירה" onClick={onDelete} /></div><span className="context-muted">ערכים מעורבים יוצגו כאן בהמשך</span></section>;
}

function PlaceholderContextToolbar({ label, onDelete, onDuplicate, onMoveLayer }: { label: string; onDelete: () => void; onDuplicate: () => void; onMoveLayer: (direction: "forward" | "backward" | "front" | "back") => void; }): ReactElement {
  return <section className="context-toolbar" aria-label={`${label} context toolbar`} data-testid="context-toolbar"><span className="context-toolbar-label">{label}</span><span className="context-muted">מוכן להרחבה בשלב הבא</span><div className="context-group"><ToolbarButton icon={Copy} label="שכפל" onClick={onDuplicate} /><ToolbarButton icon={ChevronsUp} label="הבא קדימה" onClick={() => onMoveLayer("forward")} /><ToolbarButton icon={ChevronsDown} label="שלח אחורה" onClick={() => onMoveLayer("backward")} /><ToolbarButton danger icon={Trash2} label="מחק" onClick={onDelete} /></div></section>;
}

// ─── Image Resize Control ─────────────────────────────────────────────────────

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

  // For frames: "virtual" content size (frame × scale). For images: actual layer size.
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

// ─── Image Context Toolbar ────────────────────────────────────────────────────

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

  // ─── Visual effects helpers ────────────────────────────────────────────────
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

  // ─── Shape / metadata helpers ─────────────────────────────────────────────
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

  // ─── Fit mode ─────────────────────────────────────────────────────────────
  const fitMode = "fitMode" in layer ? (layer.fitMode as string) : "fit";

  // ─── Corner radius (FrameLayer has its own field, ImageLayer uses metadata) ──
  const frameCornerRadius = isFrame ? ((layer as Extract<VisualLayer, { type: "frame" }>).cornerRadius ?? 0) : cornerRadius;

  function setCornerRadius(v: number): void {
    if (isFrame) {
      onPatch({ cornerRadius: v } as Partial<VisualLayer>);
    } else {
      patchMeta({ imageCornerRadius: v });
    }
  }

  // ─── Fit to canvas ────────────────────────────────────────────────────────
  function fitToCanvas(mode: "fill" | "fit"): void {
    const imgW = layer.width;
    const imgH = layer.height;
    if (imgW <= 0 || imgH <= 0) return;
    const scaleX = canvasWidth / imgW;
    const scaleY = canvasHeight / imgH;
    const scale = mode === "fill" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
    const newW = imgW * scale;
    const newH = imgH * scale;
    const newX = (canvasWidth - newW) / 2;
    const newY = (canvasHeight - newH) / 2;
    onPatch({ width: newW, height: newH, x: newX, y: newY } as Partial<VisualLayer>);
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
      <div className="context-group">
        <ToolbarButton icon={RotateCw} label="סובב 90°" onClick={() => onPatch({ rotation: ((layer.rotation ?? 0) + 90) % 360 } as Partial<VisualLayer>)} />
        <ToolbarButton active={flipH} icon={FlipHorizontal} label="היפוך אופקי" onClick={() => patchMeta({ flipH: !flipH })} />
        <ToolbarButton active={flipV} icon={FlipVertical} label="היפוך אנכי" onClick={() => patchMeta({ flipV: !flipV })} />
      </div>

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

// ─── Panel header ─────────────────────────────────────────────────────────────

function PanelHeader({ selectedLayer }: { selectedLayer: VisualLayer | null }): ReactElement {
  return (
    <header className="panel-header">
      <h2 className="panel-title">{selectedLayer === null ? "מסמך" : selectedLayer.name}</h2>
      <span className="panel-pill">{selectedLayer === null ? "ללא בחירה" : selectedLayer.type}</span>
    </header>
  );
}

// ─── Accordion section ────────────────────────────────────────────────────────

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

// ─── Template Save Modal ──────────────────────────────────────────────────────

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

// ─── Batch Variable Section ───────────────────────────────────────────────────

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

// ─── Empty inspector state ────────────────────────────────────────────────────

function EmptyInspectorState(): ReactElement {
  return (
    <div className="empty-inspector">
      <Layers className="empty-inspector-icon" size={32} />
      <strong>לא נבחרה שכבה</strong>
      <p>בחר אובייקט בקנבס<br />כדי לערוך את מאפייניו.</p>
    </div>
  );
}

// ─── Text Studio ──────────────────────────────────────────────────────────────

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

// ─── Smart Tips Panel ────────────────────────────────────────────────────────

import { PHOTO_TIPS, TIP_CATEGORIES, CATEGORY_LABELS, PARAM_MAP } from "@/data/photoTipsData";
import type { PhotoTip } from "@/data/photoTipsData";

function SmartTipsPanel({
  layer,
  onPatch
}: {
  layer: VisualLayer;
  onPatch: (patch: Partial<VisualLayer>) => void;
}): ReactElement {
  const [selectedCategory, setSelectedCategory] = useState(TIP_CATEGORIES[0] ?? "Light");
  const [selectedTipId, setSelectedTipId] = useState<string | null>(null);

  const imageLayer = layer.type === "image" ? layer : null;

  const tipsInCategory = PHOTO_TIPS.filter((t) => t.category === selectedCategory);
  const tip = PHOTO_TIPS.find((t) => t.id === selectedTipId) ?? tipsInCategory[0] ?? null;

  // Select first tip of new category
  useEffect(() => {
    setSelectedTipId(tipsInCategory[0]?.id ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory]);

  function applyFix(params: Record<string, unknown>): void {
    if (imageLayer === null) return;
    const adj = { ...imageLayer.colorAdjustments };
    const extras = { ...((layer.metadata["imageEditParams"] as Record<string, number> | undefined) ?? {}) };

    for (const [key, raw] of Object.entries(params)) {
      const mapping = PARAM_MAP[key];
      if (mapping === undefined) continue;
      const numVal = typeof raw === "number" ? raw : 0;
      const scaled = mapping.scale !== undefined ? numVal * mapping.scale : numVal;
      if (mapping.field === "adj") {
        (adj as Record<string, number>)[mapping.key] = Math.round(scaled);
      } else {
        extras[mapping.key] = Math.round(scaled);
      }
    }

    onPatch({
      colorAdjustments: adj,
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
            {t.title}
          </button>
        ))}
      </div>

      {/* Tip detail */}
      {tip !== null && (
        <div className="tip-detail">
          <h4 className="tip-title">{tip.title}</h4>
          {tip.problem && <p className="tip-problem">{tip.problem}</p>}

          <div className="tip-section-label">תסמינים</div>
          <ul className="tip-list-items">
            {tip.symptoms.map((s, i) => <li key={i}>{s}</li>)}
          </ul>

          <div className="tip-section-label">סדר תיקון מומלץ</div>
          <ol className="tip-steps">
            {tip.recommended_steps.map((step, i) => (
              <li key={i}>
                <strong>{step.tool}</strong>: {step.action}
                {step.suggested_range && (
                  <span className="tip-range"> ({step.suggested_range})</span>
                )}
              </li>
            ))}
          </ol>

          {tip.warnings.length > 0 && (
            <>
              <div className="tip-section-label">⚠ אזהרות</div>
              <ul className="tip-list-items warnings">
                {tip.warnings.map((w, i) => <li key={i}>{w}</li>)}
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

type EngineParams = Record<string, number | boolean | string>;

type QuickSliderParam = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  hint: string;
};

const QUICK_LIGHT_PARAMS: QuickSliderParam[] = [
  {
    key: "exposure",
    label: "חשיפה",
    min: -25,
    max: 25,
    step: 1,
    default: 0,
    hint: "תיקון חשיפה עדין — לא שורף לבן ולא מחשיך מדי"
  },
  {
    key: "brightness",
    label: "בהירות",
    min: -28,
    max: 28,
    step: 1,
    default: 0,
    hint: "בהירות כללית בטווח נורמלי להדפסה"
  },
  {
    key: "contrast",
    label: "קונטרסט",
    min: -35,
    max: 35,
    step: 1,
    default: 0,
    hint: "קונטרסט מתון, בלי תוצאה שרופה או קשה מדי"
  },
  {
    key: "luminance",
    label: "לומיננס",
    min: -25,
    max: 25,
    step: 1,
    default: 0,
    hint: "הבהרה/הכהיה עדינה דרך HSL"
  }
];

const QUICK_COLOR_PARAMS: QuickSliderParam[] = [
  {
    key: "saturation",
    label: "רוויה",
    min: -40,
    max: 40,
    step: 1,
    default: 0,
    hint: "חיזוק או החלשה מתונה של צבעים"
  },
  {
    key: "hue",
    label: "גוון",
    min: -25,
    max: 25,
    step: 1,
    default: 0,
    hint: "הסטת גוון עדינה בלבד"
  },
  {
    key: "blur",
    label: "טשטוש קל",
    min: 0,
    max: 5,
    step: 0.5,
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

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, marginBottom: 3 }}>
        <span title={param.hint} style={{ color: isDirty ? "var(--color-accent,#7C6FE0)" : "inherit" }}>
          {param.label}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, opacity: 0.7 }}>
          {value}
          {isDirty && onReset !== undefined && (
            <button
              aria-label="אפס ערך"
              onClick={() => onReset(param.key)}
              style={{ lineHeight: 1, padding: 0, fontSize: 10, color: "var(--color-accent,#7C6FE0)", background: "none", border: "none", cursor: "pointer" }}
              title="אפס"
              type="button"
            >
              ×
            </button>
          )}
        </span>
      </div>
      <input
        type="range"
        min={param.min}
        max={param.max}
        step={param.step}
        value={value}
        onChange={(event) => onChange(param.key, Number(event.target.value))}
        style={{ width: "100%", accentColor: isDirty ? "#7C6FE0" : undefined }}
      />
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
  onPatch,
  onUpdateAsset,
}: {
  layer: VisualLayer;
  assets: Asset[];
  batchField?: BatchVariableField;
  onBatchFieldChange?: (field: BatchVariableField | null) => void;
  onConvertAlphaToFrame?: () => void;
  onDelete: () => void;
  onPatch: (patch: Partial<VisualLayer>) => void;
  onUpdateAsset: (asset: Asset) => void;
}): ReactElement {
  const [studioTab, setStudioTab] = useState<"quick" | "tips">("quick");
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
    return (layer.metadata["imageEditParams"] ?? {}) as EngineParams;
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
      patchQuickParams({ ...savedParams, [key]: 0 });
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
      </div>

      {studioTab === "tips" && <SmartTipsPanel layer={layer} onPatch={onPatch} />}

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
              <QuickSlider key={param.key} param={param} params={savedParams} onChange={updateParam} />
            ))}

            {removeWhiteEnabled && (
              <QuickSlider
                param={{
                  key: "remove_white_tolerance",
                  label: "רגישות רקע לבן",
                  min: 5,
                  max: 55,
                  step: 1,
                  default: 22,
                  hint: "כמה גוונים בהירים יוסרו. לשמור מתון כדי לא לפגוע בפרטים בהירים"
                }}
                params={savedParams}
                onChange={updateParam}
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
                    step: 1,
                    default: 28,
                    hint: "כמה צבעים קרובים לצבע הנבחר יישארו צבעוניים"
                  }}
                  params={savedParams}
                  onChange={updateParam}
                />
                <QuickSlider
                  param={{
                    key: "color_pop_background",
                    label: "דהיית שאר הצבעים",
                    min: 50,
                    max: 100,
                    step: 5,
                    default: 100,
                    hint: "100 = שאר התמונה שחור־לבן מלא, ערך נמוך משאיר מעט צבע"
                  }}
                  params={savedParams}
                  onChange={updateParam}
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



// ─── Pages panel (left sidebar pages tab) ────────────────────────────────────

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
      <span>׳¢׳׳•׳“ {index + 1}</span>
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

// ─── Page settings panel (left sidebar settings tab) ─────────────────────────

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
    </div>
  );
}

// ─── Slider field ─────────────────────────────────────────────────────────────

function GridModePanel({
  assignmentCount,
  rule,
  selectedLayer,
  onAddFilenameText,
  onAddImages,
  onApplyFit,
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
  onApplySelectedText: () => void;
  onDeleteSelectedImage: () => void;
  onRegenerate: (rule: MaskLayoutRule, patch: Partial<MaskLayoutRule>) => void;
  onResetCrops: () => void;
  onChangePreset: (entry: import("@/state/maskLibraryStore").MaskLibraryEntry) => void;
}): ReactElement {
  const [maskWidth, setMaskWidth] = useState(rule.maskWidth);
  const [maskHeight, setMaskHeight] = useState(rule.maskHeight);
  const [spacingX, setSpacingX] = useState(rule.spacingX);
  const [spacingY, setSpacingY] = useState(rule.spacingY);
  const [maskUnit, setMaskUnit] = useState<MaskDimensionUnit>("mm");
  const [widthDraft, setWidthDraft] = useState("");
  const [heightDraft, setHeightDraft] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
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
    setSpacingX(rule.spacingX);
    setSpacingY(rule.spacingY);
  }, [rule.id, rule.maskWidth, rule.maskHeight, rule.spacingX, rule.spacingY]);

  useEffect(() => {
    setWidthDraft(formatDimension(pxToUnit(maskWidth, maskUnit, dpi), maskUnit));
    setHeightDraft(formatDimension(pxToUnit(maskHeight, maskUnit, dpi), maskUnit));
  }, [dpi, maskUnit, maskWidth, maskHeight]);

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
    onRegenerate(rule, { maskWidth: nextWidth, maskHeight: nextHeight, spacingX, spacingY });
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
        <NumberField label="רווח X" min={0} max={400} value={Math.round(spacingX)} onChange={setSpacingX} />
        <NumberField label="רווח Y" min={0} max={400} value={Math.round(spacingY)} onChange={setSpacingY} />
      </div>
      <button className="mini-action success" onClick={commitAndRegenerate} type="button">
        בנה מחדש
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

// ─── Font selector ────────────────────────────────────────────────────────────

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

  const groups = useMemo(() => getGroupedFonts(favorites, query), [favorites, query]);

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

  return (
    <div className={`font-selector ${open ? "open" : ""}`}>
      <button
        className="font-trigger"
        onClick={() => setOpen((v) => !v)}
        style={{ fontFamily: `"${value}", sans-serif` }}
        type="button"
      >
        <span className="font-trigger-label">{value}</span>
        <span className="font-trigger-arrow">▾</span>
      </button>

      {open && (
        <div className="font-dropdown">
          <div className="font-search-wrap">
            <input
              autoFocus
              className="font-search"
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חפש גופן…"
              type="text"
              value={query}
            />
          </div>
          <div className="font-list">
            {renderGroup("★ מועדפים", groups.favorites)}
            {renderGroup("עברית", groups.hebrew)}
            {renderGroup("לטינית", groups.latin)}
            {groups.favorites.length === 0 && groups.hebrew.length === 0 && groups.latin.length === 0 && (
              <div className="font-empty">לא נמצאו גופנים</div>
            )}
          </div>
        </div>
      )}

      {open && <div className="font-overlay" onClick={() => { setOpen(false); setQuery(""); }} />}
    </div>
  );
}

// ─── Layer inspector ──────────────────────────────────────────────────────────
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
  const isVisualNonText =
    selectedLayer.type === "frame" ||
    selectedLayer.type === "image" ||
    selectedLayer.type === "shape" ||
    selectedLayer.type === "mask";

  return (
    <div className="inspector">
      {/* Metrics + quick controls shown at top ONLY for non-text layers */}
      {!isText ? (
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
          onTextChange={onTextChange}
        />
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

// ─── Non-text layer tabs: Edit | FX ──────────────────────────────────────────

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

// ─── Visual effects controls ──────────────────────────────────────────────────

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

// ─── Text controls ────────────────────────────────────────────────────────────

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
  onTextChange
}: {
  hasTextStyleClipboard: boolean;
  layer: Extract<VisualLayer, { type: "text" }>;
  onApplyPreset: (preset: TextPreset) => void;
  onCopyTextStyle: () => void;
  onNotify?: (message: string) => void;
  onPasteTextStyle: () => void;
  onPatch: (patch: Partial<VisualLayer>) => void;
  onTextChange: (text: string) => void;
}): ReactElement {
  const [tab, setTab] = useState<"type" | "effects" | "warp" | "presets">("type");
  const [userPresets, setUserPresets] = useState<TextPreset[]>(() => loadUserTextPresets());
  const [presetName, setPresetName] = useState("");
  const allPresets = useMemo(() => [...BUILTIN_TEXT_PRESETS, ...userPresets], [userPresets]);

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
      {/* ── Tabs are at the TOP so options are immediately visible ── */}
      <div className="text-tabs" role="tablist" aria-label="Text controls">
        <button className={tab === "type" ? "on" : ""} onClick={() => setTab("type")} type="button">Type</button>
        <button className={tab === "effects" ? "on" : ""} onClick={() => setTab("effects")} type="button">FX</button>
        <button className={tab === "warp" ? "on" : ""} onClick={() => setTab("warp")} type="button">Warp</button>
        <button className={tab === "presets" ? "on" : ""} onClick={() => setTab("presets")} type="button">Presets</button>
      </div>

      {/* ── Type Tab ── */}
      {tab === "type" ? (
        <div className="text-tab-panel">
          <div className="field">
            <span className="field-label">גופן</span>
            <FontSelector
              value={layer.fontFamily}
              onChange={(family) => onPatch({ fontFamily: family } as Partial<VisualLayer>)}
            />
          </div>

          <SliderField
            label="גודל"
            min={8}
            max={240}
            value={layer.fontSize}
            onChange={(v) => onPatch({ fontSize: v } as Partial<VisualLayer>)}
            unit=" px"
          />
          <SliderField
            label="משקל"
            min={100}
            max={900}
            step={100}
            value={layer.fontWeight}
            onChange={(v) => onPatch({ fontWeight: v } as Partial<VisualLayer>)}
          />
          <SliderField
            label="גובה שורה"
            min={0.7}
            max={3}
            step={0.05}
            value={layer.lineHeight}
            onChange={(v) => onPatch({ lineHeight: v } as Partial<VisualLayer>)}
            decimals={2}
            unit="×"
          />
          <SliderField
            label="ריווח אותיות"
            min={-10}
            max={40}
            value={layer.letterSpacing}
            onChange={(v) => onPatch({ letterSpacing: v } as Partial<VisualLayer>)}
            unit=" px"
          />

          <div className="button-row">
            <button
              className={layer.fontWeight >= 700 ? "toggle on" : "toggle"}
              onClick={() => onPatch({ fontWeight: layer.fontWeight >= 700 ? 400 : 700 } as Partial<VisualLayer>)}
              type="button"
              title="Bold"
            >
              <Bold size={14} />
            </button>
            <button
              className={layer.fontStyle === "italic" ? "toggle on" : "toggle"}
              onClick={() => onPatch({ fontStyle: layer.fontStyle === "italic" ? "normal" : "italic" } as Partial<VisualLayer>)}
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
                onChange={(e) => onPatch({ color: e.target.value, autoContrastOverridden: true } as Partial<VisualLayer>)}
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
            onChange={(v) => onPatch({ fillOpacity: v } as Partial<VisualLayer>)}
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
              <textarea className="text-area" dir="auto" value={layer.text} onChange={(e) => onTextChange(e.target.value)} />
            </label>
          </div>
        </div>
      ) : null}

      {/* ── Effects Tab ── */}
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

      {/* ── Warp Tab ── */}
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

      {/* ── Presets Tab ── */}
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
                  <span style={presetPreviewStyle(preset)}>{layer.text.trim().slice(0, 2) || "טק"}</span>
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

function presetPreviewStyle(preset: TextPreset): CSSProperties {
  const glow = preset.effects.find((effect) => effect.effectType === "outer_glow");
  const sparkle = preset.effects.some((effect) => effect.effectType === "sparkle");
  const gradient = preset.style.gradient;
  const gradientCss = gradient === undefined
    ? undefined
    : gradient.type === "radial"
    ? `radial-gradient(circle, ${gradient.stops.map((stop) => `${stop.color} ${Math.round(stop.offset * 100)}%`).join(", ")})`
    : `linear-gradient(${gradient.angle ?? 0}deg, ${gradient.stops.map((stop) => `${stop.color} ${Math.round(stop.offset * 100)}%`).join(", ")})`;
  const glowParams = glow?.params as Record<string, unknown> | undefined;
  const glowShadow = glowParams === undefined
    ? undefined
    : `0 0 ${Number(glowParams["blur"] ?? 18)}px ${String(glowParams["outerColor"] ?? glowParams["color"] ?? "#ffffff")}`;
  return {
    color: preset.style.color ?? "#ffffff",
    fontFamily: preset.style.fontFamily,
    background: gradientCss,
    backgroundClip: gradientCss === undefined ? undefined : "text",
    WebkitBackgroundClip: gradientCss === undefined ? undefined : "text",
    WebkitTextFillColor: gradientCss === undefined ? undefined : "transparent",
    textShadow:
      [preset.style.shadow === undefined ? undefined : `${preset.style.shadow.offsetX}px ${preset.style.shadow.offsetY}px ${preset.style.shadow.blur}px ${preset.style.shadow.color}`, glowShadow, sparkle ? "0 0 3px #fff" : undefined]
        .filter(Boolean)
        .join(", ") || undefined,
    WebkitTextStroke:
      preset.style.stroke === undefined ? undefined : `${preset.style.stroke.width}px ${preset.style.stroke.color}`
  };
}

function Metric({ label, value }: { label: string; value: number }): ReactElement {
  return (
    <span className="metric">
      <span>{label}</span>
      <strong>{Math.round(value)}</strong>
    </span>
  );
}

// ─── Layer list ───────────────────────────────────────────────────────────────

function LayerList({
  assets,
  layers,
  renamingLayerId,
  selectedLayerIds,
  selectedLayerId,
  variableLayerIds,
  onRename,
  onRenameComplete,
  onStartRename,
  onReorder,
  onSelect,
  onSelectMany,
  onToggleLock,
  onToggleVisibility,
  onLayerContextMenu,
  onHoverLayer,
  onMoveImageIntoFrame
}: {
  assets: Asset[];
  layers: VisualLayer[];
  renamingLayerId: string | null;
  selectedLayerIds: string[];
  selectedLayerId: string | null;
  variableLayerIds: Set<string>;
  onRename: (layerId: string, name: string) => void;
  onRenameComplete: () => void;
  onStartRename: (layerId: string) => void;
  onReorder: (layerIdsTopToBottom: string[]) => void;
  onSelect: (layerId: string) => void;
  onSelectMany: (layerIds: string[]) => void;
  onToggleLock: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onLayerContextMenu: (layerId: string, screenX: number, screenY: number) => void;
  onHoverLayer?: (layerId: string | null) => void;
  onMoveImageIntoFrame?: (imageLayerId: string, frameId: string) => void;
}): ReactElement {
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "images" | "text" | "frames" | "framesMasks" | "shapes" | "hidden" | "locked">("all");
  const [draftName, setDraftName] = useState("");
  const ordered = [...layers].sort((a, b) => b.zIndex - a.zIndex);
  const filtered = ordered.filter((layer) => {
    if (filter === "images") return layer.type === "image";
    if (filter === "text") return layer.type === "text";
    if (filter === "frames") return layer.type === "frame" && !isFrameMaskLayer(layer);
    if (filter === "framesMasks") return isFrameMaskLayer(layer);
    if (filter === "shapes") return layer.type === "shape";
    if (filter === "hidden") return !layer.visible;
    if (filter === "locked") return layer.locked;
    return true;
  });
  const canReorder = filter === "all";

  useEffect(() => {
    const layer = layers.find((item) => item.id === renamingLayerId);
    if (layer !== undefined) setDraftName(layer.name);
  }, [layers, renamingLayerId]);

  function handleDrop(event: React.DragEvent<HTMLDivElement>, targetLayerId: string): void {
    event.preventDefault();
    event.stopPropagation();
    if (draggingLayerId === null || draggingLayerId === targetLayerId) {
      setDraggingLayerId(null);
      return;
    }
    // If an ImageLayer is being dropped onto a Frame row, move it into the frame.
    const draggedLayer = layers.find((l) => l.id === draggingLayerId);
    const targetLayer = layers.find((l) => l.id === targetLayerId);
    if (
      onMoveImageIntoFrame !== undefined
      && draggedLayer?.type === "image"
      && targetLayer?.type === "frame"
    ) {
      onMoveImageIntoFrame(draggingLayerId, targetLayerId);
      setDraggingLayerId(null);
      return;
    }
    if (!canReorder) {
      setDraggingLayerId(null);
      return;
    }
    const nextIds = ordered.map((l) => l.id).filter((id) => id !== draggingLayerId);
    const targetIndex = nextIds.indexOf(targetLayerId);
    nextIds.splice(targetIndex < 0 ? 0 : targetIndex, 0, draggingLayerId);
    onReorder(nextIds);
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
    { id: "hidden", label: "Hidden" },
    { id: "locked", label: "Locked" }
  ];

  return (
    <section className="layer-list" aria-label="שכבות">
      <h3>שכבות</h3>
      {ordered.length === 0 ? <p>אין שכבות עדיין.</p> : null}
      <div className="layer-filter-bar" aria-label="Layer filters">
        {filterOptions.map((option) => (
          <button
            aria-pressed={filter === option.id}
            className={filter === option.id ? "active" : ""}
            key={option.id}
            onClick={() => {
              setFilter(option.id);
              setDraggingLayerId(null);
            }}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="layer-list-count">{filtered.length}/{ordered.length}</div>
      {ordered.length > 0 && filtered.length === 0 ? <p>No layers match this filter.</p> : null}
      {filtered.map((layer) => {
        const isFM = isFrameMaskLayer(layer);
        const fmFrame = isFM ? (layer as FrameLayer) : null;
        const fmAsset = fmFrame !== null && fmFrame.imageAssetId !== undefined
          ? assets.find((a) => a.id === fmFrame.imageAssetId)
          : undefined;
        return (
        <Fragment key={layer.id}>
        <div
          className={`layer-row ${selectedLayerIds.includes(layer.id) ? "active" : ""} ${draggingLayerId === layer.id ? "dragging" : ""} ${!layer.visible ? "hidden" : ""} ${layer.locked ? "locked" : ""}`}
          draggable
          onContextMenu={(e) => handleRowContextMenu(e, layer.id)}
          onDragEnd={() => setDraggingLayerId(null)}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
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
            <LayerThumbnail assets={assets} layer={layer} />
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
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commitRename(layer);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    onRenameComplete();
                  }
                }}
              />
            ) : (
              <strong>{layer.name}</strong>
            )}
            {layer.opacity < 0.995 ? <em className="layer-opacity-badge">{Math.round(layer.opacity * 100)}%</em> : null}
            {layer.blendMode !== "normal" ? <em className="layer-blend-badge">{layer.blendMode}</em> : null}
            {hasLayerFx(layer) ? <em className="layer-fx-pill">fx</em> : null}
            {variableLayerIds.has(layer.id) ? <em className="layer-var-pill">VAR</em> : null}
          </div>
          <button
            aria-label={layer.visible ? "הסתר שכבה" : "הצג שכבה"}
            className={`layer-eye-btn ${!layer.visible ? "hidden" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility(layer.id);
            }}
            title={layer.visible ? "הסתר שכבה" : "הצג שכבה"}
            type="button"
          >
            {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
          </button>
          <button
            aria-label={layer.locked ? "Unlock layer" : "Lock layer"}
            className={`layer-lock-btn ${layer.locked ? "locked" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleLock(layer.id);
            }}
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
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
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
      })}
    </section>
  );
}

// ─── Layer Panel Context Menu ─────────────────────────────────────────────────

function layerTypeIcon(layer: VisualLayer): ReactElement {
  if (layer.type === "image") return <ImagePlus size={12} />;
  if (layer.type === "text") return <Type size={12} />;
  if (layer.type === "frame") return <Frame size={12} />;
  if (layer.type === "shape") return <Square size={12} />;
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
  onMoveForward,
  onMoveBackward,
  onMoveToFront,
  onMoveToBack,
  onDuplicate,
  onDelete,
  onToggleBatchVariable,
  onConvertAlphaToFrame,
  onInsertImageIntoFrame,
  onClearFrameImage,
  onEditInsideFrame,
  onConvertFrameBackToImage,
  frameHasImage,
  onCopyEffects,
  onPasteEffects
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
  onMoveForward: () => void;
  onMoveBackward: () => void;
  onMoveToFront: () => void;
  onMoveToBack: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleBatchVariable?: () => void;
  onConvertAlphaToFrame?: () => void;
  onInsertImageIntoFrame?: () => void;
  onClearFrameImage?: () => void;
  onEditInsideFrame?: () => void;
  onConvertFrameBackToImage?: () => void;
  frameHasImage?: boolean;
  onCopyEffects: () => void;
  onPasteEffects: () => void;
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

// ─── Canvas Context Menu ──────────────────────────────────────────────────────

function CanvasContextMenu({
  target,
  imageEditorAvailable,
  imageEditorBusy,
  photoshopConfigured,
  colorLabConfigured,
  onClose,
  onOpenImageEditor,
  onOpenInPhotoshop,
  onOpenInColorLab
}: {
  target: CanvasContextMenuTarget;
  imageEditorAvailable: boolean;
  imageEditorBusy: boolean;
  photoshopConfigured: boolean;
  colorLabConfigured: boolean;
  onClose: () => void;
  onOpenImageEditor: () => void;
  onOpenInPhotoshop: () => void;
  onOpenInColorLab: () => void;
}): ReactElement {
  const menuRef = useRef<HTMLDivElement>(null);

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

  return (
    <div
      ref={menuRef}
      className="canvas-context-menu"
      style={{ left: target.screenX, top: target.screenY }}
    >
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

  return <span className="layer-thumb">{layer.type.slice(0, 3).toUpperCase()}</span>;
}
