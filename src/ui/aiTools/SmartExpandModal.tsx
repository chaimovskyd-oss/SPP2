import { useEffect, useMemo, useRef, useState, type ReactElement, type RefObject } from "react";
import type Konva from "konva";

import "./smartExpand.css";
import { useSmartExpandStore } from "@/state/smartExpandStore";
import { useDocumentStore } from "@/state/documentStore";
import { createAssetPreviews, resolveExportAssetPath } from "@/core/assets/assetManager";
import { createImageLayer } from "@/core/layers/factory";
import {
  buildCellExpandInputs,
  buildSmartExpandInputs,
  recommendModel,
  SmartExpandError,
  type SmartExpandInputs,
} from "@/core/ai/buildExpandCanvas";
import {
  runGenerativeExpand,
  type ExpandCreativity,
  type GenerativeExpandModel,
} from "@/services/ai/generativeExpand";
import { isFalConfigured } from "@/services/ai/falAiService";
import type { Asset } from "@/types/document";
import type { ContentTransform } from "@/types/layers";
import type { FitMode, ID, Metadata } from "@/types/primitives";

const IDENTITY_TRANSFORM: ContentTransform = { version: 1, offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };

interface SmartExpandModalProps {
  stageRef: RefObject<Konva.Stage | null>;
}

type Phase = "preparing" | "config" | "cost-warning" | "generating";

interface ModelOption {
  id: GenerativeExpandModel;
  title: string;
  tag: string;
  hint: string;
  disabled?: boolean;
  badge?: string;
}

const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "local-sd-fast",
    title: "מהיר",
    tag: "מקומי",
    hint: "SD 1.5 — הרחבות קטנות ורקעים פשוטים, ללא עלות",
  },
  {
    id: "local-sdxl-quality",
    title: "איכות גבוהה",
    tag: "מקומי",
    hint: "SDXL — רקעים מורכבים, ללא עלות, איטי יותר",
  },
  {
    id: "fal-ai-expand",
    title: "Ultra",
    tag: "אונליין",
    hint: "Fal.ai — האיכות הגבוהה ביותר, בתשלום",
  },
];

const CREATIVITY_OPTIONS: Array<{ id: ExpandCreativity; label: string; hint: string }> = [
  { id: "conservative", label: "שמרני", hint: "המשך רקע בלבד — בלי אנשים, חפצים או אלמנטים חדשים" },
  { id: "balanced", label: "מאוזן", hint: "המשך טבעי של הסצנה (ברירת מחדל)" },
  { id: "creative", label: "יצירתי", hint: "מותר להוסיף אלמנטים תואמים לסצנה" },
];

function costWarnKey(): string {
  return `spp_smartexpand_costwarn_${new Date().toISOString().slice(0, 10)}`;
}
function isCostWarnDismissedToday(): boolean {
  try {
    return window.localStorage.getItem(costWarnKey()) === "1";
  } catch {
    return false;
  }
}
function dismissCostWarnToday(): void {
  try {
    window.localStorage.setItem(costWarnKey(), "1");
  } catch {
    /* ignore */
  }
}

interface FriendlyError {
  text: string;
  /** Raw model/provider message, shown small for diagnosis. */
  detail?: string;
}

function friendlyError(err: unknown, model: GenerativeExpandModel): FriendlyError {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes("GEN_EXPAND_LOCAL_UNAVAILABLE") || raw.includes("sd_inpaint_unavailable")) {
    return { text: "המודל המקומי לא זמין כרגע. אפשר להתקין אותו או לבחור מודל אחר.", detail: raw };
  }
  if (raw.includes("selection_too_large")) {
    return { text: "האזור להשלמה גדול מדי למודל המקומי. מומלץ להשתמש במודל אונליין (Ultra)." };
  }
  if (raw.includes("GEN_EXPAND_FAL_NOT_CONFIGURED")) {
    return { text: "מודל אונליין לא זמין כרגע. אפשר להשתמש במודל מקומי." };
  }
  return {
    text: model === "fal-ai-expand"
      ? "פעולת ה-AI נכשלה. העבודה נשמרה — אפשר לנסות שוב או לבחור מודל אחר."
      : "פעולת ה-AI נכשלה. אפשר לנסות שוב או לבחור מודל אחר.",
    detail: raw,
  };
}

