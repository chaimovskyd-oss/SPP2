import { useState, type ReactElement } from "react";
import { TOPAZ_MODELS, type TopazModelId } from "@/services/ai/falModels.config";
import { isFalConfigured } from "@/services/ai/falAiService";
import { runUpscale } from "@/services/ai/upscaleService";
import { useAiToolsStore } from "@/state/aiToolsStore";

interface UpscalePanelProps {
  imageDataUrl: string;
  onResult: (resultDataUrl: string) => Promise<void>;
  onClose: () => void;
}

export function UpscalePanel({ imageDataUrl, onResult, onClose }: UpscalePanelProps): ReactElement {
  const [topazModel, setTopazModel] = useState<TopazModelId>("Standard V2");
  const [scale, setScale] = useState<2 | 4>(2);
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
      console.log("[Upscale] Starting API call, model:", topazModel, "scale:", scale);
      const result = await runUpscale(
        imageDataUrl,
        topazModel,
        scale,
        true,
        (pct) => setProgress(pct),
        ctrl.signal
      );
      console.log("[Upscale] Got result, applying...");
      await onResult(result);
      console.log("[Upscale] Result applied successfully");
    } catch (err) {
      if ((err as DOMException).name === "AbortError") return;
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Upscale] Error:", msg);
      setError(msg);
    } finally {
      setProcessing(false);
      setCancelController(null);
    }
  }

  return (
    <div className="ai-panel" dir="rtl">
      <div className="ai-panel-header">
        <h3>שיפור רזולוציה</h3>
        <button className="ai-panel-close" onClick={onClose} type="button" title="סגור">✕</button>
      </div>

      <div className="ai-panel-body">
        <fieldset className="ai-fieldset">
          <legend>מודל Topaz</legend>
          {TOPAZ_MODELS.map((m) => (
            <label key={m.id} className="ai-radio-row">
              <input
                type="radio"
                name="topaz-model"
                value={m.id}
                checked={topazModel === m.id}
                onChange={() => setTopazModel(m.id)}
                disabled={processing}
              />
              <span>{m.labelHe}</span>
            </label>
          ))}
        </fieldset>

        <fieldset className="ai-fieldset ai-fieldset-row">
          <legend>קנה מידה</legend>
          {([2, 4] as const).map((s) => (
            <label key={s} className="ai-radio-row">
              <input
                type="radio"
                name="scale"
                value={s}
                checked={scale === s}
                onChange={() => setScale(s)}
                disabled={processing}
              />
              <span>{s}x</span>
            </label>
          ))}
        </fieldset>

        {error && <p className="ai-error">{error}</p>}

        <button
          className="ai-btn-primary"
          type="button"
          onClick={() => void handleRun()}
          disabled={processing}
        >
          {processing ? "מעבד..." : "שפר רזולוציה"}
        </button>
      </div>
    </div>
  );
}
