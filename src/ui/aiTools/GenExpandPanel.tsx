import { useState, type PointerEvent, type ReactElement } from "react";
import { isFalConfigured } from "@/services/ai/falAiService";
import { runGenExpand, type ExpansionAmounts } from "@/services/ai/genExpandService";
import { useAiToolsStore } from "@/state/aiToolsStore";

const DPI = 300;
const CM_TO_PX = DPI / 2.54;
const MAX_EXPANSION = 4096;
const PREVIEW_MAX_W = 320;
const PREVIEW_MAX_H = 210;

interface Preset {
  label: string;
  ratio: [number, number];
}

const PRESETS: Preset[] = [
  { label: "16:9", ratio: [16, 9] },
  { label: "4:3", ratio: [4, 3] },
  { label: "1:1", ratio: [1, 1] },
  { label: "A4 לרוחב", ratio: [297, 210] },
  { label: "A4 לאורך", ratio: [210, 297] },
];

interface GenExpandPanelProps {
  imageDataUrl: string;
  imageWidth: number;
  imageHeight: number;
  onResult: (resultDataUrl: string, options?: { expansion?: ExpansionAmounts }) => Promise<void>;
  onClose: () => void;
}

function clampExpansion(v: number): number {
  return Math.max(0, Math.min(MAX_EXPANSION, Math.round(v)));
}

function formatCm(px: number): string {
  return (px / CM_TO_PX).toFixed(1);
}

