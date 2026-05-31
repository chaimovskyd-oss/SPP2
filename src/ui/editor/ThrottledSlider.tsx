import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";

/**
 * Range input that keeps the thumb at 60fps locally but commits to the store at a
 * throttled cadence (default ~12/sec) during a drag, flushing the final value on
 * release. This is the core responsiveness fix for the adjustment tools: the old
 * sliders committed on EVERY input event, so every drag triggered dozens of full
 * document clones + history entries + full-resolution Konva re-filters per second.
 *
 * Pair with history coalescing (changeLayerActionCoalesced) so the whole drag
 * collapses into a single undo step.
 */
export function useThrottledCommit(
  value: number,
  commit: (next: number) => void,
  intervalMs = 80
): { display: number; onInput: (next: number) => void; flush: () => void } {
  const [local, setLocal] = useState(value);
  const dragging = useRef(false);
  const pending = useRef<number | null>(null);
  const lastCommit = useRef(0);
  const timer = useRef<number | null>(null);

  // Adopt external changes (undo, preset apply, switching layers) only while idle,
  // so we never yank the thumb out from under an active drag.
  useEffect(() => {
    if (!dragging.current) setLocal(value);
  }, [value]);

  const fire = useCallback(
    (next: number) => {
      lastCommit.current = Date.now();
      pending.current = null;
      commit(next);
    },
    [commit]
  );

  const onInput = useCallback(
    (next: number) => {
      dragging.current = true;
      setLocal(next);
      pending.current = next;
      const elapsed = Date.now() - lastCommit.current;
      if (elapsed >= intervalMs) {
        fire(next);
      } else if (timer.current === null) {
        timer.current = window.setTimeout(() => {
          timer.current = null;
          if (pending.current !== null) fire(pending.current);
        }, intervalMs - elapsed);
      }
    },
    [fire, intervalMs]
  );

  const flush = useCallback(() => {
    dragging.current = false;
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (pending.current !== null) fire(pending.current);
  }, [fire]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  return { display: local, onInput, flush };
}

const RANGE_STYLE: React.CSSProperties = { width: "100%", accentColor: "var(--accent)" };

export function ThrottledSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onCommit,
  format
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (value: number) => void;
  format?: (value: number) => string;
}): ReactElement {
  const { display, onInput, flush } = useThrottledCommit(value, onCommit);
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 6 }}>
      <span style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--color-text-secondary,#888)" }}>
        <span>{label}</span>
        <span style={{ color: "var(--color-text-tertiary,#666)" }}>{format ? format(display) : display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={display}
        onChange={(e) => onInput(Number(e.target.value))}
        onPointerUp={flush}
        onPointerCancel={flush}
        onBlur={flush}
        onKeyUp={flush}
        style={RANGE_STYLE}
      />
    </label>
  );
}
