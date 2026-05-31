import { useState, useRef, useEffect, useCallback, type ReactElement } from "react";
import { isFalConfigured } from "@/services/ai/falAiService";
import { runObjectRemove } from "@/services/ai/objectRemoveService";
import { useAiToolsStore } from "@/state/aiToolsStore";

type MaskTool = "rect" | "brush" | "wand";

interface ObjectRemovePanelProps {
  imageDataUrl: string;
  imageWidth: number;
  imageHeight: number;
  onResult: (resultDataUrl: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Build a binary mask PNG from an RGBA mask canvas (alpha channel = selection).
 */
function canvasToMaskDataUrl(maskCanvas: HTMLCanvasElement): string {
  const { width, height } = maskCanvas;
  const ctx = maskCanvas.getContext("2d")!;
  const src = ctx.getImageData(0, 0, width, height);

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const octx = out.getContext("2d")!;
  const dst = octx.createImageData(width, height);

  for (let i = 0; i < src.data.length; i += 4) {
    const alpha = src.data[i + 3];
    const val = alpha > 128 ? 255 : 0;
    dst.data[i] = val;
    dst.data[i + 1] = val;
    dst.data[i + 2] = val;
    dst.data[i + 3] = 255;
  }
  octx.putImageData(dst, 0, 0);
  return out.toDataURL("image/png");
}

const DISPLAY_MAX = 480;

export function ObjectRemovePanel({
  imageDataUrl,
  imageWidth,
  imageHeight,
  onResult,
  onClose,
}: ObjectRemovePanelProps): ReactElement {
  const [activeTool, setActiveTool] = useState<MaskTool>("rect");
  const [brushSize, setBrushSize] = useState(30);
  const [hasMask, setHasMask] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [useCreative, setUseCreative] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const rectStartRef = useRef<{ x: number; y: number } | null>(null);

  const processing = useAiToolsStore((s) => s.processing);
  const setProcessing = useAiToolsStore((s) => s.setProcessing);
  const setProgress = useAiToolsStore((s) => s.setProgress);
  const setCancelController = useAiToolsStore((s) => s.setCancelController);

  // Display scale
  const aspectRatio = imageHeight / imageWidth;
  const displayW = Math.min(DISPLAY_MAX, imageWidth);
  const displayH = Math.round(displayW * aspectRatio);
  const scaleX = imageWidth / displayW;
  const scaleY = imageHeight / displayH;

  // Initialize canvases
  useEffect(() => {
    const canvas = canvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    if (!canvas || !maskCanvas) return;

    canvas.width = displayW;
    canvas.height = displayH;
    maskCanvas.width = imageWidth;
    maskCanvas.height = imageHeight;

    const ctx = canvas.getContext("2d")!;
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, displayW, displayH);
    img.src = imageDataUrl;
  }, [imageDataUrl, displayW, displayH, imageWidth, imageHeight]);

  function getCanvasPoint(e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (displayW / rect.width),
      y: (e.clientY - rect.top) * (displayH / rect.height),
    };
  }

  function paintBrushAt(cx: number, cy: number): void {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const mctx = maskCanvas.getContext("2d")!;
    const mx = cx * scaleX;
    const my = cy * scaleY;
    const mr = (brushSize / 2) * scaleX;

    mctx.globalCompositeOperation = "source-over";
    mctx.fillStyle = "rgba(255, 0, 0, 1)";
    mctx.beginPath();
    mctx.arc(mx, my, mr, 0, Math.PI * 2);
    mctx.fill();

    // Mirror to display canvas (semi-transparent red)
    const dctx = canvasRef.current!.getContext("2d")!;
    dctx.globalCompositeOperation = "source-over";
    dctx.fillStyle = "rgba(255, 0, 0, 0.4)";
    dctx.beginPath();
    dctx.arc(cx, cy, brushSize / 2, 0, Math.PI * 2);
    dctx.fill();

    setHasMask(true);
  }

