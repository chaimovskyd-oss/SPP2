import { useAiPreloadStore, type AiModelStatusEntry, type AiPreloadOverall } from "@/state/aiPreloadStore";

/**
 * Drives the AI model preload/warmup system from the renderer. Tells the
 * smart-selection sidecar which models to preload (based on AI Performance Mode),
 * then keeps the aiPreloadStore in sync via the sidecar's progress events plus a
 * periodic status poll until every model reaches a terminal state.
 * See plan add-an-ai-model-jiggly-locket.
 */

const POLL_INTERVAL_MS = 1000;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let unsubscribeProgress: (() => void) | null = null;

function stopWatching(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (unsubscribeProgress !== null) {
    unsubscribeProgress();
    unsubscribeProgress = null;
  }
}

async function pollOnce(): Promise<boolean> {
  const api = window.spp?.smartSelection;
  if (api === undefined || typeof api.modelsStatus !== "function") return true;
  try {
    const status = await api.modelsStatus();
    if (status !== undefined && status.ok) {
      useAiPreloadStore.getState().applyStatus({
        level: status.level,
        overall: status.overall as AiPreloadOverall,
        essentialReady: status.essentialReady,
        models: status.models as Record<string, AiModelStatusEntry>
      });
      // Done once the level's models settle (overall leaves "loading").
      return status.overall !== "loading";
    }
  } catch {
    // Polling is best-effort; the next tick retries.
  }
  return false;
}

function watch(): void {
  stopWatching();
  const api = window.spp?.smartSelection;
  if (api === undefined) return;

  if (typeof api.onProgress === "function") {
    unsubscribeProgress = api.onProgress((payload) => {
      if (payload.phase === "preload" && payload.model !== undefined) {
        useAiPreloadStore.getState().applyModel(payload.model as AiModelStatusEntry);
      }
    });
  }

  pollTimer = setInterval(() => {
    void pollOnce().then((done) => {
      if (done) stopWatching();
    });
  }, POLL_INTERVAL_MS);
  // Kick an immediate poll so the UI doesn't wait a full interval.
  void pollOnce().then((done) => {
    if (done) stopWatching();
  });
}

/** Begin preloading the models for the given AI Performance Mode. No-op for "lazy". */
export function startAiPreload(level: string): void {
  const store = useAiPreloadStore.getState();
  store.beginPreload(level);
  if (level === "lazy") {
    stopWatching();
    return;
  }
  const api = window.spp?.smartSelection;
  if (api === undefined || typeof api.preloadModels !== "function") return;
  void api.preloadModels(level).catch(() => {
    // Sidecar may not be ready; the chip will simply stay idle.
  });
  watch();
}

/** Drop loaded sessions and preload again from scratch (Settings → "Reload AI models"). */
export function reloadAiModels(level: string): void {
  const store = useAiPreloadStore.getState();
  store.reset();
  store.beginPreload(level);
  if (level === "lazy") {
    stopWatching();
    return;
  }
  const api = window.spp?.smartSelection;
  if (api === undefined || typeof api.reloadModels !== "function") return;
  void api.reloadModels(level).catch(() => {});
  watch();
}
