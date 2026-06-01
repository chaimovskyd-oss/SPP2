import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  buildLibraryItems,
  libraryCategories,
  recentItems,
  recommendedItems,
  searchLibrary,
  type LibraryContext,
  type LibraryItem
} from "@/core/presets/toolLibrary";
import { getPreset } from "@/core/presets/smartPresets";
import {
  buildCustomPresetDefinition,
  fineTuneTemplates,
  isNeutralFineTune,
  NEUTRAL_FINE_TUNE,
  type PresetFineTune
} from "@/core/presets/customPresets";
import { useToolLibraryStore } from "@/state/toolLibraryStore";
import { useCustomPresetStore } from "@/state/customPresetStore";
import { ThrottledSlider } from "@/ui/editor/ThrottledSlider";
import { ADJUSTMENT_LABELS, PARAM_CONFIG } from "@/ui/editor/adjustmentParamConfig";
import { analyzeAndBuildEnhance } from "@/services/ai/autoEnhanceService";
import {
  CURVE_PRESET_IDS,
  createImageAdjustment,
  IMAGE_ADJUSTMENT_DEFAULTS,
  type CurvePresetId,
  type ImageAdjustment,
  type ImageAdjustmentTemplate,
  type ImageAdjustmentType
} from "@/types/imageAdjustments";
import {
  clearPreviewBitmapCache,
  combinedPreviewAdjustments,
  loadPreviewBitmap,
  paintPreviewBuffer,
  renderPresetPreviewData,
  type PreviewBuffer
} from "@/services/preview/presetPreviewService";

/**
 * Unified Tool Library (plan שלב 4 + preview phase) — a large, searchable,
 * categorized catalog with a FAST before/after preview of the selected image.
 *
 * Layout (logical order, RTL): left = search + categories + preset cards,
 * center = before/after preview, end = name/description/strength/apply.
 *
 * The preview never touches document state — it runs the pure pixel pipeline on
 * a small cached bitmap (see presetPreviewService). Nothing is committed until
 * the user clicks "החל".
 */
export interface ToolLibraryProps {
  context: LibraryContext;
  /**
   * Called when the user applies an item. strength is 0..1 (presets only; tools/effects get 1).
   * applyToAll is true when the user chose "apply to all images on the page" (image presets only).
   * duplicate is true when the user chose "duplicate layer & apply" (single image preset only).
   */
  onApply: (
    item: LibraryItem,
    strength: number,
    applyToAll: boolean,
    duplicate: boolean,
    extra: ImageAdjustmentTemplate[]
  ) => void;
  onClose: () => void;
  /** src/data-URL of the image to preview against (the selected image). */
  previewSrc?: string;
  /** label of the preview target (e.g. layer name) shown in the preview pane. */
  previewLabel?: string;
  /** how many images the preset would apply to (for the multi-select note). */
  selectedCount?: number;
}

const ALL_CATEGORIES = "__all__";
/** side = original next to edited (default), split = wipe divider, before/after = single. */
type PreviewMode = "side" | "split" | "before" | "after";
/** How an image preset is committed: in place, on a duplicate, or to all images. */
type ApplyMode = "layer" | "duplicate" | "all";

type AiState = "idle" | "running" | "done";

/** Seed an editable slider draft for a raw tool from its neutral defaults. */
function initToolDraft(type: ImageAdjustmentType): Record<string, number> {
  const cfg = PARAM_CONFIG[type];
  const defaults = IMAGE_ADJUSTMENT_DEFAULTS[type] as unknown as Record<string, number>;
  const draft: Record<string, number> = {};
  for (const slider of cfg) draft[slider.key] = defaults[slider.key] ?? 0;
  return draft;
}

/** Turn the live tool draft into the concrete template that gets applied/previewed. */
function buildToolTemplate(
  type: ImageAdjustmentType,
  draft: Record<string, number>,
  curvePreset: CurvePresetId
): ImageAdjustmentTemplate {
  if (type === "curves") return { type: "curves", channel: "rgb", preset: curvePreset };
  if (type === "gradientMap") return { type: "gradientMap" };
  return { type, ...draft } as ImageAdjustmentTemplate;
}

/** Short Hebrew-ish summary lines describing the templates an AI recipe will add. */
function recipeSummary(templates: ImageAdjustmentTemplate[]): string[] {
  return templates.map((template) => {
    const label = ADJUSTMENT_LABELS[template.type];
    const parts: string[] = [];
    for (const [key, value] of Object.entries(template)) {
      if (key === "type" || key === "enabled") continue;
      if (typeof value === "number" && value !== 0) parts.push(`${key} ${value > 0 ? "+" : ""}${value}`);
    }
    return parts.length > 0 ? `${label} — ${parts.join(", ")}` : label;
  });
}

