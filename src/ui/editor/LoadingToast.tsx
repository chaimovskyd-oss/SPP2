import type { ReactElement } from "react";
import { useUiBusyStore } from "@/state/uiBusyStore";

/**
 * Centered loading toast shown while a long operation runs (see runWithBusy).
 * Fixed overlay, non-blocking visually but signals progress clearly.
 */
export function LoadingToast(): ReactElement | null {
  const busy = useUiBusyStore((s) => s.busy);
  const label = useUiBusyStore((s) => s.label);
  const flash = useUiBusyStore((s) => s.flash);
  if (!busy) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      dir="rtl"
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 4000,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 20px",
        borderRadius: 10,
        background: "rgba(20,20,28,0.92)",
        border: "1px solid var(--color-border,#2a2a3e)",
        boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
        color: "var(--color-text-primary,#eee)",
        fontSize: 14,
        pointerEvents: "none"
      }}
    >
      {!flash && (
        <span
          style={{
            width: 18,
            height: 18,
            border: "2px solid rgba(255,255,255,0.25)",
            borderTopColor: "var(--accent,#6ea8fe)",
            borderRadius: "50%",
            animation: "spp-busy-spin 0.7s linear infinite",
            display: "inline-block"
          }}
        />
      )}
      <span>{label ?? "מעבד…"}</span>
      <style>{"@keyframes spp-busy-spin { to { transform: rotate(360deg); } }"}</style>
    </div>
  );
}
