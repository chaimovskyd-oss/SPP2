import { Suspense, lazy, useMemo, useState, type ReactElement } from "react";
import { cleanupRecovery, createGridModeDocument, getLatestRecoveryRecord, restoreRecoveryRecord, type AutosaveRecord } from "@/core";
import type { PageSetup } from "@/types/primitives";
import type { GridCreateOptions } from "@/types/grid";
import type { ModeType } from "@/types/template";
import { useDocumentStore } from "@/state/documentStore";
import { useSelectionStore } from "@/state/selectionStore";
import { useViewportStore } from "@/state/viewportStore";
import { HomeScreen } from "./home/HomeScreen";
import { createFreeModeDocument } from "./projectActions";
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
  const clearSelection = useSelectionStore((state) => state.clearSelection);
  const resetViewport = useViewportStore((state) => state.resetViewport);

  const canShowEditor = useMemo(() => screen === "editor" && document !== null, [document, screen]);

  function openMode(mode: ModeType): void {
    setPendingMode(mode);
    setScreen("setup");
  }

  function createDocument(setup: PageSetup, gridOptions?: Partial<GridCreateOptions>): void {
    const name = pendingMode === "free" ? "פרויקט חופשי חדש" : `פרויקט ${pendingMode}`;
    setDocument(pendingMode === "grid" ? createGridModeDocument(name, setup, gridOptions) : createFreeModeDocument(name, setup));
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
    setDocument(envelope.document);
    resetViewport();
    clearSelection();
    setRecoveryRecord(null);
    setScreen("editor");
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
          <button className="btn btn-ghost" onClick={() => setRecoveryRecord(null)} type="button">התעלם</button>
        </div>
      ) : null}
      <HomeScreen onOpenMode={openMode} />
    </>
  );
}
