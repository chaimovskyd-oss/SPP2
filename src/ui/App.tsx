import { Suspense, lazy, useEffect, useMemo, useState, type ReactElement } from "react";
import { cleanupRecovery, createGridModeDocument, createMaskModeDocument, createPhotoPrintModeDocument, createProjectEnvelope, discardRecoveryRecord, getLatestRecoveryRecord, restoreRecoveryRecord, withProjectMetadata, type AutosaveRecord } from "@/core";
import { createPage } from "@/core/document/factory";
import { createDocumentFromProduct } from "@/core/product/productDocument";
import { useProductStore } from "@/state/productStore";
import { ProductLibraryScreen } from "./productLibrary/ProductLibraryScreen";
import type { ProductDefinition } from "@/types/product";
import { createCollageModeDocument } from "@/core/collage/collageFactory";
import { syncFrameLayersToPage } from "@/core/collage/collageModeEngine";
import { importImageAsset } from "@/core/assets/assetManager";
import { createClassPhotoModeDocument, defaultLayoutSettings } from "@/core/classPhoto/classPhotoFactory";
import { syncClassPhotoToPage } from "@/core/classPhoto/classPhotoLayoutEngine";
import { defaultGridSettings, defaultSnapSettings, mmToPx } from "@/core";
import type { Asset } from "@/types/document";
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

export function App(): ReactElement {
  const [screen, setScreen] = useState<"home" | "setup" | "editor" | "collage-wizard" | "photo-print-wizard" | "pdf-studio" | "class-photo-wizard" | "mask-wizard" | "product-library">("home");
  const [classPhotoWizardInitialState, setClassPhotoWizardInitialState] = useState<ClassPhotoWizardInitialState | undefined>(undefined);
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
  const setActiveProduct = useProductStore((state) => state.setActiveProduct);
  const setProductCollageContext = useProductStore((state) => state.setCollageContext);

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
    } else {
      setScreen("setup");
    }
  }

  function handleOpenProductStandard(product: ProductDefinition): void {
    const doc = createDocumentFromProduct(product);
    setActiveProduct(product);
    setProductCollageContext(null);
    const envelope = beginProject(createProjectEnvelope({ document: doc, linkedGroups: [], batchJobs: [] }));
    setDocument(withProjectMetadata(envelope.document, envelope.metadata));
    resetViewport();
    clearSelection();
    setScreen("editor");
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
        const blob = await (await fetch(libraryEntry.fileDataUrl)).blob();
        const file = new File([blob], `${libraryEntry.name}.${libraryEntry.type}`, {
          type: libraryEntry.type === "svg" ? "image/svg+xml" : "image/png"
        });
        const { asset } = await importImageAsset(file, nextDocument.assets, { createPreview: false });
        nextDocument.assets = [...nextDocument.assets, asset];
        if (extraPreset !== undefined) {
          nextDocument.maskPresets = nextDocument.maskPresets.map((p) =>
            p.id === extraPreset!.id ? { ...p, assetId: asset.id } : p
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
    clearSelection();
    setScreen("home");
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

  if (screen === "mask-wizard") {
    return (
      <MaskSetupWizard
        onComplete={(result) => void handleMaskWizardComplete(result)}
        onCancel={() => setScreen("home")}
      />
    );
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

  if (screen === "class-photo-wizard") {
    return (
      <ClassPhotoSetupWizard
        initialState={classPhotoWizardInitialState}
        onComplete={(result) => void handleClassPhotoWizardComplete(result)}
        onCancel={() => setScreen("home")}
      />
    );
  }


  if (screen === "product-library") {
    return (
      <ProductLibraryScreen
        onOpenStandard={handleOpenProductStandard}
        onOpenCollage={handleOpenProductCollage}
        onCancel={() => setScreen("home")}
      />
    );
  }

  if (screen === "pdf-studio") {
    return (
      <Suspense fallback={<main className="loading-screen">טוען את כלי ה-PDF...</main>}>
        <PdfStudioScreen onBackHome={() => setScreen("home")} />
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
    return <DocumentSetupScreen modeName={pendingMode} onBack={() => setScreen("home")} onCreate={createDocument} />;
  }

  return (
    <>
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
          />
        </>
      )}

      <SettingsWindow open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
