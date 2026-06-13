import { useEffect, useState, type ReactElement } from "react";
import { useAiPreloadStore } from "@/state/aiPreloadStore";

/**
 * Small corner indicator for the AI model preload/warmup status
 * (loading / ready / failed / fallback). Auto-hides a few seconds after the
 * models are ready; stays visible on failure. See plan add-an-ai-model-jiggly-locket.
 */
const READY_AUTO_HIDE_MS = 4000;

const LABELS: Record<string, { text: string; color: string; spin: boolean }> = {
  loading: { text: "טוען מודלים של AI…", color: "#6ea8fe", spin: true },
  ready: { text: "מודלי AI מוכנים", color: "#4caf50", spin: false },
  fallback: { text: "מודלי AI מוכנים (חלקי)", color: "#e0a800", spin: false },
  failed: { text: "טעינת מודלי AI נכשלה", color: "#e35d6a", spin: false }
};

export function AiPreloadChip(): ReactElement | null {
  const overall = useAiPreloadStore((s) => s.overall);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(false);
    if (overall === "ready") {
      const timer = setTimeout(() => setHidden(true), READY_AUTO_HIDE_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [overall]);

  if (overall === "idle" || hidden) return null;
  const meta = LABELS[overall] ?? LABELS.loading;

  return (
    <div
      role="status"
      aria-live="polite"
      dir="rtl"
      onClick={() => setHidden(true)}
      title="לחץ להסתרה"
      style={{
        position: "fixed",
        bottom: 14,
        insetInlineEnd: 14,
        zIndex: 3500,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 12px",
        borderRadius: 999,
        background: "rgba(20,20,28,0.92)",
        border: "1px solid var(--color-border,#2a2a3e)",
        boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
        color: "var(--color-text-primary,#eee)",
        fontSize: 12.5,
        cursor: "pointer",
        userSelect: "none"
      }}
    >
      {meta.spin ? (
        <span
          style={{
            width: 13,
            height: 13,
            border: "2px solid rgba(255,255,255,0.25)",
            borderTopColor: meta.color,
            borderRadius: "50%",
            animation: "spp-busy-spin 0.7s linear infinite",
            display: "inline-block"
          }}
        />
      ) : (
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: meta.color, display: "inline-block" }} />
      )}
      <span>{meta.text}</span>
    </div>
  );
}
