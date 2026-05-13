import { Suspense, lazy, useMemo, useState, type ReactElement } from "react";
import { cleanupRecovery, createGridModeDocument, createMaskModeDocument, createProjectEnvelope, discardRecoveryRecord, getLatestRecoveryRecord, restoreRecoveryRecord, withProjectMetadata, type AutosaveRecord } from "@/core";
import type { PageSetup } from "@/types/primitives";
import type { ProjectCustomerInfo } from "@/types/project";
import type { GridCreateOptions } from "@/types/grid";
import type { MaskCreateOptions } from "@/types/mask";
import type { ModeType } from "@/types/template";
import { useDocumentStore } from "@/state/documentStore";
import { useSelectionStore } from "@/state/selectionStore";
import { useViewportStore } from "@/state/viewportStore";
import { useProjectLifecycleStore } from "@/state/projectLifecycleStore";
import { HomeScreen } from "./home/HomeScreen";
import { createFreeModeDocument, loadProject } from "./projectActions";
import { DocumentSetupScreen } from "./setup/DocumentSetupScreen";

const EditorScreen = lazy(() =>
  import("./editor/EditorScreen").then((module) => ({
    default: module.EditorScreen
  }))
);

export function App(): ReactElement {
  const [screen, setScreen] = useState<"home" | "setup" | "editor">("home");
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

  const canShowEditor = useMemo(() => screen === "editor" && document !== null, [document, screen]);

  function openMode(mode: ModeType): void {
    setPendingMode(mode);
    setScreen("setup");
  }

  function createDocument(setup: PageSetup, options?: { grid?: Partial<GridCreateOptions>; mask?: Partial<MaskCreateOptions> }, customerInfo?: ProjectCustomerInfo): void {
    const name = pendingMode === "free" ? "פרויקט חופשי חדש" : `פרויקט ${pendingMode}`;
    const projectMetadata = {
      ...customerInfo,
      projectType: pendingMode === "grid" ? "Grid" : pendingMode === "mask" ? "Mask" : "Collage"
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
    if (recoveryRecord === null) {
      return;
    }
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

  if (screen === "setup") {
    return <DocumentSetupScreen modeName={pendingMode} onBack={() => setScreen("home")} onCreate={createDocument} />;
  }

  return canShowEditor ? (
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
      <HomeScreen onOpenMode={openMode} onOpenProjectFile={(file) => void openProjectFile(file)} />
    </>
  );
}