export function ToolLibrary({
  context,
  onApply,
  onClose,
  previewSrc,
  previewLabel,
  selectedCount = 0
}: ToolLibraryProps): ReactElement {
  const recentKeys = useToolLibraryStore((s) => s.recentKeys);
  const markUsed = useToolLibraryStore((s) => s.markUsed);
  const customPresets = useCustomPresetStore((s) => s.presets);
  const addCustomPreset = useCustomPresetStore((s) => s.addPreset);

  // customPresets is a dep so the catalog rebuilds when the user saves/removes one.
  const items = useMemo(() => buildLibraryItems(context), [context, customPresets]);
  const categories = useMemo(() => libraryCategories(items), [items]);
  const recommended = useMemo(() => recommendedItems(context, items), [context, items]);

  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORIES);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const searching = query.trim() !== "";
  const recent = useMemo(() => recentItems(recentKeys, items), [recentKeys, items]);

  const filtered = useMemo(() => {
    let list = searchLibrary(items, query);
    if (activeCategory !== ALL_CATEGORIES) list = list.filter((i) => i.category === activeCategory);
    return list;
  }, [items, query, activeCategory]);

  const selected = selectedKey === null ? null : items.find((i) => i.key === selectedKey) ?? null;
  const selectedIsPreset = selected !== null && (selected.kind === "imagePreset" || selected.kind === "pageLookPreset");
  const isTool = selected !== null && selected.kind === "tool";
  const isAiTool = selected !== null && selected.kind === "aiTool";
  const defaultPct =
    selected !== null && selected.presetId !== undefined
      ? Math.round((getPreset(selected.presetId)?.defaultStrength ?? 0.75) * 100)
      : 100;
  const [strengthPct, setStrengthPct] = useState<number | null>(null);
  const [applyMode, setApplyMode] = useState<ApplyMode>("layer");
  const [fineTune, setFineTune] = useState<PresetFineTune>(NEUTRAL_FINE_TUNE);
  const [savingName, setSavingName] = useState<string | null>(null);
  // Raw-tool editing draft (slider values + curve preset).
  const [toolDraft, setToolDraft] = useState<Record<string, number>>({});
  const [curvePreset, setCurvePreset] = useState<CurvePresetId>("linear");
  // AI smart-tool analysis result.
  const [aiState, setAiState] = useState<AiState>("idle");
  const [aiTemplates, setAiTemplates] = useState<ImageAdjustmentTemplate[]>([]);
  const [aiHasFace, setAiHasFace] = useState(false);

  const effectivePct = strengthPct ?? defaultPct;
  const isImagePreset = selected !== null && selected.kind === "imagePreset";
  const canApplyToAll = isImagePreset;
  const canDuplicate = context === "image" && isImagePreset && previewSrc !== undefined;
  // Tools and AI tools can also be applied to every image on the page.
  const toolCanApplyToAll = isTool || (isAiTool && previewSrc !== undefined);
  const duplicate = applyMode === "duplicate";
  // Fine-tune offsets become extra MANUAL adjustments appended on Apply (image presets only).
  const extraTemplates = isImagePreset ? fineTuneTemplates(fineTune) : [];

  // ── Resolved preview recipe + a stable key the preview pane recomputes on ──
  const fineTuneKey = `${fineTune.brightness},${fineTune.contrast},${fineTune.saturation},${fineTune.temperature}`;
  const toolDraftKey = JSON.stringify(toolDraft);
  const aiKey = JSON.stringify(aiTemplates);

  const previewAdjustments = useMemo<ImageAdjustment[]>(() => {
    if (selected === null) return [];
    if (selected.kind === "imagePreset" || selected.kind === "pageLookPreset") {
      if (selected.presetId === undefined) return [];
      return combinedPreviewAdjustments(selected.presetId, effectivePct / 100, fineTune);
    }
    if (selected.kind === "tool" && selected.toolType !== undefined) {
      return [createImageAdjustment(buildToolTemplate(selected.toolType, toolDraft, curvePreset))];
    }
    if (selected.kind === "aiTool") {
      return aiTemplates.map((template) => createImageAdjustment(template));
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, effectivePct, fineTuneKey, toolDraftKey, curvePreset, aiKey]);

  const previewKey = `${selectedKey ?? "none"}|${effectivePct}|${fineTuneKey}|${toolDraftKey}|${curvePreset}|${aiKey}`;

  const handleClose = (): void => {
    clearPreviewBitmapCache();
    onClose();
  };

  const handleSelect = (item: LibraryItem): void => {
    setSelectedKey(item.key);
    setStrengthPct(null);
    setApplyMode(context === "page" && (item.kind === "imagePreset" || item.kind === "tool") ? "all" : "layer");
    setFineTune(NEUTRAL_FINE_TUNE);
    setSavingName(null);
    setAiState("idle");
    setAiTemplates([]);
    setAiHasFace(false);
    if (item.kind === "tool" && item.toolType !== undefined) {
      setToolDraft(initToolDraft(item.toolType));
      setCurvePreset((IMAGE_ADJUSTMENT_DEFAULTS.curves.preset ?? "linear") as CurvePresetId);
    } else {
      setToolDraft({});
    }
  };

  // Run the global AI analysis when an AI tool is selected against a real image.
  useEffect(() => {
    if (selected === null || selected.kind !== "aiTool" || selected.aiVariant === undefined) return;
    if (previewSrc === undefined) {
      setAiState("idle");
      setAiTemplates([]);
      return;
    }
    let cancelled = false;
    setAiState("running");
    setAiTemplates([]);
    const variant = selected.aiVariant;
    void analyzeAndBuildEnhance(previewSrc, variant).then((res) => {
      if (cancelled) return;
      setAiTemplates(res?.templates ?? []);
      setAiHasFace(res?.hasFace ?? false);
      setAiState("done");
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, previewSrc]);

  const handleApply = (item: LibraryItem): void => {
    markUsed(item.key);
    const shouldApplyToAll = context === "page" || applyMode === "all";
    if (item.kind === "tool" && item.toolType !== undefined) {
      onApply(item, 1, toolCanApplyToAll && shouldApplyToAll, false, [
        buildToolTemplate(item.toolType, toolDraft, curvePreset)
      ]);
    } else if (item.kind === "aiTool") {
      if (aiTemplates.length === 0) return;
      onApply(item, 1, toolCanApplyToAll && shouldApplyToAll, false, aiTemplates);
    } else {
      onApply(item, effectivePct / 100, canApplyToAll && shouldApplyToAll, canDuplicate && duplicate, extraTemplates);
    }
  };

  const handleSaveCustom = (): void => {
    if (selected === null || selected.presetId === undefined) return;
    const base = getPreset(selected.presetId);
    if (base === undefined) return;
    const name = (savingName ?? "").trim();
    if (name.length === 0) return;
    const def = buildCustomPresetDefinition(base, effectivePct / 100, fineTune, name);
    addCustomPreset(def);
    // Switch the selection to the freshly-saved preset (image preset key === id).
    setSelectedKey(def.id);
    setStrengthPct(100);
    setFineTune(NEUTRAL_FINE_TUNE);
    setSavingName(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      dir="rtl"
      onClick={handleClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 3500,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1240px, 96vw)",
          height: "min(880px, 92vh)",
          display: "flex",
          flexDirection: "column",
          background: "var(--color-surface,#1b1b26)",
          border: "1px solid var(--color-border,#2a2a3e)",
          borderRadius: 12,
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          overflow: "hidden"
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid var(--color-border,#2a2a3e)"
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text-primary,#eee)" }}>
            ספריית כלים {context === "image" ? "— תמונה" : "— עמוד"}
          </span>
          <button
            type="button"
            onClick={handleClose}
            title="סגור"
            style={{ background: "none", border: "none", color: "var(--color-text-secondary,#888)", cursor: "pointer", fontSize: 20 }}
          >
            ✕
          </button>
        </div>

        {/* Three-pane body */}
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          {/* ── Left: search + categories + cards ── */}
          <div
            style={{
              width: 340,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              borderInlineEnd: "1px solid var(--color-border,#2a2a3e)",
              minHeight: 0
            }}
          >
            <div style={{ padding: "10px 12px 6px" }}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="חיפוש כלי, אפקט או פריסט…"
                autoFocus
                style={{
                  width: "100%",
                  fontSize: 13,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--color-border,#2a2a3e)",
                  background: "var(--color-surface-2,rgba(255,255,255,0.03))",
                  color: "var(--color-text-primary,#eee)"
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "4px 12px 8px" }}>
              <CategoryChip label="הכל" active={activeCategory === ALL_CATEGORIES} onClick={() => setActiveCategory(ALL_CATEGORIES)} />
              {categories.map((c) => (
                <CategoryChip key={c} label={c} active={activeCategory === c} onClick={() => setActiveCategory(c)} />
              ))}
            </div>
            <div style={{ overflowY: "auto", padding: "0 12px 12px", flex: 1, minHeight: 0 }}>
              {!searching && activeCategory === ALL_CATEGORIES && recommended.length > 0 && (
                <Section title="מומלץ עבורך">
                  <CardGrid items={recommended} selectedKey={selectedKey} onSelect={handleSelect} />
                </Section>
              )}
              {!searching && activeCategory === ALL_CATEGORIES && recent.length > 0 && (
                <Section title="בשימוש לאחרונה">
                  <CardGrid items={recent} selectedKey={selectedKey} onSelect={handleSelect} />
                </Section>
              )}
              <Section title={searching ? "תוצאות חיפוש" : "כל הכלים"}>
                {filtered.length === 0 ? (
                  <p style={{ margin: "4px 0", fontSize: 12, color: "var(--color-text-tertiary,#666)" }}>לא נמצאו פריטים.</p>
                ) : (
                  <CardGrid items={filtered} selectedKey={selectedKey} onSelect={handleSelect} />
                )}
              </Section>
            </div>
          </div>

          {/* ── Center: before/after preview ── */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", padding: 14, gap: 10 }}>
            <PresetPreview
              context={context}
              selected={selected}
              previewSrc={previewSrc}
              previewLabel={previewLabel}
              selectedCount={selectedCount}
              adjustments={previewAdjustments}
              previewKey={previewKey}
              note={
                isAiTool
                  ? aiState === "running"
                    ? "מנתח את התמונה…"
                    : aiState === "done" && aiTemplates.length === 0
                      ? "התמונה כבר מאוזנת — אין שינוי מומלץ."
                      : aiHasFace
                        ? "הומלץ לפי ניתוח פנים."
                        : undefined
                  : undefined
              }
            />
          </div>

          {/* ── End: details + apply ── */}
          <div
            style={{
              width: 280,
              flexShrink: 0,
              borderInlineStart: "1px solid var(--color-border,#2a2a3e)",
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              overflowY: "auto"
            }}
          >
            {selected === null ? (
              <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-tertiary,#666)" }}>בחר פריט מהרשימה כדי לראות פרטים ותצוגה מקדימה.</p>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {selected.icon && <span style={{ fontSize: 20 }}>{selected.icon}</span>}
                  <span style={{ fontSize: 15, fontWeight: 700, color: "var(--color-text-primary,#eee)" }}>{selected.name}</span>
                </div>
                <span style={{ ...badgeStyle, alignSelf: "flex-start" }}>{selected.status}</span>
                <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary,#888)", lineHeight: 1.45 }}>{selected.description}</p>

                <div style={{ fontSize: 11, color: "var(--color-text-tertiary,#666)" }}>מצב מומלץ: {selected.recommendedMode}</div>

                {selectedIsPreset && (
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--color-text-secondary,#888)" }}>
                    <span style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>עוצמה</span>
                      <span style={{ color: "var(--color-text-tertiary,#666)" }}>{effectivePct}%</span>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={effectivePct}
                      onChange={(e) => setStrengthPct(Number(e.target.value))}
                      style={{ width: "100%", accentColor: "var(--accent)" }}
                    />
                  </label>
                )}

                {/* ── Raw tool: editable sliders (+ curve preset) ── */}
                {isTool && selected.toolType !== undefined && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {PARAM_CONFIG[selected.toolType].length > 0 ? (
                      PARAM_CONFIG[selected.toolType].map((slider) => (
                        <ThrottledSlider
                          key={slider.key}
                          label={slider.label}
                          value={toolDraft[slider.key] ?? 0}
                          min={slider.min}
                          max={slider.max}
                          step={slider.step ?? 1}
                          onCommit={(v) => setToolDraft((d) => ({ ...d, [slider.key]: v }))}
                        />
                      ))
                    ) : selected.toolType === "curves" ? (
                      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--color-text-secondary,#888)" }}>
                        <span>סוג עקומה</span>
                        <select
                          value={curvePreset}
                          onChange={(e) => setCurvePreset(e.target.value as CurvePresetId)}
                          style={{
                            fontSize: 12,
                            padding: "6px 8px",
                            borderRadius: 8,
                            border: "1px solid var(--color-border,#2a2a3e)",
                            background: "var(--color-surface-2,rgba(255,255,255,0.03))",
                            color: "var(--color-text-primary,#eee)"
                          }}
                        >
                          {CURVE_PRESET_IDS.map((id) => (
                            <option key={id} value={id}>
                              {id}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-tertiary,#666)", lineHeight: 1.45 }}>
                        כלי זה מתווסף עם ערכי ברירת מחדל — ניתן לכוונן אותו בפאנל ההתאמות לאחר ההחלה.
                      </p>
                    )}
                  </div>
                )}

                {/* ── AI smart tool: status + recipe summary ── */}
                {isAiTool && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {previewSrc === undefined ? (
                      <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-tertiary,#666)" }}>בחר תמונה כדי שה־AI ינתח אותה.</p>
                    ) : aiState === "running" ? (
                      <p style={{ margin: 0, fontSize: 12, color: "var(--accent,#6ea8fe)" }}>מנתח את התמונה…</p>
                    ) : aiTemplates.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-tertiary,#888)" }}>
                        התמונה כבר מאוזנת — אין שינוי מומלץ.
                      </p>
                    ) : (
                      <>
                        <span style={{ fontSize: 11, color: "var(--color-text-tertiary,#666)" }}>
                          {aiHasFace ? "מתכון מותאם (זוהו פנים):" : "מתכון מותאם:"}
                        </span>
                        {recipeSummary(aiTemplates).map((line, i) => (
                          <span key={i} style={{ fontSize: 11, color: "var(--color-text-secondary,#aaa)", lineHeight: 1.4 }}>
                            • {line}
                          </span>
                        ))}
                        <span style={{ fontSize: 10, color: "var(--color-text-tertiary,#666)", lineHeight: 1.4 }}>
                          ההתאמות מתווספות כשכבות רגילות — ניתן לערוך או להסיר כל אחת לאחר מכן.
                        </span>
                      </>
                    )}
                  </div>
                )}

                {/* ── Tool / AI apply mode (this image vs. all images) ── */}
                {(isTool || isAiTool) && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 11, color: "var(--color-text-tertiary,#666)" }}>אופן ההחלה</span>
                    <ApplyModeButton
                      label="החל על התמונה"
                      hint="מוסיף את ההתאמה לתמונה הנבחרת בלבד"
                      active={applyMode !== "all"}
                      onClick={() => setApplyMode("layer")}
                    />
                    {toolCanApplyToAll && (
                      <ApplyModeButton
                        label="החל על כל תמונות העמוד"
                        hint="מוסיף את אותה התאמה לכל התמונות בעמוד"
                        active={applyMode === "all"}
                        onClick={() => setApplyMode("all")}
                      />
                    )}
                  </div>
                )}

                {isImagePreset && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 11, color: "var(--color-text-tertiary,#666)" }}>אופן ההחלה</span>
                    <ApplyModeButton
                      label="החל על השכבה"
                      hint="משנה את התמונה הנבחרת ישירות"
                      active={applyMode === "layer"}
                      onClick={() => setApplyMode("layer")}
                    />
                    {canDuplicate && (
                      <ApplyModeButton
                        label="שכפל שכבה והחל"
                        hint="יוצר עותק מעל המקור עם האפקט — לשילוב ב-blend mode"
                        active={applyMode === "duplicate"}
                        onClick={() => setApplyMode("duplicate")}
                      />
                    )}
                    {canApplyToAll && (
                      <ApplyModeButton
                        label="החל על כל תמונות העמוד"
                        hint="מחיל את אותו פריסט על כל התמונות בעמוד"
                        active={applyMode === "all"}
                        onClick={() => setApplyMode("all")}
                      />
                    )}
                  </div>
                )}

                {isImagePreset && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: "var(--color-text-tertiary,#666)" }}>כוונון עדין</span>
                    <FineTuneSlider label="בהירות" value={fineTune.brightness} onChange={(v) => setFineTune((f) => ({ ...f, brightness: v }))} />
                    <FineTuneSlider label="ניגודיות" value={fineTune.contrast} onChange={(v) => setFineTune((f) => ({ ...f, contrast: v }))} />
                    <FineTuneSlider label="רוויה" value={fineTune.saturation} onChange={(v) => setFineTune((f) => ({ ...f, saturation: v }))} />
                    <FineTuneSlider label="חום" value={fineTune.temperature} onChange={(v) => setFineTune((f) => ({ ...f, temperature: v }))} />
                    {!isNeutralFineTune(fineTune) && (
                      <button
                        type="button"
                        onClick={() => setFineTune(NEUTRAL_FINE_TUNE)}
                        style={{
                          alignSelf: "flex-start",
                          fontSize: 10,
                          padding: "2px 8px",
                          borderRadius: 6,
                          cursor: "pointer",
                          border: "1px solid var(--color-border,#2a2a3e)",
                          background: "transparent",
                          color: "var(--color-text-tertiary,#888)"
                        }}
                      >
                        אפס כוונון
                      </button>
                    )}
                  </div>
                )}

                <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                  {selectedIsPreset && (
                    savingName === null ? (
                      <button
                        type="button"
                        onClick={() => setSavingName(`${selected.name} מותאם`)}
                        style={{
                          fontSize: 12,
                          padding: "7px 10px",
                          borderRadius: 8,
                          cursor: "pointer",
                          border: "1px solid var(--color-border,#2a2a3e)",
                          background: "transparent",
                          color: "var(--color-text-secondary,#aaa)"
                        }}
                      >
                        💾 שמור כפריסט מותאם אישית
                      </button>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <input
                          type="text"
                          value={savingName}
                          autoFocus
                          onChange={(e) => setSavingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveCustom();
                            if (e.key === "Escape") setSavingName(null);
                          }}
                          placeholder="שם הפריסט המותאם"
                          style={{
                            width: "100%",
                            fontSize: 12,
                            padding: "6px 8px",
                            borderRadius: 8,
                            border: "1px solid var(--color-border,#2a2a3e)",
                            background: "var(--color-surface-2,rgba(255,255,255,0.03))",
                            color: "var(--color-text-primary,#eee)"
                          }}
                        />
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            type="button"
                            onClick={handleSaveCustom}
                            disabled={savingName.trim().length === 0}
                            style={{
                              flex: 1,
                              fontSize: 12,
                              padding: "6px 8px",
                              borderRadius: 8,
                              cursor: savingName.trim().length === 0 ? "default" : "pointer",
                              border: "1px solid var(--accent,#6ea8fe)",
                              background: "rgba(110,168,254,0.16)",
                              color: "var(--accent,#6ea8fe)",
                              opacity: savingName.trim().length === 0 ? 0.5 : 1
                            }}
                          >
                            שמור
                          </button>
                          <button
                            type="button"
                            onClick={() => setSavingName(null)}
                            style={{
                              fontSize: 12,
                              padding: "6px 10px",
                              borderRadius: 8,
                              cursor: "pointer",
                              border: "1px solid var(--color-border,#2a2a3e)",
                              background: "transparent",
                              color: "var(--color-text-tertiary,#888)"
                            }}
                          >
                            ביטול
                          </button>
                        </div>
                      </div>
                    )
                  )}

                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={isAiTool && (aiState !== "done" || aiTemplates.length === 0)}
                    onClick={() => {
                      handleApply(selected);
                      handleClose();
                    }}
                  >
                    החל
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Center preview pane: loads a small cached bitmap of the target image and
 * renders a debounced before/after simulation of the selected preset. Falls
 * back to instructional messages when there is no image / no preset.
 */
