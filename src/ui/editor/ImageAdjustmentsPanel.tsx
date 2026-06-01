import { useState, type ReactElement } from "react";
import { useDocumentStore } from "@/state/documentStore";
import { ThrottledSlider } from "@/ui/editor/ThrottledSlider";
import { ToolLibrary } from "@/ui/editor/ToolLibrary";
import { runWithBusy } from "@/state/uiBusyStore";
import { resolveCanvasAssetPath } from "@/core/assets/assetManager";
import { analyzeImageForFixes } from "@/services/ai/suggestedFixesService";
import type { ImageAutoAnalysis, SuggestedFix } from "@/core/analysis/imageAutoAnalysis";
import type { LibraryItem } from "@/core/presets/toolLibrary";
import { ENABLE_IMAGE_LEVEL_ADJUSTMENTS } from "@/core/features/adjustmentFlags";
import { ADJUSTMENT_LABELS, PARAM_CONFIG } from "@/ui/editor/adjustmentParamConfig";
import {
  CURVE_PRESET_IDS,
  type CurvePresetId,
  type GradientStop,
  type ImageAdjustment,
  type ImageAdjustmentTemplate
} from "@/types/imageAdjustments";
import type { FrameLayer, ImageLayer } from "@/types/layers";

type AdjustableImageLayer = ImageLayer | FrameLayer;

const smallBadgeStyle = {
  fontSize: 10,
  lineHeight: 1,
  padding: "4px 6px",
  borderRadius: 6,
  border: "1px solid var(--color-border,#2a2a3e)",
  color: "var(--color-text-secondary,#aaa)"
} as const;

function getAdjustableAssetId(layer: AdjustableImageLayer): string | undefined {
  return layer.type === "image" ? layer.assetId : layer.imageAssetId;
}

