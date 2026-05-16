import { Suspense, lazy, useEffect, useMemo, useState, type ReactElement } from "react";
import { cleanupRecovery, createGridModeDocument, createMaskModeDocument, createPhotoPrintModeDocument, createProjectEnvelope, discardRecoveryRecord, getLatestRecoveryRecord, restoreRecoveryRecord, withProjectMetadata, type AutosaveRecord } from "@/core";
import { createPage } from "@/core/document/factory";
import { createCollageModeDocument } from "@/core/collage/collageFactory";
import { syncFrameLayersToPage } from "@/core/collage/collageModeEngine";
import { importImageAsset } from "@/core/assets/assetManager";
import { defaultGridSettings, defaultSnapSettings, mmToPx } from "@/core";
import type { Asset } from "@/types/document";
import type { PageSetup } from "@/types/primitives";
import type { ProjectCustomerInfo } from "@/types/project";
import type { GridCreateOptions } from "@/types/grid";
import type { MaskCreateOptions } from "@/types/mask";
import type { ModeType } from "@/types/template";
import type { CollageWizardResult } from "./collage/CollageSetupWizard";
import type { PhotoPrintWizardResult } from "@/types/photoPrint";
import { useDocumentStore } from "@/state/documentStore";
import { useSelectionStore } from "@/state/selectionStore";
import { useViewportStore } from "@/state/viewportStore";
import { useProjectLifecycleStore } from "@/state/projectLifecycleStore";
import { HomeScreen } from "./home/HomeScreen";
import { createFreeModeDocument, loadProject } from "./projectActions";
import { DocumentSetupScreen } from "./setup/DocumentSetupScreen";
import { CollageSetupWizard } from "./collage/CollageSetupWizard";
import { PhotoPrintSetupWizard } from "./photoPrint/PhotoPrintSetupWizard";
import "./photoPrint/photoPrint.css";
import { SettingsWindow } from "./settings/SettingsWindow";

const EditorScreen = lazy(() =>
  import("./editor/EditorScreen").then((module) => ({
    default: module.EditorScreen
  }))
);

