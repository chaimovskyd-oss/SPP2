/**
 * Curves modal — Photoshop-style non-destructive tone-curve editor.
 *
 * Opened from the image context menu ("עקומות…") or the Image Adjustments panel.
 * Edits a multi-channel curve set (RGB composite + per-channel R/G/B) on a single
 * image layer. The same LUT engine drives the live canvas preview and the final
 * export (see imageAdjustmentPipeline), so what you see is what prints.
 *
 * The editor is a DRAGGABLE, non-modal floating panel (no dimming backdrop) so
 * the live canvas preview stays fully visible while editing. Preview is live on
 * the real canvas via previewImageAdjustmentStacks (NON-undoable); Apply commits
 * one undo record via setImageAdjustmentStacks; Cancel / unmount restores the
 * original stack. Re-opening loads the layer's existing curve set.
 */

import { useEffect, useMemo, useRef, useState, type ReactElement, type PointerEvent as ReactPointerEvent } from "react";
import { useCurvesStore } from "@/state/curvesStore";
import { useDocumentStore } from "@/state/documentStore";
import { resolveCanvasAssetPath } from "@/core/assets/assetManager";
import { buildCurveLUT } from "@/core/rendering/curveUtils";
import {
  histogramFromImageData,
  loadDownscaledImageData,
  sampleDownscaled,
  type DownscaledImage,
  type ImageHistogram
} from "@/core/rendering/histogram";
import {
  BUILTIN_CURVE_PRESETS,
  deleteCustomCurvePreset,
  loadCustomCurvePresets,
  saveCustomCurvePreset,
  type CustomCurvePreset
} from "@/core/presets/curveChannelPresets";
import {
  createDefaultCurveChannels,
  createImageAdjustment,
  isIdentityCurveChannels,
  type CurveChannel,
  type CurveChannelPoints,
  type CurvePoint,
  type ImageAdjustment,
  type ImageAdjustmentStack
} from "@/types/imageAdjustments";
import type { VisualLayer } from "@/types/layers";

// ─── channel-level helpers (pure) ─────────────────────────────────────────────

const CHANNELS: Array<{ key: CurveChannel; label: string; color: string }> = [
  { key: "rgb", label: "RGB", color: "#e8e8f0" },
  { key: "r", label: "אדום", color: "#ff5b5b" },
  { key: "g", label: "ירוק", color: "#4ade80" },
  { key: "b", label: "כחול", color: "#5b8cff" }
];

type Eyedropper = "black" | "gray" | "white";

const EYEDROPPERS: Array<{ key: Eyedropper; label: string; title: string }> = [
  { key: "black", label: "⚫ נק' שחור", title: "בחר את הנקודה שתהפוך לשחור" },
  { key: "gray", label: "🔘 נק' אפור", title: "בחר נקודה ניטרלית לאיזון צבע" },
  { key: "white", label: "⚪ נק' לבן", title: "בחר את הנקודה שתהפוך ללבן" }
];

function cloneChannels(c: CurveChannelPoints): CurveChannelPoints {
  return {
    rgb: c.rgb.map((p) => ({ ...p })),
    r: c.r.map((p) => ({ ...p })),
    g: c.g.map((p) => ({ ...p })),
    b: c.b.map((p) => ({ ...p }))
  };
}

const clampByte = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** Insert a point keeping the array sorted by x; returns its index. */
function addPoint(points: CurvePoint[], x: number, y: number): { points: CurvePoint[]; index: number } {
  const px = clampByte(x);
  const py = clampByte(y);
  const next = [...points];
  let index = next.findIndex((p) => p.x >= px);
  if (index === -1) index = next.length;
  // Don't stack onto an endpoint x; nudge inward by 1.
  const safeX = index === 0 ? 1 : index === next.length ? 254 : px;
  next.splice(index, 0, { x: safeX, y: py });
  return { points: next, index };
}

/** Move a point with endpoint x-locking and neighbour clamping. */
function movePoint(points: CurvePoint[], index: number, x: number, y: number): CurvePoint[] {
  if (index < 0 || index >= points.length) return points;
  const next = points.map((p) => ({ ...p }));
  const last = next.length - 1;
  const ny = clampByte(y);
  let nx: number;
  if (index === 0) nx = 0;
  else if (index === last) nx = 255;
  else {
    const lo = next[index - 1]!.x + 1;
    const hi = next[index + 1]!.x - 1;
    nx = Math.max(lo, Math.min(hi, clampByte(x)));
  }
  next[index] = { x: nx, y: ny };
  return next;
}

