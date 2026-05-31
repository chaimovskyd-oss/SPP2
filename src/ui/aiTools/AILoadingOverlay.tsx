import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { useAiToolsStore } from "@/state/aiToolsStore";

const TOOL_LABELS: Record<string, { text: string; seconds: number }> = {
  expand:  { text: "מרחיב תמונה...", seconds: 8 },
  remove:  { text: "מסיר אלמנטים...", seconds: 6 },
  upscale: { text: "משפר רזולוציה...", seconds: 12 },
  restore: { text: "משחזר תמונה...", seconds: 8 },
};

interface AILoadingOverlayProps {
  previewDataUrl: string | null;
}

export function AILoadingOverlay({ previewDataUrl }: AILoadingOverlayProps): ReactElement | null {
  const processing = useAiToolsStore((s) => s.processing);
  const progress = useAiToolsStore((s) => s.progress);
  const cancel = useAiToolsStore((s) => s.cancel);
  const tool = useAiToolsStore((s) => s.activeTarget?.tool ?? null);

  const [resultArrived, setResultArrived] = useState(false);
  const prevProgress = useRef(0);

  useEffect(() => {
    if (!processing) {
      setResultArrived(false);
      prevProgress.current = 0;
      return;
    }
    if (progress === 100 && prevProgress.current < 100) {
      setResultArrived(true);
    }
    prevProgress.current = progress;
  }, [processing, progress]);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape" && processing) cancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [processing, cancel]);

  if (!processing || !tool) return null;

  const label = TOOL_LABELS[tool] ?? { text: "מעבד...", seconds: 10 };

  return (
    <div className="ai-loading-overlay" role="dialog" aria-modal="true" aria-label={label.text}>
      <div className="ai-loading-inner">
        {previewDataUrl && (
          <div
            className="ai-loading-preview"
            style={{
              backgroundImage: `url(${previewDataUrl})`,
              filter: resultArrived ? "blur(0px)" : "blur(18px)",
              transition: resultArrived ? "filter 1.5s ease" : "none",
            }}
          />
        )}

        <div className="ai-loading-content">
          <div className="ai-loading-spinner" />
          <p className="ai-loading-text">
            {label.text}
            <span className="ai-loading-hint"> (~{label.seconds} שניות)</span>
          </p>

          <div className="ai-loading-bar-wrap" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="ai-loading-bar-fill" style={{ width: `${progress}%` }} />
          </div>

          <button
            className="ai-loading-cancel"
            type="button"
            onClick={cancel}
            title="ביטול (Escape)"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
