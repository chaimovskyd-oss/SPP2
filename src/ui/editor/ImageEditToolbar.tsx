import { Brush, Check, Copy, Crop, Eraser, RectangleHorizontal, RotateCcw, Scissors, Sparkles, Trash2, Wand2, X } from "lucide-react";
import type { ReactElement } from "react";
import { useImageEditStore, type ImageEditTool } from "@/state/imageEditStore";
import type { AiTool } from "@/state/aiToolsStore";
import { warmSdEngine, type ContentFillEngine } from "@/services/ai/contentAwareFillService";

const FILL_ENGINE_OPTIONS: { value: ContentFillEngine; label: string }[] = [
  { value: "auto", label: "מילוי: אוטומטי" },
  { value: "lama", label: "מילוי: LaMa (מהיר)" },
  { value: "sd_inpaint", label: "מילוי: SD (איכותי)" },
  { value: "texture_fill", label: "מילוי: טקסטורה (דשא/דפוס)" },
  { value: "quick_heal", label: "מילוי: תיקון מהיר" }
];

interface ImageEditToolbarProps {
  onApply: () => void;
  onCancel: () => void;
  onResetCrop: () => void;
  onResetMask: () => void;
  onAiFillSelection: () => void;
  onDeleteSelection: () => void;
  onCopySelection: () => void;
  onCutSelection: () => void;
  onClearSelection: () => void;
  onOpenAiTool?: (tool: AiTool) => void;
  onOpenAiStyles?: () => void;
}

function isSelectionTool(tool: ImageEditTool | null): boolean {
  return tool === "wand" || tool === "rect-select" || tool === "smart-select" || tool === "brush-select" || tool === "lasso";
}

