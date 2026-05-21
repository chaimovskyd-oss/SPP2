import { useBatchStore } from "@/state/batchStore";
import { useDocumentStore } from "@/state/documentStore";
import { useDrawingToolsStore } from "@/state/drawingToolsStore";
import { useImageEditStore } from "@/state/imageEditStore";
import { useMaskContentEditStore } from "@/state/maskContentEditStore";
import { useProductStore } from "@/state/productStore";
import { useProjectLifecycleStore } from "@/state/projectLifecycleStore";
import { useSelectionStore } from "@/state/selectionStore";
import { useViewportStore } from "@/state/viewportStore";

export function resetWorkspaceForHome(): void {
  useImageEditStore.getState().exitImageEditMode();
  useImageEditStore.getState().clearSelection();
  useMaskContentEditStore.getState().exit();
  useDrawingToolsStore.getState().resetTools();
  useSelectionStore.getState().resetSelection();
  useViewportStore.getState().resetViewport();
  useDocumentStore.getState().clearDocument();
  useProjectLifecycleStore.getState().resetLifecycle();
  useProductStore.getState().clearProduct();
  useBatchStore.getState().clearJobs();
}
