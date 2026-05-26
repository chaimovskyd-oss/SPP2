import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useDocumentStore } from "@/state/documentStore";
import { applyLayoutFamily, mergeLiveFrameEditsIntoCollageRule, syncFrameLayersToPage } from "@/core/collage/collageModeEngine";
import type {
  CollageEdgeStyle,
  CollageLayoutFamily,
  CollageRule,
  CollageSlotShape,
  ScoredLayoutSuggestion
} from "@/types/collage";
import type { FitMode, ID } from "@/types/primitives";
import type { ContentTransform, VisualLayer } from "@/types/layers";

interface CollageRightPanelProps {
  rule: CollageRule;
  selectedSlotId?: ID | null;
  selectedLayer?: VisualLayer | null;
  /** Kept optional for old CollageScreen compatibility, but layouts are no longer shown here. */
  suggestions?: ScoredLayoutSuggestion[];
  onSelectLayout?: (family: CollageLayoutFamily) => void;
  onReplaceImage?: () => void;
}

type EmptyTab = "layout" | "style" | "canvas";
type ImageTab = "adjust" | "tips" | "edge";

const DEFAULT_TRANSFORM: ContentTransform = {
  version: 1,
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  rotation: 0
};

function isCollageFrame(layer: VisualLayer | null | undefined): layer is Extract<VisualLayer, { type: "frame" }> {
  if (layer?.type !== "frame") return false;
  const meta = layer.metadata["collageFrame"] as { isCollageFrame?: boolean } | undefined;
  return meta?.isCollageFrame === true;
}