export function ImageEditToolbar({
  onApply,
  onCancel,
  onResetCrop,
  onResetMask,
  onAiFillSelection,
  onDeleteSelection,
  onCopySelection,
  onCutSelection,
  onClearSelection,
  onOpenAiTool,
  onOpenAiStyles
}: ImageEditToolbarProps): ReactElement {
  const activeTool = useImageEditStore((s) => s.activeTool);
  const selectionMask = useImageEditStore((s) => s.selectionMask);
  const setActiveTool = useImageEditStore((s) => s.setActiveTool);
  const hasSelection = selectionMask !== null;
  const selectionBrushSize = useImageEditStore((s) => s.selectionBrushSize);
  const setSelectionBrushSize = useImageEditStore((s) => s.setSelectionBrushSize);
  const selectionBrushMode = useImageEditStore((s) => s.selectionBrushMode);
  const setSelectionBrushMode = useImageEditStore((s) => s.setSelectionBrushMode);
  const aiFillWorking = useImageEditStore((s) => s.aiFillStatus === "working" || s.aiFillStatus === "preparing");
  const contentFillEngine = useImageEditStore((s) => s.contentFillEngine);
  const setContentFillEngine = useImageEditStore((s) => s.setContentFillEngine);

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
      <span className="context-toolbar-label">Image Edit</span>

      <div className="context-group">
        {toolBtn("crop", <Crop size={14} />, "Crop")}
        {toolBtn("eraser", <Eraser size={14} />, "Eraser")}
        {toolBtn("white-bg", <Scissors size={14} />, "Remove white background")}
        {toolBtn("smart-select", <Sparkles size={14} />, "Smart Select")}
        {toolBtn("wand", <Wand2 size={14} />, "Magic Wand")}
        {toolBtn("rect-select", <RectangleHorizontal size={14} />, "Rect Select")}
        {toolBtn("brush-select", <Brush size={14} />, "מכחול סימון")}
      </div>

      {activeTool === "brush-select" && (
        <div className="context-group">
          <label className="ctx-slider" title="גודל מכחול">
            <span className="ctx-btn-label">גודל</span>
            <input
              type="range"
              min={4}
              max={300}
              value={selectionBrushSize}
              onChange={(e) => setSelectionBrushSize(Number(e.target.value))}
            />
            <span className="ctx-btn-label" style={{ minWidth: 26, textAlign: "center" }}>{selectionBrushSize}</span>
          </label>
          <button
            className={`context-icon ${selectionBrushMode === "add" ? "on" : ""}`}
            title="הוסף לבחירה"
            type="button"
            onClick={() => setSelectionBrushMode("add")}
          >
            <span className="ctx-btn-label">+ הוסף</span>
          </button>
          <button
            className={`context-icon ${selectionBrushMode === "subtract" ? "on" : ""}`}
            title="הסר מהבחירה"
            type="button"
            onClick={() => setSelectionBrushMode("subtract")}
          >
            <span className="ctx-btn-label">− הסר</span>
          </button>
        </div>
      )}

      <div className="context-group">
        {activeTool === "crop" && (
          <button className="context-icon" title="Reset crop" type="button" onClick={onResetCrop}>
            <RotateCcw size={14} />
            <span className="ctx-btn-label">Reset Crop</span>
          </button>
        )}
        {(activeTool === "eraser" || isSelectionTool(activeTool)) && (
          <button className="context-icon" title="Reset mask" type="button" onClick={onResetMask}>
            <RotateCcw size={14} />
            <span className="ctx-btn-label">Reset Mask</span>
          </button>
        )}
        {hasSelection && isSelectionTool(activeTool) && (
          <>
            <button className="context-icon" title="Copy selection to new layer" type="button" onClick={onCopySelection}>
              <Copy size={14} />
              <span className="ctx-btn-label">Copy Layer</span>
            </button>
            <button className="context-icon" title="Cut selection to new layer" type="button" onClick={onCutSelection}>
              <Scissors size={14} />
              <span className="ctx-btn-label">Cut Layer</span>
            </button>
            <select
              className="context-select"
              title="בחירת מנוע מילוי"
              value={contentFillEngine}
              onChange={(e) => {
                const engine = e.target.value as ContentFillEngine;
                setContentFillEngine(engine);
                if (engine === "sd_inpaint") void warmSdEngine();
              }}
            >
              {FILL_ENGINE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button className="context-icon" title="הסר את הבחירה ומלא באופן טבעי (Shift+F5)" type="button" disabled={aiFillWorking} onClick={onAiFillSelection}>
              <Sparkles size={14} />
              <span className="ctx-btn-label">{contentFillEngine === "sd_inpaint" ? "מילוי איכותי" : "מילוי חכם"}</span>
            </button>
            <button className="context-icon danger" title="Delete selection" type="button" onClick={onDeleteSelection}>
              <Trash2 size={14} />
              <span className="ctx-btn-label">Delete</span>
            </button>
            <button className="context-icon" title="Clear selection" type="button" onClick={onClearSelection}>
              <X size={14} />
              <span className="ctx-btn-label">Clear</span>
            </button>
          </>
        )}
      </div>

      {onOpenAiTool && (
        <div className="context-group">
          {onOpenAiStyles && (
            <button className="context-icon" title="ספריית אפקטים AI" type="button" onClick={onOpenAiStyles}>
              <Sparkles size={14} />
              <span className="ctx-btn-label">AI FX</span>
            </button>
          )}
          <span className="ctx-btn-label" style={{ opacity: 0.6 }}>✨ AI</span>
          <button className="context-icon" title="הרחב תמונה" type="button" onClick={() => onOpenAiTool("expand")}>
            <span className="ctx-btn-label">הרחב</span>
          </button>
          <button className="context-icon" title="הסר אובייקט" type="button" onClick={() => onOpenAiTool("remove")}>
            <span className="ctx-btn-label">הסר</span>
          </button>
          <button className="context-icon" title="שפר רזולוציה" type="button" onClick={() => onOpenAiTool("upscale")}>
            <span className="ctx-btn-label">שפר</span>
          </button>
          <button className="context-icon" title="שחזר תמונה" type="button" onClick={() => onOpenAiTool("restore")}>
            <span className="ctx-btn-label">שחזר</span>
          </button>
        </div>
      )}

      <div className="context-group" style={{ marginInlineStart: "auto" }}>
        <button className="context-icon danger" title="Cancel" type="button" onClick={onCancel}>
          <X size={14} />
          <span className="ctx-btn-label">Cancel</span>
        </button>
        <button className="context-icon on" title="Apply changes" type="button" onClick={onApply}>
          <Check size={14} />
          <span className="ctx-btn-label">Apply</span>
        </button>
      </div>
    </section>
  );
}