  function applyRectMask(sx: number, sy: number, ex: number, ey: number): void {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    const x = Math.min(sx, ex);
    const y = Math.min(sy, ey);
    const w = Math.abs(ex - sx);
    const h = Math.abs(ey - sy);

    const mctx = maskCanvas.getContext("2d")!;
    mctx.fillStyle = "rgba(255, 0, 0, 1)";
    mctx.fillRect(x * scaleX, y * scaleY, w * scaleX, h * scaleY);

    const dctx = canvasRef.current!.getContext("2d")!;
    dctx.fillStyle = "rgba(255, 0, 0, 0.4)";
    dctx.fillRect(x, y, w, h);

    setHasMask(true);
  }

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>): void => {
    const pt = getCanvasPoint(e);
    drawingRef.current = true;
    if (activeTool === "brush") {
      paintBrushAt(pt.x, pt.y);
    } else if (activeTool === "rect") {
      rectStartRef.current = pt;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, brushSize, scaleX, scaleY]);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!drawingRef.current) return;
    const pt = getCanvasPoint(e);
    if (activeTool === "brush") paintBrushAt(pt.x, pt.y);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, brushSize, scaleX, scaleY]);

  const onMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>): void => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (activeTool === "rect" && rectStartRef.current) {
      const pt = getCanvasPoint(e);
      applyRectMask(rectStartRef.current.x, rectStartRef.current.y, pt.x, pt.y);
      rectStartRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, scaleX, scaleY]);

  function clearMask(): void {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    maskCanvas.getContext("2d")!.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

    // Redraw image on display canvas
    const ctx = canvasRef.current!.getContext("2d")!;
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, displayW, displayH);
    img.src = imageDataUrl;
    setHasMask(false);
  }

  async function handleRun(): Promise<void> {
    if (!isFalConfigured()) {
      setError("לא הוגדר FAL_KEY. הגדר ב'הגדרות → שירותי AI'.");
      return;
    }
    if (!hasMask) {
      setError("יש לסמן תחילה את האזור להסרה.");
      return;
    }
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;

    const maskDataUrl = canvasToMaskDataUrl(maskCanvas);
    setError(null);
    const ctrl = new AbortController();
    setCancelController(ctrl);
    setProcessing(true, 0);
    try {
      console.log("[ObjectRemove] Starting API call, useCreative:", useCreative);
      const result = await runObjectRemove(
        imageDataUrl,
        maskDataUrl,
        prompt,
        useCreative,
        (pct) => setProgress(pct),
        ctrl.signal
      );
      console.log("[ObjectRemove] Got result, applying...");
      await onResult(result);
      console.log("[ObjectRemove] Result applied successfully");
    } catch (err) {
      if ((err as DOMException).name === "AbortError") return;
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[ObjectRemove] Error:", msg);
      setError(msg);
    } finally {
      setProcessing(false);
      setCancelController(null);
    }
  }

  return (
    <div className="ai-panel ai-panel-wide" dir="rtl">
      <div className="ai-panel-header">
        <h3>הסרת אובייקט</h3>
        <button className="ai-panel-close" onClick={onClose} type="button" title="סגור">✕</button>
      </div>

      <div className="ai-panel-body">
        {/* Tool selector */}
        <div className="ai-tool-bar">
          {(["rect", "brush"] as MaskTool[]).map((t) => (
            <button
              key={t}
              className={`ai-tool-btn ${activeTool === t ? "active" : ""}`}
              type="button"
              onClick={() => setActiveTool(t)}
              disabled={processing}
            >
              {t === "rect" ? "מלבן" : "מכחול"}
            </button>
          ))}
          {activeTool === "brush" && (
            <label className="ai-slider-label">
              גודל:
              <input
                type="range"
                min={5}
                max={120}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                disabled={processing}
              />
              <span>{brushSize}px</span>
            </label>
          )}
          <button
            className="ai-tool-btn"
            type="button"
            onClick={clearMask}
            disabled={processing}
            title="נקה סימון"
          >
            נקה
          </button>
        </div>

        <p className="ai-hint">סמן את האזור שברצונך להסיר</p>

        {/* Canvas */}
        <div className="ai-canvas-wrap" style={{ width: displayW, height: displayH }}>
          <canvas
            ref={canvasRef}
            style={{ width: displayW, height: displayH, cursor: activeTool === "brush" ? "crosshair" : "default" }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          />
          {/* Hidden full-res mask canvas */}
          <canvas ref={maskCanvasRef} style={{ display: "none" }} />
        </div>

        {/* Advanced mode */}
        <button
          className="ai-link-btn"
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? "הסתר מצב מתקדם ▲" : "מצב מתקדם ▼"}
        </button>
        {showAdvanced && (
          <div className="ai-advanced">
            <label className="ai-checkbox-row">
              <input
                type="checkbox"
                checked={useCreative}
                onChange={(e) => setUseCreative(e.target.checked)}
                disabled={processing}
              />
              <span>השתמש ב-Flux Fill (ציור יצירתי)</span>
            </label>
            <label className="ai-label">
              תיאור מה להוסיף במקום (Flux בלבד):
              <input
                className="ai-input"
                type="text"
                placeholder="לדוגמה: דשא ירוק, שמיים כחולים..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={processing || !useCreative}
              />
            </label>
          </div>
        )}

        {error && <p className="ai-error">{error}</p>}

        <button
          className="ai-btn-primary"
          type="button"
          onClick={() => void handleRun()}
          disabled={processing || !hasMask}
        >
          {processing ? "מסיר..." : "הסר אובייקט"}
        </button>
      </div>
    </div>
  );
}
