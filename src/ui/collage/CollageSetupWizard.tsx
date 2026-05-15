import { useRef, useState, type ChangeEvent, type DragEvent, type ReactElement } from "react";
import { ArrowLeft, ArrowRight, Check, UploadCloud, X } from "lucide-react";
import { PAGE_PRESETS, pageSetupFromPreset } from "@/core/pageSetup/presets";
import { unitToPx } from "@/core/units/conversion";
import { generateCollageSuggestions } from "@/core/collage/collageModeEngine";
import { CollageMiniPreview } from "./CollageMiniPreview";
import type { CollageComplexityMode, CollageLayoutFamily, CollageSlot, ScoredLayoutSuggestion } from "@/types/collage";
import type { PageSetup, Unit } from "@/types/primitives";
import type { ProjectCustomerInfo } from "@/types/project";

export interface ImageEntry {
  file: File;
  url: string;
  width: number;
  height: number;
}

export interface CollageWizardResult {
  images: ImageEntry[];
  pageSetup: PageSetup;
  spacingMm: number;
  marginMm: number;
  complexityMode: CollageComplexityMode;
  selectedFamily: CollageLayoutFamily;
  cachedSlots: CollageSlot[];
  suggestions: ScoredLayoutSuggestion[];
  customerInfo?: Partial<ProjectCustomerInfo>;
}

interface CollageSetupWizardProps {
  onComplete: (result: CollageWizardResult) => void;
  onCancel: () => void;
}

// Only photo/paper presets + custom
const COLLAGE_PRESETS = [
  ...PAGE_PRESETS.filter((p) => p.category === "photo" || (p.category === "paper" && ["a4", "a3", "a5"].includes(p.id))),
  { id: "custom", name: "מותאם אישית", category: "custom" as const, width: 200, height: 200, units: "mm" as Unit, dpi: 300, printIntent: "photo" as const }
];

