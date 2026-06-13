/**
 * Auto Fix modal — Photoshop-style Auto / Curves, NO generative AI.
 *
 * Opened from the image context menu ("✨ תיקון אוטומטי…") or the properties
 * panel button. Analyses each target image once, then blends the calculated
 * correction against the original by an intensity slider + feature toggles.
 * Preview is live on the real canvas (non-undoable); Apply commits one undo
 * record, Cancel restores the original, and re-opening blends from the
 * pre-Auto-Fix state so corrections never stack aggressively.
 */

import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useAutoFixStore } from "@/state/autoFixStore";
import { useDocumentStore } from "@/state/documentStore";
import { resolveCanvasAssetPath } from "@/core/assets/assetManager";
import { analyzeImageForAutoFix } from "@/services/ai/autoFixService";
import {
  AUTO_FIX_VERSION,
  DEFAULT_AUTO_FIX_TOGGLES,
  blendAutoFixToTemplates,
  blendAutoFixToValues,
  type AutoFixCorrection,
  type AutoFixToggles,
  type AutoFixBlendedValues
} from "@/core/analysis/autoFix";
import {
  createImageAdjustment,
  type AutoFixMode,
  type ImageAdjustment,
  type ImageAdjustmentStack
} from "@/types/imageAdjustments";
import type { VisualLayer } from "@/types/layers";

interface PreparedTarget {
  layerId: string;
  name: string;
  src?: string;
  /** the pristine stack (and enabled flag) Auto Fix blends FROM. */
  base: { enabled: boolean; stack: ImageAdjustment[] };
  /** exact stack to restore on cancel (may be undefined = no adjustments). */
  original: ImageAdjustmentStack | undefined;
  correction?: AutoFixCorrection;
  improved: boolean;
  status: "loading" | "ready" | "failed";
}

const INTENSITY_PRESETS: Array<{ label: string; value: number }> = [
  { label: "עדין", value: 35 },
  { label: "רגיל", value: 60 },
  { label: "חזק", value: 85 }
];

const TOGGLE_LABELS: Array<{ key: keyof AutoFixToggles; label: string }> = [
  { key: "lighting", label: "תאורה" },
  { key: "color", label: "תיקון צבע" },
  { key: "contrast", label: "ניגודיות" },
  { key: "skinProtection", label: "הגנת עור" },
  { key: "sharpen", label: "חידוד עדין" }
];

function getAssetIdFor(layer: VisualLayer): string | undefined {
  if (layer.type === "image") return layer.assetId;
  if (layer.type === "frame") return layer.imageAssetId;
  return undefined;
}

function deriveBase(stack: ImageAdjustmentStack | undefined): PreparedTarget["base"] {
  if (stack?.autoFix?.applied === true) {
    return { enabled: stack.autoFix.previousEnabled, stack: stack.autoFix.previousStack };
  }
  return { enabled: stack?.enabled ?? true, stack: stack?.stack ?? [] };
}

function deriveMode(toggles: AutoFixToggles): AutoFixMode {
  const on = [toggles.lighting, toggles.color, toggles.contrast].filter(Boolean).length;
  if (on >= 2) return "full";
  if (toggles.color) return "color";
  if (toggles.contrast) return "contrast";
  if (toggles.lighting) return "exposure";
  return "full";
}

/** Build the blended stack for a target at the given intensity/toggles. */
function buildStack(
  target: PreparedTarget,
  intensity: number,
  toggles: AutoFixToggles
): ImageAdjustmentStack {
  const templates =
    target.correction !== undefined
      ? blendAutoFixToTemplates(target.correction, { intensity: intensity / 100, toggles })
      : [];

  if (templates.length === 0) {
    // Nothing to add → revert to the pristine base (drops any prior Auto Fix).
    return { enabled: target.base.enabled, stack: [...target.base.stack] };
  }

  const generated = templates.map((t) => createImageAdjustment(t));
  return {
    enabled: true,
    stack: [...target.base.stack, ...generated],
    autoFix: {
      applied: true,
      version: AUTO_FIX_VERSION,
      mode: deriveMode(toggles),
      intensity,
      previousStack: target.base.stack,
      previousEnabled: target.base.enabled
    }
  };
}

