import { ArrowLeft, ArrowRight, Check, Circle, Heart, Star, X } from "lucide-react";
import { useState, type ReactElement } from "react";
import { PAGE_PRESETS, pageSetupFromPreset } from "@/core/pageSetup/presets";
import { unitToPx } from "@/core/units/conversion";
import { useMaskLibraryStore, type MaskLibraryEntry } from "@/state/maskLibraryStore";
import type { MaskShape } from "@/types/mask";
import type { PageSetup, Unit } from "@/types/primitives";

export interface MaskWizardResult {
  name: string;
  setup: PageSetup;
  builtInShape?: MaskShape;
  libraryEntry?: MaskLibraryEntry;
  maskWidth: number;
  maskHeight: number;
  spacingX: number;
  spacingY: number;
}

interface MaskSetupWizardProps {
  onComplete: (result: MaskWizardResult) => void;
  onCancel: () => void;
}

type BuiltInOption = { shape: MaskShape; label: string };

const BUILT_IN_SHAPES: BuiltInOption[] = [
  { shape: "circle", label: "עיגול" },
  { shape: "heart", label: "לב" },
  { shape: "roundedRect", label: "מלבן מעוגל" },
  { shape: "star", label: "כוכב" }
];

const MASK_PRESETS = [
  ...PAGE_PRESETS.filter((p) => p.category === "photo" || (p.category === "paper" && ["a4", "a3", "a5"].includes(p.id)))
];

function marginsFromValue(v: number) {
  return { top: v, right: v, bottom: v, left: v };
}

function ShapeIcon({ shape, size = 40 }: { shape: MaskShape; size?: number }): ReactElement {
  const s = size;
  if (shape === "circle") {
    return (
      <svg width={s} height={s} viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="18" />
      </svg>
    );
  }
  if (shape === "heart") {
    return (
      <svg width={s} height={s} viewBox="0 0 40 40">
        <path d="M20 34 C20 34 4 24 4 14 C4 9 8 6 12 6 C15 6 18 8 20 11 C22 8 25 6 28 6 C32 6 36 9 36 14 C36 24 20 34 20 34Z" />
      </svg>
    );
  }
  if (shape === "star") {
    return (
      <svg width={s} height={s} viewBox="0 0 40 40">
        <polygon points="20,3 25,15 38,15 28,24 32,36 20,28 8,36 12,24 2,15 15,15" />
      </svg>
    );
  }
  // roundedRect
  return (
    <svg width={s} height={s} viewBox="0 0 40 40">
      <rect x="4" y="4" width="32" height="32" rx="8" ry="8" />
    </svg>
  );
}

