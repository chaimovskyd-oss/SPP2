import { useMemo, useState, type ReactElement } from "react";
import { PAGE_PRESETS, pageSetupFromPreset } from "@/core/pageSetup/presets";
import { unitToPx } from "@/core/units/conversion";
import type { GridCreateOptions } from "@/types/grid";
import type { PageSetup, Unit } from "@/types/primitives";

interface DocumentSetupScreenProps {
  modeName: string;
  onBack: () => void;
  onCreate: (setup: PageSetup, gridOptions?: Partial<GridCreateOptions>) => void;
}

export function DocumentSetupScreen({ modeName, onBack, onCreate }: DocumentSetupScreenProps): ReactElement {
  const isGridMode = modeName === "grid";
  const [setupStep, setSetupStep] = useState<1 | 2>(1);
  const [presetId, setPresetId] = useState("a4");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const basePreset = PAGE_PRESETS.find((preset) => preset.id === presetId) ?? PAGE_PRESETS[1];
  const [units, setUnits] = useState<Unit>(basePreset.units);
  const [dpi, setDpi] = useState(basePreset.dpi);
  const [bleed, setBleed] = useState(basePreset.bleed ?? 0);
  const [margins, setMargins] = useState(basePreset.margins ?? 0);
  const [safeArea, setSafeArea] = useState(basePreset.margins ?? 0);
  const [customSize, setCustomSize] = useState(false);
  const [customWidth, setCustomWidth] = useState(basePreset.width);
  const [customHeight, setCustomHeight] = useState(basePreset.height);
  const [gridRows, setGridRows] = useState(2);
  const [gridColumns, setGridColumns] = useState(3);
  const [gridSpacing, setGridSpacing] = useState(8);
  const [gridFillDirection, setGridFillDirection] = useState<"rtl" | "ltr">("rtl");

  const setup = useMemo(() => {
    const preset = PAGE_PRESETS.find((item) => item.id === presetId) ?? PAGE_PRESETS[1];
    const sourcePreset = customSize
      ? { ...preset, width: customWidth, height: customHeight, units, dpi }
      : { ...preset, dpi };
    const nextSetup = pageSetupFromPreset(sourcePreset, orientation);
    const bleedPx = unitToPx(bleed, units, dpi);
    const marginsPx = unitToPx(margins, units, dpi);
    const safeAreaPx = unitToPx(safeArea, units, dpi);
    return {
      ...nextSetup,
      units,
      dpi,
      bleed: marginsFromValue(bleedPx),
      margins: marginsFromValue(marginsPx),
      safeArea: marginsFromValue(safeAreaPx)
    };
  }, [bleed, customHeight, customSize, customWidth, dpi, margins, orientation, presetId, safeArea, units]);

  function handlePresetChange(nextPresetId: string): void {
    const preset = PAGE_PRESETS.find((item) => item.id === nextPresetId) ?? PAGE_PRESETS[1];
    setPresetId(nextPresetId);
    setUnits(preset.units);
    setDpi(preset.dpi);
    setBleed(preset.bleed ?? 0);
    setMargins(preset.margins ?? 0);
    setSafeArea(preset.margins ?? 0);
    setCustomSize(preset.id === "custom");
    setCustomWidth(preset.width);
    setCustomHeight(preset.height);
  }

  function createDocument(): void {
    onCreate(
      setup,
      isGridMode
        ? {
            rows: gridRows,
            columns: gridColumns,
            spacingX: unitToPx(gridSpacing, units, dpi),
            spacingY: unitToPx(gridSpacing, units, dpi),
            margins: setup.margins,
            fillDirection: gridFillDirection
          }
        : undefined
    );
  }

  return (
    <main className="setup-shell" data-testid="document-setup-screen">
      <section className="setup-panel">
        <header className="setup-header">
          <div>
            <span>{isGridMode ? "מצב גריד" : "עיצוב חופשי"}</span>
            <h1>{isGridMode && setupStep === 2 ? "הגדרת הגריד" : "הגדרת דף"}</h1>
          </div>
          <button className="btn btn-ghost" onClick={onBack} type="button">
            חזרה
          </button>
        </header>

        {isGridMode ? (
          <div className="setup-steps" aria-label="שלבי הגדרה">
            <span className={setupStep === 1 ? "active" : ""}>1. דף</span>
            <span className={setupStep === 2 ? "active" : ""}>2. גריד</span>
          </div>
        ) : null}

        {setupStep === 1 ? (
          <div className="setup-grid">
            <label className="field">
              <span className="field-label">מידת דף</span>
              <select className="text-input" onChange={(event) => handlePresetChange(event.target.value)} value={presetId}>
                {PAGE_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">יחידות</span>
              <select className="text-input" onChange={(event) => setUnits(event.target.value as Unit)} value={units}>
                <option value="mm">מ"מ</option>
                <option value="cm">ס"מ</option>
                <option value="inch">אינץ'</option>
                <option value="px">פיקסלים</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">DPI</span>
              <input className="text-input" min={72} max={1200} onChange={(event) => setDpi(Number(event.target.value) || 300)} type="number" value={dpi} />
            </label>
            <div className="field">
              <span className="field-label">כיוון</span>
              <div className="seg">
                <button className={orientation === "portrait" ? "on" : ""} onClick={() => setOrientation("portrait")} type="button">לאורך</button>
                <button className={orientation === "landscape" ? "on" : ""} onClick={() => setOrientation("landscape")} type="button">לרוחב</button>
                <button disabled type="button">כפולה</button>
              </div>
            </div>
            <label className="check-line">
              <input checked={customSize} onChange={(event) => setCustomSize(event.target.checked)} type="checkbox" />
              מידה מותאמת אישית
            </label>
            <SetupNumber disabled={!customSize} label={`רוחב (${units})`} onChange={setCustomWidth} value={customWidth} />
            <SetupNumber disabled={!customSize} label={`גובה (${units})`} onChange={setCustomHeight} value={customHeight} />
            <SetupNumber label={`בליד (${units})`} onChange={setBleed} value={bleed} />
            <SetupNumber label={`שוליים (${units})`} onChange={setMargins} value={margins} />
            <SetupNumber label={`אזור בטוח (${units})`} onChange={setSafeArea} value={safeArea} />
          </div>
        ) : (
          <section className="setup-subpanel">
            <div className="panel-section-title">הגדרת גריד</div>
            <div className="setup-grid">
              <SetupNumber label="שורות" min={1} onChange={setGridRows} step={1} value={gridRows} />
              <SetupNumber label="עמודות" min={1} onChange={setGridColumns} step={1} value={gridColumns} />
              <SetupNumber label={`ריווח (${units})`} onChange={setGridSpacing} value={gridSpacing} />
              <div className="field">
                <span className="field-label">כיוון מילוי</span>
                <div className="seg">
                  <button className={gridFillDirection === "rtl" ? "on" : ""} onClick={() => setGridFillDirection("rtl")} type="button">מימין לשמאל</button>
                  <button className={gridFillDirection === "ltr" ? "on" : ""} onClick={() => setGridFillDirection("ltr")} type="button">משמאל לימין</button>
                </div>
              </div>
            </div>
            <GridPreview columns={gridColumns} rows={gridRows} />
          </section>
        )}

        <div className="setup-summary">
          <span>{Math.round(setup.size.width)} x {Math.round(setup.size.height)} px</span>
          <span>{setup.dpi} DPI</span>
          <span>{setup.printIntent}</span>
        </div>

        <div className="setup-actions">
          {isGridMode && setupStep === 2 ? (
            <button className="btn btn-ghost" onClick={() => setSetupStep(1)} type="button">חזרה להגדרת דף</button>
          ) : null}
          {isGridMode && setupStep === 1 ? (
            <button className="btn btn-accent setup-create" onClick={() => setSetupStep(2)} type="button">המשך להגדרת גריד</button>
          ) : (
            <button className="btn btn-accent setup-create" data-testid="create-document" onClick={createDocument} type="button">צור מסמך</button>
          )}
        </div>
      </section>
    </main>
  );
}

function SetupNumber({ disabled = false, label, min = 0, onChange, step = 0.5, value }: { disabled?: boolean; label: string; min?: number; onChange: (value: number) => void; step?: number; value: number }): ReactElement {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input className="text-input" disabled={disabled} min={min} onChange={(event) => onChange(Math.max(min, Number(event.target.value) || min))} step={step} type="number" value={value} />
    </label>
  );
}

function GridPreview({ rows, columns }: { rows: number; columns: number }): ReactElement {
  return (
    <div className="grid-setup-preview" style={{ gridTemplateColumns: `repeat(${Math.max(1, columns)}, 1fr)` }}>
      {Array.from({ length: Math.max(1, rows * columns) }).map((_, index) => (
        <span key={index}>{index + 1}</span>
      ))}
    </div>
  );
}

function marginsFromValue(value: number): PageSetup["margins"] {
  return {
    top: value,
    right: value,
    bottom: value,
    left: value
  };
}