/** Rough CSS-filter approximation of the correction for the after-thumbnail. */
function cssFilter(v: AutoFixBlendedValues): string {
  const brightness = 1 + v.exposure * 0.7 + v.shadows * 0.0016 + v.highlights * 0.0009;
  const contrast = 1 + v.contrast / 110;
  const saturate = Math.max(0, 1 + (v.saturation + v.vibrance * 0.7) / 100);
  const hue = v.temperature * -0.35 + v.tint * 0.2;
  const sepia = v.temperature > 0 ? Math.min(0.25, v.temperature / 80) : 0;
  return `brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)}) saturate(${saturate.toFixed(3)}) hue-rotate(${hue.toFixed(1)}deg) sepia(${sepia.toFixed(3)})`;
}

export function AutoFixModal(): ReactElement | null {
  const target = useAutoFixStore((s) => s.target);
  const close = useAutoFixStore((s) => s.close);
  const previewStacks = useDocumentStore((s) => s.previewImageAdjustmentStacks);
  const commitStacks = useDocumentStore((s) => s.setImageAdjustmentStacks);

  const [targets, setTargets] = useState<PreparedTarget[]>([]);
  const [intensity, setIntensity] = useState(60);
  const [toggles, setToggles] = useState<AutoFixToggles>(DEFAULT_AUTO_FIX_TOGGLES);
  const [analyzing, setAnalyzing] = useState(false);

  // Refs so the unmount cleanup can restore the originals with fresh values.
  const appliedRef = useRef(false);
  const previewedRef = useRef(false);
  const targetsRef = useRef<PreparedTarget[]>([]);
  const pageIdRef = useRef<string | null>(null);
  targetsRef.current = targets;
  pageIdRef.current = target?.pageId ?? null;

  // ── Load + analyse each target image when the modal opens ──
  useEffect(() => {
    if (target === null) {
      setTargets([]);
      return;
    }
    appliedRef.current = false;
    previewedRef.current = false;
    setIntensity(60);
    setToggles(DEFAULT_AUTO_FIX_TOGGLES);

    const { document } = useDocumentStore.getState();
    const page = document?.pages.find((p) => p.id === target.pageId);
    if (page === undefined) {
      setTargets([]);
      return;
    }
    const assets = document?.assets ?? [];
    const prepared: PreparedTarget[] = target.layerIds.flatMap((layerId) => {
      const layer = page.layers.find((l) => l.id === layerId);
      if (layer === undefined) return [];
      const assetId = getAssetIdFor(layer);
      const src = assetId !== undefined ? resolveCanvasAssetPath(assets.find((a) => a.id === assetId)) : undefined;
      const stack = "imageAdjustments" in layer ? layer.imageAdjustments : undefined;
      return [
        {
          layerId,
          name: layer.name,
          src,
          base: deriveBase(stack),
          original: stack,
          improved: false,
          status: "loading" as const
        }
      ];
    });
    setTargets(prepared);

    let cancelled = false;
    setAnalyzing(true);
    void Promise.all(
      prepared.map(async (t) => {
        const result = t.src !== undefined ? await analyzeImageForAutoFix(t.src) : null;
        if (result === null) return { ...t, status: "failed" as const };
        return { ...t, correction: result.correction, improved: result.improved, status: "ready" as const };
      })
    ).then((resolved) => {
      if (cancelled) return;
      setTargets(resolved);
      setAnalyzing(false);
    });

    // On close/cancel (target → null) or switching targets, restore the
    // originals unless the user committed via Apply.
    return () => {
      cancelled = true;
      if (!appliedRef.current && previewedRef.current) {
        previewStacks(
          target.pageId,
          targetsRef.current.map((t) => ({ layerId: t.layerId, stack: t.original }))
        );
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // ── Live preview on the real canvas (non-undoable) ──
  useEffect(() => {
    if (target === null) return;
    const ready = targets.filter((t) => t.status === "ready");
    if (ready.length === 0) return;
    previewedRef.current = true;
    previewStacks(
      target.pageId,
      ready.map((t) => ({ layerId: t.layerId, stack: buildStack(t, intensity, toggles) }))
    );
  }, [target, targets, intensity, toggles, previewStacks]);

  const primary = targets[0];
  const previewValues = useMemo<AutoFixBlendedValues | null>(() => {
    if (primary?.correction === undefined) return null;
    return blendAutoFixToValues(primary.correction, { intensity: intensity / 100, toggles });
  }, [primary, intensity, toggles]);

  if (target === null) return null;

  const ready = targets.filter((t) => t.status === "ready");
  const anyImprovable = ready.some((t) => t.improved);
  const hadAutoFix = targets.some((t) => t.original?.autoFix?.applied === true);

  function applyAt(commitIntensity: number): void {
    const pageId = pageIdRef.current;
    if (pageId === null) return;
    const live = targetsRef.current.filter((t) => t.status === "ready");
    if (live.length === 0) {
      close();
      return;
    }
    // Restore originals first so the undo record's "before" is the true original.
    previewStacks(pageId, live.map((t) => ({ layerId: t.layerId, stack: t.original })));
    commitStacks(
      pageId,
      live.map((t) => ({ layerId: t.layerId, stack: buildStack(t, commitIntensity, toggles) })),
      undefined,
      "AutoFixAction"
    );
    appliedRef.current = true;
    close();
  }

  const setToggle = (key: keyof AutoFixToggles): void =>
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div
      role="dialog"
      aria-modal="true"
      dir="rtl"
      onClick={close}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 3600,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 94vw)",
          maxHeight: "92vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          padding: 20,
          background: "var(--color-surface,#1b1b26)",
          border: "1px solid var(--color-border,#2a2a3e)",
          borderRadius: 12,
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          color: "var(--color-text,#eee)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>✨ תיקון אוטומטי</h3>
          <button className="ctx-item" onClick={close} type="button" style={{ width: "auto", padding: "2px 8px" }}>
            ✕
          </button>
        </div>

        {targets.length > 1 && (
          <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary,#9aa)" }}>
            יוחל על {targets.length} תמונות נבחרות.
          </p>
        )}

        {/* Before / after preview (primary image) */}
        {primary?.src !== undefined && (
          <div style={{ display: "flex", gap: 10 }}>
            <ThumbCard label="לפני" src={primary.src} filter="none" />
            <ThumbCard label="אחרי" src={primary.src} filter={previewValues ? cssFilter(previewValues) : "none"} />
          </div>
        )}

        {analyzing && <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary,#9aa)" }}>מנתח תמונה…</p>}
        {!analyzing && ready.length > 0 && !anyImprovable && (
          <p style={{ margin: 0, fontSize: 12, color: "#e0a000" }}>התמונה כבר מאוזנת — אין שיפור משמעותי להחיל.</p>
        )}
        {!analyzing && ready.length === 0 && (
          <p style={{ margin: 0, fontSize: 12, color: "#e0a000" }}>לא ניתן לנתח את התמונה.</p>
        )}

        {/* Intensity slider */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span>עוצמה</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{intensity}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={intensity}
            onChange={(e) => setIntensity(Number(e.target.value))}
            style={{ width: "100%" }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            {INTENSITY_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={intensity === p.value ? "toggle on" : "toggle"}
                onClick={() => setIntensity(p.value)}
                style={{ flex: 1 }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Feature toggles */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {TOGGLE_LABELS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={toggles[t.key] ? "toggle on" : "toggle"}
              onClick={() => setToggle(t.key)}
            >
              {toggles[t.key] ? "✓ " : ""}
              {t.label}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          {hadAutoFix && (
            <button type="button" className="toggle" onClick={() => applyAt(0)} style={{ marginInlineEnd: "auto" }}>
              בטל תיקון אוטומטי
            </button>
          )}
          <button type="button" className="toggle" onClick={close}>
            ביטול
          </button>
          <button
            type="button"
            className="toggle on"
            disabled={ready.length === 0}
            onClick={() => applyAt(intensity)}
          >
            החל
          </button>
        </div>
      </div>
    </div>
  );
}

function ThumbCard({ label, src, filter }: { label: string; src: string; filter: string }): ReactElement {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, color: "var(--color-text-secondary,#9aa)" }}>{label}</span>
      <div
        style={{
          width: "100%",
          aspectRatio: "4 / 3",
          borderRadius: 8,
          overflow: "hidden",
          background: "#000",
          border: "1px solid var(--color-border,#2a2a3e)"
        }}
      >
        <img
          src={src}
          alt={label}
          style={{ width: "100%", height: "100%", objectFit: "contain", filter }}
        />
      </div>
    </div>
  );
}