function PresetPreview({
  context,
  selected,
  previewSrc,
  previewLabel,
  selectedCount,
  adjustments,
  previewKey,
  note
}: {
  context: LibraryContext;
  selected: LibraryItem | null;
  previewSrc: string | undefined;
  previewLabel: string | undefined;
  selectedCount: number;
  adjustments: ImageAdjustment[];
  previewKey: string;
  note?: string;
}): ReactElement {
  const beforeRef = useRef<HTMLCanvasElement | null>(null);
  const afterRef = useRef<HTMLCanvasElement | null>(null);
  const [base, setBase] = useState<PreviewBuffer | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<PreviewMode>("side");
  const [split, setSplit] = useState(50);

  const isPageLookPreset = selected !== null && selected.kind === "pageLookPreset";
  const needsImage =
    selected !== null && (context === "image" || selected.kind === "imagePreset");

  // Load (and cache) the base preview bitmap when the target image changes.
  useEffect(() => {
    let cancelled = false;
    if (previewSrc === undefined) {
      setBase(null);
      return;
    }
    setLoading(true);
    void loadPreviewBitmap(previewSrc).then((buf) => {
      if (cancelled) return;
      setBase(buf);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [previewSrc]);

  // Paint "before" whenever the base bitmap (or layout mode) changes.
  useEffect(() => {
    if (base !== null && beforeRef.current !== null) paintPreviewBuffer(beforeRef.current, base);
  }, [base, mode]);

  // Debounced "after" recompute when the resolved recipe (previewKey) / base / mode change.
  useEffect(() => {
    if (base === null || afterRef.current === null) return;
    const canvas = afterRef.current;
    const handle = window.setTimeout(() => {
      const after = adjustments.length > 0 ? renderPresetPreviewData(base, adjustments) : base;
      paintPreviewBuffer(canvas, after);
    }, 90);
    return () => window.clearTimeout(handle);
    // adjustments are keyed by previewKey; eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, previewKey, mode]);

  // ── No-preview states ──
  if (selected === null) {
    return <PreviewMessage text="בחר פריט כדי לראות תצוגה מקדימה." />;
  }
  if (previewSrc === undefined) {
    if (needsImage) {
      return <PreviewMessage text="בחר תמונה כדי לראות תצוגה מקדימה." />;
    }
    return <PreviewMessage text="תצוגה מקדימה ל־Page Look על העמוד תיתמך בהמשך." />;
  }
  if (loading) {
    return <PreviewMessage text="טוען תצוגה מקדימה…" />;
  }
  if (base === null) {
    return <PreviewMessage text="לא ניתן לטעון תצוגה מקדימה לתמונה זו." />;
  }

  // Aspect-ratio preserving canvas style: never stretch — fit inside the box.
  const fitStyle: React.CSSProperties = {
    display: "block",
    maxWidth: "100%",
    maxHeight: "100%",
    width: "auto",
    height: "auto",
    margin: "auto",
    objectFit: "contain"
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%", minHeight: 0 }}>
      {/* Mode buttons + fast-preview label */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <ModeButton label="זה לצד זה" active={mode === "side"} onClick={() => setMode("side")} />
        <ModeButton label="חצוי" active={mode === "split"} onClick={() => setMode("split")} />
        <ModeButton label="מקור" active={mode === "before"} onClick={() => setMode("before")} />
        <ModeButton label="ערוך" active={mode === "after"} onClick={() => setMode("after")} />
        <span style={{ marginInlineStart: "auto", fontSize: 10, padding: "2px 8px", borderRadius: 999, background: "rgba(110,168,254,0.14)", color: "var(--accent,#6ea8fe)" }}>
          תצוגה מהירה
        </span>
      </div>

      {isPageLookPreset && (
        <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-tertiary,#888)" }}>
          תצוגה מקדימה משוערת — Page Look משפיע על כל העמוד.
        </p>
      )}

      {note !== undefined && (
        <p style={{ margin: 0, fontSize: 11, color: "var(--accent,#6ea8fe)" }}>{note}</p>
      )}

      {mode === "side" ? (
        // ── Side-by-side: original beside edited, each keeping its own AR ──
        <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 10 }}>
          <PreviewColumn label="מקור">
            <canvas ref={beforeRef} style={fitStyle} />
          </PreviewColumn>
          <PreviewColumn label="ערוך">
            <canvas ref={afterRef} style={fitStyle} />
          </PreviewColumn>
        </div>
      ) : (
        // ── Overlay stage: split-wipe / before / after ──
        <div
          style={{
            position: "relative",
            flex: 1,
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "repeating-conic-gradient(#2a2a36 0% 25%, #20202a 0% 50%) 50% / 20px 20px",
            borderRadius: 8,
            overflow: "hidden"
          }}
        >
          <div style={{ position: "relative", maxWidth: "100%", maxHeight: "100%", display: "inline-block" }}>
            <canvas ref={beforeRef} style={{ display: "block", maxWidth: "100%", maxHeight: "62vh", width: "auto", height: "auto" }} />
            <canvas
              ref={afterRef}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                display: mode === "before" ? "none" : "block",
                clipPath: mode === "split" ? `inset(0 0 0 ${split}%)` : "none"
              }}
            />
            {mode === "split" && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  insetInlineStart: `${split}%`,
                  width: 2,
                  background: "var(--accent,#6ea8fe)",
                  transform: "translateX(-1px)",
                  pointerEvents: "none"
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Split slider + labels */}
      {mode === "split" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--color-text-tertiary,#888)" }}>
          <span>מקור</span>
          <input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} style={{ flex: 1, accentColor: "var(--accent)" }} />
          <span>ערוך</span>
        </div>
      )}

      {/* Target note */}
      <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-tertiary,#777)" }}>
        {previewLabel !== undefined ? `תצוגה: ${previewLabel}. ` : ""}
        {selectedCount > 1 ? `הפריסט יוחל על ${selectedCount} תמונות נבחרות.` : ""}
      </p>
    </div>
  );
}

/** One labeled, checkered column of the side-by-side preview. */
function PreviewColumn({ label, children }: { label: string; children: ReactElement }): ReactElement {
  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10, textAlign: "center", color: "var(--color-text-tertiary,#888)" }}>{label}</span>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "repeating-conic-gradient(#2a2a36 0% 25%, #20202a 0% 50%) 50% / 20px 20px",
          borderRadius: 8,
          overflow: "hidden",
          padding: 4
        }}
      >
        {children}
      </div>
    </div>
  );
}

