import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type ReactElement } from "react";
import { ArrowLeft, ArrowRight, Boxes, Check, Plus, UploadCloud, X } from "lucide-react";
import { PAGE_PRESETS, pageSetupFromPreset } from "@/core/pageSetup/presets";
import { unitToPx } from "@/core/units/conversion";
import { generateCollageSuggestions } from "@/core/collage/collageModeEngine";
import { buildMaskAwareSlotsFromAnalysis, createCollageMaskSnapshot, renderTemplateToAlphaMask, type CollageMaskSnapshot } from "@/core/collage/collageMaskShape";
import { createMaskAsset } from "@/core/assets/assetManager";
import { HEIC_CONVERSION_ERROR_MESSAGE, SUPPORTED_IMAGE_ACCEPT, normalizeIncomingImages } from "@/core/image/normalizeIncomingImage";
import { CollageMiniPreview } from "./CollageMiniPreview";
import { useProductStore } from "@/state/productStore";
import { useCollageShapeTemplateStore } from "@/state/collageShapeTemplateStore";
import { GlobalWizardDropTarget, isImageDropFile } from "@/ui/wizard/GlobalWizardDropTarget";
import type { BatchCollageSettings } from "@/types/batchCollage";
import type { CollageComplexityMode, CollageLayoutFamily, CollageShapeTemplate, CollageSlot, ScoredLayoutSuggestion } from "@/types/collage";
import type { Asset } from "@/types/document";
import type { PageSetup, Unit } from "@/types/primitives";
import type { ProjectCustomerInfo } from "@/types/project";

export interface ImageEntry {
  file: File;
  url: string;
  width: number;
  height: number;
}

export interface BatchCollageWizardGroup {
  id: string;
  name: string;
  images: ImageEntry[];
}

interface CollageWizardBaseResult {
  pageSetup: PageSetup;
  spacingMm: number;
  marginMm: number;
  customerInfo?: Partial<ProjectCustomerInfo>;
}

export interface SingleCollageWizardResult extends CollageWizardBaseResult {
  mode: "single";
  images: ImageEntry[];
  complexityMode: CollageComplexityMode;
  selectedFamily: CollageLayoutFamily;
  cachedSlots: CollageSlot[];
  suggestions: ScoredLayoutSuggestion[];
  shapeTemplateSnapshot?: CollageMaskSnapshot;
  shapeTemplateMaskAsset?: Asset;
}

export interface BatchCollageWizardResult extends CollageWizardBaseResult {
  mode: "batch";
  batchGroups: BatchCollageWizardGroup[];
  allowedLayoutMode: BatchCollageSettings["allowedLayoutMode"];
  smartCropEnabled: boolean;
}

export type CollageWizardResult = SingleCollageWizardResult | BatchCollageWizardResult;

interface CollageSetupWizardProps {
  onComplete: (result: CollageWizardResult) => void;
  onCancel: () => void;
}

const COLLAGE_PRESETS = [
  ...PAGE_PRESETS.filter((p) => p.category === "photo" || (p.category === "paper" && ["a4", "a3", "a5"].includes(p.id))),
  { id: "custom", name: "מותאם אישית", category: "custom" as const, width: 200, height: 200, units: "mm" as Unit, dpi: 300, printIntent: "photo" as const }
];

function createBatchGroup(index: number): BatchCollageWizardGroup {
  return { id: crypto.randomUUID(), name: `קבוצה ${index}`, images: [] };
}

