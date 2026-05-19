import type { ReactElement } from "react";
import { useImageEditStore } from "@/state/imageEditStore";

interface ImageEditFloatingBarProps {
  onSmartAutoSelect?: () => void;
  onSmartRefine?: () => void;
}

export function ImageEditFloatingBar({
  onSmartAutoSelect,
  onSmartRefine
}: ImageEditFloatingBarProps = {}): ReactElement | null {
  const {
    activeTool,
    cropLockRatio, setCropLockRatio,
    eraserMode, setEraserMode,
    eraserSize, setEraserSize,
    eraserFeather, setEraserFeather,
    eraserStrength, setEraserStrength,
    showMask, setShowMask,
    whiteBackgroundThreshold, setWhiteBackgroundThreshold,
    wandTolerance, setWandTolerance,
    wandContiguous, setWandContiguous,
    selectionMask,
    invertSelection, clearSelection,
    smartSelectionMode, setSmartSelectionMode,
    smartSelectionSoftness, setSmartSelectionSoftness,
    smartSelectionStatus,
    smartSelectionMessage,
    smartSelectionProgress,
    clearSmartSelectionPrompts,
    aiFillStatus,
    aiFillMessage,
    aiFillProgress
  } = useImageEditStore();

  if (activeTool === null) return null;

  return (
    <div className="image-edit-floating-bar" data-tool={activeTool}>
      {activeTool === "crop" && (
        <label className="float-param">
          <input
            type="checkbox"
            checked={cropLockRatio}
            onChange={(e) => setCropLockRatio(e.target.checked)}
          />
          Lock ratio
        </label>
      )}

      {activeTool === "eraser" && (
        <>
          <div className="float-param-group">
            <button
              className={`float-toggle ${eraserMode === "erase" ? "on" : ""}`}
              type="button"
              onClick={() => setEraserMode("erase")}
            >
              Erase
            </button>
            <button
              className={`float-toggle ${eraserMode === "restore" ? "on" : ""}`}
              type="button"
              onClick={() => setEraserMode("restore")}
            >
              Restore
            </button>
          </div>
          <label className="float-param">
            Size
            <input
              type="range"
              min={4}
              max={200}
              value={eraserSize}
              onChange={(e) => setEraserSize(Number(e.target.value))}
            />
            <span>{eraserSize}px</span>
          </label>
          <label className="float-param">
            Feather
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={eraserFeather}
              onChange={(e) => setEraserFeather(Number(e.target.value))}
            />
          </label>
          <label className="float-param">
            Strength
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={eraserStrength}
              onChange={(e) => setEraserStrength(Number(e.target.value))}
            />
          </label>
          <label className="float-param">
            <input
              type="checkbox"
              checked={showMask}
              onChange={(e) => setShowMask(e.target.checked)}
            />
            Show mask
          </label>
        </>
      )}

      {activeTool === "white-bg" && (
        <label className="float-param">
          Threshold
          <input
            type="range"
            min={5}
            max={55}
            value={whiteBackgroundThreshold}
            onChange={(e) => setWhiteBackgroundThreshold(Number(e.target.value))}
          />
          <span>{whiteBackgroundThreshold}</span>
        </label>
      )}

      {activeTool === "smart-select" && (
        <>
          <div className="float-param-group">
            <button
              className={`float-toggle ${smartSelectionMode === "add" ? "on" : ""}`}
              type="button"
              onClick={() => setSmartSelectionMode("add")}
            >
              Add
            </button>
            <button
              className={`float-toggle ${smartSelectionMode === "remove" ? "on" : ""}`}
              type="button"
              onClick={() => setSmartSelectionMode("remove")}
            >
              Remove
            </button>
          </div>
          <div className="float-param-group">
            <button className="float-toggle" type="button" onClick={onSmartAutoSelect}>
              Select Object
            </button>
            <button className="float-toggle" type="button" disabled={selectionMask === null} onClick={onSmartRefine}>
              Refine Edges
            </button>
          </div>
          <div className="float-param-group" aria-label="Edge softness">
            {(["sharp", "natural", "soft"] as const).map((softness) => (
              <button
                key={softness}
                className={`float-toggle ${smartSelectionSoftness === softness ? "on" : ""}`}
                type="button"
                onClick={() => setSmartSelectionSoftness(softness)}
              >
                {softness}
              </button>
            ))}
          </div>
          <button className="float-toggle" type="button" onClick={clearSmartSelectionPrompts}>
            Clear Points
          </button>
          <div className="smart-selection-status">
            <span>{smartSelectionMessage ?? smartSelectionStatus}</span>
            {smartSelectionProgress !== null && (
              <div className="smart-selection-progress" aria-label={smartSelectionProgress.message}>
                <div className="smart-selection-progress-track">
                  <span
                    className={smartSelectionProgress.percent == null ? "indeterminate" : ""}
                    style={smartSelectionProgress.percent == null ? undefined : { width: `${Math.max(0, Math.min(100, smartSelectionProgress.percent))}%` }}
                  />
                </div>
                <span className="smart-selection-progress-text">
                  {formatSmartSelectionProgress(smartSelectionProgress)}
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {activeTool === "wand" && (
        <>
          <label className="float-param">
            Tolerance
            <input
              type="range"
              min={1}
              max={100}
              value={wandTolerance}
              onChange={(e) => setWandTolerance(Number(e.target.value))}
            />
            <span>{wandTolerance}</span>
          </label>
          <label className="float-param">
            <input
              type="checkbox"
              checked={wandContiguous}
              onChange={(e) => setWandContiguous(e.target.checked)}
            />
            Contiguous
          </label>
          {selectionMask !== null && (
            <div className="float-param-group">
              <button className="float-toggle" type="button" onClick={invertSelection}>
                Invert Selection
              </button>
              <button className="float-toggle" type="button" onClick={clearSelection}>
                Clear Selection
              </button>
            </div>
          )}
        </>
      )}

      {(activeTool === "rect-select" || activeTool === "smart-select") && selectionMask !== null && (
        <div className="float-param-group">
          <button className="float-toggle" type="button" onClick={invertSelection}>
            Invert Selection
          </button>
          <button className="float-toggle" type="button" onClick={clearSelection}>
            Clear Selection
          </button>
        </div>
      )}

      {selectionMask !== null && aiFillStatus !== "idle" && (
        <div className="smart-selection-status">
          <span>{aiFillMessage ?? aiFillStatus}</span>
          {aiFillProgress !== null && (
            <div className="smart-selection-progress" aria-label={aiFillProgress.message}>
              <div className="smart-selection-progress-track">
                <span
                  className={aiFillProgress.percent == null ? "indeterminate" : ""}
                  style={aiFillProgress.percent == null ? undefined : { width: `${Math.max(0, Math.min(100, aiFillProgress.percent))}%` }}
                />
              </div>
              <span className="smart-selection-progress-text">
                {formatSmartSelectionProgress(aiFillProgress)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatSmartSelectionProgress(progress: { message: string; percent?: number | null; bytesDone?: number | null; bytesTotal?: number | null }): string {
  if (typeof progress.percent === "number") {
    return `${progress.message} ${Math.round(progress.percent)}%`;
  }
  return progress.message;
}
