/**
 * Shadow/Highlights modal — Photoshop-style LOCAL shadow/highlight recovery (V1)
 * plus scene-aware Smart Options (V2).
 *
 * Opened from the image context menu ("צללים / אורות…") or the inspector quick
 * controls — NOT from the preset library. Edits a single image-bearing layer's
 * `shadowHighlights` adjustment. The SAME pixel pipeline drives the live canvas
 * preview and the final export (see imageAdjustmentPipeline), so what you see is
 * what prints.
 *
 * Like the Curves modal this is a DRAGGABLE, non-modal floating panel: preview is
 * live on the real canvas via previewImageAdjustmentStacks (NON-undoable); Apply
 * commits one undo record via setImageAdjustmentStacks; Cancel / unmount restores
 * the original stack. Re-opening loads the layer's existing settings.
 *
 * V2 analysis (face boxes + noise score) runs once on open via
 * analyzeSmartShadowHighlights and is cached into the adjustment so the renderer
 * reproduces the smart result deterministically.
 */

import { useEffect, useRef, useState, type ReactElement, type PointerEvent as ReactPointerEvent } from "react";
import { useShadowHighlightsStore } from "@/state/shadowHighlightsStore";
import { useDocumentStore } from "@/state/documentStore";
import { resolveCanvasAssetPath } from "@/core/assets/assetManager";
import { ThrottledSlider } from "@/ui/editor/ThrottledSlider";
import { ENABLE_SMART_SHADOW_HIGHLIGHTS_V2 } from "@/core/features/adjustmentFlags";
import {
  analyzeSmartShadowHighlights,
  type SmartShadowHighlightsAnalysis,
  type SmartShadowHighlightsDiagnostics
} from "@/services/ai/smartShadowHighlightsService";
import {
  IMAGE_ADJUSTMENT_DEFAULTS,
  createImageAdjustment,
  type ImageAdjustment,
  type ImageAdjustmentStack,
  type ShadowHighlightsAdjustment,
  type ShadowHighlightsParams,
  type SmartFaceRegion
} from "@/types/imageAdjustments";
import type { VisualLayer } from "@/types/layers";

const PANEL_W = 320;

type Draft = ShadowHighlightsParams;

/** Fresh draft with the spec's recommended natural defaults. */
function newDraft(): Draft {
  return {
    ...IMAGE_ADJUSTMENT_DEFAULTS.shadowHighlights,
    // Recommended starting point (spec §10): region-aware, gentle, face-forward.
    shadows: 20,
    highlights: 28,
    faceShadows: 42,
    protectBrightFaces: 80,
    protectHighlights: 75,
    preserveSkinTones: 60,
    shadowSaturation: -10,
    clothingProtection: 80,
    localContrast: 12,
    smart: ENABLE_SMART_SHADOW_HIGHLIGHTS_V2,
    auto: false,
    faceRegions: undefined,
    noiseScore: undefined
  };
}

function getAssetIdFor(layer: VisualLayer): string | undefined {
  if (layer.type === "image") return layer.assetId;
  if (layer.type === "frame") return layer.imageAssetId;
  return undefined;
}

/** Pull an existing modal-authored shadowHighlights adjustment off the stack. */
function findShadowHighlights(stack: ImageAdjustment[]): ShadowHighlightsAdjustment | null {
  for (const adj of stack) if (adj.type === "shadowHighlights") return adj;
  return null;
}

/** Build the committed stack: base (minus any existing shadowHighlights) + new one. */
function buildStack(original: ImageAdjustmentStack | undefined, draft: Draft): ImageAdjustmentStack {
  const base = (original?.stack ?? []).filter((a) => a.type !== "shadowHighlights");
  const adj = createImageAdjustment({ type: "shadowHighlights", ...draft });
  // Deterministic order: after tone/colour, before spatial detail/effects.
  const detailIdx = base.findIndex((a) => a.type === "detail");
  const stack = detailIdx === -1 ? [...base, adj] : [...base.slice(0, detailIdx), adj, ...base.slice(detailIdx)];
  return { ...(original ?? { enabled: true, stack: [] }), enabled: true, stack };
}