/** Remove a non-endpoint point. */
function deletePoint(points: CurvePoint[], index: number): CurvePoint[] {
  if (index <= 0 || index >= points.length - 1) return points;
  return points.filter((_, i) => i !== index);
}

/** Black/white point: remap so input `level` becomes 0 (black) or 255 (white). */
function blackPointCurve(level: number): CurvePoint[] {
  const lv = Math.max(1, Math.min(254, Math.round(level)));
  return [{ x: 0, y: 0 }, { x: lv, y: 0 }, { x: 255, y: 255 }];
}
function whitePointCurve(level: number): CurvePoint[] {
  const lv = Math.max(1, Math.min(254, Math.round(level)));
  return [{ x: 0, y: 0 }, { x: lv, y: 255 }, { x: 255, y: 255 }];
}
/** Gray point: per-channel map the sampled value to the target neutral. */
function grayPointCurve(channelValue: number, target: number): CurvePoint[] {
  const v = Math.max(1, Math.min(254, Math.round(channelValue)));
  return [{ x: 0, y: 0 }, { x: v, y: clampByte(target) }, { x: 255, y: 255 }];
}

function getAssetIdFor(layer: VisualLayer): string | undefined {
  if (layer.type === "image") return layer.assetId;
  if (layer.type === "frame") return layer.imageAssetId;
  return undefined;
}

/** Pull the channels off an existing modal-authored curves adjustment, if any. */
function findCurvesChannels(stack: ImageAdjustment[]): CurveChannelPoints | null {
  for (const adj of stack) {
    if (adj.type === "curves" && adj.channels !== undefined) return cloneChannels(adj.channels);
  }
  return null;
}

/** Build the committed stack: base (minus any existing curves-with-channels) + new curves. */
function buildCurvesStack(
  original: ImageAdjustmentStack | undefined,
  channels: CurveChannelPoints
): ImageAdjustmentStack {
  const base = (original?.stack ?? []).filter((a) => !(a.type === "curves" && a.channels !== undefined));
  const curvesAdj = createImageAdjustment({ type: "curves", channels: cloneChannels(channels) });
  // Deterministic order: curves after tone/colour, before spatial detail/effects.
  const detailIdx = base.findIndex((a) => a.type === "detail");
  const stack =
    detailIdx === -1
      ? [...base, curvesAdj]
      : [...base.slice(0, detailIdx), curvesAdj, ...base.slice(detailIdx)];
  return { ...(original ?? { enabled: true, stack: [] }), enabled: true, stack };
}

// ─── modal ─────────────────────────────────────────────────────────────────────

const PANEL_W = 380;

