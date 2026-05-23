import { Suspense, lazy, useEffect, useMemo, useState, type ReactElement } from "react";
import { AUTOSAVE_TEMPORARILY_DISABLED, cleanupRecovery, createGridModeDocument, createMaskModeDocument, createPhotoPrintModeDocument, createProjectEnvelope, discardRecoveryRecord, getLatestRecoveryRecord, restoreRecoveryRecord, withProjectMetadata, type AutosaveRecord } from "@/core";
import { applyFaceDetectionToPhotoPrint } from "@/core/photoPrint/photoPrintModeEngine";
import { captureError, writeLog } from "@/core/logging/logger";
import { createPage } from "@/core/document/factory";
import { applyOrientationToProduct, createDocumentFromProduct } from "@/core/product/productDocument";
import { useProductStore } from "@/state/productStore";
import { resetWorkspaceForHome } from "@/state/workspaceReset";
import { ProductLibraryScreen } from "./productLibrary/ProductLibraryScreen";
import type { ProductDefinition } from "@/types/product";
import { createCollageModeDocument } from "@/core/collage/collageFactory";
import { assignByPoolOrder, syncFrameLayersToPage } from "@/core/collage/collageModeEngine";
import { importImageAsset } from "@/core/assets/assetManager";
import { generateMaskThumbnail } from "@/state/maskLibraryStore";
import { createClassPhotoModeDocument, defaultLayoutSettings } from "@/core/classPhoto/classPhotoFactory";
import { syncClassPhotoToPage } from "@/core/classPhoto/classPhotoLayoutEngine";
import { defaultGridSettings, defaultSnapSettings, mmToPx } from "@/core";
import type { Asset, Document as SppDocument } from "@/types/document";
import type { PageSetup } from "@/types/primitives";
import type { ProjectCustomerInfo } from "@/types/project";
import type { GridCreateOptions } from "@/types/grid";
import type { MaskCreateOptions } from "@/types/mask";
import type { ModeType } from "@/types/template";
import type { CollageWizardResult } from "./collage/CollageSetupWizard";
import type { PhotoPrintWizardResult } from "@/types/photoPrint";
import type { ClassPhotoWizardResult } from "@/types/classPhoto";
import type { ClassPhotoWizardInitialState } from "./classPhoto/ClassPhotoSetupWizard";
import { MaskSetupWizard, type MaskWizardResult } from "./mask/MaskSetupWizard";
import { useDocumentStore } from "@/state/documentStore";
import { useSelectionStore } from "@/state/selectionStore";
import { useViewportStore } from "@/state/viewportStore";
import { useProjectLifecycleStore } from "@/state/projectLifecycleStore";
import { HomeScreen } from "./home/HomeScreen";
import { createFreeModeDocument, loadProject } from "./projectActions";
import { DocumentSetupScreen } from "./setup/DocumentSetupScreen";
import { CollageSetupWizard } from "./collage/CollageSetupWizard";
import { PhotoPrintSetupWizard } from "./photoPrint/PhotoPrintSetupWizard";
import { ClassPhotoSetupWizard } from "./classPhoto/ClassPhotoSetupWizard";
import "./photoPrint/photoPrint.css";
import "./classPhoto/classPhoto.css";
import { SettingsWindow } from "./settings/SettingsWindow";
import type { PdfStudioDocument } from "./pdf/pdfStudioTypes";
import { BatchProductionLibraryScreen } from "./batchProduction/BatchProductionLibraryScreen";
import { BatchProductionWizard } from "./batchProduction/BatchProductionWizard";
import type { BatchTemplateIndexItem } from "@/core/batchProduction/batchTemplateStore";
import { loadTemplateDocument } from "@/core/batchProduction/batchTemplateStore";
import { getBatchProductionMeta } from "@/core/batchProduction/batchProductionMeta";
import { generateBatchProduction } from "@/core/batchProduction/generateEngine";
import type { BatchWizardResult } from "@/types/batchProduction";

const EditorScreen = lazy(() =>
  import("./editor/EditorScreen").then((module) => ({
    default: module.EditorScreen
  }))
);

const PdfStudioScreen = lazy(() =>
  import("./pdf/PdfStudioScreen").then((module) => ({
    default: module.PdfStudioScreen
  }))
);

type AppScreen = "home" | "setup" | "editor" | "collage-wizard" | "photo-print-wizard" | "pdf-studio" | "class-photo-wizard" | "mask-wizard" | "product-library" | "batch-production-library" | "batch-wizard";

interface ModeWindowInfo {
  mode: string;
  screen: AppScreen;
  title: string;
  snapshotId?: string;
}

interface ModeWindowSnapshot {
  document?: SppDocument;
  pdfStudioDocument?: PdfStudioDocument;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Cannot read image file"));
    reader.readAsDataURL(file);
  });
}

const MODE_WINDOW_TITLES: Record<string, string> = {
  "pdf-studio": "SPP2-PDF EDITOR",
  editor: "SPP2-EDITOR",
  "product-library": "SPP2-PRODUCT LIBRARY",
  settings: "SPP2-SETTINGS",
  setup: "SPP2-SETUP",
  "collage-wizard": "SPP2-COLLAGE",
  "photo-print-wizard": "SPP2-PHOTO PRINT",
  "class-photo-wizard": "SPP2-CLASS PHOTO",
  "mask-wizard": "SPP2-MASK"
};

