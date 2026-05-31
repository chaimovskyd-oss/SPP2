import { useState, type ReactElement } from "react";
import { isFalConfigured } from "@/services/ai/falAiService";
import { runRestoration, type RestorationMode } from "@/services/ai/restorationService";
import { useAiToolsStore } from "@/state/aiToolsStore";

interface RestorationPanelProps {
  imageDataUrl: string;
  onResult: (resultDataUrl: string) => Promise<void>;
  onClose: () => void;
}

export function RestorationPanel({ imageDataUrl, onResult, onClose }: RestorationPanelProps): ReactElement {
  const [mode, setMode] = useState<RestorationMode>("topaz-recovery");
  const [error, setError] = useState<string | null>(null);

  const processing = useAiToolsStore((s) => s.processing);
  const setProcessing = useAiToolsStore((s) => s.setProcessing);
  const setProgress = useAiToolsStore((s) => s.setProgress);
  const setCancelController = useAiToolsStore((s) => s.setCancelController);

  async function handleRun(): Promise<void> {
    if (!isFalConfigured()) {
      setError("לא הוגדר FAL_KEY. הגדר ב'הגדרות → שירותי AI'.");
      return;
    }
    setError(null);
    const ctrl = new AbortController();
    setCancelController(ctrl);
    setProcessing(true, 0);
    try {
      console.log("[Restore] Starting API call, mode:", mode);
      const result = await runRestoration(
        imageDataUrl,
        mode,
        (pct) => setProgress(pct),
        ctrl.signal
      );
      console.log("[Restore] Got result, applying...");
      await onResult(result);
      console.log("[Restore] Result applied successfully");
    } catch (err) {
      if ((err as DOMException).name === "AbortError") return;
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Restore] Error:", msg);
      setError(msg);
    } finally {
      setProcessing(false);
      setCancelController(null);
    }
  }

  return (
    <div className="ai-panel" dir="rtl">
      <div className="ai-panel-header">
        <h3>שחזור תמונה</h3>
        <button className="ai-panel-close" onClick={onClose} type="button" title="סגור">✕</button>
      </div>

      <div className="ai-panel-body">
        <fieldset className="ai-fieldset">
          <legend>מצב שחזור</legend>
          <label className="ai-radio-row">
            <input
              type="radio"
              name="restore-mode"
              value="topaz-recovery"
              checked={mode === "topaz-recovery"}
              onChange={() => setMode("topaz-recovery")}
              disabled={processing}
            />
            <span>
              <strong>איכות מקסימלית</strong> — Topaz Recovery V2
              <br />
              <small>מתאים לתמונות פגומות מאוד: רעש גבוה, blur, ישנות</small>
            </span>
          </label>
          <label className="ai-radio-row">
            <input
              type="radio"
              name="restore-mode"
              value="real-esrgan"
              checked={mode === "real-esrgan"}
              onChange={() => setMode("real-esrgan")}
              disabled={processing}
            />
            <span>
              <strong>מהיר</strong> — Real-ESRGAN
              <br />
              <small>שחזור כללי: ישנות, compression artifacts, פנים</small>
            </span>
          </label>
        </fieldset>

        {error && <p className="ai-error">{error}</p>}

        <button
          className="ai-btn-primary"
          type="button"
          onClick={() => void handleRun()}
          disabled={processing}
        >
          {processing ? "משחזר..." : "שחזר תמונה"}
        </button>
      </div>
    </div>
  );
}
