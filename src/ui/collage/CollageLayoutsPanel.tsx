import { useEffect, useRef, useState, type ChangeEvent, type ReactElement } from "react";
import { ImagePlus, LayoutGrid, Shapes, Sparkles, Trash2 } from "lucide-react";
import { generateCollageSuggestions } from "@/core/collage/collageModeEngine";
import { createCollageMaskSnapshot, readCollageMaskSnapshot, renderTemplateToAlphaMask } from "@/core/collage/collageMaskShape";
import { applySmartCropToAssignment } from "@/core/collage/collageFrameSync";
import { mmToPx } from "@/core/units/conversion";
import { createMaskAsset, importImageAsset } from "@/core/assets/assetManager";
import { HEIC_CONVERSION_ERROR_MESSAGE, SUPPORTED_IMAGE_ACCEPT, isSupportedIncomingImageFile, normalizeIncomingImages } from "@/core/image/normalizeIncomingImage";
import { useDocumentStore } from "@/state/documentStore";
import { useCollageShapeTemplateStore } from "@/state/collageShapeTemplateStore";
import { CollageMiniPreview } from "./CollageMiniPreview";
import type { CollageShapeTemplate } from "@/types/collage";
import type { CollageImageInput, CollageRule, ScoredLayoutSuggestion } from "@/types/collage";

interface CollageLayoutsPanelProps {
  rule: CollageRule;
}

