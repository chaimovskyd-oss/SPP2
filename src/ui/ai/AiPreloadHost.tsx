import { useEffect, type ReactElement } from "react";
import { useAiPreload } from "./useAiPreload";
import { AiPreloadChip } from "./AiPreloadChip";
import { useAiPreloadStore } from "@/state/aiPreloadStore";

declare global {
  interface Window {
    __sppHideAiSplash?: () => void;
  }
}

/**
 * Root-level host for the AI model preload system: starts the background preload
 * on mount and renders the status chip. The loading-video splash itself lives as
 * static markup in index.html (so it paints immediately on launch, before this
 * bundle runs) — here we just dismiss it once the essential models are ready (or
 * the overall preload settles). Mounted once in main.tsx.
 */
export function AiPreloadHost(): ReactElement {
  useAiPreload();
  const essentialReady = useAiPreloadStore((s) => s.essentialReady);
  const overall = useAiPreloadStore((s) => s.overall);

  useEffect(() => {
    if (essentialReady || overall === "ready" || overall === "fallback" || overall === "failed") {
      window.__sppHideAiSplash?.();
    }
  }, [essentialReady, overall]);

  return <AiPreloadChip />;
}
