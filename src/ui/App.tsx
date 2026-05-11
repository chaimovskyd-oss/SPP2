import { Suspense, lazy, useMemo, useState, type ReactElement } from "react";
import type { ModeType } from "@/types/template";
import { useDocumentStore } from "@/state/documentStore";
import { useSelectionStore } from "@/state/selectionStore";
import { createFreeModeDocument } from "./projectActions";
import { HomeScreen } from "./home/HomeScreen";

const EditorScreen = lazy(() =>
  import("./editor/EditorScreen").then((module) => ({
    default: module.EditorScreen
  }))
);

export function App(): ReactElement {
  const [screen, setScreen] = useState<"home" | "editor">("home");
  const document = useDocumentStore((state) => state.document);
  const setDocument = useDocumentStore((state) => state.setDocument);
  const clearSelection = useSelectionStore((state) => state.clearSelection);

  const canShowEditor = useMemo(() => screen === "editor" && document !== null, [document, screen]);

  function openMode(mode: ModeType): void {
    const name = mode === "free" ? "פרויקט חופשי חדש" : `פרויקט ${mode}`;
    setDocument(createFreeModeDocument(name));
    clearSelection();
    setScreen("editor");
  }

  function backHome(): void {
    clearSelection();
    setScreen("home");
  }

  return canShowEditor ? (
    <Suspense fallback={<main className="loading-screen">טוען את סביבת העריכה...</main>}>
      <EditorScreen onBackHome={backHome} />
    </Suspense>
  ) : (
    <HomeScreen onOpenMode={openMode} />
  );
}