export function CollageLayoutsPanel({ rule }: CollageLayoutsPanelProps): ReactElement {
  const [suggestions, setSuggestions] = useState<ScoredLayoutSuggestion[]>([]);
  const [smartCropProgress, setSmartCropProgress] = useState<{ done: number; total: number } | null>(null);
  const [layoutTab, setLayoutTab] = useState<"standard" | "custom">("standard");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);
  const document = useDocumentStore((s) => s.document);
  const setDocument = useDocumentStore((s) => s.setDocument);
  const applyCollageLayoutFamily = useDocumentStore((s) => s.applyCollageLayoutFamily);
  const applyCollageShapeTemplate = useDocumentStore((s) => s.applyCollageShapeTemplate);
  const addImagesToCollage = useDocumentStore((s) => s.addImagesToCollage);
  const updateImageTransform = useDocumentStore((s) => s.updateCollageImageTransform);
  const shapeTemplates = useCollageShapeTemplateStore((s) => s.templates);
  const addShapeTemplate = useCollageShapeTemplateStore((s) => s.addTemplate);
  const removeShapeTemplate = useCollageShapeTemplateStore((s) => s.removeTemplate);
  const activeShapeTemplateId = readCollageMaskSnapshot(rule.metadata["collageShapeTemplate"])?.templateId;

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
    setSuggestions(generateCollageSuggestions(imageInputs, page.width, page.height, spacingPx, marginPx, "creative"));
  }, [rule.id, rule.imagePool.length, rule.spacingMM, rule.marginMM, document]);

  async function handleAddImages(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    if (!e.target.files || !document) return;
    const { files, failed } = await normalizeIncomingImages(Array.from(e.target.files).filter(isSupportedIncomingImageFile));
    if (failed.length > 0) window.alert(HEIC_CONVERSION_ERROR_MESSAGE);
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

  function isTemplateFile(file: File): boolean {
    const name = file.name.toLowerCase();
    return isSupportedIncomingImageFile(file) || name.endsWith(".svg");
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("Unable to read file"));
      reader.readAsDataURL(file);
    });
  }

  async function isSafeSvgTemplate(file: File): Promise<boolean> {
    if (!(file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg"))) return true;
    const text = await file.text();
    return !/<script[\s>]/i.test(text)
      && !/\b(?:href|xlink:href)\s*=\s*["'](?:https?:)?\/\//i.test(text)
      && !/<(?:iframe|foreignObject)\b/i.test(text);
  }

  function readImageSize(src: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || img.width || 800, height: img.naturalHeight || img.height || 600 });
      img.onerror = () => resolve({ width: 800, height: 600 });
      img.src = src;
    });
  }

  async function handleAddShapeTemplates(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const { files, failed } = await normalizeIncomingImages(Array.from(e.target.files ?? []).filter(isTemplateFile));
    if (failed.length > 0) window.alert(HEIC_CONVERSION_ERROR_MESSAGE);
    e.target.value = "";
    for (const file of files) {
      if (!(await isSafeSvgTemplate(file))) {
        window.alert("SVG עם scripts או הפניות חיצוניות לא נתמך כתבנית קולאג'.");
        continue;
      }
      const fileDataUrl = await readFileAsDataUrl(file);
      const size = await readImageSize(fileDataUrl);
      addShapeTemplate({
        name: file.name.replace(/\.[^.]+$/, ""),
        sourceType: file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg") ? "svg" : "image",
        fileDataUrl,
        thumbnailDataUrl: fileDataUrl,
        defaultWidth: size.width,
        defaultHeight: size.height,
        maskMode: "auto",
        threshold: 245,
        alphaThreshold: 32,
        feather: 2,
        invert: false,
        metadata: {}
      });
    }
  }

  async function handleApplyShapeTemplate(template: CollageShapeTemplate): Promise<void> {
    if (!document) return;
    const page = document.pages.find((p) => p.id === rule.pageId);
    if (!page) return;
    const mask = await renderTemplateToAlphaMask(template);
    if (mask.analysis.bounds === null || mask.analysis.activeRatio < 0.02) {
      window.alert("התבנית דקה מדי או לא מכילה אזור פעיל ברור.");
      return;
    }
    const fittedMaskDataUrl = await fitMaskToCanvas(mask.dataUrl, page.width, page.height);
    const maskAsset = createMaskAsset(fittedMaskDataUrl, page.width, page.height, `collage_${rule.id}`);
    const snapshot = createCollageMaskSnapshot(
      { ...template, defaultWidth: mask.width, defaultHeight: mask.height, thumbnailDataUrl: mask.dataUrl },
      maskAsset.id,
      mask.analysis
    );
    applyCollageShapeTemplate(rule.id, snapshot, maskAsset);
  }

  function fitMaskToCanvas(dataUrl: string, canvasW: number, canvasH: number): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(canvasW));
        canvas.height = Math.max(1, Math.round(canvasH));
        const ctx = canvas.getContext("2d");
        if (ctx === null) { resolve(dataUrl); return; }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const scale = Math.min(canvas.width / Math.max(1, img.width), canvas.height / Math.max(1, img.height));
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
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

  return (
    <div className="collage-layouts-panel">
      <div className="collage-layouts-sticky">
        <button type="button" className="btn btn-primary btn-full" onClick={() => fileInputRef.current?.click()}>
          <ImagePlus size={14} /> הוסף תמונות לקולאז'
        </button>
        <input ref={fileInputRef} type="file" accept={SUPPORTED_IMAGE_ACCEPT} multiple style={{ display: "none" }} onChange={(e) => void handleAddImages(e)} />
        <button type="button" className="btn btn-ghost btn-full" onClick={() => templateInputRef.current?.click()}>
          <Shapes size={14} /> העלה תבנית צורה
        </button>
        <input ref={templateInputRef} type="file" accept={SUPPORTED_IMAGE_ACCEPT} multiple style={{ display: "none" }} onChange={(e) => void handleAddShapeTemplates(e)} />
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

        <div className="collage-layout-tabs" role="tablist" aria-label="סוג פריסות קולאז'">
          <button type="button" className={layoutTab === "standard" ? "active" : ""} onClick={() => setLayoutTab("standard")}>
            <LayoutGrid size={13} /> פריסות ({suggestions.length})
          </button>
          <button type="button" className={layoutTab === "custom" ? "active" : ""} onClick={() => setLayoutTab("custom")}>
            <Shapes size={13} /> מותאם אישית ({shapeTemplates.length})
          </button>
        </div>
      </div>

      <div className="collage-layouts-scroll">
        {layoutTab === "custom" ? (
          <div className="collage-shape-template-section">
            {shapeTemplates.length === 0 ? (
              <div className="collage-empty-state">אין עדיין פריסות מותאמות. אפשר להעלות תבנית צורה או לשמור תמונה/טקסט מהקנבס כתבנית.</div>
            ) : (
              <div className="collage-shape-template-grid">
                {shapeTemplates.map((template) => (
                  <div key={template.id} className={`collage-shape-template-card${rule.activeFamily === "customMaskShape" && activeShapeTemplateId === template.id ? " active" : ""}`}>
                    <button type="button" className="collage-shape-template-thumb" onClick={() => void handleApplyShapeTemplate(template)} title="החל תבנית קולאג'">
                      {template.thumbnailDataUrl ? <img src={template.thumbnailDataUrl} alt={template.name} /> : <Shapes size={22} />}
                    </button>
                    <div className="collage-shape-template-row">
                      <span>{template.name}</span>
                      <button type="button" className="icon-btn danger" onClick={() => removeShapeTemplate(template.id)} title="מחק תבנית">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          suggestions.map((s, i) => (
            <CollageMiniPreview
              key={s.family}
              suggestion={s}
              isSelected={s.family === rule.activeFamily}
              isTop={i === 0}
              onClick={() => void handleSelectLayout(s)}
            />
          ))
        )}
      </div>
    </div>
  );
}