export function ImageAdjustmentsPanel({ layer }: { layer: AdjustableImageLayer }): ReactElement | null {
  const pageId = useDocumentStore((s) => s.activePageId);
  const addImageAdjustment = useDocumentStore((s) => s.addImageAdjustment);
  const applyAdjustmentToAllImagesOnPage = useDocumentStore((s) => s.applyAdjustmentToAllImagesOnPage);
  const updateImageAdjustment = useDocumentStore((s) => s.updateImageAdjustment);
  const removeImageAdjustment = useDocumentStore((s) => s.removeImageAdjustment);
  const toggleImageAdjustment = useDocumentStore((s) => s.toggleImageAdjustment);
  const resetImageAdjustments = useDocumentStore((s) => s.resetImageAdjustments);
  const copyImageAdjustments = useDocumentStore((s) => s.copyImageAdjustments);
  const pasteImageAdjustments = useDocumentStore((s) => s.pasteImageAdjustments);
  const hasClipboard = useDocumentStore((s) => s.imageAdjustmentsClipboard !== null);
  const applyPresetToImage = useDocumentStore((s) => s.applyPresetToImage);
  const applyPresetToAllImagesOnPage = useDocumentStore((s) => s.applyPresetToAllImagesOnPage);
  const applyPresetToDuplicatedImage = useDocumentStore((s) => s.applyPresetToDuplicatedImage);
  const applyPresetAsPageLook = useDocumentStore((s) => s.applyPresetAsPageLook);
  const updateAppliedPresetStrength = useDocumentStore((s) => s.updateAppliedPresetStrength);
  const removeAppliedPreset = useDocumentStore((s) => s.removeAppliedPreset);
  const assetId = getAdjustableAssetId(layer);
  const assetSrc = useDocumentStore((s) =>
    resolveCanvasAssetPath(s.document?.assets.find((a) => a.id === assetId))
  );
  const [libraryOpen, setLibraryOpen] = useState(false);

  if (!ENABLE_IMAGE_LEVEL_ADJUSTMENTS || pageId === null || assetId === undefined) return null;

  const stack = layer.imageAdjustments?.stack ?? [];
  const presetInstances = layer.imageAdjustments?.presetInstances ?? [];

  const handleLibraryApply = (
    item: LibraryItem,
    strength: number,
    applyToAll: boolean,
    duplicate: boolean,
    extra: ImageAdjustmentTemplate[]
  ): void => {
    if (item.kind === "tool" || item.kind === "aiTool") {
      // `extra` carries the concrete, edited recipe (tool sliders / AI analysis).
      if (applyToAll) {
        for (const template of extra) applyAdjustmentToAllImagesOnPage(pageId, template);
      } else {
        for (const template of extra) addImageAdjustment(pageId, layer.id, template);
      }
    } else if (item.kind === "imagePreset" && item.presetId !== undefined) {
      if (applyToAll) {
        void runWithBusy("מחיל פריסט על כל תמונות העמוד…", () =>
          applyPresetToAllImagesOnPage(pageId, item.presetId!, strength, extra)
        );
      } else if (duplicate) {
        applyPresetToDuplicatedImage(pageId, layer.id, item.presetId, strength, extra);
      } else {
        applyPresetToImage(pageId, layer.id, item.presetId, strength, extra);
      }
    } else if (item.kind === "pageLookPreset" && item.presetId !== undefined) {
      applyPresetAsPageLook(pageId, item.presetId, strength);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-secondary,#888)", lineHeight: 1.5 }}>
        התאמות לא־הרסניות שרצות ישירות על התמונה. אותו צינור משמש לתצוגה ולייצוא — מה שרואים זה מה שמודפס.
      </p>

      <button className="btn btn-primary" type="button" onClick={() => setLibraryOpen(true)}>
        + ספריית כלים
      </button>

      {libraryOpen && (
        <ToolLibrary
          context="image"
          previewSrc={assetSrc}
          previewLabel={layer.name}
          selectedCount={1}
          onApply={handleLibraryApply}
          onClose={() => setLibraryOpen(false)}
        />
      )}

      <SuggestedFixesSection
        assetSrc={assetSrc}
        onApply={(fix) => applyPresetToImage(pageId, layer.id, fix.presetId, fix.recommendedStrength)}
      />

      {stack.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-tertiary,#666)" }}>אין התאמות פעילות.</p>
      ) : (
        stack.map((adj) => (
          <AdjustmentCard
            key={adj.id}
            adjustment={adj}
            onToggle={() => toggleImageAdjustment(pageId, layer.id, adj.id)}
            onRemove={() => removeImageAdjustment(pageId, layer.id, adj.id)}
            onPatch={(patch) => updateImageAdjustment(pageId, layer.id, adj.id, patch)}
          />
        ))
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button
          className="btn btn-ghost"
          type="button"
          disabled={stack.length === 0}
          onClick={() => copyImageAdjustments(pageId, layer.id)}
        >
          העתק
        </button>
        <button
          className="btn btn-ghost"
          type="button"
          disabled={!hasClipboard}
          onClick={() => pasteImageAdjustments(pageId, [layer.id])}
        >
          הדבק
        </button>
        <button
          className="btn btn-ghost"
          type="button"
          disabled={layer.imageAdjustments === undefined}
          onClick={() => resetImageAdjustments(pageId, layer.id)}
        >
          ↺ איפוס הכל
        </button>
      </div>

      {presetInstances.length > 0 && (
        <div style={{ borderTop: "1px solid var(--color-border,#2a2a3e)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-secondary,#888)" }}>פריסטים שהוחלו</p>
          {presetInstances.map((preset) => (
            <div key={preset.id} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary,#ddd)" }}>{preset.name}</span>
                <button
                  type="button"
                  onClick={() => removeAppliedPreset(pageId, layer.id, preset.id)}
                  title="הסר פריסט"
                  style={{ background: "none", border: "none", color: "var(--color-text-secondary,#888)", cursor: "pointer", fontSize: 15 }}
                >
                  ✕
                </button>
              </div>
              <ThrottledSlider
                label="עוצמה"
                value={Math.round(preset.strength * 100)}
                min={0}
                max={100}
                step={1}
                onCommit={(v) => updateAppliedPresetStrength(pageId, layer.id, preset.id, v / 100)}
                format={(v) => `${Math.round(v)}%`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "תיקונים מומלצים" — runs the light Smart/AI analysis (שלב 6) which reuses the
 * existing face detection to sample skin tone, then recommends EXISTING presets.
 * Fully optional and fallback-safe: if analysis yields nothing it says so.
 */
function SuggestedFixesSection({
  assetSrc,
  onApply
}: {
  assetSrc: string | undefined;
  onApply: (fix: SuggestedFix) => void;
}): ReactElement {
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [analysis, setAnalysis] = useState<ImageAutoAnalysis | null>(null);
  const [fixes, setFixes] = useState<SuggestedFix[]>([]);

  const run = async (): Promise<void> => {
    setState("running");
    const result = await analyzeImageForFixes(assetSrc);
    setAnalysis(result);
    setFixes(result?.suggestions ?? []);
    setState("done");
  };

  return (
    <div style={{ borderTop: "1px solid var(--color-border,#2a2a3e)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      <button
        className="btn btn-ghost"
        type="button"
        disabled={assetSrc === undefined || state === "running"}
        onClick={() => void run()}
        title="ניתוח חכם של התמונה והמלצה על פריסטים מתאימים"
      >
        {state === "running" ? "מנתח…" : "✨ תיקונים מומלצים"}
      </button>

      {state === "done" && fixes.length === 0 && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-tertiary,#666)" }}>
          No strong correction recommended. The image does not appear underexposed, so no brightness boost was applied.
        </p>
      )}

      {state === "done" && analysis !== null && (analysis.issues?.length ?? 0) > 0 && (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {analysis.issues!.slice(0, 4).map((issue) => (
            <span key={issue.type} style={smallBadgeStyle}>
              {issue.type.replace(/_/g, " ")} {Math.round(issue.confidence * 100)}%
            </span>
          ))}
        </div>
      )}

      {fixes.map((fix) => (
        <div
          key={fix.presetId}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            border: "1px solid var(--color-border,#2a2a3e)",
            borderRadius: 6,
            padding: "6px 8px"
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary,#ddd)" }}>{fix.presetName}</span>
            <span style={{ fontSize: 11, color: "var(--color-text-secondary,#888)", lineHeight: 1.3 }}>{fix.reason}</span>
          </div>
          <button className="btn btn-primary" type="button" style={{ flexShrink: 0 }} onClick={() => onApply(fix)}>
            החל
          </button>
        </div>
      ))}
    </div>
  );
}

function AdjustmentCard({
  adjustment,
  onToggle,
  onRemove,
  onPatch
}: {
  adjustment: ImageAdjustment;
  onToggle: () => void;
  onRemove: () => void;
  onPatch: (patch: Partial<ImageAdjustment>) => void;
}): ReactElement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params = adjustment as any;
  const sliders = PARAM_CONFIG[adjustment.type];

  return (
    <div
      style={{
        border: "1px solid var(--color-border,#2a2a3e)",
        borderRadius: 6,
        padding: "8px 10px",
        opacity: adjustment.enabled ? 1 : 0.5
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          <input type="checkbox" checked={adjustment.enabled} onChange={onToggle} style={{ accentColor: "var(--accent)" }} />
          {ADJUSTMENT_LABELS[adjustment.type]}
        </label>
        <button
          type="button"
          onClick={onRemove}
          title="הסר התאמה"
          style={{ background: "none", border: "none", color: "var(--color-text-secondary,#888)", cursor: "pointer", fontSize: 16 }}
        >
          ✕
        </button>
      </div>

      {sliders.map((cfg) => {
        const value = typeof params[cfg.key] === "number" ? (params[cfg.key] as number) : cfg.min;
        return (
          <ThrottledSlider
            key={cfg.key}
            label={cfg.label}
            value={value}
            min={cfg.min}
            max={cfg.max}
            step={cfg.step ?? 1}
            onCommit={(v) => onPatch({ [cfg.key]: v } as Partial<ImageAdjustment>)}
          />
        );
      })}

      {adjustment.type === "curves" && (
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
          פריסט עקומה
          <select
            value={adjustment.preset ?? "linear"}
            onChange={(e) => onPatch({ preset: e.target.value as CurvePresetId, points: undefined } as Partial<ImageAdjustment>)}
            style={{ fontSize: 12, padding: "4px 6px" }}
          >
            {CURVE_PRESET_IDS.map((preset) => (
              <option key={preset} value={preset}>
                {preset}
              </option>
            ))}
          </select>
        </label>
      )}

      {adjustment.type === "gradientMap" && (
        <GradientStopsEditor stops={adjustment.stops} onPatch={onPatch} />
      )}
    </div>
  );
}

function GradientStopsEditor({
  stops,
  onPatch
}: {
  stops: GradientStop[];
  onPatch: (patch: Partial<ImageAdjustment>) => void;
}): ReactElement {
  const first = stops[0] ?? { position: 0, color: "#000000" };
  const mid = stops.length >= 3 ? stops[1]! : { position: 0.5, color: "#777777" };
  const last = stops[stops.length - 1] ?? { position: 1, color: "#ffffff" };

  const update = (which: "first" | "mid" | "last", color: string): void => {
    const next: GradientStop[] = stops.length >= 3 ? [...stops] : [{ ...first }, { ...mid }, { ...last }];
    if (which === "first") next[0] = { ...next[0]!, position: 0, color };
    else if (which === "mid") next[1] = { ...next[1]!, position: 0.5, color };
    else next[next.length - 1] = { ...next[next.length - 1]!, position: 1, color };
    onPatch({ stops: next } as Partial<ImageAdjustment>);
  };

  return (
    <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
        צל
        <input type="color" value={first.color} onChange={(e) => update("first", e.target.value)} style={{ width: 36, height: 26 }} />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
        Mid
        <input type="color" value={mid.color} onChange={(e) => update("mid", e.target.value)} style={{ width: 36, height: 26 }} />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
        אור
        <input type="color" value={last.color} onChange={(e) => update("last", e.target.value)} style={{ width: 36, height: 26 }} />
      </label>
    </div>
  );
}