export function CurvesModal(): ReactElement | null {
  const target = useCurvesStore((s) => s.target);
  const close = useCurvesStore((s) => s.close);
  const previewStacks = useDocumentStore((s) => s.previewImageAdjustmentStacks);
  const commitStacks = useDocumentStore((s) => s.setImageAdjustmentStacks);

  const [channels, setChannels] = useState<CurveChannelPoints>(createDefaultCurveChannels);
  const [activeChannel, setActiveChannel] = useState<CurveChannel>("rgb");
  const [selected, setSelected] = useState<number | null>(null);
  const [showBefore, setShowBefore] = useState(false);
  const [histogram, setHistogram] = useState<ImageHistogram | null>(null);
  const [thumbSrc, setThumbSrc] = useState<string | undefined>(undefined);
  const [eyedropper, setEyedropper] = useState<Eyedropper | null>(null);
  const [customPresets, setCustomPresets] = useState<CustomCurvePreset[]>([]);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 24, top: 84 });

  // Refs for cleanup-time restore with fresh values (mirrors AutoFixModal).
  const appliedRef = useRef(false);
  const previewedRef = useRef(false);
  const originalRef = useRef<ImageAdjustmentStack | undefined>(undefined);
  const pageIdRef = useRef<string | null>(null);
  const layerIdRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const downscaledRef = useRef<DownscaledImage | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  // ── Load layer state + downscaled image (histogram + sampling) when opened ──
  useEffect(() => {
    if (target === null) return;
    appliedRef.current = false;
    previewedRef.current = false;
    pageIdRef.current = target.pageId;
    layerIdRef.current = target.layerId;
    setActiveChannel("rgb");
    setSelected(null);
    setShowBefore(false);
    setEyedropper(null);
    setCustomPresets(loadCustomCurvePresets());
    // Default the panel to the left edge, away from the canvas centre.
    setPos({ left: 24, top: 84 });

    const { document } = useDocumentStore.getState();
    const page = document?.pages.find((p) => p.id === target.pageId);
    const layer = page?.layers.find((l) => l.id === target.layerId);
    if (layer === undefined) {
      close();
      return;
    }
    const original = "imageAdjustments" in layer ? layer.imageAdjustments : undefined;
    originalRef.current = original;
    const existing = original !== undefined ? findCurvesChannels(original.stack) : null;
    setChannels(existing ?? createDefaultCurveChannels());

    const assetId = getAssetIdFor(layer);
    const src = assetId !== undefined ? resolveCanvasAssetPath(document?.assets.find((a) => a.id === assetId)) : undefined;
    setThumbSrc(src);
    let cancelled = false;
    setHistogram(null);
    downscaledRef.current = null;
    void loadDownscaledImageData(src).then((img) => {
      if (cancelled || img === null) return;
      downscaledRef.current = img;
      setHistogram(histogramFromImageData(img));
    });

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (!appliedRef.current && previewedRef.current && pageIdRef.current !== null && layerIdRef.current !== null) {
        previewStacks(pageIdRef.current, [{ layerId: layerIdRef.current, stack: originalRef.current }]);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // ── Live preview on the real canvas (rAF-throttled, non-undoable) ──
  useEffect(() => {
    if (target === null) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      previewedRef.current = true;
      const stack = showBefore ? originalRef.current : buildCurvesStack(originalRef.current, channels);
      previewStacks(target.pageId, [{ layerId: target.layerId, stack }]);
    });
  }, [target, channels, showBefore, previewStacks]);

  // ── Window-level drag for the floating panel ──
  useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      if (dragRef.current === null) return;
      const left = Math.max(0, Math.min(window.innerWidth - 60, e.clientX - dragRef.current.dx));
      const top = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragRef.current.dy));
      setPos({ left, top });
    };
    const onUp = (): void => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  // ── Keyboard: Delete removes the selected point, Escape cancels ──
  useEffect(() => {
    if (target === null) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") close();
      else if ((e.key === "Delete" || e.key === "Backspace") && selected !== null) {
        e.preventDefault();
        removeSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, selected, activeChannel, channels]);

  const activePoints = channels[activeChannel];
  const activeColor = CHANNELS.find((c) => c.key === activeChannel)!.color;

  const setActivePoints = (updater: (pts: CurvePoint[]) => CurvePoint[]): void => {
    setChannels((prev) => ({ ...prev, [activeChannel]: updater(prev[activeChannel]) }));
  };

  const removeSelected = (): void => {
    if (selected === null) return;
    setActivePoints((pts) => deletePoint(pts, selected));
    setSelected(null);
  };

  const resetChannel = (): void => {
    setActivePoints(() => [{ x: 0, y: 0 }, { x: 255, y: 255 }]);
    setSelected(null);
  };

  const resetAll = (): void => {
    setChannels(createDefaultCurveChannels());
    setSelected(null);
    setEyedropper(null);
  };

  const applyChannels = (next: CurveChannelPoints): void => {
    setChannels(cloneChannels(next));
    setSelected(null);
    setEyedropper(null);
  };

  // ── Eyedropper sampling from the in-panel preview thumbnail ──
  const onThumbClick = (e: ReactPointerEvent<HTMLImageElement>): void => {
    if (eyedropper === null || downscaledRef.current === null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    const { r, g, b } = sampleDownscaled(downscaledRef.current, fx, fy);
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    setChannels((prev) => {
      const next = cloneChannels(prev);
      if (eyedropper === "black") next.rgb = blackPointCurve(luma);
      else if (eyedropper === "white") next.rgb = whitePointCurve(luma);
      else {
        // gray point: neutralise the colour cast at the sampled pixel
        next.r = grayPointCurve(r, luma);
        next.g = grayPointCurve(g, luma);
        next.b = grayPointCurve(b, luma);
      }
      return next;
    });
    setEyedropper(null);
    setSelected(null);
  };

  const onSavePreset = (): void => {
    // eslint-disable-next-line no-alert
    const name = window.prompt("שם הפריסט:", "פריסט עקומה");
    if (name === null) return;
    setCustomPresets(saveCustomCurvePreset(name, cloneChannels(channels)));
  };

  if (target === null) return null;

  const apply = (): void => {
    const pageId = pageIdRef.current;
    const layerId = layerIdRef.current;
    if (pageId === null || layerId === null) return;
    // Restore the original first so the undo "before" is the true original.
    previewStacks(pageId, [{ layerId, stack: originalRef.current }]);
    commitStacks(pageId, [{ layerId, stack: buildCurvesStack(originalRef.current, channels) }], undefined, "CurvesAction");
    appliedRef.current = true;
    close();
  };

  const isDirty = !isIdentityCurveChannels(channels);
  const startPanelDrag = (e: ReactPointerEvent): void => {
    dragRef.current = { dx: e.clientX - pos.left, dy: e.clientY - pos.top };
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="עקומות"
      dir="rtl"
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        zIndex: 3600,
        width: `min(${PANEL_W}px, 94vw)`,
        maxHeight: "90vh",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 16,
        background: "var(--color-surface,#1b1b26)",
        border: "1px solid var(--color-border,#2a2a3e)",
        borderRadius: 12,
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        color: "var(--color-text,#eee)"
      }}
    >
      {/* Draggable header */}
      <div
        onPointerDown={startPanelDrag}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "move", userSelect: "none" }}
      >
        <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ opacity: 0.5, fontSize: 13 }}>⠿</span> עקומות
        </h3>
        <button className="ctx-item" onClick={close} type="button" style={{ width: "auto", padding: "2px 8px" }}>
          ✕
        </button>
      </div>

      {/* Channel selector */}
      <div style={{ display: "flex", gap: 6 }}>
        {CHANNELS.map((ch) => (
          <button
            key={ch.key}
            type="button"
            className={activeChannel === ch.key ? "toggle on" : "toggle"}
            onClick={() => {
              setActiveChannel(ch.key);
              setSelected(null);
            }}
            style={{ flex: 1, borderBottom: `2px solid ${ch.color}` }}
          >
            {ch.label}
          </button>
        ))}
      </div>

      {/* Curve graph */}
      <CurveGraph
        points={activePoints}
        color={activeColor}
        histogram={histogram}
        channel={activeChannel}
        selected={selected}
        onSelect={setSelected}
        onAddPoint={(x, y) => {
          let newIndex = -1;
          setActivePoints((pts) => {
            const res = addPoint(pts, x, y);
            newIndex = res.index;
            return res.points;
          });
          setSelected(newIndex);
        }}
        onMovePoint={(index, x, y) => setActivePoints((pts) => movePoint(pts, index, x, y))}
      />

      {/* Eyedroppers + preview thumbnail */}
      {thumbSrc !== undefined && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {EYEDROPPERS.map((ed) => (
              <button
                key={ed.key}
                type="button"
                className={eyedropper === ed.key ? "toggle on" : "toggle"}
                title={ed.title}
                onClick={() => setEyedropper((cur) => (cur === ed.key ? null : ed.key))}
                style={{ flex: 1, fontSize: 11 }}
              >
                {ed.label}
              </button>
            ))}
          </div>
          {eyedropper !== null && (
            <p style={{ margin: 0, fontSize: 11, color: "#e0a000" }}>לחץ על נקודה בתמונה כדי לדגום.</p>
          )}
          <img
            src={thumbSrc}
            alt="תצוגה לדגימה"
            draggable={false}
            onPointerDown={onThumbClick}
            style={{
              width: "100%",
              maxHeight: 110,
              objectFit: "contain",
              borderRadius: 6,
              border: "1px solid var(--color-border,#2a2a3e)",
              background: "#000",
              cursor: eyedropper !== null ? "crosshair" : "default"
            }}
          />
        </div>
      )}

      {/* Presets */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 11, color: "var(--color-text-secondary,#9aa)" }}>פריסטים</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {BUILTIN_CURVE_PRESETS.map((p) => (
            <button key={p.id} type="button" className="toggle" style={{ flex: "1 1 30%", fontSize: 11 }} onClick={() => applyChannels(p.channels)}>
              {p.label}
            </button>
          ))}
        </div>
        {customPresets.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {customPresets.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button type="button" className="toggle" style={{ flex: 1, fontSize: 11 }} onClick={() => applyChannels(p.channels)}>
                  {p.name}
                </button>
                <button
                  type="button"
                  className="ctx-item"
                  style={{ width: "auto", padding: "2px 8px" }}
                  title="מחק פריסט"
                  onClick={() => setCustomPresets(deleteCustomCurvePreset(p.id))}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <button type="button" className="toggle" style={{ fontSize: 11 }} disabled={!isDirty} onClick={onSavePreset}>
          💾 שמור כפריסט
        </button>
      </div>

      {/* Point + channel actions */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" className="toggle" disabled={selected === null || selected === 0 || selected === activePoints.length - 1} onClick={removeSelected}>
          מחק נקודה
        </button>
        <button type="button" className="toggle" onClick={resetChannel}>
          איפוס ערוץ
        </button>
        <button type="button" className="toggle" onClick={resetAll}>
          איפוס הכל
        </button>
        <button
          type="button"
          className={showBefore ? "toggle on" : "toggle"}
          onPointerDown={() => setShowBefore(true)}
          onPointerUp={() => setShowBefore(false)}
          onPointerLeave={() => setShowBefore(false)}
          title="החזק כדי לראות לפני"
        >
          👁 לפני/אחרי
        </button>
      </div>

      {/* Apply / cancel */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="toggle" onClick={close}>
          ביטול
        </button>
        <button type="button" className="toggle on" disabled={!isDirty} onClick={apply}>
          החל
        </button>
      </div>
    </div>
  );
}

// ─── curve graph (SVG) ───────────────────────────────────────────────────────

function CurveGraph({
  points,
  color,
  histogram,
  channel,
  selected,
  onSelect,
  onAddPoint,
  onMovePoint
}: {
  points: CurvePoint[];
  color: string;
  histogram: ImageHistogram | null;
  channel: CurveChannel;
  selected: number | null;
  onSelect: (index: number | null) => void;
  onAddPoint: (x: number, y: number) => void;
  onMovePoint: (index: number, x: number, y: number) => void;
}): ReactElement {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<number | null>(null);

  // Convert a pointer event into 0..255 data coordinates.
  const toData = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect === undefined || rect.width === 0) return { x: 0, y: 0 };
    const fx = (clientX - rect.left) / rect.width;
    const fy = (clientY - rect.top) / rect.height;
    return { x: fx * 255, y: (1 - fy) * 255 };
  };

  useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      if (dragRef.current === null) return;
      const { x, y } = toData(e.clientX, e.clientY);
      onMovePoint(dragRef.current, x, y);
    };
    const onUp = (): void => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMovePoint]);

  // Curve polyline from the real pipeline LUT (monotone-cubic), in SVG coords.
  const curvePath = useMemo(() => {
    const lut = buildCurveLUT({ points });
    let d = "";
    for (let x = 0; x < 256; x += 1) d += `${x === 0 ? "M" : "L"}${x},${255 - lut[x]!} `;
    return d.trim();
  }, [points]);

  // Histogram fill area for the active channel.
  const histPath = useMemo(() => {
    if (histogram === null) return null;
    const bins = channel === "rgb" ? histogram.luma : histogram[channel];
    const max = channel === "rgb" ? histogram.max.luma : histogram.max[channel];
    if (max <= 0) return null;
    let d = "M0,255 ";
    for (let x = 0; x < 256; x += 1) {
      const h = Math.min(255, (bins[x]! / max) * 255);
      d += `L${x},${255 - h} `;
    }
    d += "L255,255 Z";
    return d;
  }, [histogram, channel]);

  const startDrag = (e: ReactPointerEvent, index: number): void => {
    e.stopPropagation();
    dragRef.current = index;
    onSelect(index);
  };

  const onBackgroundDown = (e: ReactPointerEvent): void => {
    const { x, y } = toData(e.clientX, e.clientY);
    onAddPoint(x, y);
  };

  const histColor = channel === "rgb" ? "#6b6b80" : color;

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 255 255"
      preserveAspectRatio="none"
      onPointerDown={onBackgroundDown}
      style={{
        width: "100%",
        aspectRatio: "1 / 1",
        background: "#0e0e16",
        border: "1px solid var(--color-border,#2a2a3e)",
        borderRadius: 8,
        touchAction: "none",
        cursor: "crosshair",
        display: "block"
      }}
    >
      {[0.25, 0.5, 0.75].map((f) => (
        <g key={f}>
          <line x1={f * 255} y1={0} x2={f * 255} y2={255} stroke="#2a2a3e" strokeWidth={0.5} />
          <line x1={0} y1={f * 255} x2={255} y2={f * 255} stroke="#2a2a3e" strokeWidth={0.5} />
        </g>
      ))}
      <line x1={0} y1={255} x2={255} y2={0} stroke="#33334a" strokeWidth={0.5} strokeDasharray="3 3" />

      {histPath !== null && <path d={histPath} fill={histColor} opacity={0.32} />}

      <path d={curvePath} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />

      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={255 - p.y}
          r={selected === i ? 5 : 4}
          fill={selected === i ? color : "#15151f"}
          stroke={color}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          style={{ cursor: "grab" }}
          onPointerDown={(e) => startDrag(e, i)}
        />
      ))}
    </svg>
  );
}