export function App(): ReactElement {
  const [screen, setScreen] = useState<"home" | "setup" | "editor" | "collage-wizard" | "photo-print-wizard">("home");
  const [pendingMode, setPendingMode] = useState<ModeType>("free");
  const [recoveryRecord, setRecoveryRecord] = useState<AutosaveRecord | null>(() => {
    cleanupRecovery();
    return getLatestRecoveryRecord();
  });
  const document = useDocumentStore((state) => state.document);
  const setDocument = useDocumentStore((state) => state.setDocument);
  const beginProject = useProjectLifecycleStore((state) => state.beginProject);
  const clearSelection = useSelectionStore((state) => state.clearSelection);
  const resetViewport = useViewportStore((state) => state.resetViewport);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isCreatingPhotoPrint, setIsCreatingPhotoPrint] = useState(false);
  const [creatingProgress, setCreatingProgress] = useState("");
  const canShowEditor = useMemo(() => screen === "editor" && document !== null, [document, screen]);

  // Global Ctrl+, shortcut to open settings from anywhere in the app
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.ctrlKey && e.key === "," && !e.metaKey && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        setSettingsOpen((v) => !v);
      }
    }
    // Use globalThis.document to avoid shadowing by the Zustand store's `document` variable
    globalThis.document.addEventListener("keydown", onKeyDown);
    return () => globalThis.document.removeEventListener("keydown", onKeyDown);
  }, []);

  function openMode(mode: ModeType): void {
    setPendingMode(mode);
    if (mode === "collage") {
      setScreen("collage-wizard");
    } else if (mode === "photo_print") {
      setScreen("photo-print-wizard");
    } else {
      setScreen("setup");
    }
  }

  async function handleCollageWizardComplete(result: CollageWizardResult): Promise<void> {
    const { images, pageSetup, selectedFamily, cachedSlots, spacingMm, marginMm, customerInfo } = result;

    // Import each image as a real SPP2 Asset (data URL stored in previewPath/originalPath)
    const importedAssets: Asset[] = [];
    for (const imgEntry of images) {
      try {
        const { asset } = await importImageAsset(imgEntry.file, [], { createPreview: true });
        importedAssets.push(asset);
      } catch {
        // If import fails, create a minimal asset with the blob URL so canvas can still render
        importedAssets.push({
          version: 1,
          id: crypto.randomUUID(),
          name: imgEntry.file.name,
          kind: "image",
          status: "ready",
          originalPath: imgEntry.url,
          previewPath: imgEntry.url,
          thumbnailPath: imgEntry.url,
          mimeType: imgEntry.file.type || "image/jpeg",
          width: imgEntry.width,
          height: imgEntry.height,
          fileSize: imgEntry.file.size,
          metadata: {}
        });
      }
    }

    const assetIds = importedAssets.map((a) => a.id);
    const collagePage = createPage({ setup: pageSetup });

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
      const page = doc.pages.find((p) => p.id === rule.pageId);
      if (page) {
        const { page: updatedPage, frameIds } = syncFrameLayersToPage(page, rule, page.width, page.height);
        const updatedRule = { ...rule, frameIds };
        doc = {
          ...doc,
          collageRules: doc.collageRules.map((r) => r.id === rule.id ? updatedRule : r),
          pages: doc.pages.map((p) => p.id === rule.pageId ? updatedPage : p)
        };
      }
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

    // Import all assets in parallel for speed
    const importedAssets: Asset[] = await Promise.all(
      images.map(async (imgEntry, i): Promise<Asset> => {
        try {
          const { asset } = await importImageAsset(imgEntry.file, [], { createPreview: false });
          setCreatingProgress(`מייבא תמונות (${i + 1}/${images.length})...`);
          return asset;
        } catch {
          return {
            version: 1,
            id: crypto.randomUUID(),
            name: imgEntry.file.name,
            kind: "image",
            status: "ready",
            originalPath: imgEntry.url,
            previewPath: imgEntry.url,
            thumbnailPath: imgEntry.url,
            mimeType: imgEntry.file.type || "image/jpeg",
            width: imgEntry.width,
            height: imgEntry.height,
            fileSize: imgEntry.file.size,
            metadata: {}
          };
        }
      })
    );

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
    clearSelection();
    setScreen("home");
  }

  function restoreRecovery(): void {
    if (recoveryRecord === null) return;
    const envelope = restoreRecoveryRecord(recoveryRecord);
    const opened = beginProject(envelope, envelope.metadata.currentFilePath);
    setDocument(withProjectMetadata(opened.document, opened.metadata));
    resetViewport();
    clearSelection();
    setRecoveryRecord(null);
    setScreen("editor");
  }

  async function openProjectFile(file: File): Promise<void> {
    try {
      const envelope = await loadProject(file);
      const opened = beginProject(envelope, file.name);
      setDocument(withProjectMetadata(opened.document, opened.metadata));
      resetViewport();
      clearSelection();
      setScreen("editor");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "לא ניתן לפתוח את הפרויקט");
    }
  }

  if (screen === "collage-wizard") {
    return (
      <CollageSetupWizard
        onComplete={(result) => void handleCollageWizardComplete(result)}
        onCancel={() => setScreen("home")}
      />
    );
  }

  if (screen === "photo-print-wizard") {
    return (
      <PhotoPrintSetupWizard
        onComplete={(result) => void handlePhotoPrintWizardComplete(result)}
        onCancel={() => setScreen("home")}
      />
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
    return <DocumentSetupScreen modeName={pendingMode} onBack={() => setScreen("home")} onCreate={createDocument} />;
  }

  return (
    <>
      {canShowEditor ? (
        <Suspense fallback={<main className="loading-screen">טוען את סביבת העריכה...</main>}>
          <EditorScreen onBackHome={backHome} />
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
          />
        </>
      )}

      <SettingsWindow open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
