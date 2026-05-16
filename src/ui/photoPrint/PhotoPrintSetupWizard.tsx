import { useRef, useState, type ChangeEvent, type DragEvent, type ReactElement } from "react";
import { ArrowLeft, ArrowRight, Check, Printer, UploadCloud, X } from "lucide-react";
import { mmToPx } from "@/core/units/conversion";
import { computeBestGridForCount, computePhotoPrintLayout } from "@/core/photoPrint/photoPrintModeEngine";
import type {
  PhotoPagePreset,
  PhotoPrintCreateOptions,
  PhotoPrintLayoutResult,
  PhotoPrintWizardImageEntry,
  PhotoPrintWizardResult,
  PrintSizePreset
} from "@/types/photoPrint";
import { PHOTO_PAGE_PRESETS, PRINT_SIZE_PRESETS } from "@/types/photoPrint";
import "./photoPrint.css";

interface PhotoPrintSetupWizardProps {
  onComplete: (result: PhotoPrintWizardResult) => void;
  onCancel: () => void;
}

const LOW_RES_DPI_THRESHOLD = 150;
const SPLIT_OPTIONS = [1, 2, 4, 6, 8, 9] as const;

export function PhotoPrintSetupWizard({ onComplete, onCancel }: PhotoPrintSetupWizardProps): ReactElement {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1 — images + customer
  const [images, setImages] = useState<PhotoPrintWizardImageEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  // Step 2 — page/paper size
  const [pagePresetId, setPagePresetId] = useState("4x6_inch");
  const [pageOrientation, setPageOrientation] = useState<"portrait" | "landscape">("portrait");
  const [customPageW, setCustomPageW] = useState("210");
  const [customPageH, setCustomPageH] = useState("297");

  // Step 3 — layout mode: fixed print size OR page split
  const [layoutMode, setLayoutMode] = useState<"fixed" | "split">("fixed");
  const [printPresetId, setPrintPresetId] = useState("10x15");
  const [customPrintW, setCustomPrintW] = useState("100");
  const [customPrintH, setCustomPrintH] = useState("150");
  const [targetsPerPage, setTargetsPerPage] = useState(2);
  const [globalCopies, setGlobalCopies] = useState(1);
  const [fitMode, setFitMode] = useState<"fill" | "fit">("fill");
  const [orientationPolicy, setOrientationPolicy] = useState<"auto" | "portrait" | "landscape">("auto");
  const [faceDetectionEnabled, setFaceDetectionEnabled] = useState(false);

  // Step 4 — frame + cut line + margins
  const [frameBorderEnabled, setFrameBorderEnabled] = useState(true);
  const [frameBorderMm, setFrameBorderMm] = useState(5);
  const [cutLineEnabled, setCutLineEnabled] = useState(true);
  const [autoRotateOnSheet, setAutoRotateOnSheet] = useState(true);
  const [sheetMarginsMm, setSheetMarginsMm] = useState(0);
  const [gapMm, setGapMm] = useState(0);

  // ─── Image upload ──────────────────────────────────────────────────────────

  function addFiles(files: FileList | File[]): void {
    const todo = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (todo.length === 0) return;
    let pending = todo.length;
    const toAdd: PhotoPrintWizardImageEntry[] = [];
    for (const file of todo) {
      const url = URL.createObjectURL(file);
      const img = new window.Image();
      img.onload = () => {
        toAdd.push({ file, url, width: img.naturalWidth, height: img.naturalHeight, copies: globalCopies });
        pending -= 1;
        if (pending === 0) setImages((prev) => [...prev, ...toAdd]);
      };
      img.src = url;
    }
  }

  function onDrop(e: DragEvent): void {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  function removeImage(index: number): void {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  function setCopiesForImage(index: number, copies: number): void {
    setImages((prev) => prev.map((img, i) => i === index ? { ...img, copies } : img));
  }

  function applyCopiesToAll(copies: number): void {
    setImages((prev) => prev.map((img) => ({ ...img, copies })));
  }

  // ─── Computed values ───────────────────────────────────────────────────────

  function getPagePreset(): PhotoPagePreset {
    return PHOTO_PAGE_PRESETS.find((p) => p.id === pagePresetId) ?? PHOTO_PAGE_PRESETS[0];
  }

  function getPageDimsMm(): { widthMm: number; heightMm: number } {
    if (pagePresetId === "custom") {
      const w = parseFloat(customPageW) || 210;
      const h = parseFloat(customPageH) || 297;
      return pageOrientation === "portrait"
        ? { widthMm: Math.min(w, h), heightMm: Math.max(w, h) }
        : { widthMm: Math.max(w, h), heightMm: Math.min(w, h) };
    }
    const preset = getPagePreset();
    return pageOrientation === "portrait"
      ? { widthMm: Math.min(preset.widthMm, preset.heightMm), heightMm: Math.max(preset.widthMm, preset.heightMm) }
      : { widthMm: Math.max(preset.widthMm, preset.heightMm), heightMm: Math.min(preset.widthMm, preset.heightMm) };
  }

  function getPrintDimsMm(): { widthMm: number; heightMm: number } {
    if (printPresetId === "custom") {
      return { widthMm: parseFloat(customPrintW) || 100, heightMm: parseFloat(customPrintH) || 150 };
    }
    const preset = PRINT_SIZE_PRESETS.find((p) => p.id === printPresetId) ?? PRINT_SIZE_PRESETS[0];
    return { widthMm: preset.widthMm, heightMm: preset.heightMm };
  }

  function getLayout(forCount?: number): PhotoPrintLayoutResult {
    const dpi = getPagePreset().dpi;
    const { widthMm: pageW, heightMm: pageH } = getPageDimsMm();
    const { widthMm: printW, heightMm: printH } = getPrintDimsMm();
    const pageWpx = mmToPx(pageW, dpi);
    const pageHpx = mmToPx(pageH, dpi);
    const count = forCount ?? (layoutMode === "split" ? targetsPerPage : 0);
    return computePhotoPrintLayout(pageWpx, pageHpx, printW, printH, dpi, sheetMarginsMm, gapMm, autoRotateOnSheet, globalCopies, Math.max(1, images.length), count);
  }

  function getSplitSlotSizeMm(count: number): { widthMm: number; heightMm: number } {
    const dpi = getPagePreset().dpi;
    const { widthMm: pageW, heightMm: pageH } = getPageDimsMm();
    const pageWpx = mmToPx(pageW, dpi);
    const pageHpx = mmToPx(pageH, dpi);
    const marginPx = mmToPx(sheetMarginsMm, dpi);
    const gapPx = mmToPx(gapMm, dpi);
    const usableW = pageWpx - 2 * marginPx;
    const usableH = pageHpx - 2 * marginPx;
    const { rows, cols } = computeBestGridForCount(usableW, usableH, gapPx, count);
    const slotW = (usableW - (cols - 1) * gapPx) / cols;
    const slotH = (usableH - (rows - 1) * gapPx) / rows;
    const mmPerPx = 25.4 / dpi;
    return { widthMm: slotW * mmPerPx, heightMm: slotH * mmPerPx };
  }

  function getSplitGrid(count: number): { rows: number; cols: number } {
    const dpi = getPagePreset().dpi;
    const { widthMm: pageW, heightMm: pageH } = getPageDimsMm();
    const pageWpx = mmToPx(pageW, dpi);
    const pageHpx = mmToPx(pageH, dpi);
    const marginPx = mmToPx(sheetMarginsMm, dpi);
    const gapPx = mmToPx(gapMm, dpi);
    return computeBestGridForCount(pageWpx - 2 * marginPx, pageHpx - 2 * marginPx, gapPx, count);
  }

  function isPrintSizeTooLarge(): boolean {
    if (layoutMode === "split") return false;
    return !getLayout().fits;
  }

  function isLowRes(img: PhotoPrintWizardImageEntry): boolean {
    if (layoutMode === "split") return false;
    const { widthMm: printW, heightMm: printH } = getPrintDimsMm();
    const dpi = getPagePreset().dpi;
    const neededW = (printW / 25.4) * LOW_RES_DPI_THRESHOLD;
    const neededH = (printH / 25.4) * LOW_RES_DPI_THRESHOLD;
    return img.width < neededW || img.height < neededH;
  }

  // ─── Navigation ────────────────────────────────────────────────────────────

  function canAdvance(): boolean {
    if (step === 1) return images.length > 0;
    if (step === 3) return !isPrintSizeTooLarge();
    return true;
  }

  function advance(): void {
    if (!canAdvance()) return;
    if (step < 4) {
      setStep((s) => (s + 1) as 1 | 2 | 3 | 4);
    } else {
      handleComplete();
    }
  }

  function back(): void {
    if (step > 1) setStep((s) => (s - 1) as 1 | 2 | 3 | 4);
  }

  function handleComplete(): void {
    const { widthMm: pageW, heightMm: pageH } = getPageDimsMm();
    const { widthMm: printW, heightMm: printH } = getPrintDimsMm();
    const pageDpi = getPagePreset().dpi;
    const printOptions: PhotoPrintCreateOptions = {
      printWidthMm: printW,
      printHeightMm: printH,
      globalCopies,
      fitMode,
      frameBorderEnabled,
      frameBorderMm,
      frameBorderColor: "#ffffff",
      cutLineEnabled,
      autoRotateOnSheet: layoutMode === "split" ? true : autoRotateOnSheet,
      sheetMarginsMm,
      gapBetweenPrintsMm: gapMm,
      targetsPerPage: layoutMode === "split" ? targetsPerPage : 0,
      orientationPolicy,
      faceDetectionEnabled,
      smartFillEnabled: false
    };
    onComplete({
      images: images.map((img) => ({ ...img })),
      pageWidthMm: pageW,
      pageHeightMm: pageH,
      pageDpi,
      pageOrientation,
      pagePresetId,
      printOptions,
      customerInfo: {
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined
      }
    });
  }

  // ─── Step renders ──────────────────────────────────────────────────────────

  function renderStep1(): ReactElement {
    return (
      <div className="wizard-body">
        <h2>תמונות ופרטי לקוח</h2>
        <div
          className={`pp-drop-zone${dragging ? " pp-drop-zone--active" : ""}`}
          onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadCloud size={28} />
          <span>גרור תמונות לכאן, או לחץ לבחירה</span>
          <input ref={fileInputRef} type="file" multiple accept="image/*" hidden onChange={(e: ChangeEvent<HTMLInputElement>) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        </div>

        {images.length > 0 && (
          <>
            {images.length > 1 && (
              <div className="wizard-row" style={{ gap: 10 }}>
                <span className="wizard-count">{images.length} תמונות</span>
                <label style={{ fontSize: 13, color: "var(--text-secondary)" }}>ברירת מחדל עותקים:</label>
                <input type="number" min={1} max={99} value={globalCopies} style={{ width: 52 }}
                  onChange={(e) => { const v = Math.max(1, parseInt(e.target.value) || 1); setGlobalCopies(v); applyCopiesToAll(v); }} />
              </div>
            )}
            <div className="pp-thumb-list">
              {images.map((img, i) => (
                <div key={img.url} className="pp-thumb-item">
                  <div className="pp-thumb-img-wrap">
                    <img src={img.url} alt={img.file.name} />
                    {isLowRes(img) && <span className="pp-res-warn" title="רזולוציה נמוכה לגודל שנבחר">⚠</span>}
                  </div>
                  <div className="pp-thumb-info">
                    <span className="pp-thumb-name">{img.file.name}</span>
                    <div className="pp-thumb-copies">
                      <label>עותקים</label>
                      <input type="number" min={1} max={99} value={img.copies}
                        onChange={(e) => setCopiesForImage(i, Math.max(1, parseInt(e.target.value) || 1))} />
                    </div>
                  </div>
                  <button className="pp-thumb-remove" onClick={() => removeImage(i)} type="button" title="הסר">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="wizard-divider" />
        <div className="wizard-customer-section">
          <div className="wizard-customer-row">
            <label>שם לקוח</label>
            <input className="wizard-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="שם מלא..." />
          </div>
          <div className="wizard-customer-row">
            <label>טלפון</label>
            <input className="wizard-input" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="050-0000000" dir="ltr" />
          </div>
        </div>
      </div>
    );
  }

  function renderStep2(): ReactElement {
    const isCustom = pagePresetId === "custom";
    return (
      <div className="wizard-body">
        <h2>גודל נייר / דף הדפסה</h2>
        <div className="wizard-presets-grid">
          {PHOTO_PAGE_PRESETS.map((preset) => (
            <button key={preset.id}
              className={`wizard-preset-btn${pagePresetId === preset.id ? " active" : ""}`}
              type="button" onClick={() => setPagePresetId(preset.id)}>
              {preset.name}
            </button>
          ))}
        </div>
        {isCustom && (
          <div className="wizard-custom-size">
            <div className="wizard-custom-row">
              <label>רוחב (מ"מ)</label>
              <input className="wizard-input wizard-size-input" type="number" value={customPageW} onChange={(e) => setCustomPageW(e.target.value)} />
              <label>גובה (מ"מ)</label>
              <input className="wizard-input wizard-size-input" type="number" value={customPageH} onChange={(e) => setCustomPageH(e.target.value)} />
            </div>
          </div>
        )}
        <div className="wizard-field">
          <label>כיוון דף</label>
          <div className="wizard-orientation-row">
            <button className={`wizard-orientation-btn${pageOrientation === "portrait" ? " active" : ""}`} type="button" onClick={() => setPageOrientation("portrait")}>אנכי</button>
            <button className={`wizard-orientation-btn${pageOrientation === "landscape" ? " active" : ""}`} type="button" onClick={() => setPageOrientation("landscape")}>אופקי</button>
          </div>
        </div>
        <PageShapePreview widthMm={getPageDimsMm().widthMm} heightMm={getPageDimsMm().heightMm} />
      </div>
    );
  }

  function renderStep3(): ReactElement {
    const tooLarge = isPrintSizeTooLarge();
    const layout = getLayout();
    const { widthMm: printW, heightMm: printH } = getPrintDimsMm();
    const { widthMm: pageW, heightMm: pageH } = getPageDimsMm();

    const photoPresets = PRINT_SIZE_PRESETS.filter((p) => p.category === "photo" || p.category === "custom");
    const paperPresets = PRINT_SIZE_PRESETS.filter((p) => p.category === "paper");
    const passportPresets = PRINT_SIZE_PRESETS.filter((p) => p.category === "passport");

    return (
      <div className="wizard-body">
        <h2>גודל הדפסה וסידור</h2>

        {/* Layout mode toggle */}
        <div className="pp-mode-toggle">
          <button
            className={`pp-mode-btn${layoutMode === "fixed" ? " active" : ""}`}
            type="button"
            onClick={() => setLayoutMode("fixed")}
          >
            גודל קבוע (מ"מ)
          </button>
          <button
            className={`pp-mode-btn${layoutMode === "split" ? " active" : ""}`}
            type="button"
            onClick={() => setLayoutMode("split")}
          >
            פיצול חכם (כמה בדף)
          </button>
        </div>

        {layoutMode === "split" ? (
          <>
            <div className="wizard-field">
              <label>כמה הדפסות בדף?</label>
              <div className="pp-split-grid">
                {SPLIT_OPTIONS.map((count) => {
                  const { rows, cols } = getSplitGrid(count);
                  const { widthMm: sw, heightMm: sh } = getSplitSlotSizeMm(count);
                  return (
                    <button
                      key={count}
                      className={`pp-split-btn${targetsPerPage === count ? " active" : ""}`}
                      type="button"
                      onClick={() => setTargetsPerPage(count)}
                    >
                      <SplitGridMiniPreview rows={rows} cols={cols} />
                      <span className="pp-split-label">{count} בדף</span>
                      <span className="pp-split-sub">{Math.round(sw)}×{Math.round(sh)} מ"מ</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="pp-layout-summary">
              <span>כל חריץ: ~{Math.round(getSplitSlotSizeMm(targetsPerPage).widthMm)}×{Math.round(getSplitSlotSizeMm(targetsPerPage).heightMm)} מ"מ</span>
              <span>({getLayout(targetsPerPage).totalPages} דפים)</span>
            </div>
          </>
        ) : (
          <>
            <div className="wizard-field">
              <label>גדלים צילומיים</label>
              <div className="wizard-presets-grid">
                {photoPresets.map((p) => (
                  <button key={p.id} className={`wizard-preset-btn${printPresetId === p.id ? " active" : ""}`} type="button" onClick={() => setPrintPresetId(p.id)}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="wizard-field">
              <label>נייר / A</label>
              <div className="wizard-presets-grid">
                {paperPresets.map((p) => (
                  <button key={p.id} className={`wizard-preset-btn${printPresetId === p.id ? " active" : ""}`} type="button" onClick={() => setPrintPresetId(p.id)}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="wizard-field">
              <label>דרכון / ת"ז</label>
              <div className="wizard-presets-grid">
                {passportPresets.map((p) => (
                  <button key={p.id} className={`wizard-preset-btn${printPresetId === p.id ? " active" : ""}`} type="button" onClick={() => setPrintPresetId(p.id)}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            {printPresetId === "custom" && (
              <div className="wizard-custom-size">
                <div className="wizard-custom-row">
                  <label>רוחב (מ"מ)</label>
                  <input className="wizard-input wizard-size-input" type="number" value={customPrintW} onChange={(e) => setCustomPrintW(e.target.value)} />
                  <label>גובה (מ"מ)</label>
                  <input className="wizard-input wizard-size-input" type="number" value={customPrintH} onChange={(e) => setCustomPrintH(e.target.value)} />
                </div>
              </div>
            )}
            {tooLarge && (
              <div className="pp-warning">
                גודל ההדפסה ({Math.round(printW)}×{Math.round(printH)} מ"מ) גדול מגודל הדף ({Math.round(pageW)}×{Math.round(pageH)} מ"מ)
              </div>
            )}
            {!tooLarge && (
              <div className="pp-layout-summary">
                <span>{layout.slotsPerRow}×{layout.slotsPerColumn} הדפסות בדף</span>
                <span>({layout.slotsPerPage} בדף, {layout.totalPages} דפים)</span>
                {layout.rotatedOnSheet && <span className="pp-rotated-badge">מסובב לחיסכון</span>}
              </div>
            )}
            {!tooLarge && (
              <PrintLayoutPreview
                pageWidthMm={pageW}
                pageHeightMm={pageH}
                printWidthMm={printW}
                printHeightMm={printH}
                layout={layout}
                sheetMarginsMm={sheetMarginsMm}
              />
            )}
          </>
        )}

        <div className="wizard-divider" />
        <div className="wizard-row" style={{ gap: 20, flexWrap: "wrap" }}>
          <label className="wizard-field" style={{ flex: "1 1 120px" }}>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>עותקים לכל תמונה</span>
            <input type="number" min={1} max={99} value={globalCopies}
              onChange={(e) => setGlobalCopies(Math.max(1, parseInt(e.target.value) || 1))}
              style={{ width: 64 }} />
          </label>
          <div className="wizard-field" style={{ flex: "1 1 160px" }}>
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>מצב מילוי</span>
            <div className="wizard-row">
              <button className={`wizard-orientation-btn${fitMode === "fill" ? " active" : ""}`} type="button" onClick={() => setFitMode("fill")}>מלא (חיתוך)</button>
              <button className={`wizard-orientation-btn${fitMode === "fit" ? " active" : ""}`} type="button" onClick={() => setFitMode("fit")}>התאמה</button>
            </div>
          </div>
        </div>
        <div className="wizard-field">
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>אוריינטציית תמונה</span>
          <div className="wizard-row">
            <button className={`wizard-orientation-btn${orientationPolicy === "auto" ? " active" : ""}`} type="button" onClick={() => setOrientationPolicy("auto")}>אוטומטי</button>
            <button className={`wizard-orientation-btn${orientationPolicy === "portrait" ? " active" : ""}`} type="button" onClick={() => setOrientationPolicy("portrait")}>לגובה</button>
            <button className={`wizard-orientation-btn${orientationPolicy === "landscape" ? " active" : ""}`} type="button" onClick={() => setOrientationPolicy("landscape")}>לרוחב</button>
          </div>
        </div>
      </div>
    );
  }

  function renderStep4(): ReactElement {
    const layout = layoutMode === "split" ? getLayout(targetsPerPage) : getLayout();
    const totalPrints = images.reduce((sum, img) => sum + img.copies, 0);

    return (
      <div className="wizard-body">
        <h2>מסגרת, שוליים וסיכום</h2>
        <div className="wizard-field">
          <label>
            <input type="checkbox" checked={frameBorderEnabled} onChange={(e) => setFrameBorderEnabled(e.target.checked)} />
            {" "}גבול לבן (מסגרת)
          </label>
          {frameBorderEnabled && (
            <div className="wizard-row">
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>עובי</span>
              <input type="range" min={0} max={20} step={0.5} value={frameBorderMm}
                onChange={(e) => setFrameBorderMm(parseFloat(e.target.value))} style={{ flex: 1 }} />
              <span style={{ fontSize: 13, minWidth: 40 }}>{frameBorderMm} מ"מ</span>
            </div>
          )}
        </div>
        <div className="wizard-field">
          <label>
            <input type="checkbox" checked={cutLineEnabled} onChange={(e) => setCutLineEnabled(e.target.checked)} />
            {" "}קו חיתוך שחור
          </label>
        </div>
        {layoutMode === "fixed" && (
          <div className="wizard-field">
            <label>
              <input type="checkbox" checked={autoRotateOnSheet} onChange={(e) => setAutoRotateOnSheet(e.target.checked)} />
              {" "}סובב אוטומטית לחיסכון בנייר
            </label>
          </div>
        )}
        <div className="wizard-field">
          <label>
            <input type="checkbox" checked={faceDetectionEnabled} onChange={(e) => setFaceDetectionEnabled(e.target.checked)} />
            {" "}זיהוי פנים לשיפור מיקום (מומלץ לתמונות אנשים)
          </label>
        </div>
        <div className="wizard-divider" />
        <div className="wizard-field">
          <label>שוליים סביב הגיליון (מ"מ)</label>
          <div className="wizard-row">
            <input type="range" min={0} max={20} step={1} value={sheetMarginsMm}
              onChange={(e) => setSheetMarginsMm(parseInt(e.target.value))} style={{ flex: 1 }} />
            <span style={{ fontSize: 13, minWidth: 40 }}>{sheetMarginsMm} מ"מ</span>
          </div>
        </div>
        <div className="wizard-field">
          <label>מרווח בין הדפסות (מ"מ)</label>
          <div className="wizard-row">
            <input type="range" min={0} max={10} step={0.5} value={gapMm}
              onChange={(e) => setGapMm(parseFloat(e.target.value))} style={{ flex: 1 }} />
            <span style={{ fontSize: 13, minWidth: 40 }}>{gapMm} מ"מ</span>
          </div>
        </div>
        <div className="wizard-divider" />
        <div className="pp-summary">
          <div className="pp-summary-row"><span>תמונות</span><strong>{images.length}</strong></div>
          <div className="pp-summary-row"><span>סה"כ הדפסות</span><strong>{totalPrints}</strong></div>
          <div className="pp-summary-row"><span>בדף</span><strong>{layout.slotsPerPage}</strong></div>
          <div className="pp-summary-row"><span>דפים</span><strong>{layout.totalPages}</strong></div>
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const stepLabels = ["תמונות", "גודל דף", "סידור", "מסגרת"];
  const isLastStep = step === 4;

  return (
    <div className="collage-wizard-overlay">
      <div className="collage-wizard" style={{ width: "min(95vw, 740px)" }}>
        <button className="collage-wizard-close" onClick={onCancel} type="button"><X size={18} /></button>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <Printer size={20} style={{ color: "var(--accent)" }} />
          <span style={{ fontWeight: 700, fontSize: 16 }}>פיתוח תמונות — אשף הגדרה</span>
        </div>
        <div className="wizard-steps">
          {stepLabels.map((label, i) => {
            const stepNum = (i + 1) as 1 | 2 | 3 | 4;
            const isDone = step > stepNum;
            const isActive = step === stepNum;
            return (
              <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div className={`wizard-step-dot${isActive ? " active" : ""}${isDone ? " done" : ""}`}>
                  {isDone ? <Check size={12} /> : stepNum}
                </div>
                <span style={{ fontSize: 11, color: isActive ? "var(--accent)" : "var(--text-secondary)" }}>{label}</span>
              </div>
            );
          })}
        </div>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        <div className="wizard-footer" style={{ marginTop: 20 }}>
          {step > 1 && (
            <button className="btn btn-ghost" type="button" onClick={back}>
              <ArrowRight size={15} />חזרה
            </button>
          )}
          <button className="btn btn-accent" type="button" onClick={advance} disabled={!canAdvance()}>
            {isLastStep ? "צור דפי הדפסה" : "הבא"}
            {!isLastStep && <ArrowLeft size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function PageShapePreview({ widthMm, heightMm }: { widthMm: number; heightMm: number }): ReactElement {
  const maxW = 120, maxH = 80;
  const ratio = widthMm / heightMm;
  const w = ratio >= 1 ? maxW : maxH * ratio;
  const h = ratio >= 1 ? maxW / ratio : maxH;
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
      <div style={{ width: w, height: h, border: "2px solid var(--accent)", borderRadius: 2, background: "var(--bg-surface)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>{Math.round(widthMm)}×{Math.round(heightMm)}</span>
      </div>
    </div>
  );
}

function SplitGridMiniPreview({ rows, cols }: { rows: number; cols: number }): ReactElement {
  const W = 48, H = 36;
  const gap = 1;
  const slotW = (W - (cols - 1) * gap) / cols;
  const slotH = (H - (rows - 1) * gap) / rows;
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => (
          <rect key={`${r}-${c}`}
            x={c * (slotW + gap)}
            y={r * (slotH + gap)}
            width={slotW}
            height={slotH}
            fill="currentColor"
            opacity={0.2}
            rx={1}
          />
        ))
      )}
    </svg>
  );
}

function PrintLayoutPreview({ pageWidthMm, pageHeightMm, printWidthMm, printHeightMm, layout, sheetMarginsMm }: {
  pageWidthMm: number; pageHeightMm: number; printWidthMm: number; printHeightMm: number;
  layout: PhotoPrintLayoutResult; sheetMarginsMm: number;
}): ReactElement {
  const PW = 200, PH = 140;
  const scale = Math.min(PW / pageWidthMm, PH / pageHeightMm);
  const pw = pageWidthMm * scale, ph = pageHeightMm * scale;
  const slotW = (layout.rotatedOnSheet ? printHeightMm : printWidthMm) * scale;
  const slotH = (layout.rotatedOnSheet ? printWidthMm : printHeightMm) * scale;
  const margin = sheetMarginsMm * scale;
  const slots: { x: number; y: number }[] = [];
  for (let row = 0; row < layout.slotsPerColumn; row += 1) {
    for (let col = 0; col < layout.slotsPerRow; col += 1) {
      slots.push({ x: margin + col * slotW, y: margin + row * slotH });
    }
  }
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
      <svg width={pw} height={ph} style={{ border: "1px solid var(--border)", borderRadius: 2, background: "var(--bg-surface)" }}>
        {slots.map((slot, i) => (
          <rect key={i} x={slot.x + 0.5} y={slot.y + 0.5} width={slotW - 1} height={slotH - 1}
            fill="var(--accent-glow, rgba(99,102,241,0.15))" stroke="var(--accent)" strokeWidth={0.5} />
        ))}
      </svg>
    </div>
  );
}
