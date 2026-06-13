import { useEffect, useRef } from "react";
import { useAppSettings } from "@/settings";
import { startAiPreload } from "@/services/ai/aiPreloadService";

/**
 * Kicks off AI model preload once, shortly after the app mounts, based on the
 * user's AI Performance Mode setting. Runs in the background and never blocks the
 * UI (the sidecar does the work on a daemon thread). See plan
 * add-an-ai-model-jiggly-locket.
 */
export function useAiPreload(): void {
  const level = useAppSettings((s) => s.settings.performance.aiPerformanceMode);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startAiPreload(level);
    // Intentionally only on first mount: the setting's effect on a running
    // session is applied via the explicit "Reload AI models" button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
