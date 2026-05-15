import { useEffect, useRef, useState, type ChangeEvent, type ReactElement } from "react";
import { ImagePlus, RefreshCw } from "lucide-react";
import { generateCollageSuggestions } from "@/core/collage/collageModeEngine";
import { applySmartCropToAssignment } from "@/core/collage/collageFrameSync";
import { mmToPx } from "@/core/units/conversion";
import { importImageAsset } from "@/core/assets/assetManager";
import { useDocumentStore } from "@/state/documentStore";
import { CollageMiniPreview } from "./CollageMiniPreview";
import type { CollageImageInput, CollageRule, ScoredLayoutSuggestion } from "@/types/collage";

interface CollageLayoutsPanelProps {
  rule: CollageRule;
}

export function CollageLayoutsPanel({ rule }: CollageLayoutsPanelProps): ReactElement {
  const [suggestions, setSuggestions] = useState<ScoredLayoutSuggestion[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const document = useDocumentStore((s) => s.document);
  const setDocument = useDocumentStore((s) => s.setDocument);
  const applyCollageLayoutFamily = useDocumentStore((s) => s.applyCollageLayoutFamily);
  const addImagesToCollage = useDocumentStore((s) => s.addImagesToCollage);
  const updateImageTransform = useDocumentStore((s) => s.updateCollageImageTransform);

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
    setSuggestions(generateCollageSuggestions(imageInputs, page.width, page.height, spacingPx, marginPx, "simple"));
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

  async function handleSelectLayout(suggestion: ScoredLayoutSuggestion): Promise<void> {
    if (!document) return;
    const page = document.pages.find((p) => p.id === rule.pageId);
    if (!page) return;
    applyCollageLayoutFamily(rule.id, suggestion.family, page.width, page.height);
    // Smart crop after layout change
    const freshDoc = useDocumentStore.getState().document;
    if (!freshDoc) return;
    const updatedRule = freshDoc.collageRules.find((r) => r.id === rule.id);
    const freshPage = freshDoc.pages.find((p) => p.id === rule.pageId);
    if (!updatedRule || !freshPage) return;
    for (const a of updatedRule.imageAssignments) {
      if (a.hasManualTransform) continue;
      const asset = freshDoc.assets.find((x) => x.id === a.assetId);
      if (!asset) continue;
      const slot = updatedRule.cachedSlots.find((s) => s.id === a.slotId);
      if (!slot) continue;
      const newTransform = await applySmartCropToAssignment(a, asset, slot.w * freshPage.width, slot.h * freshPage.height);
      updateImageTransform(rule.id, a.slotId, newTransform);
    }
  }

  function handleRegenerate(): void {
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
    setSuggestions(generateCollageSuggestions(imageInputs, page.width, page.height, spacingPx, marginPx, "creative"));
  }

  return (
    <div className="collage-layouts-panel">
      <button type="button" className="btn btn-primary btn-full" onClick={() => fileInputRef.current?.click()}>
        <ImagePlus size={14} /> הוסף תמונות לקולאז&apos;
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => void handleAddImages(e)} />

      <div className="collage-panel-row" style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="panel-section-label">פריסות ({suggestions.length})</span>
        <button type="button" className="btn btn-ghost btn-xs" onClick={handleRegenerate} title="ייצר מחדש">
          <RefreshCw size={12} />
        </button>
      </div>

      <div className="collage-layouts-scroll">
        {suggestions.map((s, i) => (
          <CollageMiniPreview
            key={s.family}
            suggestion={s}
            isSelected={s.family === rule.activeFamily}
            isTop={i === 0}
            onClick={() => void handleSelectLayout(s)}
          />
        ))}
      </div>
    </div>
  );
}
