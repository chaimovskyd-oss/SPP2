import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Clipboard,
  Copy,
  Download,
  FileDown,
  FileUp,
  ChevronsDown,
  ChevronsUp,
  GripVertical,
  Eye,
  EyeOff,
  Home,
  ImagePlus,
  Italic,
  Layers,
  Lock,
  Maximize2,
  MousePointer2,
  Plus,
  Redo2,
  Save,
  Star,
  Trash2,
  Type,
  Unlock,
  Undo2,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import {
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
  createGridTextOverlay,
  createMaskTextOverlay,
  createPage,
  createProjectEnvelope,
  deleteGridImageAndCompactFromEnd,
  deleteMaskImageAndCompactFromEnd,
  PAGE_PRESETS,
  pageSetupFromPreset,
  pxToUnit,
  regenerateGrid,
  regenerateMaskLayout,
  resetGridCrops,
  resetMaskCrops,
  clampContentTransformToFillBounds,
  swapGridCellImages,
  unitToPx,
  withProjectMetadata,
  type AlignmentCommand
} from "@/core";
import { importImageAsset } from "@/core/assets/assetManager";
import { measureTextLayerSize } from "@/core/text/measurement";
import { BUILTIN_TEXT_PRESETS } from "@/core/text/presets";
import { useDocumentStore } from "@/state/documentStore";
import { useSelectionStore } from "@/state/selectionStore";
import { CropUI } from "./CropUI";
import { useViewportStore, type ViewportStore } from "@/state/viewportStore";
import type { Asset, Document } from "@/types/document";
import type { BlendMode, VisualLayer } from "@/types/layers";
import type { GridLayoutRule } from "@/types/grid";
import type { MaskLayoutRule } from "@/types/mask";
import type { PageSetup, Unit } from "@/types/primitives";
import type { TextEffect, TextPreset } from "@/types/text";
import {
  VISUAL_EFFECT_LABELS,
  VISUAL_EFFECT_PRESETS,
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
  loadProject,
  savePortableProject,
  saveProject
} from "../projectActions";
import { CanvasStage } from "./CanvasStage";
import { useProjectLifecycleStore } from "@/state/projectLifecycleStore";
import { CollageModePanel } from "@/ui/collage/CollageModePanel";
import { applySmartCropToAssignment } from "@/core/collage/collageFrameSync";
import { syncFrameLayersToPage } from "@/core/collage/collageModeEngine";
import {
  getFontFavorites,
  getGroupedFonts,
  toggleFontFavorite,
  type FontEntry
} from "./fonts";

type ToolId = "move" | "text" | "image" | "layers";

interface EditorScreenProps {
  onBackHome: () => void;
}

async function runInitialSmartCrop(
  rule: import("@/types/collage").CollageRule,
  page: import("@/types/document").Page,
  assets: import("@/types/document").Asset[]
): Promise<void> {
  const updateTransform = useDocumentStore.getState().updateCollageImageTransform;
  for (const assignment of rule.imageAssignments) {
    if (assignment.hasManualTransform) continue;
    const asset = assets.find((a) => a.id === assignment.assetId);
    if (!asset) continue;
    const slot = rule.cachedSlots.find((s) => s.id === assignment.slotId);
    if (!slot) continue;
    const newTransform = await applySmartCropToAssignment(
      assignment, asset, slot.w * page.width, slot.h * page.height
    );
    updateTransform(rule.id, assignment.slotId, newTransform);
  }
}

