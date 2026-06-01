import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Sparkles, X } from "lucide-react";
import { createAssetPreviews, resolveCanvasAssetPath } from "@/core/assets/assetManager";
import { AI_STYLE_PRESETS, aiStyleCategories } from "@/features/aiStyles/catalog";
import { applyAIStyle } from "@/features/aiStyles/localPipeline";
import type { AiStyleOptions, AiStylePreset } from "@/features/aiStyles/types";
import { isFalConfigured } from "@/services/ai/falAiService";
import { useAiStyleStore } from "@/state/aiStyleStore";
import { useDocumentStore } from "@/state/documentStore";
import { useSelectionStore } from "@/state/selectionStore";
import type { Asset } from "@/types/document";
import { DEFAULT_IMAGE_LAYER_EFFECTS, type FrameLayer, type ImageLayer, type VisualLayer } from "@/types/layers";
import "./aiStyles.css";

const ALL = "__all__";

function layerAssetId(layer: ImageLayer | FrameLayer): string | undefined {
  return layer.type === "image" ? layer.assetId : layer.imageAssetId;
}

function frameToStyleImageLayer(frame: FrameLayer, assetId: string): ImageLayer {
  return {
    ...frame,
    type: "image",
    assetId,
    crop: frame.crop,
    fitMode: frame.fitMode,
    transform: { x: frame.x, y: frame.y, scaleX: 1, scaleY: 1, rotation: frame.rotation },
    filters: [],
    colorAdjustments: { version: 1, brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 },
    effects: { ...DEFAULT_IMAGE_LAYER_EFFECTS },
    visualEffects: frame.visualEffects,
    imageAdjustments: frame.imageAdjustments,
  };
}

