import type { ReactElement } from "react";
import { useImageEditStore } from "@/state/imageEditStore";

export function ImageEditFloatingBar(): ReactElement | null {
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
    invertSelection, clearSelection
  } = useImageEditStore();

  if (activeTool === null) return null;

  return (
    <div className="image-edit-floating-bar" data-tool={activeTool}>
      {activeTool === "crop" && (
        <>
          <label className="float-param">
            <input
              type="checkbox"
              checked={cropLockRatio}
              onChange={(e) => setCropLockRatio(e.target.checked)}
            />
            נעל יחס
          </label>
        </>
      )}

      {activeTool === "eraser" && (
        <>
          <div className="float-param-group">
            <button
              className={`float-toggle ${eraserMode === "erase" ? "on" : ""}`}
              type="button"
              onClick={() => setEraserMode("erase")}
            >
              מחיקה
            </button>
            <button
              className={`float-toggle ${eraserMode === "restore" ? "on" : ""}`}
              type="button"
              onClick={() => setEraserMode("restore")}
            >
              שחזור
            </button>
          </div>
          <label className="float-param">
            גודל
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
            ריכוך
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
            עוצמה
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
            הצג מסכה
          </label>
        </>
      )}

      {activeTool === "white-bg" && (
        <>
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
        </>
      )}

      {activeTool === "wand" && (
        <>
          <label className="float-param">
            רגישות
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
            אזורים מחוברים
          </label>
          {selectionMask !== null && (
            <div className="float-param-group">
              <button className="float-toggle" type="button" onClick={invertSelection}>
                היפוך בחירה
              </button>
              <button className="float-toggle" type="button" onClick={clearSelection}>
                נקה בחירה
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