function PreviewMessage({ text }: { text: string }): ReactElement {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        color: "var(--color-text-tertiary,#666)",
        fontSize: 13,
        border: "1px dashed var(--color-border,#2a2a3e)",
        borderRadius: 8,
        padding: 24
      }}
    >
      {text}
    </div>
  );
}

function ModeButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 11,
        padding: "4px 12px",
        borderRadius: 6,
        cursor: "pointer",
        border: active ? "1px solid var(--accent,#6ea8fe)" : "1px solid var(--color-border,#2a2a3e)",
        background: active ? "rgba(110,168,254,0.16)" : "transparent",
        color: active ? "var(--accent,#6ea8fe)" : "var(--color-text-secondary,#888)"
      }}
    >
      {label}
    </button>
  );
}

function ApplyModeButton({
  label,
  hint,
  active,
  onClick
}: {
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 2,
        width: "100%",
        textAlign: "start",
        padding: "6px 10px",
        borderRadius: 8,
        cursor: "pointer",
        border: active ? "1px solid var(--accent,#6ea8fe)" : "1px solid var(--color-border,#2a2a3e)",
        background: active ? "rgba(110,168,254,0.14)" : "transparent",
        color: active ? "var(--accent,#6ea8fe)" : "var(--color-text-secondary,#aaa)"
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 10, color: "var(--color-text-tertiary,#666)", lineHeight: 1.3 }}>{hint}</span>
    </button>
  );
}

