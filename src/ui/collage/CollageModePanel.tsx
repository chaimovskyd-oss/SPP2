import { useEffect, useRef, useState, type ChangeEvent, type ReactElement } from "react";
import { ImagePlus, RefreshCw } from "lucide-react";
import { importImageAsset } from "@/core/assets/assetManager";
import { generateCollageSuggestions } from "@/core/collage/collageModeEngine";
import { applySmartCropToAssignment } from "@/core/collage/collageFrameSync";
import { mmToPx } from "@/core/units/conversion";
import { useDocumentStore } from "@/state/documentStore";
import { CollageMiniPreview } from "./CollageMiniPreview";
import type { CollageEdgeStyle, CollageImageInput, CollageRule, ScoredLayoutSuggestion } from "@/types/collage";
import type { VisualLayer } from "@/types/layers";

interface CollageModeePanelProps {
  rule: CollageRule;
  selectedLayer: VisualLayer | null;
}

export function CollageModePanel({ rule, selectedLayer }: CollageModeePanelProps): ReactElement {
  const [tab, setTab] = useState<"layouts" | "cell" | "canvas">("layouts");
  const [suggestions, setSuggestions] = useState<ScoredLayoutSuggestion[]>([]);
  const addImgRef = useRef<HTMLInputElement>(null);
  const document = useDocumentStore((s) => s.document);
  const setDocument = useDocumentStore((s) => s.setDocument);
  const applyCollageLayoutFamily = useDocumentStore((s) => s.applyCollageLayoutFamily);
  const addImagesToCollage = useDocumentStore((s) => s.addImagesToCollage);
  const updateImageTransform = useDocumentStore((s) => s.updateCollageImageTransform);
  const updateAdjustments = useDocumentStore((s) => s.updateCollageImageAdjustments);
  const updateEdgeConfig = useDocumentStore((s) => s.updateCollageEdgeConfig);
  const updateCanvasSettings = useDocumentStore((s) => s.updateCollageCanvasSettings);

  // Find which slot corresponds to the selected layer
  const collageFrameMeta = selectedLayer?.metadata["collageFrame"] as {
    slotId?: string; collageRuleId?: string; isCollageFrame?: boolean
  } | undefined;
  const selectedSlotId = collageFrameMeta?.collageRuleId === rule.id ? (collageFrameMeta.slotId ?? null) : null;
  const assignment = selectedSlotId ? rule.imageAssignments.find((a) => a.slotId === selectedSlotId) : undefined;
  const adj = assignment?.colorAdjustments;

  // Generate suggestions when rule or image pool changes
  useEffect(() => {
    if (!document) return;
    const page = document.pages.find((p) => p.id === rule.pageId);
    if (!page) return;
    const dpi = page.setup?.dpi ?? 300;
    const spacingPx = mmToPx(rule.spacingMM, dpi);
    const marginPx = mmToPx(rule.marginMM, dpi);
    const imageInputs: CollageImageInput[] = rule.imagePool.map((assetId) => {
      const asset = document.assets.find((a) => a.id === assetId);
      return { assetId, width: asset?.width ?? 800, height: asset?.height ?? 600 };
    });
    const newSuggestions = generateCollageSuggestions(
      imageInputs, page.width, page.height,
      spacingPx, marginPx, "creative"
    );
    setSuggestions(newSuggestions);
  }, [rule.id, rule.imagePool.length, rule.spacingMM, rule.marginMM, document]);

  async function handleAddImages(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    if (!e.target.files || !document) return;
    const files = Array.from(e.target.files);
    e.target.value = "";
    const newAssets = [];
    const newIds: string[] = [];
    for (const file of files) {
      try {
        const { asset } = await importImageAsset(file, document.assets, { createPreview: true });
        newAssets.push(asset);
        newIds.push(asset.id);
      } catch { /* skip failed */ }
    }
    if (newAssets.length === 0) return;
    const updatedDoc = { ...document, assets: [...document.assets, ...newAssets] };
    setDocument(updatedDoc);
    addImagesToCollage(rule.id, newIds);
  }

  function handleSelectLayout(suggestion: ScoredLayoutSuggestion): void {
    if (!document) return;
    const page = document.pages.find((p) => p.id === rule.pageId);
    if (!page) return;
    // applyCollageLayoutFamily is synchronous (Zustand set) — store is updated immediately
    applyCollageLayoutFamily(rule.id, suggestion.family, page.width, page.height);
    // Run smart crop using the UPDATED store state (not stale closure)
    void runSmartCropFromStore();
  }

  async function runSmartCropFromStore(): Promise<void> {
    // Get fresh state after synchronous Zustand update
    const freshDoc = useDocumentStore.getState().document;
    if (!freshDoc) return;
    const updatedRule = freshDoc.collageRules.find((r) => r.id === rule.id);
    const page = freshDoc.pages.find((p) => p.id === rule.pageId);
    if (!updatedRule || !page) return;

    for (const assignment of updatedRule.imageAssignments) {
      if (assignment.hasManualTransform) continue;
      const asset = freshDoc.assets.find((a) => a.id === assignment.assetId);
      if (!asset) continue;
      // Use cachedSlots from the UPDATED rule — NOT from the suggestion object
      const slot = updatedRule.cachedSlots.find((s) => s.id === assignment.slotId);
      if (!slot) continue;
      const newTransform = await applySmartCropToAssignment(assignment, asset, slot.w * page.width, slot.h * page.height);
      updateImageTransform(rule.id, assignment.slotId, newTransform);
    }
  }

  function handleRegenerateLayouts(): void {
    if (!document) return;
    const page = document.pages.find((p) => p.id === rule.pageId);
    if (!page) return;
    const dpi = page.setup?.dpi ?? 300;
    const spacingPx = mmToPx(rule.spacingMM, dpi);
    const marginPx = mmToPx(rule.marginMM, dpi);
    const imageInputs: CollageImageInput[] = rule.imagePool.map((assetId) => {
      const asset = document.assets.find((a) => a.id === assetId);
      return { assetId, width: asset?.width ?? 800, height: asset?.height ?? 600 };
    });
    const newSuggestions = generateCollageSuggestions(
      imageInputs, page.width, page.height,
      spacingPx, marginPx, "creative"
    );
    setSuggestions(newSuggestions);
  }

  return (
    <div className="collage-mode-panel">
      <div className="panel-tabs">
        <button type="button" className={`panel-tab${tab === "layouts" ? " active" : ""}`} onClick={() => setTab("layouts")}>פריסות</button>
        <button type="button" className={`panel-tab${tab === "cell" ? " active" : ""}`} onClick={() => setTab("cell")}>תא</button>
        <button type="button" className={`panel-tab${tab === "canvas" ? " active" : ""}`} onClick={() => setTab("canvas")}>קנבס</button>
      </div>

      {/* Layouts tab */}
      {tab === "layouts" && (
        <div className="panel-section">
          {/* Add images button — prominent */}
          <button type="button" className="btn btn-primary collage-add-images-btn"
            onClick={() => addImgRef.current?.click()}>
            <ImagePlus size={14} /> הוסף תמונות לקולאז'
          </button>
          <input ref={addImgRef} type="file" accept="image/*" multiple style={{ display: "none" }}
            onChange={(e) => void handleAddImages(e)} />

          <div className="collage-panel-row" style={{ marginTop: 8 }}>
            <span className="panel-section-label">הצעות פריסה ({suggestions.length})</span>
            <button type="button" className="btn btn-ghost btn-xs" onClick={handleRegenerateLayouts} title="ייצר מחדש">
              <RefreshCw size={12} />
            </button>
          </div>
          <div className="collage-layouts-scroll">
            {suggestions.map((suggestion, i) => (
              <CollageMiniPreview
                key={suggestion.family}
                suggestion={suggestion}
                isSelected={suggestion.family === rule.activeFamily}
                isTop={i === 0}
                onClick={() => handleSelectLayout(suggestion)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Cell tab */}
      {tab === "cell" && (
        <div className="panel-section">
          {!selectedSlotId || !assignment ? (
            <p className="panel-hint">לחץ על תא בקנבס לעריכה</p>
          ) : (
            <>
              <div className="panel-field">
                <label>בהירות: {adj?.brightness.toFixed(2)}</label>
                <input type="range" min={0.2} max={2} step={0.05} value={adj?.brightness ?? 1}
                  onChange={(e) => updateAdjustments(rule.id, selectedSlotId, { brightness: +e.target.value })} />
              </div>
              <div className="panel-field">
                <label>ניגודיות: {adj?.contrast.toFixed(2)}</label>
                <input type="range" min={0.2} max={2} step={0.05} value={adj?.contrast ?? 1}
                  onChange={(e) => updateAdjustments(rule.id, selectedSlotId, { contrast: +e.target.value })} />
              </div>
              <div className="panel-field">
                <label>רוויה: {adj?.saturation.toFixed(2)}</label>
                <input type="range" min={0} max={2} step={0.05} value={adj?.saturation ?? 1}
                  onChange={(e) => updateAdjustments(rule.id, selectedSlotId, { saturation: +e.target.value })} />
              </div>
              <div className="panel-field">
                <label>חשיפה (EV): {adj?.exposureEV.toFixed(1)}</label>
                <input type="range" min={-3} max={3} step={0.1} value={adj?.exposureEV ?? 0}
                  onChange={(e) => updateAdjustments(rule.id, selectedSlotId, { exposureEV: +e.target.value })} />
              </div>
              <div className="panel-field">
                <label>
                  <input type="checkbox" checked={adj?.isBlackAndWhite ?? false}
                    onChange={(e) => updateAdjustments(rule.id, selectedSlotId, { isBlackAndWhite: e.target.checked })} />
                  &nbsp;שחור לבן
                </label>
              </div>
              <div className="panel-sep" />
              <div className="panel-field">
                <label>סגנון שוליים:</label>
                <select value={assignment.edgeConfig?.style ?? "hard"}
                  onChange={(e) => updateEdgeConfig(rule.id, selectedSlotId, { style: e.target.value as CollageEdgeStyle })}>
                  <option value="hard">חד</option>
                  <option value="softEdge">רך</option>
                  <option value="tornPaper">נייר קרוע</option>
                  <option value="outlineCircle">מסגרת עגולה</option>
                </select>
              </div>
            </>
          )}
        </div>
      )}

      {/* Canvas tab */}
      {tab === "canvas" && (
        <div className="panel-section">
          <div className="panel-field">
            <label>צבע רקע:</label>
            <input type="color" value={rule.canvasSettings.backgroundColor}
              onChange={(e) => updateCanvasSettings(rule.id, { backgroundColor: e.target.value })} />
          </div>
          <div className="panel-field">
            <label>רדיוס פינות: {rule.canvasSettings.globalCornerRadius} מ״מ</label>
            <input type="range" min={0} max={20} step={0.5} value={rule.canvasSettings.globalCornerRadius}
              onChange={(e) => updateCanvasSettings(rule.id, { globalCornerRadius: +e.target.value })} />
          </div>
          <div className="panel-field">
            <label>גבול: {rule.canvasSettings.globalBorderWidth} מ״מ</label>
            <input type="range" min={0} max={5} step={0.1} value={rule.canvasSettings.globalBorderWidth}
              onChange={(e) => updateCanvasSettings(rule.id, { globalBorderWidth: +e.target.value })} />
          </div>
          <div className="panel-field">
            <label>
              <input type="checkbox" checked={rule.canvasSettings.globalShadowEnabled}
                onChange={(e) => updateCanvasSettings(rule.id, { globalShadowEnabled: e.target.checked })} />
              &nbsp;צל כללי
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