export function CollageSetupWizard({ onComplete, onCancel }: CollageSetupWizardProps): ReactElement {
  const productCollageContext = useProductStore((s) => s.collageContext);
  const clearProductCollageContext = useProductStore((s) => s.setCollageContext);
  const shapeTemplates = useCollageShapeTemplateStore((s) => s.templates);
  const isProductCollage = productCollageContext !== null;

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [batchMode, setBatchMode] = useState(false);

  const [images, setImages] = useState<ImageEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFileKeysRef = useRef<Set<string>>(new Set());

  const [batchGroups, setBatchGroups] = useState<BatchCollageWizardGroup[]>(() => [createBatchGroup(1)]);
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);

  const imagesRef = useRef(images);
  const batchGroupsRef = useRef(batchGroups);
  imagesRef.current = images;
  batchGroupsRef.current = batchGroups;
  useEffect(() => () => {
    for (const entry of imagesRef.current) revokeEntry(entry);
    for (const group of batchGroupsRef.current) {
      for (const entry of group.images) revokeEntry(entry);
    }
  }, []);

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");

  const [presetId, setPresetId] = useState("a4");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [customW, setCustomW] = useState("20");
  const [customH, setCustomH] = useState("20");
  const [customUnit, setCustomUnit] = useState<Unit>("cm");
  const [customDpi, setCustomDpi] = useState(300);

  const [spacingMm, setSpacingMm] = useState(0.5);
  const [marginMm, setMarginMm] = useState(0);
  const [complexityMode, setComplexityMode] = useState<CollageComplexityMode>("simple");
  const [allowedLayoutMode, setAllowedLayoutMode] = useState<BatchCollageSettings["allowedLayoutMode"]>("safeOnly");
  const [smartCropEnabled, setSmartCropEnabled] = useState(false);

  const [suggestions, setSuggestions] = useState<ScoredLayoutSuggestion[]>([]);
  const [selectedFamily, setSelectedFamily] = useState<CollageLayoutFamily | null>(null);
  const [selectedShapeTemplateId, setSelectedShapeTemplateId] = useState<string | null>(null);
  const [selectedShapeSnapshot, setSelectedShapeSnapshot] = useState<CollageMaskSnapshot | undefined>(undefined);
  const [selectedShapeMaskAsset, setSelectedShapeMaskAsset] = useState<Asset | undefined>(undefined);
  const [selectedShapeSlots, setSelectedShapeSlots] = useState<CollageSlot[] | undefined>(undefined);

  useEffect(() => {
    if (!productCollageContext) return;
    const p = productCollageContext.product;
    const bleed = p.bleed ?? { top: 2, right: 2, bottom: 2, left: 2 };
    setPresetId("custom");
    setCustomUnit("mm");
    setCustomW((p.canvasSize.width + bleed.left + bleed.right).toFixed(2));
    setCustomH((p.canvasSize.height + bleed.top + bleed.bottom).toFixed(2));
    setCustomDpi(p.recommendedDPI ?? p.printSpec.dpi ?? 300);
    if ((p.productMasks ?? []).length > 0) {
      setSpacingMm(0);
      setMarginMm(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fileKey(file: File): string {
    return `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
  }

  function revokeEntry(entry: ImageEntry): void {
    try { URL.revokeObjectURL(entry.url); } catch { /* ignore */ }
  }

  function makeImageEntry(file: File): Promise<ImageEntry | null> {
    return new Promise((resolve) => {
      if (!isImageDropFile(file)) {
        resolve(null);
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new window.Image();
      img.onload = () => resolve({ file, url, width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }

  async function entriesFromFiles(files: FileList | File[], existingEntries: ImageEntry[]): Promise<ImageEntry[]> {
    const loadedKeys = new Set(existingEntries.map((entry) => fileKey(entry.file)));
    const batchKeys = new Set<string>();
    const { files: normalizedFiles, failed } = await normalizeIncomingImages(Array.from(files).filter(isImageDropFile));
    if (failed.length > 0) window.alert(HEIC_CONVERSION_ERROR_MESSAGE);
    const todo = normalizedFiles.filter((file) => {
      const key = fileKey(file);
      if (loadedKeys.has(key) || pendingFileKeysRef.current.has(key) || batchKeys.has(key)) return false;
      batchKeys.add(key);
      pendingFileKeysRef.current.add(key);
      return isImageDropFile(file);
    });
    const entries: ImageEntry[] = [];
    for (const file of todo) {
      const entry = await makeImageEntry(file);
      pendingFileKeysRef.current.delete(fileKey(file));
      if (entry !== null) entries.push(entry);
    }
    return entries;
  }

  async function addFiles(files: FileList | File[]): Promise<void> {
    const entries = await entriesFromFiles(files, imagesRef.current);
    if (entries.length === 0) return;
    setImages((prev) => [...prev, ...entries].slice(0, 100));
  }

  async function addFilesToGroup(groupId: string, files: FileList | File[]): Promise<void> {
    const group = batchGroupsRef.current.find((item) => item.id === groupId);
    if (group === undefined) return;
    const entries = await entriesFromFiles(files, group.images);
    if (entries.length === 0) return;
    setBatchGroups((prev) =>
      prev.map((item) => item.id === groupId ? { ...item, images: [...item.images, ...entries] } : item)
    );
  }

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files) void addFiles(e.dataTransfer.files);
  }

  function handleBatchDrop(groupId: string, e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDraggingGroupId(null);
    if (e.dataTransfer.files) void addFilesToGroup(groupId, e.dataTransfer.files);
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>): void {
    if (e.target.files) void addFiles(e.target.files);
    e.target.value = "";
  }

  function handleGroupFileInput(groupId: string, e: ChangeEvent<HTMLInputElement>): void {
    if (e.target.files) void addFilesToGroup(groupId, e.target.files);
    e.target.value = "";
  }

  function removeImage(i: number): void {
    setImages((prev) => {
      const target = prev[i];
      if (target) revokeEntry(target);
      return prev.filter((_, j) => j !== i);
    });
  }

  function removeGroupImage(groupId: string, imageIndex: number): void {
    setBatchGroups((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) return group;
        const target = group.images[imageIndex];
        if (target) revokeEntry(target);
        return { ...group, images: group.images.filter((_, index) => index !== imageIndex) };
      })
    );
  }

  function removeGroup(groupId: string): void {
    setBatchGroups((prev) => {
      const target = prev.find((group) => group.id === groupId);
      for (const entry of target?.images ?? []) revokeEntry(entry);
      const next = prev.filter((group) => group.id !== groupId);
      return next.length > 0 ? next : [createBatchGroup(1)];
    });
  }

  function currentPageSetup(): PageSetup {
    if (presetId === "custom") {
      const w = unitToPx(parseFloat(customW) || 200, customUnit, customDpi);
      const h = unitToPx(parseFloat(customH) || 200, customUnit, customDpi);
      const [fw, fh] = orientation === "landscape" ? [Math.max(w, h), Math.min(w, h)] : [Math.min(w, h), Math.max(w, h)];
      return {
        version: 1, units: customUnit, dpi: customDpi, orientation,
        size: { width: fw, height: fh },
        bleed: { top: 0, right: 0, bottom: 0, left: 0 },
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
        safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
        printIntent: "photo",
        rulerOrigin: "page",
        snapSettings: { version: 1, enabled: true, snapToGrid: false, snapToGuides: true, snapToLayers: true, snapToPage: true, snapTolerance: 8, showSmartGuides: true },
        gridSettings: { version: 1, enabled: false, spacingX: 60, spacingY: 60, snapToGrid: false }
      };
    }
    const preset = COLLAGE_PRESETS.find((p) => p.id === presetId) ?? COLLAGE_PRESETS[0];
    return pageSetupFromPreset(preset as Parameters<typeof pageSetupFromPreset>[0], orientation);
  }

  function customerInfo(): Partial<ProjectCustomerInfo> {
    return {
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
      phoneNumber: customerPhone || "",
      customerEmail: customerEmail || undefined
    };
  }

  function buildSuggestions(): ScoredLayoutSuggestion[] {
    const setup = currentPageSetup();
    const spacingPx = unitToPx(spacingMm, "mm", setup.dpi);
    const marginPx = unitToPx(marginMm, "mm", setup.dpi);
    const imageInputs = images.map((img) => ({ assetId: img.file.name, width: img.width, height: img.height }));
    return generateCollageSuggestions(imageInputs, setup.size.width, setup.size.height, spacingPx, marginPx, complexityMode);
  }

  function goToStep4(): void {
    const gen = buildSuggestions();
    setSuggestions(gen);
    setSelectedFamily(gen[0]?.family ?? null);
    setSelectedShapeTemplateId(null);
    setSelectedShapeSnapshot(undefined);
    setSelectedShapeMaskAsset(undefined);
    setSelectedShapeSlots(undefined);
    setStep(4);
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

  async function selectShapeTemplate(template: CollageShapeTemplate): Promise<void> {
    const setup = currentPageSetup();
    const spacingPx = unitToPx(spacingMm, "mm", setup.dpi);
    const marginPx = unitToPx(marginMm, "mm", setup.dpi);
    const mask = await renderTemplateToAlphaMask(template);
    if (mask.analysis.bounds === null || mask.analysis.activeRatio < 0.02) {
      window.alert("התבנית דקה מדי או לא מכילה אזור פעיל ברור.");
      return;
    }
    const fittedMaskDataUrl = await fitMaskToCanvas(mask.dataUrl, setup.size.width, setup.size.height);
    const maskAsset = createMaskAsset(fittedMaskDataUrl, setup.size.width, setup.size.height, "collage_wizard");
    const snapshot = createCollageMaskSnapshot(
      { ...template, defaultWidth: mask.width, defaultHeight: mask.height, thumbnailDataUrl: mask.dataUrl },
      maskAsset.id,
      mask.analysis
    );
    const slots = buildMaskAwareSlotsFromAnalysis(mask.analysis, images.length, setup.size.width, setup.size.height, spacingPx, marginPx);
    setSelectedFamily("customMaskShape");
    setSelectedShapeTemplateId(template.id);
    setSelectedShapeSnapshot(snapshot);
    setSelectedShapeMaskAsset(maskAsset);
    setSelectedShapeSlots(slots);
  }

  function handleCreate(): void {
    const family = selectedFamily ?? suggestions[0]?.family;
    if (family === "customMaskShape" && selectedShapeSnapshot && selectedShapeMaskAsset && selectedShapeSlots) {
      clearProductCollageContext(null);
      onComplete({
        mode: "single",
        images,
        pageSetup: currentPageSetup(),
        spacingMm,
        marginMm,
        complexityMode,
        selectedFamily: "customMaskShape",
        cachedSlots: selectedShapeSlots,
        suggestions,
        shapeTemplateSnapshot: selectedShapeSnapshot,
        shapeTemplateMaskAsset: selectedShapeMaskAsset,
        customerInfo: customerInfo()
      });
      return;
    }
    const suggestion = suggestions.find((s) => s.family === family) ?? suggestions[0];
    if (!suggestion) return;
    clearProductCollageContext(null);
    onComplete({
      mode: "single",
      images,
      pageSetup: currentPageSetup(),
      spacingMm,
      marginMm,
      complexityMode,
      selectedFamily: suggestion.family,
      cachedSlots: suggestion.slots,
      suggestions,
      customerInfo: customerInfo()
    });
  }

  function handleBatchCreate(): void {
    clearProductCollageContext(null);
    onComplete({
      mode: "batch",
      batchGroups,
      pageSetup: currentPageSetup(),
      spacingMm,
      marginMm,
      allowedLayoutMode,
      smartCropEnabled,
      customerInfo: customerInfo()
    });
  }

  const batchImageCount = batchGroups.reduce((sum, group) => sum + group.images.length, 0);
  const batchValidGroupCount = batchGroups.filter((group) => group.images.length > 0).length;
  const batchWarning = batchGroups.length > 50 || batchImageCount / Math.max(1, batchValidGroupCount) > 8;

  return (
    <div className="collage-wizard-overlay">
      <GlobalWizardDropTarget acceptFile={isImageDropFile} onFiles={(files) => batchMode ? void addFilesToGroup(batchGroups[0]?.id ?? "", files) : void addFiles(files)} />
      <div className="collage-wizard">
        <button type="button" className="collage-wizard-close" onClick={onCancel}><X size={20} /></button>

        {isProductCollage && productCollageContext && (
          <div className="wizard-product-banner">
            <Boxes size={13} />
            <span>קולאז׳ מוצר: <strong>{productCollageContext.product.name}</strong></span>
          </div>
        )}

        <div className="wizard-steps">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className={`wizard-step-dot${step >= s ? " active" : ""}${step > s ? " done" : ""}${(isProductCollage && s === 2) || (batchMode && s === 4) ? " skipped" : ""}`}>
              {step > s ? <Check size={10} /> : s}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="wizard-body">
            <h2>תמונות ופרטי לקוח</h2>

            <label className="wizard-check-row">
              <input type="checkbox" checked={batchMode} onChange={(event) => setBatchMode(event.target.checked)} />
              <span>יצירת קולאז׳ים מרובים</span>
            </label>

            <div className="wizard-customer-section">
              <div className="wizard-customer-row">
                <label>שם</label>
                <input className="wizard-input" type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="שם לקוח" />
              </div>
              <div className="wizard-customer-row">
                <label>טלפון</label>
                <input className="wizard-input" type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="050-0000000" />
              </div>
              <div className="wizard-customer-row">
                <label>אימייל</label>
                <input className="wizard-input" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="name@email.com" />
              </div>
            </div>

            <div className="wizard-divider" />

            {batchMode ? (
              <>
                <div className="batch-groups">
                  {batchGroups.map((group, groupIndex) => (
                    <article key={group.id} className="batch-group-card">
                      <div className="batch-group-header">
                        <input
                          className="wizard-input"
                          value={group.name}
                          onChange={(event) => setBatchGroups((prev) => prev.map((item) => item.id === group.id ? { ...item, name: event.target.value } : item))}
                          placeholder={`קבוצה ${groupIndex + 1}`}
                        />
                        <button type="button" className="btn btn-ghost btn-xs" onClick={() => removeGroup(group.id)}><X size={14} /></button>
                      </div>
                      <div
                        className={`drop-zone batch-drop-zone${draggingGroupId === group.id ? " dragover" : ""}`}
                        onDragOver={(event) => { event.preventDefault(); setDraggingGroupId(group.id); }}
                        onDragLeave={() => setDraggingGroupId(null)}
                        onDrop={(event) => handleBatchDrop(group.id, event)}
                      >
                        <UploadCloud size={24} />
                        <span>גרור תמונות לקבוצה הזו</span>
                        <label className="btn btn-ghost">
                          בחר תמונות
                          <input type="file" accept={SUPPORTED_IMAGE_ACCEPT} multiple hidden onChange={(event) => handleGroupFileInput(group.id, event)} />
                        </label>
                      </div>
                      {group.images.length > 0 ? (
                        <div className="wizard-thumb-grid">
                          {group.images.map((img, i) => (
                            <div key={img.url} className="wizard-thumb-item">
                              <img src={img.url} alt="" />
                              <button type="button" className="wizard-thumb-remove" onClick={() => removeGroupImage(group.id, i)}><X size={12} /></button>
                            </div>
                          ))}
                        </div>
                      ) : <p className="wizard-count">אין תמונות עדיין</p>}
                    </article>
                  ))}
                </div>
                {batchWarning ? <p className="wizard-warning">טווח מומלץ: עד 50 קבוצות, בערך 6 תמונות לקבוצה.</p> : null}
                <button type="button" className="btn btn-ghost btn-full" onClick={() => setBatchGroups((prev) => [...prev, createBatchGroup(prev.length + 1)])}>
                  <Plus size={16} /> הוסף ילד / קבוצה
                </button>
              </>
            ) : (
              <>
                <div className={`drop-zone${dragging ? " dragover" : ""}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}>
                  <UploadCloud size={36} />
                  <p>גרור תמונות לכאן</p>
                  <button type="button" className="btn btn-ghost" onClick={() => fileInputRef.current?.click()}>בחר תמונות</button>
                  <input ref={fileInputRef} type="file" accept={SUPPORTED_IMAGE_ACCEPT} multiple style={{ display: "none" }} onChange={handleFileInput} />
                </div>
                {images.length > 0 && (
                  <>
                    <p className="wizard-count">נבחרו: {images.length} תמונות</p>
                    <div className="wizard-thumb-grid">
                      {images.map((img, i) => (
                        <div key={img.url} className="wizard-thumb-item">
                          <img src={img.url} alt="" />
                          <button type="button" className="wizard-thumb-remove" onClick={() => removeImage(i)}><X size={12} /></button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            <div className="wizard-footer">
              <button type="button" className="btn btn-ghost" onClick={onCancel}>ביטול</button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={batchMode ? batchValidGroupCount === 0 : images.length === 0}
                onClick={() => setStep(isProductCollage ? 3 : 2)}
              >
                המשך <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="wizard-body">
            <h2>גודל עמוד</h2>
            <div className="wizard-presets-grid">
              {COLLAGE_PRESETS.map((p) => (
                <button key={p.id} type="button" className={`preset-card${presetId === p.id ? " selected" : ""}`} onClick={() => setPresetId(p.id)}>
                  {p.name}
                </button>
              ))}
            </div>
            {presetId === "custom" && (
              <div className="wizard-custom-size">
                <div className="wizard-custom-row">
                  <label>רוחב</label>
                  <input className="wizard-input wizard-size-input" type="number" min={1} value={customW} onChange={(e) => setCustomW(e.target.value)} />
                  <label>גובה</label>
                  <input className="wizard-input wizard-size-input" type="number" min={1} value={customH} onChange={(e) => setCustomH(e.target.value)} />
                  <select className="wizard-select" value={customUnit} onChange={(e) => setCustomUnit(e.target.value as Unit)}>
                    <option value="mm">mm</option>
                    <option value="cm">cm</option>
                    <option value="inch">אינץ׳</option>
                    <option value="px">פיקסל</option>
                  </select>
                </div>
                <div className="wizard-custom-row">
                  <label>רזולוציה (DPI)</label>
                  <select className="wizard-select" value={customDpi} onChange={(e) => setCustomDpi(+e.target.value)}>
                    <option value={72}>72</option>
                    <option value={150}>150</option>
                    <option value={300}>300</option>
                    <option value={600}>600</option>
                  </select>
                </div>
              </div>
            )}
            <div className="wizard-field">
              <label>כיוון הדפסה</label>
              <div className="wizard-orientation-row">
                <button type="button" className={`wizard-orientation-btn${orientation === "portrait" ? " active" : ""}`} onClick={() => setOrientation("portrait")}>
                  <span className="orientation-icon portrait-icon" />
                  לאורך
                </button>
                <button type="button" className={`wizard-orientation-btn${orientation === "landscape" ? " active" : ""}`} onClick={() => setOrientation("landscape")}>
                  <span className="orientation-icon landscape-icon" />
                  לרוחב
                </button>
              </div>
            </div>
            <div className="wizard-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}><ArrowLeft size={16} /> חזור</button>
              <button type="button" className="btn btn-primary" onClick={() => setStep(3)}>המשך <ArrowRight size={16} /></button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="wizard-body">
            <h2>הגדרות פריסה</h2>
            <div className="wizard-field">
              <label>מרווח בין תאים: {spacingMm} מ״מ</label>
              <input type="range" min={0} max={10} step={0.5} value={spacingMm} onChange={(e) => setSpacingMm(+e.target.value)} />
            </div>
            <div className="wizard-field">
              <label>שוליים: {marginMm} מ״מ</label>
              <input type="range" min={0} max={20} step={1} value={marginMm} onChange={(e) => setMarginMm(+e.target.value)} />
            </div>
            {batchMode ? (
              <>
                <label className="wizard-check-row">
                  <input type="checkbox" checked={allowedLayoutMode === "allLayouts"} onChange={(event) => setAllowedLayoutMode(event.target.checked ? "allLayouts" : "safeOnly")} />
                  <span>השתמש בכל סוגי פריסות הקולאז׳</span>
                </label>
                <label className="wizard-check-row">
                  <input type="checkbox" checked={smartCropEnabled} onChange={(event) => setSmartCropEnabled(event.target.checked)} />
                  <span>הפעל Smart Crop אוטומטי</span>
                </label>
              </>
            ) : (
              <div className="wizard-field">
                <label>סוג פריסות</label>
                <div className="wizard-complexity-row">
                  <button type="button" className={`btn btn-ghost${complexityMode === "simple" ? " active" : ""}`} onClick={() => setComplexityMode("simple")}>
                    פשוט
                  </button>
                  <button type="button" className={`btn btn-ghost${complexityMode === "creative" ? " active" : ""}`} onClick={() => setComplexityMode("creative")}>
                    יצירתי
                  </button>
                </div>
              </div>
            )}
            <div className="wizard-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(isProductCollage ? 1 : 2)}><ArrowLeft size={16} /> חזור</button>
              {batchMode ? (
                <button type="button" className="btn btn-primary" onClick={handleBatchCreate}>צור קולאז׳ים <Check size={16} /></button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={goToStep4}>ייצר הצעות <ArrowRight size={16} /></button>
              )}
            </div>
          </div>
        )}

        {step === 4 && !batchMode && (
          <div className="wizard-body wizard-body-wide">
            <h2>בחר פריסה</h2>
            {shapeTemplates.length > 0 ? (
              <>
                <div className="wizard-section-title">תבניות צורה מותאמות אישית</div>
                <div className="collage-shape-template-grid wizard-shape-template-grid">
                  {shapeTemplates.map((template) => (
                    <div key={template.id} className={`collage-shape-template-card${selectedShapeTemplateId === template.id ? " active" : ""}`}>
                      <button type="button" className="collage-shape-template-thumb" onClick={() => void selectShapeTemplate(template)} title="בחר תבנית קולאז׳">
                        {template.thumbnailDataUrl ? <img src={template.thumbnailDataUrl} alt={template.name} /> : <Boxes size={22} />}
                      </button>
                      <div className="collage-shape-template-row"><span>{template.name}</span></div>
                    </div>
                  ))}
                </div>
                <div className="wizard-section-title">פריסות רגילות</div>
              </>
            ) : null}
            <div className="collage-layouts-grid">
              {suggestions.map((suggestion, i) => (
                <CollageMiniPreview
                  key={suggestion.family}
                  suggestion={suggestion}
                  isSelected={selectedFamily === suggestion.family && selectedShapeTemplateId === null}
                  isTop={i === 0}
                  onClick={() => {
                    setSelectedFamily(suggestion.family);
                    setSelectedShapeTemplateId(null);
                    setSelectedShapeSnapshot(undefined);
                    setSelectedShapeMaskAsset(undefined);
                    setSelectedShapeSlots(undefined);
                  }}
                />
              ))}
            </div>
            <div className="wizard-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(3)}><ArrowLeft size={16} /> חזור</button>
              <button type="button" className="btn btn-ghost" onClick={goToStep4}>ייצר מחדש</button>
              <button type="button" className="btn btn-primary" disabled={!selectedFamily} onClick={handleCreate}>
                צור קולאז׳ <Check size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
