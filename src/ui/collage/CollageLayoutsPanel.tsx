import { useEffect, useRef, useState, type ChangeEvent, type ReactElement } from "react";
import { ImagePlus, RefreshCw, Sparkles } from "lucide-react";
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
  const [smartCropProgress, setSmartCropProgress] = useState<{ done: number; total: number } | null>(null);
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
  }

  async function handleSmartCrop(): Promise<void> {
    if (!document || smartCropProgress !== null) return;
    const freshDoc = useDocumentStore.getState().document;
    if (!freshDoc) return;
    const updatedRule = freshDoc.collageRules.find((r) => r.id === rule.id);
    const freshPage = freshDoc.pages.find((p) => p.id === rule.pageId);
    if (!updatedRule || !freshPage) return;
    const workItems = updatedRule.imageAssignments.filter((a) => !a.hasManualTransform);
    setSmartCropProgress({ done: 0, total: workItems.length });
    let done = 0;
    for (const a of workItems) {
      const latestDoc = useDocumentStore.getState().document;
      if (!latestDoc) break;
      const latestRule = latestDoc.collageRules.find((r) => r.id === rule.id);
      const latestPage = latestDoc.pages.find((p) => p.id === rule.pageId);
      if (!latestRule || !latestPage) break;
      const latestAssignment = latestRule.imageAssignments.find((item) => item.slotId === a.slotId);
      if (!latestAssignment || latestAssignment.hasManualTransform) {
        done += 1;
        setSmartCropProgress({ done, total: workItems.length });
        continue;
      }
      const asset = latestDoc.assets.find((x) => x.id === latestAssignment.assetId);
      const slot = latestRule.cachedSlots.find((s) => s.id === latestAssignment.slotId);
      if (!asset || !slot) {
        done += 1;
        setSmartCropProgress({ done, total: workItems.length });
        continue;
      }
      const newTransform = await applySmartCropToAssignment(
        latestAssignment,
        asset,
        slot.w * latestPage.width,
        slot.h * latestPage.height
      );
      updateImageTransform(rule.id, latestAssignment.slotId, newTransform);
      done += 1;
      setSmartCropProgress({ done, total: workItems.length });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
    setSmartCropProgress(null);
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
      <button
        type="button"
        className="btn btn-ghost btn-full"
        disabled={smartCropProgress !== null}
        onClick={() => void handleSmartCrop()}
        title="התאם תמונות לפי זיהוי פנים"
      >
        <Sparkles size={14} />
        {smartCropProgress === null
          ? "התאם לפי פנים"
          : `מנתח ${smartCropProgress.done}/${smartCropProgress.total}`}
      </button>

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
