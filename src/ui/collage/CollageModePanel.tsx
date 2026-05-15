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
  const [suggestions, setSuggestions] = useState<ScoredLayoutSuggestion[]>([]);
  const addImgRef = useRef<HTMLInputElement>(null);
  const document = useDocumentStore((s) => s.document);
  const setDocument = useDocumentStore((s) => s.setDocument);
  const applyCollageLayoutFamily = useDocumentStore((s) => s.applyCollageLayoutFamily);
  const addImagesToCollage = useDocumentStore((s) => s.addImagesToCollage);
  const updateImageTransform = useDocumentStore((s) => s.updateCollageImageTransform);
  const updateEdgeConfig = useDocumentStore((s) => s.updateCollageEdgeConfig);
  const applyEdgeConfigToAll = useDocumentStore((s) => s.applyCollageEdgeConfigToAll);
  const updateCanvasSettings = useDocumentStore((s) => s.updateCollageCanvasSettings);

  const collageFrameMeta = selectedLayer?.metadata["collageFrame"] as {
    slotId?: string; collageRuleId?: string; isCollageFrame?: boolean
  } | undefined;
  const selectedSlotId = collageFrameMeta?.collageRuleId === rule.id ? (collageFrameMeta.slotId ?? null) : null;
  const assignment = selectedSlotId ? rule.imageAssignments.find((a) => a.slotId === selectedSlotId) : undefined;

  // Generate layout suggestions
  useEffect(() => {
    if (!document) return;
    const page = document.pages.find((p) => p.id === rule.pageId);
    if (!page) return;
    const dpi = page.setup?.dpi ?? 300;
    setSuggestions(generateCollageSuggestions(
      rule.imagePool.map((assetId) => {
        const asset = document.assets.find((a) => a.id === assetId);
        return { assetId, width: asset?.width ?? 800, height: asset?.height ?? 600 } as CollageImageInput;
      }),
      page.width, page.height,
      mmToPx(rule.spacingMM, dpi), mmToPx(rule.marginMM, dpi),
      "creative"
    ));
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
      } catch { /* skip */ }
    }
    if (newAssets.length === 0) return;
    setDocument({ ...document, assets: [...document.assets, ...newAssets] });
    addImagesToCollage(rule.id, newIds);
  }

  function handleSelectLayout(suggestion: ScoredLayoutSuggestion): void {
    if (!document) return;
    const page = document.pages.find((p) => p.id === rule.pageId);
    if (!page) return;
    applyCollageLayoutFamily(rule.id, suggestion.family, page.width, page.height);
    void (async () => {
      const freshDoc = useDocumentStore.getState().document;
      if (!freshDoc) return;
      const updatedRule = freshDoc.collageRules.find((r) => r.id === rule.id);
      const freshPage = freshDoc.pages.find((p) => p.id === rule.pageId);
      if (!updatedRule || !freshPage) return;
      for (const a of updatedRule.imageAssignments) {
        if (a.hasManualTransform) continue;
        const asset = freshDoc.assets.find((x) => x.id === a.assetId);
        const slot = updatedRule.cachedSlots.find((s) => s.id === a.slotId);
        if (!asset || !slot) continue;
        updateImageTransform(rule.id, a.slotId, await applySmartCropToAssignment(a, asset, slot.w * freshPage.width, slot.h * freshPage.height));
      }
    })();
  }


  return (
    <div className="collage-mode-panel">
      <div className="panel-section">
          <button type="button" className="btn btn-primary btn-full" onClick={() => addImgRef.current?.click()}>
            <ImagePlus size={14} /> הוסף תמונות לקולאז&apos;
          </button>
          <input ref={addImgRef} type="file" accept="image/*" multiple style={{ display: "none" }}
            onChange={(e) => void handleAddImages(e)} />

          <div className="panel-sep" />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span className="panel-section-label">הצעות פריסה</span>
            <button type="button" className="btn btn-ghost btn-xs" title="ייצר מחדש"
              onClick={() => {
                if (!document) return;
                const page = document.pages.find((p) => p.id === rule.pageId);
                if (!page) return;
                const dpi = page.setup?.dpi ?? 300;
                setSuggestions(generateCollageSuggestions(
                  rule.imagePool.map((assetId) => {
                    const asset = document.assets.find((a) => a.id === assetId);
                    return { assetId, width: asset?.width ?? 800, height: asset?.height ?? 600 } as CollageImageInput;
                  }),
                  page.width, page.height,
                  mmToPx(rule.spacingMM, dpi), mmToPx(rule.marginMM, dpi),
                  "creative"
                ));
              }}>
              <RefreshCw size={12} />
            </button>
          </div>
          <div className="collage-layouts-scroll" style={{ maxHeight: 160 }}>
            {suggestions.slice(0, 5).map((s, i) => (
              <CollageMiniPreview key={s.family} suggestion={s} isSelected={s.family === rule.activeFamily}
                isTop={i === 0} onClick={() => handleSelectLayout(s)} />
            ))}
          </div>

      <div className="panel-sep" />
      <div className="panel-group-label">סגנון שוליים</div>
      <div className="panel-field" style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <select value={assignment?.edgeConfig?.style ?? "hard"}
          onChange={(e) => {
            if (selectedSlotId) updateEdgeConfig(rule.id, selectedSlotId, { style: e.target.value as CollageEdgeStyle });
          }}
          style={{ flex: 1 }}>
          <option value="hard">חד</option>
          <option value="softEdge">רך</option>
          <option value="tornPaper">נייר קרוע</option>
          <option value="outlineCircle">מסגרת עגולה</option>
        </select>
        {assignment && (
          <button type="button" className="btn btn-ghost btn-xs" title="החל על כל התאים"
            onClick={() => applyEdgeConfigToAll(rule.id, { style: (assignment.edgeConfig?.style ?? "hard") as CollageEdgeStyle })}>
            כל התאים
          </button>
        )}
      </div>

      <div className="panel-sep" />
      <div className="panel-group-label">הגדרות קנבס</div>
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
    </div>
  );
}
