import { Check, Crop, Eraser, RectangleHorizontal, RotateCcw, Scissors, Wand2, X } from "lucide-react";
import type { ReactElement } from "react";
import { useImageEditStore, type ImageEditTool } from "@/state/imageEditStore";

interface ImageEditToolbarProps {
  onApply: () => void;
  onCancel: () => void;
  onResetCrop: () => void;
  onResetMask: () => void;
  onDeleteSelection: () => void;
}

export function ImageEditToolbar({
  onApply,
  onCancel,
  onResetCrop,
  onResetMask,
  onDeleteSelection
}: ImageEditToolbarProps): ReactElement {
  const activeTool = useImageEditStore((s) => s.activeTool);
  const selectionMask = useImageEditStore((s) => s.selectionMask);
  const setActiveTool = useImageEditStore((s) => s.setActiveTool);
  const hasSelection = selectionMask !== null;

  function toolBtn(tool: ImageEditTool, icon: ReactElement, label: string): ReactElement {
    return (
      <button
        className={`context-icon ${activeTool === tool ? "on" : ""}`}
        title={label}
        type="button"
        onClick={() => setActiveTool(activeTool === tool ? null : tool)}
      >
        {icon}
        <span className="ctx-btn-label">{label}</span>
      </button>
    );
  }

  return (
    <section className="context-toolbar image-edit-mode" aria-label="Image edit toolbar" data-testid="image-edit-toolbar">
      <span className="context-toolbar-label">עריכת תמונה</span>

      <div className="context-group">
        {toolBtn("crop", <Crop size={14} />, "קרופ")}
        {toolBtn("eraser", <Eraser size={14} />, "מחיקה")}
        {toolBtn("white-bg", <Scissors size={14} />, "הסר רקע לבן")}
        {toolBtn("wand", <Wand2 size={14} />, "שרביט קסם")}
        {toolBtn("rect-select", <RectangleHorizontal size={14} />, "בחירה מרובעת")}
      </div>

      <div className="context-group">
        {activeTool === "crop" && (
          <button className="context-icon" title="איפוס קרופ" type="button" onClick={onResetCrop}>
            <RotateCcw size={14} />
            <span className="ctx-btn-label">איפוס קרופ</span>
          </button>
        )}
        {(activeTool === "eraser" || activeTool === "wand" || activeTool === "rect-select") && (
          <button className="context-icon" title="איפוס מסכה" type="button" onClick={onResetMask}>
            <RotateCcw size={14} />
            <span className="ctx-btn-label">איפוס מסכה</span>
          </button>
        )}
        {/* Delete selection — active for wand/rect-select with active selection */}
        {hasSelection && (activeTool === "wand" || activeTool === "rect-select") && (
          <button
            className="context-icon danger"
            title="מחק בחירה (Delete)"
            type="button"
            onClick={onDeleteSelection}
          >
            <Scissors size={14} />
            <span className="ctx-btn-label">מחק בחירה</span>
          </button>
        )}
      </div>

      <div className="context-group" style={{ marginInlineStart: "auto" }}>
        <button className="context-icon danger" title="בטל (Escape)" type="button" onClick={onCancel}>
          <X size={14} />
          <span className="ctx-btn-label">בטל</span>
        </button>
        <button className="context-icon on" title="החל שינויים" type="button" onClick={onApply}>
          <Check size={14} />
          <span className="ctx-btn-label">החל</span>
        </button>
      </div>
    </section>
  );
}