function FineTuneSlider({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}): ReactElement {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11, color: "var(--color-text-secondary,#888)" }}>
      <span style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{label}</span>
        <span style={{ color: "var(--color-text-tertiary,#666)" }}>{value > 0 ? `+${value}` : value}</span>
      </span>
      <input
        type="range"
        min={-100}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--accent)" }}
      />
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactElement | ReactElement[] }): ReactElement {
  return (
    <div style={{ marginTop: 10 }}>
      <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary,#888)", textTransform: "none" }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function CardGrid({
  items,
  selectedKey,
  onSelect
}: {
  items: LibraryItem[];
  selectedKey: string | null;
  onSelect: (item: LibraryItem) => void;
}): ReactElement {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onSelect(item)}
          style={{
            textAlign: "right",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: "8px 10px",
            borderRadius: 8,
            cursor: "pointer",
            border: selectedKey === item.key ? "1px solid var(--accent,#6ea8fe)" : "1px solid var(--color-border,#2a2a3e)",
            background: selectedKey === item.key ? "rgba(110,168,254,0.12)" : "var(--color-surface-2,rgba(255,255,255,0.02))",
            color: "var(--color-text-primary,#ddd)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {item.icon && <span style={{ fontSize: 16 }}>{item.icon}</span>}
            <span style={{ fontSize: 13, fontWeight: 600 }}>{item.name}</span>
          </div>
          <span style={{ ...badgeStyle, alignSelf: "flex-start" }}>{item.status}</span>
          <span style={{ fontSize: 11, color: "var(--color-text-secondary,#888)", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {item.description}
          </span>
        </button>
      ))}
    </div>
  );
}

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 11,
        padding: "4px 10px",
        borderRadius: 999,
        cursor: "pointer",
        border: active ? "1px solid var(--accent,#6ea8fe)" : "1px solid var(--color-border,#2a2a3e)",
        background: active ? "rgba(110,168,254,0.16)" : "transparent",
        color: active ? "var(--accent,#6ea8fe)" : "var(--color-text-secondary,#888)"
      }}
    >
      {label}
    </button>
  );
}

const badgeStyle: React.CSSProperties = {
  fontSize: 10,
  padding: "1px 7px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.06)",
  color: "var(--color-text-tertiary,#999)",
  whiteSpace: "nowrap"
};