export function SmartExpandModal({ stageRef }: SmartExpandModalProps): ReactElement | null {
  const target = useSmartExpandStore((s) => s.target);
  const close = useSmartExpandStore((s) => s.close);
  const setHighlight = useSmartExpandStore((s) => s.setHighlight);
  const document = useDocumentStore((s) => s.document);
  const applyDocumentChange = useDocumentStore((s) => s.applyDocumentChange);

  const page = useMemo(
    () =>
      target === null || document === null
        ? undefined
        : document.pages.find((p) => p.layers.some((l) => l.id === target.layerId)),
    [target, document],
  );
  const layer = useMemo(
    () => (target === null || page === undefined ? undefined : page.layers.find((l) => l.id === target.layerId)),
    [target, page],
  );

  const [inputs, setInputs] = useState<SmartExpandInputs | null>(null);
  const [model, setModel] = useState<GenerativeExpandModel>("local-sd-fast");
  const [recommendation, setRecommendation] = useState("");
  const [error, setError] = useState<FriendlyError | null>(null);
  const [phase, setPhase] = useState<Phase>("preparing");
  const [progress, setProgress] = useState(0);
  const [creativity, setCreativity] = useState<ExpandCreativity>("balanced");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [useCustomPrompt, setUseCustomPrompt] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [seed, setSeed] = useState("");
  const [replaceOriginal, setReplaceOriginal] = useState(false);
  const [dontWarnToday, setDontWarnToday] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Build input + mask whenever a new target opens; highlight the fill region on canvas.
  useEffect(() => {
    if (target === null) return;
    let cancelled = false;
    setPhase("preparing");
    setError(null);
    setInputs(null);
    setProgress(0);
    setModel("local-sd-fast");

    const build = (): Promise<SmartExpandInputs> => {
      if (target.kind === "cell") {
        const doc = useDocumentStore.getState().document;
        const asset = doc?.assets.find((a) => a.id === target.assetId);
        const srcUrl = resolveExportAssetPath(asset);
        if (srcUrl === undefined) {
          return Promise.reject(new SmartExpandError("NO_IMAGE", "לא נמצאה התמונה של התא."));
        }
        return buildCellExpandInputs(srcUrl, target.cellAspect);
      }
      const stage = stageRef.current;
      if (stage === null || page === undefined) {
        return Promise.reject(new SmartExpandError("CONTEXT_MISSING", "יש לבחור תמונה כדי להשתמש בהרחבה חכמה."));
      }
      return buildSmartExpandInputs(stage, page, target.layerId);
    };

    void build()
      .then((res) => {
        if (cancelled) return;
        setInputs(res);
        const rec = recommendModel(res.fillRatio);
        setRecommendation(rec.reason);
        // Pre-select the recommended LOCAL tier; never auto-select the paid model —
        // the recommendation text still points at it when relevant.
        setModel(rec.model === "fal-ai-expand" ? "local-sdxl-quality" : rec.model);
        // Cell flow has no on-canvas highlight (empty string → clear it).
        setHighlight(res.highlightDataUrl !== "" ? res.highlightDataUrl : null);
        setPhase("config");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.error("[SmartExpand] prepare failed:", e);
        const msg = e instanceof SmartExpandError ? e.message : "אירעה שגיאה בהכנת התמונה.";
        setError({ text: msg });
        setInputs(null);
        setPhase("config");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.layerId]);

  if (target === null) return null;

  const layerName = layer !== undefined ? layer.name : "תמונה";

  async function commitCellResult(resultDataUrl: string): Promise<void> {
    if (target === null || target.kind !== "cell") return;
    const { ruleId, slotId, assetId: oldAssetId } = target;
    const previews = await createAssetPreviews(resultDataUrl, 1600, 280);
    const newAsset: Asset = {
      version: 1,
      id: crypto.randomUUID(),
      name: `smart_fit_${Date.now()}`,
      kind: "image",
      status: "ready",
      originalPath: resultDataUrl,
      previewPath: previews.previewPath,
      thumbnailPath: previews.thumbnailPath,
      mimeType: "image/png",
      width: inputs?.genWidth ?? 0,
      height: inputs?.genHeight ?? 0,
      metadata: {} as Metadata,
    };

    applyDocumentChange("CollageSmartFitAction", (doc) => {
      const withAsset = { ...doc, assets: [...doc.assets, newAsset] };
      return {
        ...withAsset,
        collageRules: withAsset.collageRules.map((r) => {
          if (r.id !== ruleId) return r;
          // Replace the FIRST pool occurrence so the expanded image survives reflow
          // (assignByPoolOrder pairs by pool); duplicates of the same source stay put.
          let replaced = false;
          const imagePool = r.imagePool.map((id) => {
            if (!replaced && id === oldAssetId) {
              replaced = true;
              return newAsset.id;
            }
            return id;
          });
          return {
            ...r,
            imagePool,
            imageAssignments: r.imageAssignments.map((a) =>
              a.slotId === slotId
                ? {
                    ...a,
                    assetId: newAsset.id,
                    contentTransform: IDENTITY_TRANSFORM,
                    fitMode: "fit" as FitMode,
                    hasManualTransform: false,
                  }
                : a,
            ),
          };
        }),
        pages: withAsset.pages.map((p) => ({
          ...p,
          layers: p.layers.map((l) => {
            if (l.type !== "frame") return l;
            const meta = l.metadata["collageFrame"] as { collageRuleId?: ID; slotId?: ID } | undefined;
            if (meta?.collageRuleId !== ruleId || meta.slotId !== slotId) return l;
            return { ...l, imageAssetId: newAsset.id, contentTransform: IDENTITY_TRANSFORM, fitMode: "fit" as FitMode };
          }),
        })),
      };
    });
  }

  async function commitResult(resultDataUrl: string): Promise<void> {
    if (target === null) return;
    if (target.kind === "cell") {
      await commitCellResult(resultDataUrl);
      return;
    }
    if (page === undefined || layer === undefined) return;
    const pageId = page.id;
    const originalLayerId = target.layerId;
    const previews = await createAssetPreviews(resultDataUrl, 1600, 280);
    const newAsset: Asset = {
      version: 1,
      id: crypto.randomUUID(),
      name: `smart_expand_${Date.now()}`,
      kind: "image",
      status: "ready",
      originalPath: resultDataUrl,
      previewPath: previews.previewPath,
      thumbnailPath: previews.thumbnailPath,
      mimeType: "image/png",
      width: page.width,
      height: page.height,
      metadata: {} as Metadata,
    };
    const maxZ = page.layers.reduce((m, l) => Math.max(m, l.zIndex), 0);
    const newLayer = createImageLayer({
      name: `${layerName} - הרחבה חכמה`,
      rect: { x: 0, y: 0, width: page.width, height: page.height },
      assetId: newAsset.id,
      fitMode: "fill",
      zIndex: maxZ + 1,
    });
    newLayer.selected = true;

    applyDocumentChange("SmartExpandAction", (doc) => {
      const withAsset = { ...doc, assets: [...doc.assets, newAsset] };
      return {
        ...withAsset,
        pages: withAsset.pages.map((p) => {
          if (p.id !== pageId) return p;
          let layers = p.layers.map((l) => ({ ...l, selected: false }));
          if (replaceOriginal) {
            layers = layers.filter((l) => l.id !== originalLayerId);
          } else {
            layers = layers.map((l) => (l.id === originalLayerId ? { ...l, visible: false } : l));
          }
          return { ...p, layers: [...layers, newLayer] };
        }),
      };
    });
  }

  async function handleGenerate(): Promise<void> {
    if (inputs === null || page === undefined || layer === undefined) return;

    if (model === "fal-ai-expand") {
      if (!isFalConfigured()) {
        setError({ text: "מודל אונליין לא זמין כרגע. אפשר להשתמש במודל מקומי." });
        return;
      }
      if (!isCostWarnDismissedToday() && phase !== "cost-warning") {
        setPhase("cost-warning");
        return;
      }
    }
    if (dontWarnToday) dismissCostWarnToday();

    setPhase("generating");
    setProgress(0);
    setError(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      // Empty prompt → each provider applies its own model-appropriate default
      // (instruction-style for flux, descriptive caption for local SD/SDXL).
      const prompt = useCustomPrompt && customPrompt.trim() !== "" ? customPrompt.trim() : "";
      const seedNum = seed.trim() === "" ? undefined : Number(seed);
      const res = await runGenerativeExpand(
        model,
        {
          inputImageDataUrl: inputs.inputImageDataUrl,
          maskDataUrl: inputs.maskDataUrl,
          maskAlphaDataUrl: inputs.maskAlphaDataUrl,
          width: inputs.genWidth,
          height: inputs.genHeight,
          ...(inputs.isRectangular
            ? { layerImageDataUrl: inputs.layerImageDataUrl, placement: inputs.placement }
            : {}),
          prompt,
          // Empty → providers build the negative per creativity level.
          negativePrompt: "",
          creativity,
          ...(seedNum !== undefined && Number.isFinite(seedNum) ? { seed: seedNum } : {}),
        },
        setProgress,
        ctrl.signal,
      );
      if (ctrl.signal.aborted) return;
      await commitResult(res.resultDataUrl);
      close();
    } catch (e: unknown) {
      if (ctrl.signal.aborted) return;
      console.error("[SmartExpand] generate failed:", e);
      setError(friendlyError(e, model));
      setPhase("config");
    } finally {
      abortRef.current = null;
    }
  }

  function handleCancelGenerating(): void {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("config");
    setProgress(0);
  }

  function handleClose(): void {
    if (phase === "generating") handleCancelGenerating();
    close();
  }

  return (
    <div
      className="se-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="הרחבה חכמה"
      dir="rtl"
      onClick={(e) => {
        if (e.target === e.currentTarget && phase !== "generating") handleClose();
      }}
    >
      <div className="se-popup">
        <div className="se-popup-header">
          <h3>✨ הרחבה חכמה</h3>
          <button className="se-close" type="button" onClick={handleClose} aria-label="סגור">
            ×
          </button>
        </div>

        {phase === "preparing" && <div className="se-status">מזהה את האזורים הריקים…</div>}

        {phase === "cost-warning" && (
          <div className="se-body">
            <p className="se-cost-text">
              פעולה זו משתמשת במודל אונליין ועלולה לעלות קרדיטים / כסף. להמשיך?
            </p>
            <label className="se-check">
              <input
                type="checkbox"
                checked={dontWarnToday}
                onChange={(e) => setDontWarnToday(e.target.checked)}
              />
              אל תציג שוב אזהרה היום
            </label>
            <div className="se-row-actions">
              <button className="se-btn-ghost" type="button" onClick={() => setPhase("config")}>
                ביטול
              </button>
              <button className="se-btn-primary" type="button" onClick={() => void handleGenerate()}>
                המשך
              </button>
            </div>
          </div>
        )}

        {phase === "config" && inputs !== null && (
          <div className="se-body">
            {recommendation !== "" && <div className="se-recommend">{recommendation}</div>}

            <div className="se-models">
              {MODEL_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`se-model${model === opt.id ? " is-selected" : ""}${opt.disabled === true ? " is-disabled" : ""}`}
                  disabled={opt.disabled === true}
                  title={opt.hint}
                  onClick={() => {
                    if (opt.disabled !== true) setModel(opt.id);
                  }}
                >
                  <span className={`se-radio${model === opt.id ? " is-on" : ""}`} />
                  <span className="se-model-text">
                    <span className="se-model-title">
                      {opt.title}
                      <span className="se-model-tag">{opt.tag}</span>
                      {opt.badge !== undefined && <span className="se-model-badge">{opt.badge}</span>}
                    </span>
                    <span className="se-model-hint">{opt.hint}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="se-creativity">
              <span className="se-creativity-label">יצירתיות:</span>
              <div className="se-seg">
                {CREATIVITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`se-seg-btn${creativity === opt.id ? " is-on" : ""}`}
                    title={opt.hint}
                    onClick={() => setCreativity(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="se-creativity-hint">
              {CREATIVITY_OPTIONS.find((o) => o.id === creativity)?.hint}
            </div>

            <button type="button" className="se-advanced-toggle" onClick={() => setShowAdvanced((v) => !v)}>
              {showAdvanced ? "▾" : "◂"} הגדרות מתקדמות
            </button>

            {showAdvanced && (
              <div className="se-advanced">
                <label className="se-check">
                  <input
                    type="checkbox"
                    checked={useCustomPrompt}
                    onChange={(e) => setUseCustomPrompt(e.target.checked)}
                  />
                  Prompt מותאם אישית
                </label>
                {useCustomPrompt && (
                  <textarea
                    className="se-textarea"
                    value={customPrompt}
                    placeholder="תיאור הרקע להשלמה…"
                    onChange={(e) => setCustomPrompt(e.target.value)}
                  />
                )}
                <label className="se-field">
                  Seed
                  <input
                    type="text"
                    className="se-input"
                    value={seed}
                    placeholder="אקראי"
                    onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ""))}
                  />
                </label>
                <label className="se-check">
                  <input
                    type="checkbox"
                    checked={replaceOriginal}
                    onChange={(e) => setReplaceOriginal(e.target.checked)}
                  />
                  החלף את התמונה המקורית
                </label>
              </div>
            )}

            {error !== null && (
              <div className="se-error">
                {error.text}
                {error.detail !== undefined && <small className="se-error-detail">{error.detail}</small>}
              </div>
            )}

            <button className="se-btn-primary se-run" type="button" onClick={() => void handleGenerate()}>
              מלא קנבס בעזרת AI
            </button>
          </div>
        )}

        {phase === "config" && inputs === null && error !== null && (
          <div className="se-body">
            <div className="se-error">{error.text}</div>
          </div>
        )}

        {phase === "generating" && (
          <div className="se-body se-generating">
            <div className="se-progress-track">
              <div className="se-progress-bar" style={{ width: `${Math.max(4, progress)}%` }} />
            </div>
            <div className="se-status">יוצר הרחבה… {Math.round(progress)}%</div>
            <button className="se-btn-ghost" type="button" onClick={handleCancelGenerating}>
              ביטול
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