export function CollageSetupWizard({ onComplete, onCancel }: CollageSetupWizardProps): ReactElement {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1 — images
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 1b — customer info
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");

  // Step 2 — page size
  const [presetId, setPresetId] = useState("a4");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [customW, setCustomW] = useState("20");
  const [customH, setCustomH] = useState("20");
  const [customUnit, setCustomUnit] = useState<Unit>("cm");
  const [customDpi, setCustomDpi] = useState(300);

  // Step 3 — settings
  const [spacingMm, setSpacingMm] = useState(3);
  const [marginMm, setMarginMm] = useState(4);
  const [complexityMode, setComplexityMode] = useState<CollageComplexityMode>("simple");

  // Step 4 — layout pick
  const [suggestions, setSuggestions] = useState<ScoredLayoutSuggestion[]>([]);
  const [selectedFamily, setSelectedFamily] = useState<CollageLayoutFamily | null>(null);

  // ─── Image upload ─────────────────────────────────────────────────────────

  function addFiles(files: FileList | File[]): void {
    const todo = Array.from(files).filter((f) => f.type.startsWith("image/"));
    let pending = todo.length;
    if (pending === 0) return;
    const toAdd: ImageEntry[] = [];
    for (const file of todo) {
      const url = URL.createObjectURL(file);
      const img = new window.Image();
      img.onload = () => {
        toAdd.push({ file, url, width: img.naturalWidth, height: img.naturalHeight });
        pending--;
        if (pending === 0) setImages((prev) => [...prev, ...toAdd].slice(0, 100));
      };
      img.src = url;
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault(); setDragging(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>): void {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = "";
  }

  function removeImage(i: number): void {
    setImages((prev) => { URL.revokeObjectURL(prev[i]?.url ?? ""); return prev.filter((_, j) => j !== i); });
  }

  // ─── Page setup ───────────────────────────────────────────────────────────

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

  // ─── Suggestion generation ────────────────────────────────────────────────

  function buildSuggestions(): ScoredLayoutSuggestion[] {
    const setup = currentPageSetup();
    const w = setup.size.width; const h = setup.size.height; const dpi = setup.dpi;
    const spacingPx = unitToPx(spacingMm, "mm", dpi);
    const marginPx = unitToPx(marginMm, "mm", dpi);
    const imageInputs = images.map((img) => ({ assetId: img.file.name, width: img.width, height: img.height }));
    return generateCollageSuggestions(imageInputs, w, h, spacingPx, marginPx, complexityMode);
  }

  function goToStep4(): void {
    const gen = buildSuggestions();
    setSuggestions(gen);
    setSelectedFamily(gen[0]?.family ?? null);
    setStep(4);
  }

  function handleCreate(): void {
    const family = selectedFamily ?? suggestions[0]?.family;
    const suggestion = suggestions.find((s) => s.family === family) ?? suggestions[0];
    if (!suggestion) return;
    const ci: Partial<ProjectCustomerInfo> = {
      customerName: customerName || undefined,
      customerPhone: customerPhone || undefined,
      phoneNumber: customerPhone || "",
      customerEmail: customerEmail || undefined
    };
    onComplete({
      images,
      pageSetup: currentPageSetup(),
      spacingMm,
      marginMm,
      complexityMode,
      selectedFamily: suggestion.family,
      cachedSlots: suggestion.slots,
      suggestions,
      customerInfo: ci
    });
  }

  // ─── Unit label ───────────────────────────────────────────────────────────
  const UNIT_LABELS: Record<Unit, string> = { mm: 'מ"מ', cm: 'ס"מ', inch: 'אינץ\'', px: 'פיקסל' };

  return (
    <div className="collage-wizard-overlay">
      <div className="collage-wizard">
        <button type="button" className="collage-wizard-close" onClick={onCancel}><X size={20} /></button>

        {/* Progress dots */}
        <div className="wizard-steps">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className={`wizard-step-dot${step >= s ? " active" : ""}${step > s ? " done" : ""}`}>
              {step > s ? <Check size={10} /> : s}
            </div>
          ))}
        </div>

        {/* ── Step 1: Images + Customer Info ── */}
        {step === 1 && (
          <div className="wizard-body">
            <h2>תמונות ופרטי לקוח</h2>

            {/* Customer info */}
            <div className="wizard-customer-section">
              <div className="wizard-customer-row">
                <label>שם לקוח</label>
                <input className="wizard-input" type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="שם מלא" />
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

            {/* Drop zone */}
            <div
              className={`drop-zone${dragging ? " dragover" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <UploadCloud size={36} />
              <p>גרור תמונות לכאן</p>
              <button type="button" className="btn btn-ghost" onClick={() => fileInputRef.current?.click()}>בחר תמונות</button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleFileInput} />
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

            <div className="wizard-footer">
              <button type="button" className="btn btn-ghost" onClick={onCancel}>ביטול</button>
              <button type="button" className="btn btn-primary" disabled={images.length === 0} onClick={() => setStep(2)}>
                המשך <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Page size ── */}
        {step === 2 && (
          <div className="wizard-body">
            <h2>גודל עמוד</h2>

            <div className="wizard-presets-grid">
              {COLLAGE_PRESETS.map((p) => (
                <button key={p.id} type="button"
                  className={`preset-card${presetId === p.id ? " selected" : ""}`}
                  onClick={() => setPresetId(p.id)}>
                  {p.name}
                </button>
              ))}
            </div>

            {/* Custom size fields */}
            {presetId === "custom" && (
              <div className="wizard-custom-size">
                <div className="wizard-custom-row">
                  <label>רוחב</label>
                  <input className="wizard-input wizard-size-input" type="number" min={1} value={customW}
                    onChange={(e) => setCustomW(e.target.value)} />
                  <label>גובה</label>
                  <input className="wizard-input wizard-size-input" type="number" min={1} value={customH}
                    onChange={(e) => setCustomH(e.target.value)} />
                  <select className="wizard-select" value={customUnit} onChange={(e) => setCustomUnit(e.target.value as Unit)}>
                    <option value="mm">מ"מ</option>
                    <option value="cm">ס"מ</option>
                    <option value="inch">אינץ'</option>
                    <option value="px">פיקסל</option>
                  </select>
                </div>
                <div className="wizard-custom-row">
                  <label>רזולוציה (DPI)</label>
                  <select className="wizard-select" value={customDpi} onChange={(e) => setCustomDpi(+e.target.value)}>
                    <option value={72}>72 (מסך)</option>
                    <option value={150}>150</option>
                    <option value={300}>300 (הדפסה)</option>
                    <option value={600}>600</option>
                  </select>
                </div>
              </div>
            )}

            {/* Orientation */}
            <div className="wizard-field">
              <label>כיוון הדפסה:</label>
              <div className="wizard-orientation-row">
                <button type="button"
                  className={`wizard-orientation-btn${orientation === "portrait" ? " active" : ""}`}
                  onClick={() => setOrientation("portrait")}>
                  <span className="orientation-icon portrait-icon" />
                  לאורך
                  {orientation === "portrait" && <Check size={14} className="orientation-check" />}
                </button>
                <button type="button"
                  className={`wizard-orientation-btn${orientation === "landscape" ? " active" : ""}`}
                  onClick={() => setOrientation("landscape")}>
                  <span className="orientation-icon landscape-icon" />
                  לרוחב
                  {orientation === "landscape" && <Check size={14} className="orientation-check" />}
                </button>
              </div>
            </div>

            <div className="wizard-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}><ArrowLeft size={16} /> חזור</button>
              <button type="button" className="btn btn-primary" onClick={() => setStep(3)}>המשך <ArrowRight size={16} /></button>
            </div>
          </div>
        )}

        {/* ── Step 3: Layout settings ── */}
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
            <div className="wizard-field">
              <label>סוג פריסות:</label>
              <div className="wizard-complexity-row">
                <button type="button" className={`btn btn-ghost${complexityMode === "simple" ? " active" : ""}`} onClick={() => setComplexityMode("simple")}>
                  פשוטה — רשת + גיבור
                </button>
                <button type="button" className={`btn btn-ghost${complexityMode === "creative" ? " active" : ""}`} onClick={() => setComplexityMode("creative")}>
                  יצירתית — לב, עיגול, אלכסון
                </button>
              </div>
            </div>
            <div className="wizard-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(2)}><ArrowLeft size={16} /> חזור</button>
              <button type="button" className="btn btn-primary" onClick={goToStep4}>ייצר הצעות <ArrowRight size={16} /></button>
            </div>
          </div>
        )}

        {/* ── Step 4: Pick layout ── */}
        {step === 4 && (
          <div className="wizard-body wizard-body-wide">
            <h2>בחר פריסה</h2>
            <div className="collage-layouts-grid">
              {suggestions.map((suggestion, i) => (
                <CollageMiniPreview
                  key={suggestion.family}
                  suggestion={suggestion}
                  isSelected={selectedFamily === suggestion.family}
                  isTop={i === 0}
                  onClick={() => setSelectedFamily(suggestion.family)}
                />
              ))}
            </div>
            <div className="wizard-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setStep(3)}><ArrowLeft size={16} /> חזור</button>
              <button type="button" className="btn btn-ghost" onClick={() => {
                const gen = buildSuggestions();
                setSuggestions(gen);
                setSelectedFamily(gen[0]?.family ?? null);
              }}>
                ייצר מחדש
              </button>
              <button type="button" className="btn btn-primary" disabled={!selectedFamily} onClick={handleCreate}>
                צור קולאז' <Check size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