export function MaskSetupWizard({ onComplete, onCancel }: MaskSetupWizardProps): ReactElement {
  const libraryEntries = useMaskLibraryStore((s) => s.entries);

  const [step, setStep] = useState<1 | 2>(1);

  // Step 1 — preset selection
  const [selectedBuiltIn, setSelectedBuiltIn] = useState<MaskShape | null>("circle");
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);

  // Step 2 — settings
  const [projectName, setProjectName] = useState("פרויקט מסיכה חדש");
  const [presetId, setPresetId] = useState("a4");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [maskWidth, setMaskWidth] = useState(0);
  const [maskHeight, setMaskHeight] = useState(0);
  const [spacingX, setSpacingX] = useState(16);
  const [spacingY, setSpacingY] = useState(16);

  const selectedLibrary = libraryEntries.find((e) => e.id === selectedLibraryId) ?? null;

  function selectBuiltIn(shape: MaskShape): void {
    setSelectedBuiltIn(shape);
    setSelectedLibraryId(null);
  }

  function selectLibrary(entry: MaskLibraryEntry): void {
    setSelectedLibraryId(entry.id);
    setSelectedBuiltIn(null);
  }

  function goToStep2(): void {
    // Pre-fill mask size from library entry or defaults
    if (selectedLibrary !== null) {
      setMaskWidth(selectedLibrary.defaultWidth);
      setMaskHeight(selectedLibrary.defaultHeight);
    } else {
      setMaskWidth(200);
      setMaskHeight(200);
    }
    setStep(2);
  }

  function handleComplete(): void {
    const preset = MASK_PRESETS.find((p) => p.id === presetId) ?? MASK_PRESETS[0];
    const setup = pageSetupFromPreset(preset, orientation);
    const bleedPx = unitToPx(preset.bleed ?? 0, preset.units, preset.dpi);
    const marginsPx = unitToPx(preset.margins ?? 0, preset.units, preset.dpi);

    const finalSetup: PageSetup = {
      ...setup,
      bleed: marginsFromValue(bleedPx),
      margins: marginsFromValue(marginsPx),
      safeArea: marginsFromValue(marginsPx)
    };

    onComplete({
      name: projectName.trim() || "פרויקט מסיכה",
      setup: finalSetup,
      builtInShape: selectedBuiltIn ?? undefined,
      libraryEntry: selectedLibrary ?? undefined,
      maskWidth: Math.max(10, maskWidth),
      maskHeight: Math.max(10, maskHeight),
      spacingX,
      spacingY
    });
  }

  const hasSelection = selectedBuiltIn !== null || selectedLibraryId !== null;

  return (
    <div className="mask-wizard-overlay">
      <div className="mask-wizard">
        <button className="mask-wizard-close" onClick={onCancel} type="button">
          <X size={18} />
        </button>

        {/* Step dots */}
        <div className="wizard-steps">
          {([1, 2] as const).map((s) => (
            <div
              key={s}
              className={`wizard-step-dot ${step === s ? "active" : step > s ? "done" : ""}`}
            >
              {step > s ? <Check size={12} /> : s}
            </div>
          ))}
        </div>

        {/* ── Step 1: Choose preset ── */}
        {step === 1 && (
          <div className="wizard-body">
            <h2>בחר מסיכה</h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
              בחר צורה מובנית או מסיכה מהספרייה האישית שלך.
            </p>

            {/* Built-in shapes */}
            <div>
              <div className="util-field-label" style={{ marginBottom: 8 }}>צורות מובנות</div>
              <div className="mask-preset-grid">
                {BUILT_IN_SHAPES.map(({ shape, label }) => (
                  <button
                    key={shape}
                    className={`mask-preset-card ${selectedBuiltIn === shape && selectedLibraryId === null ? "selected" : ""}`}
                    onClick={() => selectBuiltIn(shape)}
                    type="button"
                  >
                    <div className="mask-preset-shape-icon">
                      <ShapeIcon shape={shape} size={40} />
                    </div>
                    <div className="mask-preset-name">{label}</div>
                    <div className="mask-preset-badge">מובנה</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Library entries */}
            {libraryEntries.length > 0 && (
              <div>
                <div className="util-field-label" style={{ marginBottom: 8 }}>ספרייה אישית</div>
                <div className="mask-preset-grid">
                  {libraryEntries.map((entry) => (
                    <button
                      key={entry.id}
                      className={`mask-preset-card ${selectedLibraryId === entry.id ? "selected" : ""}`}
                      onClick={() => selectLibrary(entry)}
                      type="button"
                    >
                      <div className="mask-preset-thumb">
                        {entry.thumbnailDataUrl ? (
                          <img src={entry.thumbnailDataUrl} alt={entry.name} />
                        ) : (
                          <div style={{ width: 64, height: 64, background: "var(--bg-elevated)" }} />
                        )}
                      </div>
                      <div className="mask-preset-name">{entry.name}</div>
                      <div className="mask-preset-badge">{entry.type.toUpperCase()}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {libraryEntries.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "8px 0" }}>
                אין מסיכות בספרייה. הוסף דרך כלי עזר → ספריית מסיכות.
              </div>
            )}

            <div className="wizard-footer">
              <button className="btn btn-ghost" onClick={onCancel} type="button">
                <ArrowRight size={14} />
                ביטול
              </button>
              <button className="btn btn-accent" onClick={goToStep2} disabled={!hasSelection} type="button">
                המשך
                <ArrowLeft size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Settings ── */}
        {step === 2 && (
          <div className="wizard-body">
            <h2>הגדרות פרויקט</h2>

            {/* Project name */}
            <div className="wizard-field">
              <label>שם הפרויקט</label>
              <input
                className="util-input"
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </div>

            {/* Page size */}
            <div className="wizard-field">
              <label>גודל דף</label>
              <div className="wizard-presets-grid">
                {MASK_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    className={`preset-card ${presetId === p.id ? "selected" : ""}`}
                    onClick={() => setPresetId(p.id)}
                    type="button"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Orientation */}
            <div className="wizard-field">
              <label>כיוון</label>
              <div className="seg">
                {(["portrait", "landscape"] as const).map((o) => (
                  <button
                    key={o}
                    className={orientation === o ? "on" : ""}
                    onClick={() => setOrientation(o)}
                    type="button"
                  >
                    {o === "portrait" ? "אנכי" : "אופקי"}
                  </button>
                ))}
              </div>
            </div>

            {/* Mask size */}
            <div className="wizard-field">
              <label>גודל מסיכה (px) — פרופורציונלי</label>
              <div className="wizard-row">
                <input
                  className="util-input compact"
                  type="number"
                  min={10}
                  max={2000}
                  value={maskWidth}
                  onChange={(e) => {
                    const w = Number(e.target.value);
                    const ratio = maskHeight > 0 && maskWidth > 0 ? maskWidth / maskHeight : 1;
                    setMaskWidth(w);
                    setMaskHeight(Math.round(w / ratio));
                  }}
                  placeholder="רוחב"
                />
                <span>×</span>
                <input
                  className="util-input compact"
                  type="number"
                  min={10}
                  max={2000}
                  value={maskHeight}
                  readOnly
                  style={{ opacity: 0.6 }}
                  placeholder="גובה"
                />
              </div>
            </div>

            {/* Spacing */}
            <div className="wizard-field">
              <label>רווח בין מסיכות (px)</label>
              <div className="wizard-row">
                <span style={{ fontSize: 12, color: "var(--text-muted)", minWidth: 28 }}>X:</span>
                <input
                  type="range"
                  min={0}
                  max={200}
                  value={spacingX}
                  onChange={(e) => setSpacingX(Number(e.target.value))}
                  style={{ flex: 1, accentColor: "var(--accent)" }}
                />
                <span style={{ fontSize: 12, minWidth: 28 }}>{spacingX}</span>
              </div>
              <div className="wizard-row">
                <span style={{ fontSize: 12, color: "var(--text-muted)", minWidth: 28 }}>Y:</span>
                <input
                  type="range"
                  min={0}
                  max={200}
                  value={spacingY}
                  onChange={(e) => setSpacingY(Number(e.target.value))}
                  style={{ flex: 1, accentColor: "var(--accent)" }}
                />
                <span style={{ fontSize: 12, minWidth: 28 }}>{spacingY}</span>
              </div>
            </div>

            <div className="wizard-footer">
              <button className="btn btn-ghost" onClick={() => setStep(1)} type="button">
                <ArrowRight size={14} />
                חזור
              </button>
              <button className="btn btn-accent" onClick={handleComplete} type="button">
                <Check size={14} />
                צור פרויקט
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