export function ShadowHighlightsModal(): ReactElement | null {
  const target = useShadowHighlightsStore((s) => s.target);
  const close = useShadowHighlightsStore((s) => s.close);
  const previewStacks = useDocumentStore((s) => s.previewImageAdjustmentStacks);
  const commitStacks = useDocumentStore((s) => s.setImageAdjustmentStacks);

  const [draft, setDraft] = useState<Draft>(newDraft);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [selectedFace, setSelectedFace] = useState<number | null>(null);
  const [thumbSrc, setThumbSrc] = useState<string | undefined>(undefined);
  const [analyzing, setAnalyzing] = useState(false);
  const [diag, setDiag] = useState<SmartShadowHighlightsDiagnostics | null>(null);
  const [suggested, setSuggested] = useState<SmartShadowHighlightsAnalysis["suggested"] | null>(null);
  const [showBefore, setShowBefore] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 24, top: 84 });

  const appliedRef = useRef(false);
  const previewedRef = useRef(false);
  const originalRef = useRef<ImageAdjustmentStack | undefined>(undefined);
  const pageIdRef = useRef<string | null>(null);
  const layerIdRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  // ── Load layer state + run scene analysis when opened ──
  useEffect(() => {
    if (target === null) return;
    appliedRef.current = false;
    previewedRef.current = false;
    pageIdRef.current = target.pageId;
    layerIdRef.current = target.layerId;
    setAdvancedOpen(false);
    setManualOpen(false);
    setSelectedFace(null);
    setShowBefore(false);
    setDiag(null);
    setSuggested(null);
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
    const existing = original !== undefined ? findShadowHighlights(original.stack) : null;
    const seeded: Draft = existing !== null
      ? { ...IMAGE_ADJUSTMENT_DEFAULTS.shadowHighlights, ...stripMeta(existing) }
      : newDraft();
    setDraft(seeded);

    const assetId = getAssetIdFor(layer);
    const src = assetId !== undefined ? resolveCanvasAssetPath(document?.assets.find((a) => a.id === assetId)) : undefined;
    setThumbSrc(src);

    let cancelled = false;
    if (ENABLE_SMART_SHADOW_HIGHLIGHTS_V2 && seeded.smart !== false && src !== undefined) {
      setAnalyzing(true);
      void analyzeSmartShadowHighlights(src, { prioritizeFaces: true, noiseProtection: true })
        .then((result) => {
          if (cancelled || result === null) return;
          setDraft((d) => ({ ...d, faceRegions: result.faceRegions, noiseScore: result.noiseScore }));
          setDiag(result.diagnostics);
          setSuggested(result.suggested);
        })
        .finally(() => {
          if (!cancelled) setAnalyzing(false);
        });
    }

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
      const stack = showBefore ? originalRef.current : buildStack(originalRef.current, draft);
      previewStacks(target.pageId, [{ layerId: target.layerId, stack }]);
    });
  }, [target, draft, showBefore, previewStacks]);

  // ── Window-level drag for the floating panel ──
  useEffect(() => {
    const onMove = (e: PointerEvent): void => {
      if (dragRef.current === null) return;
      setPos({
        left: Math.max(0, Math.min(window.innerWidth - 60, e.clientX - dragRef.current.dx)),
        top: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragRef.current.dy))
      });
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

  // ── Escape cancels ──
  useEffect(() => {
    if (target === null) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (target === null) return null;

  const patch = (p: Partial<Draft>): void => setDraft((d) => ({ ...d, ...p }));

  /** Patch one detected face's per-face manual values (by index). */
  const patchFace = (index: number, p: Partial<SmartFaceRegion>): void =>
    setDraft((d) => {
      const faces = (d.faceRegions ?? []).map((f, i) => (i === index ? { ...f, ...p } : f));
      return { ...d, faceRegions: faces };
    });

  const apply = (): void => {
    const pageId = pageIdRef.current;
    const layerId = layerIdRef.current;
    if (pageId === null || layerId === null) return;
    previewStacks(pageId, [{ layerId, stack: originalRef.current }]);
    commitStacks(pageId, [{ layerId, stack: buildStack(originalRef.current, draft) }], undefined, "ShadowHighlightsAction");
    appliedRef.current = true;
    close();
  };

  const reset = (): void => setDraft((d) => ({ ...newDraft(), faceRegions: d.faceRegions, noiseScore: d.noiseScore }));

  /** Auto Smart Shadows — apply the analysis-derived, natural control set. */
  const applyAuto = (): void => {
    if (suggested === null) return;
    setDraft((d) => ({ ...d, ...suggested, smart: true, auto: true }));
  };

  const startPanelDrag = (e: ReactPointerEvent): void => {
    dragRef.current = { dx: e.clientX - pos.left, dy: e.clientY - pos.top };
  };

  const smartOn = ENABLE_SMART_SHADOW_HIGHLIGHTS_V2 && draft.smart !== false;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="צללים / אורות"
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
        gap: 10,
        padding: 16,
        background: "var(--color-surface,#1b1b26)",
        border: "1px solid var(--color-border,#2a2a3e)",
        borderRadius: 12,
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        color: "var(--color-text,#eee)"
      }}
    >
      <div
        onPointerDown={startPanelDrag}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "move", userSelect: "none" }}
      >
        <h3 style={{ margin: 0, fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ opacity: 0.5, fontSize: 13 }}>⠿</span> צללים / אורות
        </h3>
        <button className="ctx-item" onClick={close} type="button" style={{ width: "auto", padding: "2px 8px" }}>
          ✕
        </button>
      </div>

      {/* Smart master toggle + Auto */}
      {ENABLE_SMART_SHADOW_HIGHLIGHTS_V2 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={draft.smart !== false}
              onChange={(e) => patch({ smart: e.target.checked })}
              style={{ accentColor: "var(--accent)" }}
            />
            תיקון חכם מבוסס-אזורים
            {analyzing && <span style={{ fontSize: 10, color: "var(--color-text-tertiary,#777)" }}>מנתח…</span>}
            {draft.auto === true && <span style={{ fontSize: 10, color: "var(--accent,#5b8cff)" }}>Auto</span>}
          </label>
          <button
            type="button"
            className={draft.auto === true ? "toggle on" : "toggle"}
            disabled={suggested === null}
            title="ניתוח התמונה והגדרה אוטומטית טבעית"
            style={{ fontSize: 11, padding: "2px 8px" }}
            onClick={applyAuto}
          >
            ✨ Auto
          </button>
        </div>
      )}

      {/* Primary recovery */}
      <ThrottledSlider label="צללים גלובליים" value={draft.shadows} min={0} max={100} onCommit={(v) => patch({ shadows: v, auto: false })} />
      {smartOn && (
        <ThrottledSlider label="צללי פנים" value={draft.faceShadows ?? 0} min={0} max={100} onCommit={(v) => patch({ faceShadows: v, auto: false })} />
      )}
      <ThrottledSlider label="שחזור אורות" value={draft.highlights} min={0} max={100} onCommit={(v) => patch({ highlights: v, auto: false })} />

      {/* Protection group */}
      {smartOn && (
        <div style={{ borderTop: "1px solid var(--color-border,#2a2a3e)", paddingTop: 8 }}>
          <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary,#aaa)" }}>הגנות</p>
          <ThrottledSlider label="הגנה על פנים בהירות" value={draft.protectBrightFaces ?? 80} min={0} max={100} onCommit={(v) => patch({ protectBrightFaces: v, auto: false })} />
          <ThrottledSlider label="הגנה על אורות (חולצות/שמיים)" value={draft.protectHighlights ?? 75} min={0} max={100} onCommit={(v) => patch({ protectHighlights: v, auto: false })} />
          <ThrottledSlider label="הגנה על בגדים כהים" value={draft.clothingProtection ?? 80} min={0} max={100} onCommit={(v) => patch({ clothingProtection: v, auto: false })} />
          <ThrottledSlider label="שמירה על גווני עור" value={draft.preserveSkinTones ?? 60} min={0} max={100} onCommit={(v) => patch({ preserveSkinTones: v, auto: false })} />
          <ThrottledSlider label="רוויית צללים" value={draft.shadowSaturation ?? -10} min={-50} max={0} onCommit={(v) => patch({ shadowSaturation: v, auto: false })} />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
              <input type="checkbox" checked={draft.protectSky !== false} onChange={(e) => patch({ protectSky: e.target.checked })} style={{ accentColor: "var(--accent)" }} />
              שמיים
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
              <input type="checkbox" checked={draft.noiseProtection !== false} onChange={(e) => patch({ noiseProtection: e.target.checked })} style={{ accentColor: "var(--accent)" }} />
              הגנה מרעש
            </label>
          </div>
          {diag !== null && (
            <p style={{ margin: "4px 0 0", fontSize: 10, color: "var(--color-text-tertiary,#777)", lineHeight: 1.5 }}>
              {diag.faceCount > 0 ? `${diag.faceCount} פנים (${diag.underexposedFaces} דורשות תיקון)` : "לא זוהו פנים"}
              {` · שמיים ${Math.round(diag.skyCoverage * 100)}% · עור ${Math.round(diag.skinCoverage * 100)}% · רעש ${Math.round(diag.noiseScore)}`}
            </p>
          )}
        </div>
      )}

      {/* Per-face manual fine-tuning (numbered boxes) */}
      {smartOn && (draft.faceRegions?.length ?? 0) > 0 && (
        <div style={{ borderTop: "1px solid var(--color-border,#2a2a3e)", paddingTop: 8 }}>
          <button
            type="button"
            onClick={() => setManualOpen((v) => !v)}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary,#aaa)" }}
          >
            {manualOpen ? "▾" : "▸"} כוונון ידני לכל פנים ({draft.faceRegions!.length})
          </button>
          {manualOpen && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
              <FacePickerThumb
                src={thumbSrc}
                faces={draft.faceRegions!}
                selected={selectedFace}
                onSelect={(i) => setSelectedFace((cur) => (cur === i ? null : i))}
              />
              {/* Number chips for selecting a face without clicking the (small) box. */}
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {draft.faceRegions!.map((f, i) => (
                  <button
                    key={i}
                    type="button"
                    className={selectedFace === i ? "toggle on" : "toggle"}
                    onClick={() => setSelectedFace((cur) => (cur === i ? null : i))}
                    title={f.underexposureScore !== undefined ? `ציון תת-חשיפה ${Math.round(f.underexposureScore)}` : undefined}
                    style={{ minWidth: 30, fontSize: 12, padding: "2px 6px" }}
                  >
                    {i + 1}{((f.shadows ?? 0) !== 0 || (f.highlights ?? 0) !== 0) ? " ●" : ""}
                  </button>
                ))}
              </div>
              {selectedFace !== null && draft.faceRegions![selectedFace] !== undefined ? (
                <div style={{ border: "1px solid var(--color-border,#2a2a3e)", borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>פנים #{selectedFace + 1}</span>
                    <button
                      type="button"
                      className="toggle"
                      style={{ fontSize: 11, padding: "1px 6px" }}
                      onClick={() => patchFace(selectedFace, { shadows: 0, highlights: 0 })}
                    >
                      ↺ אפס פנים
                    </button>
                  </div>
                  <ThrottledSlider
                    label="צללים (פנים אלו)"
                    value={draft.faceRegions![selectedFace]!.shadows ?? 0}
                    min={0}
                    max={100}
                    onCommit={(v) => patchFace(selectedFace, { shadows: v })}
                  />
                  <ThrottledSlider
                    label="אורות (פנים אלו)"
                    value={draft.faceRegions![selectedFace]!.highlights ?? 0}
                    min={0}
                    max={100}
                    onCommit={(v) => patchFace(selectedFace, { highlights: v })}
                  />
                  <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--color-text-tertiary,#777)" }}>
                    התיקון חל רק על הפנים הנבחרות (מעבר רך), ושומר על בגדים/רקע ללא שינוי.
                  </p>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-tertiary,#777)" }}>
                  בחר מספר פנים כדי לכוונן צללים/אורות רק עליהן.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Advanced (collapsible) */}
      <div style={{ borderTop: "1px solid var(--color-border,#2a2a3e)", paddingTop: 8 }}>
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--color-text-secondary,#aaa)" }}
        >
          {advancedOpen ? "▾" : "▸"} מתקדם
        </button>
        {advancedOpen && (
          <div style={{ marginTop: 8 }}>
            <ThrottledSlider label="רדיוס" value={draft.radius} min={0} max={200} onCommit={(v) => patch({ radius: v })} />
            <ThrottledSlider label="קונטרסט מקומי" value={draft.localContrast} min={0} max={100} onCommit={(v) => patch({ localContrast: v })} />
            <ThrottledSlider label="תיקון צבע" value={draft.colorCorrection} min={-50} max={50} onCommit={(v) => patch({ colorCorrection: v })} />
            <ThrottledSlider label="קונטרסט גוונים" value={draft.midtoneContrast} min={-50} max={50} onCommit={(v) => patch({ midtoneContrast: v })} />
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" className="toggle" onClick={reset}>
          ↺ איפוס
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
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="toggle" onClick={close}>
          ביטול
        </button>
        <button type="button" className="toggle on" onClick={apply}>
          החל
        </button>
      </div>
    </div>
  );
}

/** Strip discriminant/meta so an existing adjustment can re-seed the draft. */
function stripMeta(adj: ShadowHighlightsAdjustment): ShadowHighlightsParams {
  const { id: _id, type: _type, enabled: _enabled, ...params } = adj;
  return params;
}

/**
 * Image thumbnail with numbered, clickable face boxes drawn on top (normalised
 * coords → percentages, so it works at any thumbnail size). A face that has a
 * manual override is highlighted; the selected one is accented.
 */
function FacePickerThumb({
  src,
  faces,
  selected,
  onSelect
}: {
  src: string | undefined;
  faces: SmartFaceRegion[];
  selected: number | null;
  onSelect: (index: number) => void;
}): ReactElement {
  return (
    <div style={{ position: "relative", width: "100%", background: "#000", borderRadius: 6, overflow: "hidden", border: "1px solid var(--color-border,#2a2a3e)" }}>
      {src !== undefined ? (
        // width:100% + height:auto keeps the element box == the picture box (no
        // letterbox), so the percentage-positioned face boxes stay aligned.
        <img src={src} alt="פנים שזוהו" draggable={false} style={{ width: "100%", height: "auto", maxHeight: 220, objectFit: "fill", display: "block" }} />
      ) : (
        <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#888" }}>אין תצוגה</div>
      )}
      {faces.map((f, i) => {
        const tuned = (f.shadows ?? 0) !== 0 || (f.highlights ?? 0) !== 0;
        const isSel = selected === i;
        const color = isSel ? "var(--accent,#5b8cff)" : tuned ? "#4ade80" : "rgba(255,255,255,0.85)";
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            title={`פנים #${i + 1}`}
            style={{
              position: "absolute",
              left: `${f.x * 100}%`,
              top: `${f.y * 100}%`,
              width: `${f.width * 100}%`,
              height: `${f.height * 100}%`,
              border: `2px solid ${color}`,
              borderRadius: 4,
              background: isSel ? "rgba(91,140,255,0.15)" : "transparent",
              cursor: "pointer",
              padding: 0
            }}
          >
            <span
              style={{
                position: "absolute",
                top: -2,
                insetInlineStart: -2,
                background: color,
                color: "#000",
                fontSize: 10,
                fontWeight: 700,
                lineHeight: 1,
                padding: "2px 4px",
                borderRadius: 3
              }}
            >
              {i + 1}
            </span>
          </button>
        );
      })}
    </div>
  );
}