export function AiStyleStudioContainer(): ReactElement | null {
  const activeTarget = useAiStyleStore((s) => s.activeTarget);
  const processing = useAiStyleStore((s) => s.processing);
  const message = useAiStyleStore((s) => s.message);
  const close = useAiStyleStore((s) => s.close);
  const setProcessing = useAiStyleStore((s) => s.setProcessing);
  const document = useDocumentStore((s) => s.document);
  const applyDocumentChange = useDocumentStore((s) => s.applyDocumentChange);
  const setSelection = useSelectionStore((s) => s.setSelection);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>(ALL);
  const [selectedId, setSelectedId] = useState(AI_STYLE_PRESETS[0]?.id ?? "");
  const [options, setOptions] = useState<AiStyleOptions>({ strength: "normal", backgroundMode: "keep", faceMode: "auto" });
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const target = useMemo(() => {
    if (activeTarget === null || document === null) return null;
    const page = document.pages.find((item) => item.id === activeTarget.pageId);
    const layer = page?.layers.find((item) => item.id === activeTarget.layerId);
    if (page === undefined || (layer?.type !== "image" && layer?.type !== "frame")) return null;
    const sourceAssetId = layerAssetId(layer);
    if (sourceAssetId === undefined) return null;
    const asset = document.assets.find((item) => item.id === sourceAssetId);
    if (asset === undefined) return null;
    return { pageId: page.id, layer, styleLayer: layer.type === "image" ? layer : frameToStyleImageLayer(layer, sourceAssetId), asset };
  }, [activeTarget, document]);

  const categories = useMemo(() => aiStyleCategories(), []);
  const filtered = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return AI_STYLE_PRESETS.filter((preset) => {
      if (category !== ALL && preset.category !== category) return false;
      const haystack = `${preset.name} ${preset.category} ${preset.description} ${preset.id}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [category, query]);
  const selected = AI_STYLE_PRESETS.find((preset) => preset.id === selectedId) ?? AI_STYLE_PRESETS[0]!;

  if (activeTarget === null) return null;

  async function handleApply(): Promise<void> {
    if (target === null || document === null || selected === undefined) return;
    setError(null);
    setWarnings([]);
    if (selected.requiresCloud && !isFalConfigured()) {
      setError("FAL key is not configured. Add VITE_FAL_KEY or set the key in AI settings for local testing.");
      return;
    }
    setProcessing(true, selected.requiresCloud ? "Running direct fal style..." : "Building local AI style...");
    try {
      const result = await applyAIStyle({
        pageId: target.pageId,
        layer: target.styleLayer,
        asset: target.asset,
        presetId: selected.id,
        options,
      });
      applyDocumentChange(
        "ApplyAIStylePipelineAction",
        (doc) => ({
          ...doc,
          assets: [...doc.assets, result.asset],
          pages: doc.pages.map((page) => {
            if (page.id !== target.pageId) return page;
            const isFrameTarget = target.layer.type === "frame";
            const nextLayers = page.layers.map((layer) => {
              if (isFrameTarget && layer.id === target.layer.id && layer.type === "frame") {
                return { ...layer, imageAssetId: result.asset.id, contentType: "image", selected: true } as VisualLayer;
              }
              if (layer.id === target.layer.id) return { ...layer, selected: false, visible: false } as VisualLayer;
              if (layer.zIndex > target.layer.zIndex) return { ...layer, zIndex: layer.zIndex + 1, selected: false } as VisualLayer;
              return { ...layer, selected: false } as VisualLayer;
            });
            if (!isFrameTarget) nextLayers.push(result.layer);
            return { ...page, layers: nextLayers };
          }),
        }),
        target.pageId
      );
      setSelection([target.layer.type === "frame" ? target.layer.id : result.layer.id]);
      setWarnings(result.warnings);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="ai-style-backdrop" role="dialog" aria-modal="true" dir="rtl" onClick={(e) => { if (e.target === e.currentTarget && !processing) close(); }}>
      {processing && (
        <div className="ai-style-processing" aria-live="polite">
          <div className="ai-style-processing-box">
            <div className="ai-style-spinner" />
            <strong>{message ?? "מעבד סגנון AI..."}</strong>
            <span>{selected.requiresCloud ? "שולח ל-fal ומכין שכבה חדשה" : "מריץ עיבוד מקומי ומכין שכבה חדשה"}</span>
          </div>
        </div>
      )}
      <div className="ai-style-panel">
        <header className="ai-style-header">
          <div>
            <span className="ai-style-kicker">AI Effects Library</span>
            <h3>ספריית אפקטים AI</h3>
          </div>
          <button className="ai-style-close" disabled={processing} type="button" onClick={close} title="סגור">
            <X size={18} />
          </button>
        </header>

        <div className="ai-style-body">
          <aside className="ai-style-list">
            <input
              className="ai-style-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="חיפוש סגנון..."
            />
            <div className="ai-style-cats">
              <button className={category === ALL ? "on" : ""} type="button" onClick={() => setCategory(ALL)}>הכל</button>
              {categories.map((item) => (
                <button className={category === item ? "on" : ""} key={item} type="button" onClick={() => setCategory(item)}>
                  {categoryLabel(item)}
                </button>
              ))}
            </div>
            <div className="ai-style-cards">
              {filtered.map((preset) => (
                <PresetCard
                  key={preset.id}
                  preset={preset}
                  active={preset.id === selected.id}
                  onClick={() => {
                    setSelectedId(preset.id);
                    setOptions(preset.defaultOptions);
                    setError(null);
                    setWarnings([]);
                  }}
                />
              ))}
            </div>
          </aside>

          <main className="ai-style-detail">
            <PreviewPane asset={target?.asset} preset={selected} />
            <section className="ai-style-info">
              <div className="ai-style-title-row">
                <h4>{selected.name}</h4>
                <span className={`ai-style-status ${selected.requiresCloud ? "cloud" : "local"}`}>
                  {selected.requiresCloud ? "Direct fal test" : "Local now"}
                </span>
              </div>
              <p>{selected.description}</p>
              <div className="ai-style-pipeline">
                {selected.pipeline.map((step) => (
                  <span key={step.id}>{step.label}</span>
                ))}
              </div>

              <div className="ai-style-controls">
                <label>
                  עוצמה
                  <select value={options.strength} onChange={(event) => setOptions({ ...options, strength: event.target.value as AiStyleOptions["strength"] })}>
                    <option value="soft">עדין</option>
                    <option value="normal">רגיל</option>
                    <option value="strong">חזק</option>
                  </select>
                </label>
                <label>
                  רקע
                  <select value={options.backgroundMode} onChange={(event) => setOptions({ ...options, backgroundMode: event.target.value as AiStyleOptions["backgroundMode"] })}>
                    <option value="keep">שמור</option>
                    <option value="transparent">שקוף</option>
                    <option value="clean">נקי</option>
                  </select>
                </label>
                <label>
                  פנים
                  <select value={options.faceMode} onChange={(event) => setOptions({ ...options, faceMode: event.target.value as AiStyleOptions["faceMode"] })}>
                    <option value="auto">אוטומטי</option>
                    <option value="high">שמירה גבוהה</option>
                  </select>
                </label>
              </div>

              {error !== null && <p className="ai-style-error">{error}</p>}
              {warnings.length > 0 && (
                <div className="ai-style-warning">
                  {warnings.map((warning) => <span key={warning}>{warning}</span>)}
                </div>
              )}

              <button className="ai-style-apply" disabled={processing || target === null} type="button" onClick={() => void handleApply()}>
                <Sparkles size={16} />
                {processing ? (message ?? "מעבד...") : selected.requiresCloud ? "צור עם fal ישיר" : "צור שכבת AI חדשה"}
              </button>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}

function PresetCard({ preset, active, onClick }: { preset: AiStylePreset; active: boolean; onClick: () => void }): ReactElement {
  return (
    <button className={`ai-style-card ${active ? "on" : ""}`} type="button" onClick={onClick}>
      <span className="ai-style-thumb" data-preset={preset.id} />
      <span>
        <strong>{preset.name}</strong>
        <small>{preset.requiresCloud ? `direct fal · future ${preset.estimatedCredits} credits` : "0 credits · local"}</small>
      </span>
    </button>
  );
}

function PreviewPane({ asset, preset }: { asset: Asset | undefined; preset: AiStylePreset }): ReactElement {
  const src = resolveCanvasAssetPath(asset);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (src === undefined) {
      setPreviewSrc(null);
      return;
    }
    void createAssetPreviews(src, 720, 320).then((preview) => {
      if (!cancelled) setPreviewSrc(preview.previewPath);
    });
    return () => { cancelled = true; };
  }, [src]);

  return (
    <div className="ai-style-preview">
      {previewSrc === null ? (
        <span>אין תמונה לתצוגה</span>
      ) : (
        <img src={previewSrc} alt="" />
      )}
      <div className="ai-style-preview-badge">{preset.requiresCloud ? "Direct fal testing · proxy later" : "תצוגת מקור · תוצאה נוצרת בשכבה חדשה"}</div>
    </div>
  );
}

function categoryLabel(category: string): string {
  if (category === "Cloud styles") return "Cloud";
  if (category === "Stickers") return "מדבקות";
  if (category === "Line art") return "קו/חריטה";
  return "מקומי";
}