function parsePositiveNumber(value: string): number | null {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function GenExpandPanel({
  imageDataUrl,
  imageWidth,
  imageHeight,
  onResult,
  onClose,
}: GenExpandPanelProps): ReactElement {
  const [expansion, setExpansion] = useState<ExpansionAmounts>({ top: 0, right: 0, bottom: 0, left: 0 });
  const [prompt, setPrompt] = useState("");
  const [useCreative, setUseCreative] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customCm, setCustomCm] = useState({ w: "", h: "" });
  const [error, setError] = useState<string | null>(null);

  const processing = useAiToolsStore((s) => s.processing);
  const setProcessing = useAiToolsStore((s) => s.setProcessing);
  const setProgress = useAiToolsStore((s) => s.setProgress);
  const setCancelController = useAiToolsStore((s) => s.setCancelController);

  const totalW = imageWidth + expansion.left + expansion.right;
  const totalH = imageHeight + expansion.top + expansion.bottom;
  const aspect = totalW / totalH;
  const previewFitScale = Math.min(PREVIEW_MAX_W / totalW, PREVIEW_MAX_H / totalH);
  const previewW = Math.max(120, Math.round(totalW * previewFitScale));
  const previewH = Math.max(90, Math.round(totalH * previewFitScale));
  const previewScaleX = previewW / totalW;
  const previewScaleY = previewH / totalH;
  const directionsLabel = [
    expansion.top > 0 ? `למעלה ${expansion.top}px` : null,
    expansion.right > 0 ? `ימין ${expansion.right}px` : null,
    expansion.bottom > 0 ? `למטה ${expansion.bottom}px` : null,
    expansion.left > 0 ? `שמאל ${expansion.left}px` : null,
  ].filter(Boolean).join(" · ") || "ללא הרחבה";

  function setExpansionAndCm(next: ExpansionAmounts): void {
    setExpansion(next);
    setCustomCm({
      w: formatCm(imageWidth + next.left + next.right),
      h: formatCm(imageHeight + next.top + next.bottom),
    });
  }

  function setExpansionFromTargetPx(targetW: number, targetH: number): void {
    const extraW = Math.max(0, Math.round(targetW) - imageWidth);
    const extraH = Math.max(0, Math.round(targetH) - imageHeight);
    setExpansion({
      left: clampExpansion(Math.floor(extraW / 2)),
      right: clampExpansion(Math.ceil(extraW / 2)),
      top: clampExpansion(Math.floor(extraH / 2)),
      bottom: clampExpansion(Math.ceil(extraH / 2)),
    });
  }

  function applyPreset(ratio: [number, number]): void {
    const [rw, rh] = ratio;
    const targetAspect = rw / rh;
    const currentAspect = imageWidth / imageHeight;
    const newW = targetAspect > currentAspect ? Math.round(imageHeight * targetAspect) : imageWidth;
    const newH = targetAspect > currentAspect ? imageHeight : Math.round(imageWidth / targetAspect);
    setExpansionFromTargetPx(newW, newH);
    setCustomCm({ w: formatCm(newW), h: formatCm(newH) });
  }

  function applyCustomCm(nextCustomCm = customCm): void {
    const wCm = parsePositiveNumber(nextCustomCm.w) ?? totalW / CM_TO_PX;
    const hCm = parsePositiveNumber(nextCustomCm.h) ?? totalH / CM_TO_PX;
    setExpansionFromTargetPx(wCm * CM_TO_PX, hCm * CM_TO_PX);
  }

  function updateCustomCmField(field: "w" | "h", value: string): void {
    const next = { ...customCm, [field]: value };
    setCustomCm(next);
    applyCustomCm(next);
  }

  function setDir(dir: keyof ExpansionAmounts, value: number): void {
    setExpansionAndCm({ ...expansion, [dir]: clampExpansion(value) });
  }

  function dragExpandHandle(
    event: PointerEvent<HTMLButtonElement>,
    handle: Array<keyof ExpansionAmounts>
  ): void {
    if (processing) return;
    event.preventDefault();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const start = { ...expansion };
    event.currentTarget.setPointerCapture(pointerId);

    const onMove = (moveEvent: globalThis.PointerEvent): void => {
      const dxPx = (moveEvent.clientX - startX) / previewScaleX;
      const dyPx = (moveEvent.clientY - startY) / previewScaleY;
      const next = { ...start };
      if (handle.includes("left")) next.left = clampExpansion(start.left - dxPx);
      if (handle.includes("right")) next.right = clampExpansion(start.right + dxPx);
      if (handle.includes("top")) next.top = clampExpansion(start.top - dyPx);
      if (handle.includes("bottom")) next.bottom = clampExpansion(start.bottom + dyPx);
      setExpansionAndCm(next);
    };

    const onUp = (): void => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    window.addEventListener("pointercancel", onUp, { once: true });
  }

  const hasExpansion = expansion.top > 0 || expansion.right > 0 || expansion.bottom > 0 || expansion.left > 0;

  async function handleRun(): Promise<void> {
    if (!isFalConfigured()) {
      setError("לא הוגדר FAL_KEY. הגדר בהגדרות שירותי AI.");
      return;
    }
    if (!hasExpansion) {
      setError("יש להגדיר הרחבה כלשהי.");
      return;
    }
    setError(null);
    const ctrl = new AbortController();
    setCancelController(ctrl);
    setProcessing(true, 0);
    try {
      console.log("[GenExpand] Starting API call, expansion:", expansion, "useCreative:", useCreative);
      const result = await runGenExpand(
        imageDataUrl,
        expansion,
        prompt,
        useCreative,
        (pct) => setProgress(pct),
        ctrl.signal
      );
      console.log("[GenExpand] Got result, applying...");
      await onResult(result, { expansion });
      console.log("[GenExpand] Result applied successfully");
    } catch (err) {
      if ((err as DOMException).name === "AbortError") return;
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[GenExpand] Error:", msg);
      setError(msg);
    } finally {
      setProcessing(false);
      setCancelController(null);
    }
  }

  return (
    <div className="ai-panel" dir="rtl">
      <div className="ai-panel-header">
        <h3>הרחבת תמונה</h3>
        <button className="ai-panel-close" onClick={onClose} type="button" title="סגור">×</button>
      </div>

      <div className="ai-panel-body">
        <div className="ai-presets-row">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className="ai-preset-btn"
              type="button"
              onClick={() => applyPreset(p.ratio)}
              disabled={processing}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="ai-row ai-row-gap">
          <label className="ai-label-inline">
            רוחב (ס״מ):
            <input
              className="ai-input-sm"
              type="number"
              min={0}
              step={0.1}
              placeholder={formatCm(totalW)}
              value={customCm.w}
              onChange={(e) => updateCustomCmField("w", e.target.value)}
              disabled={processing}
            />
          </label>
          <label className="ai-label-inline">
            גובה (ס״מ):
            <input
              className="ai-input-sm"
              type="number"
              min={0}
              step={0.1}
              placeholder={formatCm(totalH)}
              value={customCm.h}
              onChange={(e) => updateCustomCmField("h", e.target.value)}
              disabled={processing}
            />
          </label>
          <button className="ai-btn-secondary" type="button" onClick={() => applyCustomCm()} disabled={processing}>
            החל
          </button>
        </div>

        <div className="ai-expand-preview">
          <div
            className="ai-expand-preview-canvas"
            style={{ width: previewW, height: previewH }}
            aria-label="תצוגת הרחבת תמונה"
          >
            <div className="ai-expand-preview-fill" />
            <div
              className="ai-expand-preview-image"
              style={{
                left: `${(expansion.left / totalW) * 100}%`,
                top: `${(expansion.top / totalH) * 100}%`,
                width: `${(imageWidth / totalW) * 100}%`,
                height: `${(imageHeight / totalH) * 100}%`,
                backgroundImage: `url("${imageDataUrl}")`,
              }}
            />
            <button className="ai-expand-handle ai-expand-handle-top" type="button" onPointerDown={(e) => dragExpandHandle(e, ["top"])} disabled={processing} aria-label="גרור להרחבה למעלה" />
            <button className="ai-expand-handle ai-expand-handle-right" type="button" onPointerDown={(e) => dragExpandHandle(e, ["right"])} disabled={processing} aria-label="גרור להרחבה ימינה" />
            <button className="ai-expand-handle ai-expand-handle-bottom" type="button" onPointerDown={(e) => dragExpandHandle(e, ["bottom"])} disabled={processing} aria-label="גרור להרחבה למטה" />
            <button className="ai-expand-handle ai-expand-handle-left" type="button" onPointerDown={(e) => dragExpandHandle(e, ["left"])} disabled={processing} aria-label="גרור להרחבה שמאלה" />
            <button className="ai-expand-corner ai-expand-corner-tl" type="button" onPointerDown={(e) => dragExpandHandle(e, ["top", "left"])} disabled={processing} aria-label="גרור להרחבה למעלה ושמאלה" />
            <button className="ai-expand-corner ai-expand-corner-tr" type="button" onPointerDown={(e) => dragExpandHandle(e, ["top", "right"])} disabled={processing} aria-label="גרור להרחבה למעלה וימינה" />
            <button className="ai-expand-corner ai-expand-corner-br" type="button" onPointerDown={(e) => dragExpandHandle(e, ["bottom", "right"])} disabled={processing} aria-label="גרור להרחבה למטה וימינה" />
            <button className="ai-expand-corner ai-expand-corner-bl" type="button" onPointerDown={(e) => dragExpandHandle(e, ["bottom", "left"])} disabled={processing} aria-label="גרור להרחבה למטה ושמאלה" />
          </div>
        </div>

        <div className="ai-expand-grid">
          {(["top", "right", "bottom", "left"] as const).map((dir) => {
            const labels: Record<string, string> = { top: "למעלה", right: "ימין", bottom: "למטה", left: "שמאל" };
            return (
              <label key={dir} className="ai-expand-field">
                <span>{labels[dir]} (px)</span>
                <input
                  type="number"
                  min={0}
                  max={MAX_EXPANSION}
                  value={expansion[dir]}
                  onChange={(e) => setDir(dir, Number(e.target.value))}
                  disabled={processing}
                />
              </label>
            );
          })}
        </div>

        <p className="ai-size-hint">
          גודל חדש: {totalW} × {totalH}px · {formatCm(totalW)} × {formatCm(totalH)} ס״מ · יחס {aspect.toFixed(3)}
          <br />
          כיוונים: {directionsLabel}
        </p>

        <button className="ai-link-btn" type="button" onClick={() => setShowAdvanced((v) => !v)}>
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
              <span>שימוש ב-Flux Fill (מאפשר prompt)</span>
            </label>
            <label className="ai-label">
              תיאור מה להוסיף (Flux בלבד):
              <input
                className="ai-input"
                type="text"
                placeholder="לדוגמה: שמיים כחולים, ספסל, יער..."
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
          disabled={processing || !hasExpansion}
        >
          {processing ? "מרחיב..." : "הרחב תמונה"}
        </button>
      </div>
    </div>
  );
}