function asEditNumber(value: number | boolean | string | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function selectedSlotFromLayer(layer: VisualLayer | null | undefined): ID | null {
  if (!isCollageFrame(layer)) return null;
  const meta = layer.metadata["collageFrame"] as { slotId?: ID } | undefined;
  return meta?.slotId ?? null;
}

function edgeLabel(style: CollageEdgeStyle): string {
  switch (style) {
    case "softEdge": return "שוליים רכים / Fade";
    case "tornPaper": return "נייר קרוע";
    case "outlineCircle": return "מסגרת עגולה";
    default: return "חד / רגיל";
  }
}

function shapeLabel(shape: CollageSlotShape): string {
  switch (shape) {
    case "rounded": return "פינות עגולות";
    case "circle": return "עיגולים";
    case "ellipse": return "אליפסות";
    case "heart": return "לבבות קטנים";
    case "puzzle": return "פאזל";
    case "polygon": return "פוליגון";
    case "diagonalPolygon": return "אלכסוני";
    default: return "מלבנים";
  }
}

export function CollageRightPanel({ rule, selectedSlotId, selectedLayer, onReplaceImage }: CollageRightPanelProps): ReactElement {
  const document = useDocumentStore((s) => s.document);
  const applyDocumentChange = useDocumentStore((s) => s.applyDocumentChange);
  const updateAdjustments = useDocumentStore((s) => s.updateCollageImageAdjustments);
  const updateEditParams = useDocumentStore((s) => s.updateCollageImageEditParams);
  const updateEdgeConfig = useDocumentStore((s) => s.updateCollageEdgeConfig);
  const applyEdgeToAll = useDocumentStore((s) => s.applyCollageEdgeConfigToAll);
  const updateCanvasSettings = useDocumentStore((s) => s.updateCollageCanvasSettings);
  const updateCachedSlots = useDocumentStore((s) => s.updateCollageCachedSlots);

  const resolvedSlotId = selectedSlotId ?? selectedSlotFromLayer(selectedLayer);
  const selectedSlot = resolvedSlotId ? rule.cachedSlots.find((slot) => slot.id === resolvedSlotId) : undefined;
  const assignment = resolvedSlotId ? rule.imageAssignments.find((a) => a.slotId === resolvedSlotId) : undefined;
  const isImageSelected = Boolean(resolvedSlotId && assignment);

  const [emptyTab, setEmptyTab] = useState<EmptyTab>("layout");
  const [imageTab, setImageTab] = useState<ImageTab>("adjust");
  const [spacingDraft, setSpacingDraft] = useState(String(rule.spacingMM));
  const [marginDraft, setMarginDraft] = useState(String(rule.marginMM));

  useEffect(() => setSpacingDraft(String(rule.spacingMM)), [rule.spacingMM]);
  useEffect(() => setMarginDraft(String(rule.marginMM)), [rule.marginMM]);

  const page = useMemo(() => document?.pages.find((p) => p.id === rule.pageId) ?? null, [document, rule.pageId]);
  const asset = useMemo(() => document?.assets.find((a) => a.id === assignment?.assetId) ?? null, [document, assignment?.assetId]);
  const adj = assignment?.colorAdjustments;

  function reflowWithPatch(patch: Partial<CollageRule>): void {
    const doc = useDocumentStore.getState().document;
    if (!doc) return;
    const currentRule = doc.collageRules.find((r) => r.id === rule.id);
    if (!currentRule) return;
    const currentPage = doc.pages.find((p) => p.id === currentRule.pageId);
    if (!currentPage) return;

    const dpi = currentPage.setup?.dpi ?? 300;
    const liveRule = mergeLiveFrameEditsIntoCollageRule(currentRule, currentPage);
    const patchedRule: CollageRule = { ...liveRule, ...patch };
    const imageInputs = patchedRule.imagePool.flatMap((assetId) => {
      const imageAsset = doc.assets.find((item) => item.id === assetId);
      if (!imageAsset) return [];
      return [{ assetId, width: imageAsset.width ?? 800, height: imageAsset.height ?? 600 }];
    });
    const shouldPreserveManualLayout = patchedRule.layoutMode === "manual" || patchedRule.hasManualLayoutOverrides === true;
    const relaidRule = shouldPreserveManualLayout
      ? patchedRule
      : applyLayoutFamily(patchedRule, patchedRule.activeFamily, currentPage.width, currentPage.height, dpi, imageInputs);
    const { page: syncedPage, frameIds } = syncFrameLayersToPage(currentPage, relaidRule, currentPage.width, currentPage.height);
    const finalRule = { ...relaidRule, frameIds };

    applyDocumentChange(
      "UpdateCollageStructureSettingsAction",
      (d) => ({
        ...d,
        collageRules: d.collageRules.map((r) => (r.id === rule.id ? finalRule : r)),
        pages: d.pages.map((p) => (p.id === currentRule.pageId ? syncedPage : p))
      }),
      currentRule.pageId
    );
  }

  function commitSpacing(): void {
    const value = Math.max(0, Math.min(50, Number(spacingDraft)));
    if (!Number.isFinite(value) || value === rule.spacingMM) return;
    reflowWithPatch({ spacingMM: value });
  }

  function commitMargin(): void {
    const value = Math.max(0, Math.min(80, Number(marginDraft)));
    if (!Number.isFinite(value) || value === rule.marginMM) return;
    reflowWithPatch({ marginMM: value });
  }

  function updateStructureColors(settings: Pick<CollageRule["canvasSettings"], "spacingColor" | "marginColor">): void {
    reflowWithPatch({ canvasSettings: { ...rule.canvasSettings, ...settings } });
  }

  function applyShapeToAll(shape: CollageSlotShape): void {
    const nextSlots = rule.cachedSlots.map((slot) => ({
      ...slot,
      shape,
      shapeParams: shape === "rounded"
        ? { ...slot.shapeParams, cornerRadius: rule.canvasSettings.globalCornerRadius > 0 ? 0.08 : 0.06 }
        : shape === "puzzle"
          ? { ...slot.shapeParams, puzzleSeed: Number(slot.id.replace(/\D/g, "").slice(-4)) || 1 }
          : {}
    }));
    updateCachedSlots(rule.id, nextSlots);
  }

  function updateFitMode(fitMode: FitMode): void {
    if (!resolvedSlotId || !assignment) return;
    applyDocumentChange(
      "UpdateCollageFitModeAction",
      (doc) => ({
        ...doc,
        collageRules: doc.collageRules.map((r) => r.id === rule.id
          ? {
              ...r,
              imageAssignments: r.imageAssignments.map((a) =>
                a.slotId === resolvedSlotId ? { ...a, fitMode, hasManualTransform: true } : a
              )
            }
          : r
        ),
        pages: doc.pages.map((p) => p.id === rule.pageId
          ? {
              ...p,
              layers: p.layers.map((layer) => {
                if (layer.type !== "frame") return layer;
                const meta = layer.metadata["collageFrame"] as { collageRuleId?: ID; slotId?: ID } | undefined;
                if (meta?.collageRuleId !== rule.id || meta.slotId !== resolvedSlotId) return layer;
                return { ...layer, fitMode };
              })
            }
          : p
        )
      }),
      rule.pageId
    );
  }

  function resetImagePosition(): void {
    if (!resolvedSlotId || !assignment) return;
    applyDocumentChange(
      "ResetCollageImagePositionAction",
      (doc) => ({
        ...doc,
        collageRules: doc.collageRules.map((r) => r.id === rule.id
          ? {
              ...r,
              imageAssignments: r.imageAssignments.map((a) =>
                a.slotId === resolvedSlotId ? { ...a, contentTransform: DEFAULT_TRANSFORM, hasManualTransform: false } : a
              )
            }
          : r
        ),
        pages: doc.pages.map((p) => p.id === rule.pageId
          ? {
              ...p,
              layers: p.layers.map((layer) => {
                if (layer.type !== "frame") return layer;
                const meta = layer.metadata["collageFrame"] as { collageRuleId?: ID; slotId?: ID } | undefined;
                if (meta?.collageRuleId !== rule.id || meta.slotId !== resolvedSlotId) return layer;
                return { ...layer, contentTransform: DEFAULT_TRANSFORM };
              })
            }
          : p
        )
      }),
      rule.pageId
    );
  }

  const effectiveDpi = useMemo(() => {
    if (!page || !selectedSlot || !asset?.width || !asset?.height) return null;
    const slotW = Math.max(1, selectedSlot.w * page.width);
    const slotH = Math.max(1, selectedSlot.h * page.height);
    const dpi = page.setup?.dpi ?? 300;
    return Math.round(Math.min(asset.width / slotW, asset.height / slotH) * dpi);
  }, [page, selectedSlot, asset]);
  const spacingColor = rule.canvasSettings.spacingColor ?? rule.canvasSettings.backgroundColor ?? "#ffffff";
  const marginColor = rule.canvasSettings.marginColor ?? rule.canvasSettings.backgroundColor ?? "#ffffff";

  if (isImageSelected && assignment && resolvedSlotId) {
    return (
      <div className="collage-right-panel collage-mode-panel">
        <div className="panel-tabs">
          <button type="button" className={`panel-tab${imageTab === "adjust" ? " active" : ""}`} onClick={() => setImageTab("adjust")}>כוונון</button>
          <button type="button" className={`panel-tab${imageTab === "tips" ? " active" : ""}`} onClick={() => setImageTab("tips")}>טיפים</button>
          <button type="button" className={`panel-tab${imageTab === "edge" ? " active" : ""}`} onClick={() => setImageTab("edge")}>שוליים</button>
        </div>

        {imageTab === "adjust" && (
          <div className="panel-section">
            <div className="panel-title">עריכת תמונה בתא</div>
            {onReplaceImage && (
              <button type="button" className="btn btn-ghost btn-full" onClick={onReplaceImage}>
                החלף תמונה בתא
              </button>
            )}
            <div className="panel-field">
              <label>מצב התאמה</label>
              <select value={assignment.fitMode} onChange={(e) => updateFitMode(e.target.value as FitMode)}>
                <option value="fill">Fill — מילוי</option>
                <option value="fit">Fit — התאמה מלאה</option>
                <option value="stretch">Stretch — מתיחה</option>
                <option value="smartCrop">Smart Crop</option>
              </select>
            </div>
            <button type="button" className="btn btn-ghost btn-full" onClick={resetImagePosition}>איפוס מיקום / זום</button>

            <Slider label="בהירות" value={adj?.brightness ?? 1} min={0.2} max={2} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => updateAdjustments(rule.id, resolvedSlotId, { brightness: v })} />
            <Slider label="ניגודיות" value={adj?.contrast ?? 1} min={0.2} max={2} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => updateAdjustments(rule.id, resolvedSlotId, { contrast: v })} />
            <Slider label="רוויה" value={adj?.saturation ?? 1} min={0} max={2} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => updateAdjustments(rule.id, resolvedSlotId, { saturation: v })} />
            <Slider label="חשיפה EV" value={adj?.exposureEV ?? 0} min={-3} max={3} step={0.1} format={(v) => v.toFixed(1)} onChange={(v) => updateAdjustments(rule.id, resolvedSlotId, { exposureEV: v })} />
            <Slider label="חדות" value={adj?.sharpness ?? 1} min={0.2} max={2} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => updateAdjustments(rule.id, resolvedSlotId, { sharpness: v })} />
            <Slider label="וינייטה" value={adj?.vignette ?? 0} min={0} max={1} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => updateAdjustments(rule.id, resolvedSlotId, { vignette: v })} />
            <label className="panel-checkbox">
              <input type="checkbox" checked={adj?.isBlackAndWhite ?? false} onChange={(e) => updateAdjustments(rule.id, resolvedSlotId, { isBlackAndWhite: e.target.checked })} />
              שחור־לבן
            </label>

            <div className="panel-subtitle">תיקוני תמונה מהירים</div>
            <Slider label="חום / קור" value={asEditNumber(assignment.imageEditParams?.temperature)} min={-100} max={100} step={1} onChange={(v) => updateEditParams(rule.id, resolvedSlotId, { temperature: v })} />
            <Slider label="היילייטים" value={asEditNumber(assignment.imageEditParams?.highlights)} min={-100} max={100} step={1} onChange={(v) => updateEditParams(rule.id, resolvedSlotId, { highlights: v })} />
            <Slider label="צללים" value={asEditNumber(assignment.imageEditParams?.shadows)} min={-100} max={100} step={1} onChange={(v) => updateEditParams(rule.id, resolvedSlotId, { shadows: v })} />
          </div>
        )}

        {imageTab === "tips" && (
          <div className="panel-section">
            <div className="panel-title">טיפים לתיקון התמונה</div>
            <TipRow title="רזולוציה" ok={effectiveDpi === null || effectiveDpi >= 220}>
              {effectiveDpi === null ? "אין מספיק מידע על גודל התמונה." : effectiveDpi >= 220 ? `נראה תקין להדפסה: בערך ${effectiveDpi} DPI.` : `עלול להיות רך בהדפסה: בערך ${effectiveDpi} DPI. עדיף תמונה גדולה יותר או תא קטן יותר.`}
            </TipRow>
            <TipRow title="חיתוך" ok={!assignment.hasManualTransform}>
              {assignment.hasManualTransform ? "בוצע מיקום ידני. בדוק שלא נחתכו פנים או פרטים חשובים." : "המיקום כרגע אוטומטי. אפשר לגרור/להגדיל בתא לפי הצורך."}
            </TipRow>
            <TipRow title="התאמה לתא" ok={assignment.fitMode === "fill" || assignment.fitMode === "smartCrop"}>
              {assignment.fitMode === "fit" ? "Fit עלול להשאיר שוליים ריקים. לרוב בקולאז׳ עדיף Fill." : "מצב ההתאמה מתאים לקולאז׳ ברוב המקרים."}
            </TipRow>
            <TipRow title="טיפ עבודה" ok>
              להחלפה מהירה בין תמונות: רחף מעל מרכז התא, לחץ על נקודת ההחלפה ואז לחץ על תא אחר.
            </TipRow>
          </div>
        )}

        {imageTab === "edge" && (
          <div className="panel-section">
            <div className="panel-title">שוליים ואפקט התא</div>
            <div className="panel-field">
              <label>סגנון שוליים</label>
              <select value={assignment.edgeConfig?.style ?? "hard"} onChange={(e) => updateEdgeConfig(rule.id, resolvedSlotId, { style: e.target.value as CollageEdgeStyle })}>
                <option value="hard">חד / רגיל</option>
                <option value="softEdge">רך / Fade</option>
                <option value="tornPaper">נייר קרוע</option>
                <option value="outlineCircle">מסגרת עגולה</option>
              </select>
            </div>
            {(assignment.edgeConfig?.style ?? "hard") === "softEdge" && (
              <Slider label="עוצמת ריכוך" value={assignment.edgeConfig?.softEdgeRadius ?? 24} min={0} max={80} step={1} onChange={(v) => updateEdgeConfig(rule.id, resolvedSlotId, { ...assignment.edgeConfig, style: "softEdge", softEdgeRadius: v })} />
            )}
            {(assignment.edgeConfig?.style ?? "hard") === "tornPaper" && (
              <Slider label="חספוס נייר" value={assignment.edgeConfig?.tornPaperRoughness ?? 0.45} min={0} max={1} step={0.05} onChange={(v) => updateEdgeConfig(rule.id, resolvedSlotId, { ...assignment.edgeConfig, style: "tornPaper", tornPaperRoughness: v, tornPaperSeed: assignment.edgeConfig?.tornPaperSeed ?? Date.now() % 100000 })} />
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="collage-right-panel collage-mode-panel">
      <div className="panel-tabs">
        <button type="button" className={`panel-tab${emptyTab === "layout" ? " active" : ""}`} onClick={() => setEmptyTab("layout")}>קולאז׳</button>
        <button type="button" className={`panel-tab${emptyTab === "canvas" ? " active" : ""}`} onClick={() => setEmptyTab("canvas")}>קנבס</button>
      </div>

      {emptyTab === "layout" && (
        <div className="panel-section">
          <div className="panel-title">הגדרות כלליות לקולאז׳</div>
          <div className="panel-field">
            <label>Spacing / רווח בין תאים במ״מ</label>
            <input type="number" min={0} max={50} step={0.5} value={spacingDraft} onChange={(e) => setSpacingDraft(e.target.value)} onBlur={commitSpacing} onKeyDown={(e) => { if (e.key === "Enter") commitSpacing(); }} />
          </div>
          <div className="panel-field">
            <label>Spacing color / ׳¦׳‘׳¢ ׳׳¨׳•׳•׳—׳™׳</label>
            <input type="color" value={spacingColor} onChange={(e) => updateStructureColors({ spacingColor: e.target.value })} />
          </div>
          <div className="panel-field">
            <label>Margin / שוליים במ״מ</label>
            <input type="number" min={0} max={80} step={0.5} value={marginDraft} onChange={(e) => setMarginDraft(e.target.value)} onBlur={commitMargin} onKeyDown={(e) => { if (e.key === "Enter") commitMargin(); }} />
          </div>
          <div className="panel-field">
            <label>Margin color / ׳¦׳‘׳¢ ׳©׳•׳׳™׳™׳</label>
            <input type="color" value={marginColor} onChange={(e) => updateStructureColors({ marginColor: e.target.value })} />
          </div>
          <button type="button" className="btn btn-ghost btn-full" onClick={() => reflowWithPatch({})}>רענן מבנה לפי ההגדרות</button>
          <p className="panel-hint">פריסות עצמן נמצאות בצד שמאל בלשונית פריסות/שכבות. כאן משנים את מאפייני הקולאז׳.</p>
        </div>
      )}

      {emptyTab === "style" && (
        <div className="panel-section">
          <div className="panel-title">סגנון תאים כללי</div>
          <div className="panel-field">
            <label>צורת תאים</label>
            <select value={rule.cachedSlots[0]?.shape ?? "rect"} onChange={(e) => applyShapeToAll(e.target.value as CollageSlotShape)}>
              <option value="rect">{shapeLabel("rect")}</option>
              <option value="rounded">{shapeLabel("rounded")}</option>
              <option value="circle">{shapeLabel("circle")}</option>
              <option value="ellipse">{shapeLabel("ellipse")}</option>
              <option value="puzzle">{shapeLabel("puzzle")}</option>
            </select>
          </div>
          <div className="panel-field">
            <label>סגנון שוליים לכל התאים</label>
            <select value={rule.canvasSettings.globalEdgeConfig?.style ?? "hard"} onChange={(e) => {
              const edge = { ...rule.canvasSettings.globalEdgeConfig, style: e.target.value as CollageEdgeStyle };
              updateCanvasSettings(rule.id, { globalEdgeConfig: edge });
              applyEdgeToAll(rule.id, edge);
            }}>
              <option value="hard">{edgeLabel("hard")}</option>
              <option value="softEdge">{edgeLabel("softEdge")}</option>
              <option value="tornPaper">{edgeLabel("tornPaper")}</option>
              <option value="outlineCircle">{edgeLabel("outlineCircle")}</option>
            </select>
          </div>
          <Slider label="רדיוס פינות כללי" value={rule.canvasSettings.globalCornerRadius} min={0} max={25} step={0.5} suffix=" מ״מ" onChange={(v) => updateCanvasSettings(rule.id, { globalCornerRadius: v })} />
          <Slider label="עובי גבול כללי" value={rule.canvasSettings.globalBorderWidth} min={0} max={8} step={0.1} suffix=" מ״מ" onChange={(v) => updateCanvasSettings(rule.id, { globalBorderWidth: v })} />
          <div className="panel-field">
            <label>צבע גבול</label>
            <input type="color" value={rule.canvasSettings.globalBorderColor} onChange={(e) => updateCanvasSettings(rule.id, { globalBorderColor: e.target.value })} />
          </div>
        </div>
      )}

      {emptyTab === "canvas" && (
        <div className="panel-section">
          <div className="panel-title">קנבס ורקע</div>
          <div className="panel-field">
            <label>צבע רקע</label>
            <input type="color" value={rule.canvasSettings.backgroundColor} onChange={(e) => updateCanvasSettings(rule.id, { backgroundColor: e.target.value })} />
          </div>
          <label className="panel-checkbox">
            <input type="checkbox" checked={rule.canvasSettings.globalShadowEnabled} onChange={(e) => updateCanvasSettings(rule.id, { globalShadowEnabled: e.target.checked })} />
            צל כללי לתאים
          </label>
          {rule.canvasSettings.globalShadowEnabled && (
            <>
              <Slider label="טשטוש צל" value={rule.canvasSettings.globalShadowBlur} min={0} max={40} step={1} onChange={(v) => updateCanvasSettings(rule.id, { globalShadowBlur: v })} />
              <Slider label="שקיפות צל" value={rule.canvasSettings.globalShadowOpacity} min={0} max={1} step={0.05} onChange={(v) => updateCanvasSettings(rule.id, { globalShadowOpacity: v })} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  suffix = "",
  format,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}): ReactElement {
  return (
    <div className="panel-field">
      <label>{label}: {format ? format(value) : value}{suffix}</label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function TipRow({ title, ok, children }: { title: string; ok: boolean; children: React.ReactNode }): ReactElement {
  return (
    <div className={`collage-tip-row${ok ? " ok" : " warn"}`}>
      <strong>{ok ? "✓" : "⚠"} {title}</strong>
      <span>{children}</span>
    </div>
  );
}