function parseModeWindowHash(hash: string): ModeWindowInfo | null {
  const route = hash.replace(/^#\/?/, "");
  if (route === "pdf-studio-window") {
    return { mode: "pdf-studio", screen: "pdf-studio", title: MODE_WINDOW_TITLES["pdf-studio"] };
  }
  const [prefix, mode, snapshotId] = route.split("/");
  if (prefix !== "window" || mode === undefined || mode.length === 0) return null;
  const screen = mode === "settings" ? "home" : modeToScreen(mode);
  if (screen === null) return null;
  return {
    mode,
    screen,
    title: MODE_WINDOW_TITLES[mode] ?? `SPP2-${mode.replace(/-/g, " ").toUpperCase()}`,
    snapshotId
  };
}

function modeToScreen(mode: string): AppScreen | null {
  switch (mode) {
    case "pdf-studio":
    case "editor":
    case "product-library":
    case "setup":
    case "collage-wizard":
    case "photo-print-wizard":
    case "class-photo-wizard":
    case "mask-wizard":
      return mode;
    default:
      return null;
  }
}

function screenToMode(screen: AppScreen): string | null {
  if (screen === "home") return null;
  return screen;
}

function isModeWindowSnapshot(value: unknown): value is ModeWindowSnapshot {
  return typeof value === "object" && value !== null;
}

function dragEventHasFiles(event: DragEvent): boolean {
  const types = event.dataTransfer?.types;
  return types !== undefined && Array.from(types).includes("Files");
}

export function App(): ReactElement {
  const modeWindow = useMemo(() => parseModeWindowHash(window.location.hash), []);
  const isModeWindow = modeWindow !== null;
  const [screen, setScreen] = useState<AppScreen>(modeWindow?.screen ?? "home");
  const [classPhotoWizardInitialState, setClassPhotoWizardInitialState] = useState<ClassPhotoWizardInitialState | undefined>(undefined);
  const [pendingMode, setPendingMode] = useState<ModeType>("free");
  const [recoveryRecord, setRecoveryRecord] = useState<AutosaveRecord | null>(() => {
    if (AUTOSAVE_TEMPORARILY_DISABLED) {
      return null;
    }
    cleanupRecovery();
    return getLatestRecoveryRecord();
  });
  const document = useDocumentStore((state) => state.document);
  const setDocument = useDocumentStore((state) => state.setDocument);
  const beginProject = useProjectLifecycleStore((state) => state.beginProject);
  const clearSelection = useSelectionStore((state) => state.clearSelection);
  const resetViewport = useViewportStore((state) => state.resetViewport);
  const setActiveProduct = useProductStore((state) => state.setActiveProduct);
  const setProductCollageContext = useProductStore((state) => state.setCollageContext);

  const [settingsOpen, setSettingsOpen] = useState(modeWindow?.mode === "settings");
  const [modeWindowSnapshot, setModeWindowSnapshot] = useState<ModeWindowSnapshot | null>(null);
  const [windowSnapshotLoading, setWindowSnapshotLoading] = useState(modeWindow?.snapshotId !== undefined);
  // Orientation picker: set when product has orientation="any" and user must choose
  const [orientationPicking, setOrientationPicking] = useState<ProductDefinition | null>(null);
  const [isCreatingPhotoPrint, setIsCreatingPhotoPrint] = useState(false);
  const [creatingProgress, setCreatingProgress] = useState("");
  const [isCreatingBatch, setIsCreatingBatch] = useState(false);
  const [creatingBatchProgress, setCreatingBatchProgress] = useState("");
  const canShowEditor = useMemo(() => screen === "editor" && document !== null, [document, screen]);

  // Keep external file drops inside the app. Without this, Electron/Chromium can
  // navigate to the dropped file when a local drop target misses the event.
  useEffect(() => {
    function onDragEnter(event: DragEvent): void {
      if (!dragEventHasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "copy";
    }

    function onDragOver(event: DragEvent): void {
      if (!dragEventHasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "copy";
    }

    function onDrop(event: DragEvent): void {
      if (!dragEventHasFiles(event)) return;
      event.preventDefault();
    }

    const capture = { capture: true };
    globalThis.window.addEventListener("dragenter", onDragEnter, capture);
    globalThis.window.addEventListener("dragover", onDragOver, capture);
    globalThis.window.addEventListener("drop", onDrop, capture);
    return () => {
      globalThis.window.removeEventListener("dragenter", onDragEnter, capture);
      globalThis.window.removeEventListener("dragover", onDragOver, capture);
      globalThis.window.removeEventListener("drop", onDrop, capture);
    };
  }, []);

  // Global Ctrl+, shortcut to open settings from anywhere in the app
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.ctrlKey && (e.key === "," || e.code === "Comma") && !e.metaKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setSettingsOpen((v) => !v);
      }
    }
    // Use globalThis.document to avoid shadowing by the Zustand store's `document` variable
    globalThis.document.addEventListener("keydown", onKeyDown);
    return () => globalThis.document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (modeWindow === null) {
      globalThis.document.title = "SPP v2";
      return;
    }
    globalThis.document.title = modeWindow.title;
  }, [modeWindow]);

  useEffect(() => {
    function openDebugEditor(): void {
      resetViewport();
      clearSelection();
      setScreen("editor");
    }

    window.addEventListener("spp2:debug-open-editor", openDebugEditor);
    return () => window.removeEventListener("spp2:debug-open-editor", openDebugEditor);
  }, [clearSelection, resetViewport]);

  useEffect(() => {
    const snapshotId = modeWindow?.snapshotId;
    if (typeof snapshotId !== "string") return;
    const requestedSnapshotId = snapshotId;

    let alive = true;
    async function loadSnapshot(): Promise<void> {
      try {
        const result = await window.spp?.getModeWindowSnapshot?.(requestedSnapshotId);
        if (!alive) return;
        if (result?.success && isModeWindowSnapshot(result.snapshot)) {
          setModeWindowSnapshot(result.snapshot);
          if (result.snapshot.document !== undefined) {
            const envelope = beginProject(createProjectEnvelope({ document: result.snapshot.document, linkedGroups: [], batchJobs: [] }));
            setDocument(withProjectMetadata(envelope.document, envelope.metadata));
            resetViewport();
            clearSelection();
          }
        }
      } finally {
        if (alive) setWindowSnapshotLoading(false);
      }
    }

    void loadSnapshot();
    return () => {
      alive = false;
    };
  }, [beginProject, clearSelection, modeWindow, resetViewport, setDocument]);

  function openMode(mode: ModeType): void {
    setPendingMode(mode);
    if (mode === "collage") {
      setScreen("collage-wizard");
    } else if (mode === "class_photo") {
      setClassPhotoWizardInitialState(undefined);
      setScreen("class-photo-wizard");
    } else if (mode === "photo_print") {
      setScreen("photo-print-wizard");
    } else if (mode === "pdf_tools") {
      setScreen("pdf-studio");
    } else if (mode === "mask") {
      setScreen("mask-wizard");
    } else if (mode === "product") {
      setScreen("product-library");
    } else if (mode === "batch_production") {
      setScreen("batch-production-library");
    } else {
      setScreen("setup");
    }
  }

  function openProductStandard(product: ProductDefinition): void {
    const doc = createDocumentFromProduct(product);
    setActiveProduct(product);
    setProductCollageContext(null);
    const envelope = beginProject(createProjectEnvelope({ document: doc, linkedGroups: [], batchJobs: [] }));
    setDocument(withProjectMetadata(envelope.document, envelope.metadata));
    resetViewport();
    clearSelection();
    setScreen("editor");
  }

  function handleOpenProductStandard(product: ProductDefinition): void {
    const orientation = String(product.metadata.orientation ?? "any");
    if (orientation === "portrait") {
      openProductStandard(applyOrientationToProduct(product, "portrait"));
    } else if (orientation === "landscape") {
      openProductStandard(applyOrientationToProduct(product, "landscape"));
    } else {
      // "any" or unspecified → let user choose
      setOrientationPicking(product);
    }
  }

  function handleOrientationPicked(orientation: "portrait" | "landscape"): void {
    if (!orientationPicking) return;
    setOrientationPicking(null);
    openProductStandard(applyOrientationToProduct(orientationPicking, orientation));
  }

  function renderOrientationPicker(): ReactElement | null {
    if (!orientationPicking) return null;
    return (
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 9999,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.55)"
        }}
        onClick={(e) => { if (e.target === e.currentTarget) setOrientationPicking(null); }}
      >
        <div style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "28px 32px",
          maxWidth: 360,
          width: "90%",
          textAlign: "center",
          boxShadow: "0 24px 64px -12px rgba(0,0,0,0.6)"
        }}>
          <div style={{ fontSize: 22, marginBottom: 6 }}>⬛</div>
          <h3 style={{ margin: "0 0 6px", fontSize: 16, color: "var(--text-primary)" }}>
            {orientationPicking.name}
          </h3>
          <p style={{ margin: "0 0 22px", fontSize: 13, color: "var(--text-secondary)" }}>
            {(orientationPicking.canvasSize.width / 10).toFixed(1)} ×{" "}
            {(orientationPicking.canvasSize.height / 10).toFixed(1)} ס&quot;מ — בחר אוריינטציה
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button
              className="btn btn-ghost"
              onClick={() => handleOrientationPicked("portrait")}
              style={{ flexDirection: "column", gap: 6, height: "auto", padding: "12px 20px" }}
              type="button"
            >
              <span style={{ fontSize: 22 }}>▭</span>
              <span>עומד</span>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Portrait</span>
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => handleOrientationPicked("landscape")}
              style={{ flexDirection: "column", gap: 6, height: "auto", padding: "12px 20px" }}
              type="button"
            >
              <span style={{ fontSize: 22 }}>▬</span>
              <span>שוכב</span>
              <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Landscape</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  function handleOpenProductCollage(product: ProductDefinition): void {
    // Only set context — the collage wizard creates the document
    setActiveProduct(product);
    setProductCollageContext({ product });
    setScreen("collage-wizard");
  }

  async function handleCollageWizardComplete(result: CollageWizardResult): Promise<void> {
    const { images, pageSetup, selectedFamily, cachedSlots, spacingMm, marginMm, customerInfo } = result;

    // Import each image as a real SPP2 Asset (data URL stored in previewPath/originalPath)
    const importedAssets: Asset[] = [];
    for (const imgEntry of images) {
      try {
        const { asset } = await importImageAsset(imgEntry.file, [], { createPreview: true });
        importedAssets.push(asset);
      } catch (error) {
        writeLog("import", "warn", "Collage image import fallback used", {
          fileName: imgEntry.file.name,
          message: error instanceof Error ? error.message : String(error)
        });
        const dataUrl = await fileToDataUrl(imgEntry.file);
        // If import fails, keep a stable data URL instead of persisting a temporary object URL.
        importedAssets.push({
          version: 1,
          id: crypto.randomUUID(),
          name: imgEntry.file.name,
          kind: "image",
          status: "ready",
          originalPath: dataUrl,
          previewPath: dataUrl,
          thumbnailPath: dataUrl,
          mimeType: imgEntry.file.type || "image/jpeg",
          width: imgEntry.width,
          height: imgEntry.height,
          fileSize: imgEntry.file.size,
          metadata: {
            importedAt: new Date().toISOString(),
            originalFileName: imgEntry.file.name,
            fallbackReason: "collage-file-reader"
          }
        });
      }
    }

    const assetIds = importedAssets.map((a) => a.id);

    // If opening from product library, inject product context into page metadata
    const productCtx = useProductStore.getState().collageContext;
    const pageExtraMetadata: import("@/types/primitives").Metadata = productCtx
      ? {
          productId: productCtx.product.id,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          productContext: productCtx.product as any
        }
      : {};

    const collagePage = createPage({
      setup: pageSetup,
      metadata: pageExtraMetadata
    });

    // Create document with new architecture: activeFamily + spacingMM + marginMM + cachedSlots
    let doc = createCollageModeDocument(
      customerInfo?.customerName ? `קולאז' - ${customerInfo.customerName}` : "קולאז' חדש",
      collagePage,
      selectedFamily,
      cachedSlots,
      assetIds,
      spacingMm,
      marginMm,
      customerInfo
    );

    // Add the imported assets to the document
    doc = { ...doc, assets: importedAssets };

    // Sync CollageSlots → real FrameLayers with correct imageAssetIds
    const rule = doc.collageRules[0];
    if (rule) {
      const imageInputs = importedAssets.map((asset) => ({
        assetId: asset.id,
        width: asset.width ?? 800,
        height: asset.height ?? 600,
      }));
      const smartRule = {
        ...rule,
        imageAssignments: assignByPoolOrder(rule.imagePool, rule.cachedSlots, rule.id, rule.imageAssignments, rule.cachedSlots, imageInputs)
      };
      doc = { ...doc, collageRules: doc.collageRules.map((r) => r.id === rule.id ? smartRule : r) };
      const page = doc.pages.find((p) => p.id === rule.pageId);
      if (page) {
        const { page: updatedPage, frameIds } = syncFrameLayersToPage(page, smartRule, page.width, page.height);
        const updatedRule = { ...smartRule, frameIds };
        doc = {
          ...doc,
          collageRules: doc.collageRules.map((r) => r.id === rule.id ? updatedRule : r),
          pages: doc.pages.map((p) => p.id === rule.pageId ? updatedPage : p)
        };
      }
    }

    // If product context was active, stamp product mode on the document
    if (productCtx) {
      doc = {
        ...doc,
        metadata: { ...doc.metadata, mode: "product", productId: productCtx.product.id, source: "product" }
      };
    }

    const envelope = beginProject(createProjectEnvelope({ document: doc, linkedGroups: [], batchJobs: [] }));
    setDocument(withProjectMetadata(envelope.document, envelope.metadata));
    resetViewport();
    clearSelection();
    setScreen("editor");
  }

  async function handlePhotoPrintWizardComplete(result: PhotoPrintWizardResult): Promise<void> {
    const { images, pageWidthMm, pageHeightMm, pageDpi, pageOrientation, pagePresetId, printOptions, customerInfo } = result;

    // Show loading screen immediately
    setScreen("home");
    setIsCreatingPhotoPrint(true);
    setCreatingProgress(`מייבא תמונות (0/${images.length})...`);

    // Import assets sequentially to avoid decoder and memory spikes.
    const importedAssets: Asset[] = [];
    for (let i = 0; i < images.length; i += 1) {
      const imgEntry = images[i];
      if (imgEntry === undefined) continue;
      try {
        const { asset } = await importImageAsset(imgEntry.file, importedAssets, {
          createPreview: true,
          previewMaxSize: 2400,
          thumbnailMaxSize: 320
        });
        importedAssets.push(asset);
      } catch (error) {
        writeLog("import", "warn", "Photo print image import fallback used", {
          fileName: imgEntry.file.name,
          message: error instanceof Error ? error.message : String(error)
        });
        const dataUrl = await fileToDataUrl(imgEntry.file);
        importedAssets.push({
          version: 1,
          id: crypto.randomUUID(),
          name: imgEntry.file.name,
          kind: "image",
          status: "ready",
          originalPath: dataUrl,
          previewPath: dataUrl,
          thumbnailPath: dataUrl,
          mimeType: imgEntry.file.type || "image/jpeg",
          width: imgEntry.width,
          height: imgEntry.height,
          fileSize: imgEntry.file.size,
          metadata: {
            importedAt: new Date().toISOString(),
            originalFileName: imgEntry.file.name,
            fallbackReason: "photo-print-file-reader"
          }
        });
      }
      setCreatingProgress(`מייבא תמונות (${i + 1}/${images.length})...`);
    }

    setCreatingProgress("מייצר דפי הדפסה...");

    const shortW = Math.min(pageWidthMm, pageHeightMm);
    const longH = Math.max(pageWidthMm, pageHeightMm);
    const finalW = pageOrientation === "portrait" ? shortW : longH;
    const finalH = pageOrientation === "portrait" ? longH : shortW;

    const setup: PageSetup = {
      version: 1,
      units: "mm",
      dpi: pageDpi,
      orientation: pageOrientation,
      size: { width: Math.round(mmToPx(finalW, pageDpi)), height: Math.round(mmToPx(finalH, pageDpi)) },
      bleed: { top: 0, right: 0, bottom: 0, left: 0 },
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
      printIntent: "photo",
      snapSettings: { ...defaultSnapSettings },
      gridSettings: { ...defaultGridSettings },
      metadata: { presetId: pagePresetId }
    };

    const projectMetadata = {
      ...customerInfo,
      projectType: "PhotoPrint" as const
    };

    const inputs = importedAssets.map((asset, i) => ({
      asset,
      copies: images[i]?.copies ?? printOptions.globalCopies ?? 1
    }));

    const docName = customerInfo?.customerName
      ? `פיתוח תמונות — ${customerInfo.customerName}`
      : "פיתוח תמונות";

    const doc = createPhotoPrintModeDocument(docName, setup, inputs, printOptions, projectMetadata);
    const envelope = beginProject(createProjectEnvelope({ document: doc, linkedGroups: [], batchJobs: [] }));
    setDocument(withProjectMetadata(envelope.document, envelope.metadata));
    resetViewport();
    clearSelection();
    setIsCreatingPhotoPrint(false);
    setCreatingProgress("");
    setScreen("editor");

    // Run face detection asynchronously after the editor opens. The wizard's
    // engine sets smartCropMode="face" on every frame when the user enabled
    // it; this pass shifts each frame's contentTransform.offsetX/Y so faces
    // land at the cell center. Skipped silently if the sidecar is unreachable.
    if (printOptions.faceDetectionEnabled) {
      const ruleId = envelope.document.photoPrintRules[0]?.id;
      if (ruleId !== undefined) {
        void applyFaceDetectionToPhotoPrint(envelope.document, ruleId).then((updated) => {
          if (updated !== envelope.document) {
            setDocument(withProjectMetadata(updated, envelope.metadata));
          }
        }).catch(() => undefined);
      }
    }
  }

  async function handleClassPhotoWizardComplete(result: ClassPhotoWizardResult): Promise<void> {
    const {
      images,
      personRecords,
      backgroundFile,
      pageSetup,
      titleText,
      footerText,
      titleFontFamily,
      footerFontFamily,
      titlePresetId,
      footerPresetId,
      childFrameStyle,
      staffFrameStyle,
      layoutSettings,
      visualBalanceSettings,
      customerInfo
    } = result;

    // Resolve preset effects + visual style if a preset was selected
    const { BUILTIN_TEXT_PRESETS } = await import("@/core/text/presets");
    const titlePreset = titlePresetId ? BUILTIN_TEXT_PRESETS.find((p) => p.presetId === titlePresetId) : null;
    const footerPreset = footerPresetId ? BUILTIN_TEXT_PRESETS.find((p) => p.presetId === footerPresetId) : null;
    const titleEffects = titlePreset?.effects ?? [];
    const footerEffects = footerPreset?.effects ?? [];
    // The preset style contains color, gradient, stroke, shadow — serialize for storage
    const titlePresetStyle = titlePreset?.style
      ? (titlePreset.style as import("@/types/primitives").Metadata)
      : undefined;
    const footerPresetStyle = footerPreset?.style
      ? (footerPreset.style as import("@/types/primitives").Metadata)
      : undefined;

    // Import each person image as a real SPP2 asset, indexed to match personRecords.
    // In back-to-wizard flow, records already have real assetIds — reuse existing assets.
    const existingDoc = useDocumentStore.getState().document;
    const importedAssets: Asset[] = [];
    const recordsWithAssetIds = personRecords.map((rec) => ({ ...rec }));

    for (let i = 0; i < recordsWithAssetIds.length; i++) {
      const rec = recordsWithAssetIds[i];
      if (!rec) continue;

      // If assetId is already real (not PLACEHOLDER_), reuse it
      if (!rec.assetId.startsWith("PLACEHOLDER_")) {
        const existingAsset = existingDoc?.assets.find((a) => a.id === rec.assetId);
        if (existingAsset) {
          importedAssets.push(existingAsset);
          continue;
        }
      }

      // Otherwise import the new file
      const entry = images[i];
      if (!entry) continue;
      try {
        const { asset } = await importImageAsset(entry.file, [], { createPreview: true });
        importedAssets.push(asset);
        rec.assetId = asset.id;
      } catch {
        // Fallback: create a minimal asset from blob URL
        const fallbackAsset: Asset = {
          version: 1,
          id: crypto.randomUUID(),
          name: entry.file.name,
          kind: "image",
          status: "ready",
          originalPath: entry.url,
          previewPath: entry.url,
          thumbnailPath: entry.url,
          mimeType: entry.file.type || "image/jpeg",
          width: entry.width,
          height: entry.height,
          fileSize: entry.file.size,
          metadata: {}
        };
        importedAssets.push(fallbackAsset);
        rec.assetId = fallbackAsset.id;
      }
    }

    // Import background image if present
    let backgroundAssetId: string | undefined;
    if (backgroundFile) {
      try {
        const { asset } = await importImageAsset(backgroundFile, [], { createPreview: false });
        importedAssets.push(asset);
        backgroundAssetId = asset.id;
      } catch {
        const bgUrl = URL.createObjectURL(backgroundFile);
        const fallbackBg: Asset = {
          version: 1,
          id: crypto.randomUUID(),
          name: backgroundFile.name,
          kind: "image",
          status: "ready",
          originalPath: bgUrl,
          previewPath: bgUrl,
          thumbnailPath: bgUrl,
          mimeType: backgroundFile.type || "image/jpeg",
          metadata: {}
        };
        importedAssets.push(fallbackBg);
        backgroundAssetId = fallbackBg.id;
      }
    }

    const childCount = recordsWithAssetIds.filter((r) => r.role === "child").length;
    const staffCount = recordsWithAssetIds.filter((r) => r.role === "staff").length;
    const ls = layoutSettings ?? defaultLayoutSettings(pageSetup.size.width, pageSetup.size.height, childCount, staffCount);

    const projectMetadata = {
      ...customerInfo,
      projectType: "ClassPhoto" as const
    };

    const docName = customerInfo?.customerName
      ? `תמונת מחזור — ${customerInfo.customerName}`
      : "תמונת מחזור";

    let doc = createClassPhotoModeDocument(
      docName,
      pageSetup,
      importedAssets,
      recordsWithAssetIds,
      titleText,
      footerText,
      ls,
      visualBalanceSettings,
      childFrameStyle,
      staffFrameStyle,
      titleFontFamily,
      footerFontFamily,
      backgroundAssetId,
      projectMetadata,
      titleEffects,
      footerEffects,
      titlePresetStyle,
      footerPresetStyle
    );

    // Sync: generate FrameLayers + TextLayers from personRecords
    const rule = doc.classPhotoRules[0];
    if (rule) {
      const page = doc.pages.find((p) => p.id === rule.pageId);
      if (page) {
        const { page: updatedPage, rule: updatedRule } = syncClassPhotoToPage(page, rule);
        doc = {
          ...doc,
          classPhotoRules: doc.classPhotoRules.map((r) => r.id === rule.id ? updatedRule : r),
          pages: doc.pages.map((p) => p.id === rule.pageId ? updatedPage : p)
        };
      }
    }

    const envelope = beginProject(createProjectEnvelope({ document: doc, linkedGroups: [], batchJobs: [] }));
    setDocument(withProjectMetadata(envelope.document, envelope.metadata));
    resetViewport();
    clearSelection();
    setClassPhotoWizardInitialState(undefined);
    setScreen("editor");
  }

  async function handleMaskWizardComplete(result: MaskWizardResult): Promise<void> {
    const { name, setup, builtInShape, libraryEntry, maskWidth, maskHeight, spacingX, spacingY } = result;

    let maskShape: import("@/types/mask").MaskShape = builtInShape ?? "circle";
    let extraPreset: import("@/types/mask").MaskPreset | undefined;

    if (libraryEntry !== undefined) {
      maskShape = "custom";
      const now = new Date().toISOString();
      extraPreset = {
        version: 1,
        id: crypto.randomUUID(),
        name: libraryEntry.name,
        type: libraryEntry.type === "svg" ? "svg" : libraryEntry.thresholdEnabled ? "pngThreshold" : "png",
        assetId: undefined,
        thumbnailAssetId: undefined,
        thresholdSettings: libraryEntry.thresholdEnabled
          ? {
              version: 1,
              enabled: true,
              color: libraryEntry.thresholdColor,
              tolerance: libraryEntry.thresholdTolerance,
              feather: libraryEntry.thresholdFeather
            }
          : undefined,
        defaultSize: { width: libraryEntry.defaultWidth, height: libraryEntry.defaultHeight },
        keepProportionsDefault: true,
        createdAt: now,
        updatedAt: now,
        metadata: { libraryEntryId: libraryEntry.id }
      };
    }

    const nextDocument = createMaskModeDocument(
      name,
      setup,
      {
        maskShape,
        maskWidth,
        maskHeight,
        keepProportions: true,
        margins: { top: 20, right: 20, bottom: 20, left: 20 },
        spacingX,
        spacingY
      },
      { projectType: "Mask" }
    );

    if (extraPreset !== undefined) {
      nextDocument.maskPresets = [...nextDocument.maskPresets, extraPreset];
      nextDocument.maskRules = nextDocument.maskRules.map((r) => ({
        ...r,
        maskPresetId: extraPreset!.id
      }));
    }

    if (libraryEntry !== undefined && libraryEntry.fileDataUrl) {
      try {
        const processed = await generateMaskThumbnail(
          libraryEntry.fileDataUrl,
          libraryEntry.type as "svg" | "png",
          libraryEntry.thresholdEnabled,
          libraryEntry.thresholdColor,
          libraryEntry.thresholdTolerance,
          libraryEntry.thresholdFeather,
          2048
        );
        const blob = await (await fetch(processed)).blob();
        const file = new File([blob], `${libraryEntry.name}-mask.png`, { type: "image/png" });
        const { asset } = await importImageAsset(file, nextDocument.assets, { createPreview: false });
        nextDocument.assets = [...nextDocument.assets, asset];
        if (extraPreset !== undefined) {
          nextDocument.maskPresets = nextDocument.maskPresets.map((p) =>
            p.id === extraPreset!.id ? { ...p, assetId: asset.id } : p
          );
          nextDocument.maskRules = nextDocument.maskRules.map((rule) =>
            rule.maskPresetId === extraPreset!.id
              ? { ...rule, metadata: { ...rule.metadata, maskAssetId: asset.id } }
              : rule
          );
        }
      } catch {
        // Asset import failed — mask will render without custom shape
      }
    }

    const envelope = beginProject(createProjectEnvelope({ document: nextDocument, linkedGroups: [], batchJobs: [] }));
    setDocument(withProjectMetadata(envelope.document, envelope.metadata));
    resetViewport();
    clearSelection();
    setScreen("editor");
  }

  function createDocument(setup: PageSetup, options?: { grid?: Partial<GridCreateOptions>; mask?: Partial<MaskCreateOptions> }, customerInfo?: ProjectCustomerInfo): void {
    const name = pendingMode === "free" ? "פרויקט חופשי חדש" : `פרויקט ${pendingMode}`;
    const projectMetadata = {
      ...customerInfo,
      projectType: pendingMode === "grid" ? "Grid" : pendingMode === "mask" ? "Mask" : pendingMode
    };
    const nextDocument =
      pendingMode === "grid"
        ? createGridModeDocument(name, setup, options?.grid, projectMetadata)
        : pendingMode === "mask"
          ? createMaskModeDocument(name, setup, options?.mask, projectMetadata)
          : createFreeModeDocument(name, setup, projectMetadata);
    const envelope = beginProject(createProjectEnvelope({ document: nextDocument, linkedGroups: [], batchJobs: [] }));
    setDocument(withProjectMetadata(envelope.document, envelope.metadata));
    resetViewport();
    clearSelection();
    setScreen("editor");
  }

  function backHome(): void {
    if (isModeWindow) {
      window.close();
      return;
    }
    resetWorkspaceForHome();
    setPendingMode("free");
    setClassPhotoWizardInitialState(undefined);
    setOrientationPicking(null);
    setIsCreatingPhotoPrint(false);
    setCreatingProgress("");
    setIsCreatingBatch(false);
    setCreatingBatchProgress("");
    setBatchWizardTemplate(null);
    setModeWindowSnapshot(null);
    setScreen("home");
  }

  function handleOpenBatchLibrary(): void {
    setScreen("batch-production-library");
  }

  function handleEditBatchTemplate(doc: SppDocument): void {
    const envelope = beginProject(
      createProjectEnvelope({ document: doc, linkedGroups: [], batchJobs: [] })
    );
    void envelope;
    setScreen("editor");
  }

  const [batchWizardTemplate, setBatchWizardTemplate] =
    useState<BatchTemplateIndexItem | null>(null);

  function handleOpenBatchWizard(item: BatchTemplateIndexItem): void {
    setBatchWizardTemplate(item);
    setScreen("batch-wizard");
  }

  async function handleBatchWizardComplete(result: BatchWizardResult): Promise<void> {
    setBatchWizardTemplate(null);
    setIsCreatingBatch(true);
    setCreatingBatchProgress("טוען תבנית...");
    try {
      const templateDoc = await loadTemplateDocument(result.templateId);
      if (templateDoc === null) throw new Error("Template not found");
      const meta = getBatchProductionMeta(templateDoc);
      if (meta === null) throw new Error("No batch metadata");

      const hasImageField = meta.variableFields.some((f) => f.type === "image");
      const importedAssets: Asset[] = [];

      // Map recordId → assetId for image import
      const recordAssetMap = new Map<string, string>();

      for (let i = 0; i < result.records.length; i++) {
        const rec = result.records[i];
        if (hasImageField && rec.file !== undefined) {
          setCreatingBatchProgress(`מייבא תמונות… ${i + 1} / ${result.records.length}`);
          const { asset } = await importImageAsset(
            rec.file,
            [...templateDoc.assets, ...importedAssets],
          );
          if (!importedAssets.some((a) => a.id === asset.id)) importedAssets.push(asset);
          recordAssetMap.set(rec.id, asset.id);
        }
      }

      setCreatingBatchProgress("מייצר עמודים...");

      const generationRecords = result.records.map((rec) => ({
        fields: rec.fields,
        imageAssetId: recordAssetMap.get(rec.id),
      }));

      const generatedDoc = generateBatchProduction(
        templateDoc,
        meta,
        generationRecords,
        importedAssets,
      );

      const envelope = beginProject(
        createProjectEnvelope({ document: generatedDoc, linkedGroups: [], batchJobs: [] }),
      );
      setDocument(withProjectMetadata(envelope.document, envelope.metadata));
      resetViewport();
      clearSelection();
      setScreen("editor");
    } catch (err) {
      console.error("Batch generation failed", err);
      setScreen("batch-production-library");
    } finally {
      setIsCreatingBatch(false);
      setCreatingBatchProgress("");
    }
  }

  async function openCurrentScreenInSeparateWindow(): Promise<void> {
    const mode = screenToMode(screen);
    if (mode === null || mode === "pdf-studio") return;
    if (window.spp?.openModeWindow === undefined) {
      window.alert("פתיחת חלון נפרד זמינה רק בהרצת Electron.");
      return;
    }
    const snapshot = screen === "editor" && document !== null ? { document } : undefined;
    const result = await window.spp.openModeWindow({
      mode,
      title: MODE_WINDOW_TITLES[mode],
      snapshot
    });
    if (!result.success) {
      window.alert(result.error ?? "פתיחת החלון נכשלה.");
    }
  }

  function renderSeparateWindowButton(): ReactElement | null {
    const mode = screenToMode(screen);
    if (isModeWindow || mode === null || mode === "pdf-studio" || window.spp?.openModeWindow === undefined) return null;
    return (
      <button
        aria-label="פתח בחלון נפרד"
        onClick={() => void openCurrentScreenInSeparateWindow()}
        style={{
          position: "fixed",
          top: 14,
          left: 14,
          zIndex: 3000,
          border: "1px solid rgba(255,255,255,0.18)",
          borderRadius: 8,
          background: "rgba(20,22,34,0.9)",
          color: "#ffffff",
          padding: "8px 12px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
          cursor: "pointer"
        }}
        type="button"
      >
        פתח בחלון נפרד
      </button>
    );
  }

  function buildClassPhotoWizardStateFromDocument(): ClassPhotoWizardInitialState | undefined {
    const doc = useDocumentStore.getState().document;
    if (!doc) return undefined;
    const rule = doc.classPhotoRules[0];
    if (!rule) return undefined;
    const page = doc.pages.find((p) => p.id === rule.pageId);
    if (!page) return undefined;

    // Build thumbnail URLs from asset previewPath
    const thumbnailUrls = rule.personRecords.map((rec) => {
      const asset = doc.assets.find((a) => a.id === rec.assetId);
      return asset?.previewPath ?? asset?.originalPath ?? "";
    });

    // Extract page preset from page setup metadata
    const presetId = (page.setup.metadata?.["presetId"] as string | undefined) ?? "custom";
    const orientation = page.setup.orientation ?? "portrait";

    return {
      personRecords: rule.personRecords,
      personThumbnailUrls: thumbnailUrls,
      imagesAlreadyImported: true,
      presetId,
      orientation,
      titleText: rule.titleText,
      footerText: rule.footerText,
      titleFontFamily: rule.titleTextStyle.fontFamily,
      footerFontFamily: rule.footerTextStyle.fontFamily,
      childFrameStyle: rule.childFrameStyle,
      staffFrameStyle: rule.staffFrameStyle,
      layoutSettings: rule.layoutSettings,
      visualBalanceSettings: rule.visualBalanceSettings
    };
  }

  function restoreRecovery(): void {
    if (recoveryRecord === null) return;
    try {
      const envelope = restoreRecoveryRecord(recoveryRecord);
      const opened = beginProject(envelope, envelope.metadata.currentFilePath);
      setDocument(withProjectMetadata(opened.document, opened.metadata));
      resetViewport();
      clearSelection();
      setRecoveryRecord(null);
      setScreen("editor");
    } catch (error) {
      captureError("recovery", error, { recordId: recoveryRecord.id });
      discardRecoveryRecord(recoveryRecord.id);
      setRecoveryRecord(getLatestRecoveryRecord());
    }
  }

  async function openProjectFile(file: File): Promise<void> {
    try {
      const envelope = await loadProject(file);
      const opened = beginProject(envelope, file.name);
      const doc = withProjectMetadata(opened.document, opened.metadata);
      setDocument(doc);
      resetViewport();
      clearSelection();
      // Restore product store from saved document context
      if (doc.metadata["mode"] === "product") {
        const pageCtx = doc.pages[0]?.metadata.productContext as unknown as import("@/types/product").ProductPageContext | undefined;
        if (pageCtx?.productId) {
          try {
            const { reloadProductDefinition } = await import("@/services/python_bridge/productBridge");
            const reloaded = await reloadProductDefinition(String(pageCtx.productId));
            if (reloaded) setActiveProduct(reloaded);
          } catch {
            // Bridge unavailable — product panel won't show, but document still opens
          }
        }
      }
      setScreen("editor");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "לא ניתן לפתוח את הפרויקט");
    }
  }

  if (windowSnapshotLoading) {
    return <main className="loading-screen">טוען עותק עבודה לחלון נפרד...</main>;
  }

  const pdfStudioInitialDocument = modeWindowSnapshot?.pdfStudioDocument;

  if (screen === "mask-wizard") {
    return (
      <>
        {renderSeparateWindowButton()}
        <MaskSetupWizard
          onComplete={(result) => void handleMaskWizardComplete(result)}
          onCancel={backHome}
        />
      </>
    );
  }

  if (screen === "collage-wizard") {
    return (
      <>
        {renderSeparateWindowButton()}
        <CollageSetupWizard
          onComplete={(result) => void handleCollageWizardComplete(result)}
          onCancel={backHome}
        />
      </>
    );
  }

  if (screen === "photo-print-wizard") {
    return (
      <>
        {renderSeparateWindowButton()}
        <PhotoPrintSetupWizard
          onComplete={(result) => void handlePhotoPrintWizardComplete(result)}
          onCancel={backHome}
        />
      </>
    );
  }

  if (screen === "class-photo-wizard") {
    return (
      <>
        {renderSeparateWindowButton()}
        <ClassPhotoSetupWizard
          initialState={classPhotoWizardInitialState}
          onComplete={(result) => void handleClassPhotoWizardComplete(result)}
          onCancel={backHome}
        />
      </>
    );
  }


  if (isCreatingBatch) {
    return (
      <div className="pp-creating-screen">
        <div className="pp-spinner" />
        <div className="pp-creating-title">מייצר עיצובים...</div>
        {creatingBatchProgress && <div className="pp-creating-sub">{creatingBatchProgress}</div>}
      </div>
    );
  }

  if (screen === "batch-wizard" && batchWizardTemplate !== null) {
    return (
      <BatchProductionWizard
        template={batchWizardTemplate}
        onComplete={(result) => void handleBatchWizardComplete(result)}
        onCancel={() => setScreen("batch-production-library")}
      />
    );
  }

  if (screen === "batch-production-library") {
    return (
      <BatchProductionLibraryScreen
        onEditTemplate={handleEditBatchTemplate}
        onProduce={handleOpenBatchWizard}
        onCancel={backHome}
      />
    );
  }

  if (screen === "product-library") {
    return (
      <>
        <ProductLibraryScreen
          onOpenStandard={handleOpenProductStandard}
          onOpenCollage={handleOpenProductCollage}
          onCancel={backHome}
        />
        {renderSeparateWindowButton()}
        {orientationPicking && renderOrientationPicker()}
      </>
    );
  }

  if (screen === "pdf-studio") {
    return (
      <Suspense fallback={<main className="loading-screen">טוען את כלי ה-PDF...</main>}>
        <PdfStudioScreen initialDocument={pdfStudioInitialDocument} onBackHome={backHome} />
      </Suspense>
    );
  }

  if (isCreatingPhotoPrint) {
    return (
      <div className="pp-creating-screen">
        <div className="pp-spinner" />
        <div className="pp-creating-title">מכין דפי הדפסה...</div>
        {creatingProgress && <div className="pp-creating-sub">{creatingProgress}</div>}
      </div>
    );
  }

  if (screen === "setup") {
    return (
      <>
        {renderSeparateWindowButton()}
        <DocumentSetupScreen modeName={pendingMode} onBack={backHome} onCreate={createDocument} />
      </>
    );
  }

  return (
    <>
      {canShowEditor ? renderSeparateWindowButton() : null}
      {canShowEditor ? (
        <Suspense fallback={<main className="loading-screen">טוען את סביבת העריכה...</main>}>
          <EditorScreen
            onBackHome={backHome}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenClassPhotoWizard={() => {
              setClassPhotoWizardInitialState(buildClassPhotoWizardStateFromDocument());
              setScreen("class-photo-wizard");
            }}
          />
        </Suspense>
      ) : (
        <>
          {recoveryRecord !== null ? (
            <div className="recovery-banner">
              <span>נמצאה שמירה אוטומטית אחרונה: {recoveryRecord.projectName}</span>
              <button className="btn btn-accent" onClick={restoreRecovery} type="button">שחזר</button>
              <button className="btn btn-ghost" onClick={() => { discardRecoveryRecord(recoveryRecord.id); setRecoveryRecord(null); }} type="button">התעלם</button>
            </div>
          ) : null}
          <HomeScreen
            onOpenMode={openMode}
            onOpenProjectFile={(file) => void openProjectFile(file)}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenBatchLibrary={handleOpenBatchLibrary}
          />
        </>
      )}

      <SettingsWindow open={settingsOpen} onClose={() => (isModeWindow && modeWindow?.mode === "settings" ? window.close() : setSettingsOpen(false))} />

      {/* ── Orientation picker — shown when product orientation is "any" ── */}
      {renderOrientationPicker()}
    </>
  );
}