export function EditorScreen({ onBackHome }: EditorScreenProps): ReactElement {
  const stageRef = useRef<Konva.Stage | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const autosaveRef = useRef(new AutosaveManager({ intervalMs: 1000 * 60 * 2, debounceMs: 3000, actionThreshold: 20 }));
  const lastAutosavedRevisionRef = useRef(0);
  const [tool, setTool] = useState<ToolId>("move");
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [status, setStatus] = useState("שמירה אוטומטית מוכנה");
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
  const applyTextPreset = useDocumentStore((state) => state.applyTextPreset);
  const copyTextStyle = useDocumentStore((state) => state.copyTextStyle);
  const pasteTextStyle = useDocumentStore((state) => state.pasteTextStyle);
  const hasTextStyleClipboard = useDocumentStore((state) => state.textStyleClipboard !== null);
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
  const isCollageMode = document?.metadata["mode"] === "collage";

  useEffect(() => {
    if (document?.viewport !== undefined) {
      viewport.setViewport(document.viewport);
    }
  }, [document?.id]);

  // Initial sync: ensure collage FrameLayers exist when collage document first loads
  // Also apply smart crop to all initial assignments
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

    // Run smart crop async for all assignments
    const rule = activeCollageRule;
    const page = document.pages.find((p) => p.id === rule.pageId);
    if (!page) return;

    void runInitialSmartCrop(rule, page, document.assets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCollageRule?.id]);

  useEffect(() => {
    if (document === null) {
      return;
    }
    if (revision === 0 || revision === lastAutosavedRevisionRef.current) {
      return;
    }
    lastAutosavedRevisionRef.current = revision;
    lifecycle.markDirty();
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

  function handleAddText(): void {
    const layer = createStarterTextLayer(currentPage.width, currentPage.height);
    addLayer(currentPage.id, layer);
    setSelection([layer.id]);
    setTool("text");
    setStatus("נוספה שכבת טקסט");
  }

  function handleCanvasLayerChange(layer: VisualLayer): void {
    if (isGridMode && activeGridRule !== null && layer.type === "frame" && layer.metadata["gridCell"] !== undefined) {
      const asset = currentDocument.assets.find((item) => item.id === layer.imageAssetId);
      const nextLayer = asset === undefined || asset.width === undefined || asset.height === undefined
        ? layer
        : {
            ...layer,
            contentTransform: clampContentTransformToFillBounds(
              layer.contentTransform,
              layer.width,
              layer.height,
              asset.width,
              asset.height,
              layer.fitMode,
              layer.padding
            )
          };
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

    if (isMaskMode && activeMaskRule !== null && layer.type === "frame" && layer.metadata["maskFrame"] !== undefined) {
      const asset = currentDocument.assets.find((item) => item.id === layer.imageAssetId);
      const nextLayer = asset === undefined || asset.width === undefined || asset.height === undefined
        ? layer
        : {
            ...layer,
            contentTransform: clampContentTransformToFillBounds(
              layer.contentTransform,
              layer.width,
              layer.height,
              asset.width,
              asset.height,
              layer.fitMode,
              layer.padding
            )
          };
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

  async function handleImageFiles(files: FileList | File[]): Promise<void> {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
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

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    void handleImageFiles(event.dataTransfer.files);
  }

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
      const choice = window.prompt("Unsaved changes. Autosave is only a recovery backup. Type Save, Don't Save, or Cancel.", "Save");
      const normalized = choice?.trim().toLowerCase();
      if (normalized === null || normalized === undefined || normalized === "" || normalized === "cancel") {
        return;
      }
      if (normalized === "save") {
        handleSaveLifecycle();
      } else if (normalized !== "don't save" && normalized !== "dont save") {
        return;
      }
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

  function handleExportPng(): void {
    const stage = stageRef.current;
    if (stage === null) return;
    exportStagePng(stage, currentDocument.name, currentPage);
    setStatus("PNG יוצא");
  }

  async function handleExportPdf(): Promise<void> {
    const stage = stageRef.current;
    if (stage === null) return;
    await exportStagePdf(stage, currentDocument.name, currentPage);
    setStatus("PDF יוצא");
  }

  function handleExportJpg(): void {
    const stage = stageRef.current;
    if (stage === null) return;
    exportStageJpg(stage, currentDocument.name, currentPage);
    setStatus("JPG exported");
  }

  function handleDeleteSelected(): void {
    if (selectedLayerIds.length === 0) return;
    selectedLayerIds.forEach((layerId) => removeLayer(currentPage.id, layerId));
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

  function updateSelectedText(text: string): void {
    if (selectedLayer?.type !== "text") return;
    const nextLayer = { ...selectedLayer, text };
    const size = measureTextLayerSize(nextLayer);
    updateLayer(currentPage.id, { ...nextLayer, width: size.width, height: size.height });
  }

  function patchSelectedLayer(patch: Partial<VisualLayer>): void {
    if (selectedLayer === null) return;
    const nextLayer = { ...selectedLayer, ...patch } as VisualLayer;
    if (nextLayer.type === "text") {
      const size = measureTextLayerSize(nextLayer);
      updateLayer(currentPage.id, { ...nextLayer, width: size.width, height: size.height });
      return;
    }
    handleCanvasLayerChange(nextLayer);
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

  function handleRegenerateMask(rule: MaskLayoutRule, patch: Partial<MaskLayoutRule>): void {
    applyDocumentChange("RegenerateMaskLayoutCommand", (doc) => regenerateMaskLayout(doc, rule.id, patch), currentPage.id);
    setStatus("Mask layout regenerated");
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

  function handleDeleteMaskImage(rule: MaskLayoutRule): void {
    if (selectedLayer?.type !== "frame") return;
    const frame = selectedLayer.metadata["maskFrame"];
    if (typeof frame !== "object" || frame === null || !("maskIndexGlobal" in frame) || typeof frame.maskIndexGlobal !== "number") return;
    const maskIndexGlobal = frame.maskIndexGlobal;
    applyDocumentChange("DeleteMaskImageAndCompactFromEndCommand", (doc) => deleteMaskImageAndCompactFromEnd(doc, rule.id, maskIndexGlobal), currentPage.id);
  }

  return (
    <main className="canvas-shell" data-testid="editor-screen">
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
          <button className="btn btn-ghost" onClick={() => projectInputRef.current?.click()} type="button">
            <FileUp size={14} />
            טעינה
          </button>
          <button className="btn btn-ghost" disabled={!lifecycle.isDirty && lifecycle.currentFilePath !== null} onClick={handleSaveLifecycle} type="button">
            <Save size={14} />
            שמירה
          </button>
          <button className="btn btn-ghost" onClick={() => void handleSavePortableLifecycle()} type="button">
            <Save size={14} />
            SPP
          </button>
          <button className="btn btn-success-outline" onClick={handleExportPng} type="button">
            <Download size={14} />
            PNG
          </button>
          <button className="btn btn-success-outline" onClick={handleExportJpg} type="button">
            <Download size={14} />
            JPG
          </button>
          <button className="btn btn-accent" onClick={() => void handleExportPdf()} type="button">
            <FileDown size={14} />
            PDF
          </button>
        </div>
      </header>

      <ContextToolbar
        hasTextStyleClipboard={hasTextStyleClipboard}
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
        onCopyTextStyle={() => {
          if (selectedLayer?.type === "text") {
            copyTextStyle(currentPage.id, selectedLayer.id);
            setStatus("Text style copied");
          }
        }}
        onDelete={handleDeleteSelected}
        onDuplicate={handleDuplicateSelected}
        onMoveLayer={(direction) => {
          if (selectedLayer !== null) {
            moveLayer(currentPage.id, selectedLayer.id, direction);
          }
        }}
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
        <aside className="left-rail" aria-label="כלים">
          <ToolButton active={tool === "move"} icon={MousePointer2} label="הזזה" onClick={() => setTool("move")} testId="tool-move" />
          <ToolButton active={tool === "text"} icon={Type} label="טקסט" onClick={handleAddText} testId="tool-text" />
          <ToolButton active={tool === "image"} icon={ImagePlus} label="תמונה" onClick={() => imageInputRef.current?.click()} testId="tool-image" />
          <span className="rail-sep" />
          <ToolButton active={tool === "layers"} icon={Layers} label="שכבות" onClick={() => setTool("layers")} testId="tool-layers" />
        </aside>

        <div className="canvas-area" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
          <div className="ruler-top" />
          <div className="ruler-side" />
          <CanvasStage
            assets={currentDocument.assets}
            editingLayerId={editingLayerId}
            layoutEditMode={layoutEditMode}
            page={currentPage}
            selectedLayerIds={selectedLayerIds}
            selectedLayerId={selectedLayerId}
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
          />
          <div className="drop-hint">גרור תמונות אל הקנבס או לחץ על כלי התמונה</div>
        </div>

        <aside className="right-panel">
          <PanelHeader selectedLayer={selectedLayer} />
          {isCollageMode && activeCollageRule !== null ? (
            <>
              <CollageModePanel rule={activeCollageRule} selectedLayer={selectedLayer} />
              <span className="panel-sep" />
            </>
          ) : null}
          {isGridMode && activeGridRule !== null ? (
            <>
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
              <span className="panel-sep" />
            </>
          ) : null}
          {isMaskMode && activeMaskRule !== null ? (
            <>
              <MaskModePanel
                assignmentCount={currentDocument.maskImageAssignments.filter((assignment) => assignment.maskId === activeMaskRule.id).length}
                rule={activeMaskRule}
                selectedLayer={selectedLayer}
                onAddImages={() => imageInputRef.current?.click()}
                onAddFilenameText={() => handleAddMaskFilenameText(activeMaskRule)}
                onApplyFit={handleApplyMaskFit}
                onApplySelectedText={() => handleApplySelectedTextToMask(activeMaskRule)}
                onDeleteSelectedImage={() => handleDeleteMaskImage(activeMaskRule)}
                onRegenerate={handleRegenerateMask}
                onResetCrops={() => handleResetMaskCrops(activeMaskRule)}
              />
              <span className="panel-sep" />
            </>
          ) : null}
          <LayerInspector
            selectedLayer={selectedLayer}
            hasTextStyleClipboard={hasTextStyleClipboard}
            onDelete={handleDeleteSelected}
            onPatch={patchSelectedLayer}
            onApplyPreset={(preset) => {
              if (selectedLayer?.type === "text") {
                applyTextPreset(currentPage.id, selectedLayer.id, preset);
              }
            }}
            onCopyTextStyle={() => {
              if (selectedLayer?.type === "text") {
                copyTextStyle(currentPage.id, selectedLayer.id);
                setStatus("סגנון טקסט הועתק");
              }
            }}
            onPasteTextStyle={() => {
              if (selectedLayer?.type === "text") {
                pasteTextStyle(currentPage.id, [selectedLayer.id]);
                setStatus("סגנון טקסט הודבק");
              }
            }}
            onTextChange={updateSelectedText}
          />
          <span className="panel-sep" />
          <DocumentEnvironmentPanel
            activePage={currentPage}
            activePageId={currentPage.id}
            document={currentDocument}
            onAddGuide={handleAddGuide}
            onAddPage={handleAddPage}
            onApplyPageSetup={handleApplyPageSetup}
            onDuplicatePage={() => duplicatePage(currentPage.id)}
            onRemovePage={() => removePage(currentPage.id)}
            onSelectPage={(pageId) => {
              setActivePage(pageId);
              clearSelection();
            }}
            viewport={viewport}
          />
          <span className="panel-sep" />
          <LayerList
            assets={currentDocument.assets}
            layers={currentPage.layers}
            selectedLayerIds={selectedLayerIds}
            selectedLayerId={selectedLayerId}
            onMove={(layerId, direction) => moveLayer(currentPage.id, layerId, direction)}
            onReorder={(layerIdsTopToBottom) => reorderLayers(currentPage.id, layerIdsTopToBottom)}
            onSelect={(layerId) => setSelection([layerId])}
          />
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
                  setActivePage(page.id);
                  clearSelection();
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
                  setActivePage(page.id);
                  clearSelection();
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
                  setActivePage(page.id);
                  clearSelection();
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
      <input ref={projectInputRef} accept=".json,.spp.json,.spp" hidden onChange={(event) => void handleProjectLoadLifecycle(event)} type="file" />
    </main>
  );
}

// ─── Tool button ──────────────────────────────────────────────────────────────

function ContextToolbar({
  hasTextStyleClipboard,
  selectedLayer,
  selectedLayers,
  showGrid,
  snapEnabled,
  onAddImage,
  onAddText,
  onApplyPreset,
  onCopyTextStyle,
  onDelete,
  onDuplicate,
  onMoveLayer,
  onPasteTextStyle,
  onPatch,
  onToggleGrid,
  onToggleSnap
}: {
  hasTextStyleClipboard: boolean;
  selectedLayer: VisualLayer | null;
  selectedLayers: VisualLayer[];
  showGrid: boolean;
  snapEnabled: boolean;
  onAddImage: () => void;
  onAddText: () => void;
  onApplyPreset: (preset: TextPreset) => void;
  onCopyTextStyle: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveLayer: (direction: "forward" | "backward" | "front" | "back") => void;
  onPasteTextStyle: () => void;
  onPatch: (patch: Partial<VisualLayer>) => void;
  onToggleGrid: () => void;
  onToggleSnap: () => void;
}): ReactElement {
  if (selectedLayers.length > 1) {
    return <MixedSelectionToolbar selectedLayers={selectedLayers} onDelete={onDelete} onDuplicate={onDuplicate} onMoveLayer={onMoveLayer} />;
  }
  if (selectedLayer?.type === "text") {
    return (
      <TextContextToolbar
        hasTextStyleClipboard={hasTextStyleClipboard}
        layer={selectedLayer}
        onApplyPreset={onApplyPreset}
        onCopyTextStyle={onCopyTextStyle}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onMoveLayer={onMoveLayer}
        onPasteTextStyle={onPasteTextStyle}
        onPatch={onPatch}
      />
    );
  }
  if (selectedLayer !== null) {
    return <PlaceholderContextToolbar label={selectedLayer.type === "image" || selectedLayer.type === "frame" ? "Image tools" : `${selectedLayer.type} tools`} onDelete={onDelete} onDuplicate={onDuplicate} onMoveLayer={onMoveLayer} />;
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
  return (
    <section className="context-toolbar" aria-label="Context toolbar" data-testid="context-toolbar">
      <span className="context-toolbar-label">כלים כלליים</span>
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
  onCopyTextStyle,
  onDelete,
  onDuplicate,
  onMoveLayer,
  onPasteTextStyle,
  onPatch
}: {
  hasTextStyleClipboard: boolean;
  layer: Extract<VisualLayer, { type: "text" }>;
  onApplyPreset: (preset: TextPreset) => void;
  onCopyTextStyle: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveLayer: (direction: "forward" | "backward" | "front" | "back") => void;
  onPasteTextStyle: () => void;
  onPatch: (patch: Partial<VisualLayer>) => void;
}): ReactElement {
  const glow = layer.effects.find((effect) => effect.effectType === "outer_glow");

  function patchGlow(patch: Record<string, string | number>): void {
    const existing = glow ?? createTextEffect("outer_glow");
    const next = {
      ...existing,
      enabled: true,
      opacity: typeof patch["opacity"] === "number" ? patch["opacity"] : existing.opacity,
      params: { ...existing.params, ...patch }
    };
    onPatch({
      effects: glow === undefined ? [...layer.effects, next] : layer.effects.map((effect) => (effect.id === glow.id ? next : effect))
    } as Partial<VisualLayer>);
  }

  return (
    <section className="context-toolbar text-mode" aria-label="Text context toolbar" data-testid="context-toolbar">
      <span className="context-toolbar-label">טקסט</span>
      <div className="context-group font-context">
        <FontSelector value={layer.fontFamily} onChange={(family) => onPatch({ fontFamily: family } as Partial<VisualLayer>)} />
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
      </div>
      <ToolbarMenu label="Presets" title="פריסטים לטקסט">
        <div className="context-menu-actions">
          <button className="context-menu-button" onClick={onCopyTextStyle} type="button"><Copy size={13} /> Copy FX</button>
          <button className="context-menu-button" disabled={!hasTextStyleClipboard} onClick={onPasteTextStyle} type="button"><Clipboard size={13} /> Paste FX</button>
        </div>
        <div className="context-preset-grid">
          {BUILTIN_TEXT_PRESETS.map((preset) => (
            <button className="context-preset-chip" key={preset.presetId} onClick={() => onApplyPreset(preset)} type="button">
              <span style={presetPreviewStyle(preset)}>{layer.text.trim().slice(0, 2) || "טק"}</span>
              <strong>{preset.name}</strong>
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
        <label className="check-line"><input checked={glow?.enabled === true} onChange={(event) => event.target.checked ? patchGlow({ color: "#ffffff", opacity: 0.8, blur: 24, spread: 4 }) : onPatch({ effects: layer.effects.filter((effect) => effect.id !== glow?.id) } as Partial<VisualLayer>)} type="checkbox" /> הפעלה</label>
        {glow?.enabled === true ? <><input className="context-color wide" onChange={(event) => patchGlow({ color: event.target.value })} type="color" value={String((glow.params as Record<string, unknown>)["color"] ?? "#ffffff")} /><SliderField label="עוצמה" min={4} max={80} value={Number((glow.params as Record<string, unknown>)["blur"] ?? 24)} onChange={(value) => patchGlow({ blur: value })} unit=" px" /><SliderField label="שקיפות" min={0} max={1} step={0.01} decimals={2} value={glow.opacity} onChange={(value) => patchGlow({ opacity: value })} /></> : null}
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

function ToolbarButton({ active = false, danger = false, icon: Icon, label, onClick }: { active?: boolean; danger?: boolean; icon: LucideIcon; label: string; onClick: () => void; }): ReactElement {
  return <button className={`context-icon ${active ? "on" : ""} ${danger ? "danger" : ""}`} onClick={onClick} title={label} type="button"><Icon size={14} /></button>;
}

function ToolbarMenu({ children, label, title }: { children: ReactNode; label: string; title: string }): ReactElement {
  return <details className="context-menu"><summary title={title}>{label}</summary><div className="context-popover">{children}</div></details>;
}

function CompactRange({ label, min, max, step = 1, value, onChange }: { label: string; min: number; max: number; step?: number; value: number; onChange: (value: number) => void; }): ReactElement {
  return <label className="compact-range" title={label}><span>{label}</span><input max={max} min={min} onChange={(event) => onChange(Number(event.target.value))} step={step} type="range" value={value} /></label>;
}

function createTextEffect(effectType: TextEffect["effectType"]): TextEffect {
  return { version: 1, id: `${effectType}_${Date.now()}`, effectId: `${effectType}_${Date.now()}`, effectType, enabled: true, opacity: 0.8, blendMode: "normal", params: effectType === "outer_glow" ? { color: "#ffffff", opacity: 0.8, angle: 0, distance: 0, blur: 24, spread: 4 } : {} };
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

function MaskModePanel({
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
  rule: MaskLayoutRule;
  selectedLayer: VisualLayer | null;
  onAddFilenameText: () => void;
  onAddImages: () => void;
  onApplyFit: (rule: MaskLayoutRule, fitMode: MaskLayoutRule["fitMode"]) => void;
  onApplySelectedText: () => void;
  onDeleteSelectedImage: () => void;
  onRegenerate: (rule: MaskLayoutRule, patch: Partial<MaskLayoutRule>) => void;
  onResetCrops: () => void;
}): ReactElement {
  const [maskWidth, setMaskWidth] = useState(rule.maskWidth);
  const [maskHeight, setMaskHeight] = useState(rule.maskHeight);
  const [spacingX, setSpacingX] = useState(rule.spacingX);
  const [spacingY, setSpacingY] = useState(rule.spacingY);
  const selectedIsMaskFrame = selectedLayer?.type === "frame" && selectedLayer.metadata["maskFrame"] !== undefined;
  const selectedIsText = selectedLayer?.type === "text";

  useEffect(() => {
    setMaskWidth(rule.maskWidth);
    setMaskHeight(rule.maskHeight);
    setSpacingX(rule.spacingX);
    setSpacingY(rule.spacingY);
  }, [rule.id, rule.maskWidth, rule.maskHeight, rule.spacingX, rule.spacingY]);

  function updateWidth(value: number): void {
    setMaskWidth(value);
    if (rule.keepProportions) setMaskHeight(value);
  }

  function updateHeight(value: number): void {
    setMaskHeight(value);
    if (rule.keepProportions) setMaskWidth(value);
  }

  return (
    <section className="panel-card grid-mode-panel">
      <div className="panel-section-title">Mask Mode</div>
      <div className="metrics-grid">
        <span className="metric">
          <span>Shape</span>
          <strong>{rule.maskShape}</strong>
        </span>
        <Metric label="Images" value={assignmentCount} />
        <Metric label="Pages" value={rule.pageIds.length} />
      </div>
      {selectedIsMaskFrame ? <p className="panel-note">This mask is layout-managed. Move, crop, rotate, and scale the image inside it.</p> : null}
      <button className="btn btn-accent wide" onClick={onAddImages} type="button">
        <ImagePlus size={14} />
        Add images
      </button>
      <div className="field-grid">
        <NumberField label="Mask W" min={24} max={2000} value={Math.round(maskWidth)} onChange={updateWidth} />
        <NumberField label="Mask H" min={24} max={2000} value={Math.round(maskHeight)} onChange={updateHeight} />
        <NumberField label="Spacing X" min={0} max={400} value={Math.round(spacingX)} onChange={setSpacingX} />
        <NumberField label="Spacing Y" min={0} max={400} value={Math.round(spacingY)} onChange={setSpacingY} />
      </div>
      <button className="mini-action success" onClick={() => onRegenerate(rule, { maskWidth, maskHeight, spacingX, spacingY })} type="button">
        Rebuild masks
      </button>
      <div className="field">
        <span className="field-label">Image fit</span>
        <div className="seg">
          {(["fit", "fill", "smartCrop", "stretch"] as const).map((mode) => (
            <button className={rule.fitMode === mode ? "on" : ""} key={mode} onClick={() => onApplyFit(rule, mode)} type="button">
              {fitModeLabel(mode)}
            </button>
          ))}
        </div>
      </div>
      <div className="button-row">
        <button className="mini-action" onClick={onResetCrops} type="button">Reset crops</button>
        <button className="mini-action" onClick={onAddFilenameText} type="button">Filename text</button>
      </div>
      <button className="mini-action success" disabled={!selectedIsText} onClick={onApplySelectedText} type="button">
        Apply selected text to all
      </button>
      <button className="mini-action danger" disabled={!selectedIsMaskFrame} onClick={onDeleteSelectedImage} type="button">
        Delete image and compact
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
  return (
    <label className="field slider-field">
      <div className="slider-header">
        <span className="field-label">{label}</span>
        <span className="slider-value">
          {value.toFixed(decimals)}
          {unit}
        </span>
      </div>
      <input
        className="slider"
        max={max}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        step={step}
        type="range"
        value={value}
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
  onPatch,
  onPasteTextStyle,
  onTextChange
}: {
  selectedLayer: VisualLayer | null;
  hasTextStyleClipboard: boolean;
  onDelete: () => void;
  onApplyPreset: (preset: TextPreset) => void;
  onCopyTextStyle: () => void;
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
  onPasteTextStyle,
  onPatch,
  onTextChange
}: {
  hasTextStyleClipboard: boolean;
  layer: Extract<VisualLayer, { type: "text" }>;
  onApplyPreset: (preset: TextPreset) => void;
  onCopyTextStyle: () => void;
  onPasteTextStyle: () => void;
  onPatch: (patch: Partial<VisualLayer>) => void;
  onTextChange: (text: string) => void;
}): ReactElement {
  const [tab, setTab] = useState<"type" | "effects" | "warp" | "presets">("type");

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
          <div className="preset-grid">
            {BUILTIN_TEXT_PRESETS.map((preset) => (
              <button className="preset-chip" key={preset.presetId} onClick={() => onApplyPreset(preset)} type="button">
                <span style={presetPreviewStyle(preset)}>{layer.text.trim().slice(0, 2) || "טק"}</span>
                <strong>{preset.name}</strong>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function presetPreviewStyle(preset: TextPreset): CSSProperties {
  return {
    color: preset.style.color ?? "#ffffff",
    fontFamily: preset.style.fontFamily,
    textShadow:
      preset.style.shadow === undefined
        ? undefined
        : `${preset.style.shadow.offsetX}px ${preset.style.shadow.offsetY}px ${preset.style.shadow.blur}px ${preset.style.shadow.color}`,
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
  selectedLayerIds,
  selectedLayerId,
  onMove,
  onReorder,
  onSelect
}: {
  assets: Asset[];
  layers: VisualLayer[];
  selectedLayerIds: string[];
  selectedLayerId: string | null;
  onMove: (layerId: string, direction: "forward" | "backward" | "front" | "back") => void;
  onReorder: (layerIdsTopToBottom: string[]) => void;
  onSelect: (layerId: string) => void;
}): ReactElement {
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null);
  const ordered = [...layers].sort((a, b) => b.zIndex - a.zIndex);

  function handleDrop(targetLayerId: string): void {
    if (draggingLayerId === null || draggingLayerId === targetLayerId) {
      setDraggingLayerId(null);
      return;
    }
    const nextIds = ordered.map((l) => l.id).filter((id) => id !== draggingLayerId);
    const targetIndex = nextIds.indexOf(targetLayerId);
    nextIds.splice(targetIndex < 0 ? 0 : targetIndex, 0, draggingLayerId);
    onReorder(nextIds);
    setDraggingLayerId(null);
  }

  return (
    <section className="layer-list" aria-label="שכבות">
      <h3>שכבות</h3>
      {ordered.length === 0 ? <p>אין שכבות עדיין.</p> : null}
      {ordered.map((layer) => (
        <div
          className={`layer-row ${selectedLayerIds.includes(layer.id) ? "active" : ""} ${draggingLayerId === layer.id ? "dragging" : ""}`}
          draggable
          key={layer.id}
          onDragEnd={() => setDraggingLayerId(null)}
          onDragOver={(e) => e.preventDefault()}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", layer.id);
            setDraggingLayerId(layer.id);
          }}
          onDrop={() => handleDrop(layer.id)}
        >
          <GripVertical className="layer-drag-handle" size={14} />
          <button className="layer-main" onClick={() => onSelect(layer.id)} type="button">
            <LayerThumbnail assets={assets} layer={layer} />
            <strong>{layer.name}</strong>
          </button>
          <span className="layer-actions">
            <button aria-label="שלח אחורה" onClick={() => onMove(layer.id, "backward")} type="button">
              <ChevronsDown size={12} />
            </button>
            <button aria-label="הבא קדימה" onClick={() => onMove(layer.id, "forward")} type="button">
              <ChevronsUp size={12} />
            </button>
          </span>
        </div>
      ))}
    </section>
  );
}

function LayerThumbnail({ assets, layer }: { assets: Asset[]; layer: VisualLayer }): ReactElement {
  if (layer.type === "image") {
    const asset = assets.find((item) => item.id === layer.assetId);
    if (asset?.previewPath !== undefined) {
      return <img alt="" className="layer-thumb image" src={asset.previewPath} />;
    }
  }

  if (layer.type === "frame" && layer.contentType === "image") {
    const asset = assets.find((item) => item.id === layer.imageAssetId);
    if (asset?.previewPath !== undefined) {
      return <img alt="" className="layer-thumb image" src={asset.previewPath} />;
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
