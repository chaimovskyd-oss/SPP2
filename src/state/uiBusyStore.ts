import { create } from "zustand";

/**
 * Global "something heavy is running" indicator, surfaced as a LoadingToast.
 * Use runWithBusy() to wrap long async work (export, print, batch apply) so the
 * user gets clear feedback instead of a frozen-looking UI.
 */
interface UiBusyState {
  busy: boolean;
  label: string | null;
  /** True while showing a transient confirmation (no spinner) rather than work. */
  flash: boolean;
  /** Show the toast with a label. Returns a token-free begin/end pair via endBusy. */
  beginBusy: (label: string) => void;
  endBusy: () => void;
  /** Show a transient message that auto-clears after `ms` (default 2500). */
  flashToast: (message: string, ms?: number) => void;
}

let flashTimer: ReturnType<typeof setTimeout> | null = null;

export const useUiBusyStore = create<UiBusyState>((set) => ({
  busy: false,
  label: null,
  flash: false,
  beginBusy: (label) => {
    if (flashTimer !== null) {
      clearTimeout(flashTimer);
      flashTimer = null;
    }
    set({ busy: true, label, flash: false });
  },
  endBusy: () => set({ busy: false, label: null, flash: false }),
  flashToast: (message, ms = 2500) => {
    if (flashTimer !== null) clearTimeout(flashTimer);
    set({ busy: true, label: message, flash: true });
    flashTimer = setTimeout(() => {
      flashTimer = null;
      set({ busy: false, label: null, flash: false });
    }, ms);
  }
}));

/**
 * Wrap an async (or sync) operation so the loading toast is shown for its
 * duration. A double requestAnimationFrame before sync work lets the toast paint
 * before the main thread blocks; the toast always clears in a finally.
 */
export async function runWithBusy<T>(label: string, operation: () => Promise<T> | T): Promise<T> {
  const { beginBusy, endBusy } = useUiBusyStore.getState();
  beginBusy(label);
  try {
    // Yield twice so the toast is painted before any synchronous heavy work starts.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    return await operation();
  } finally {
    endBusy();
  }
}
