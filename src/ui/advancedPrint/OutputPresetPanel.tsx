import { Copy, RotateCcw } from "lucide-react";
import { useState, type ReactElement } from "react";

import type { OutputPreset } from "@/types/advancedPrint";

interface OutputPresetPanelProps {
  presets: OutputPreset[];
  selectedId?: string;
  strength: number;
  /** Original (un-color-managed) page thumbnail for the before/after compare. */
  beforeUrl?: string;
  /** Color-managed preview thumbnail (when available) for the after side. */
  afterUrl?: string;
  onSelect: (id: string) => void;
  onStrengthChange: (strength: number) => void;
  onDuplicate: (preset: OutputPreset) => void;
  onReset: (preset: OutputPreset) => void;
}

/** Output-preset picker with a before/after comparison slider and built-in preset actions. */
export function OutputPresetPanel({
  presets,
  selectedId,
  strength,
  beforeUrl,
  afterUrl,
  onSelect,
  onStrengthChange,
  onDuplicate,
  onReset
}: OutputPresetPanelProps): ReactElement {
  const [split, setSplit] = useState(50);
  const selected = presets.find((p) => p.id === selectedId);

  return (
    <div className="ape-preset-panel">
      <div className="ape-row">
        <label className="ape-label">פריסט פלט (תיקונים מעל ה-ICC)</label>
        <select className="ape-select" value={selectedId ?? ""} onChange={(e) => onSelect(e.target.value)}>
          <option value="">ללא</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.builtIn ? " (מובנה)" : ""}</option>
          ))}
        </select>
        {selected && (
          <>
            <button className="ape-icon-btn" title="שכפל" onClick={() => onDuplicate(selected)}>
              <Copy size={14} />
            </button>
            {!selected.builtIn && (
              <button className="ape-icon-btn" title="אפס" onClick={() => onReset(selected)}>
                <RotateCcw size={14} />
              </button>
            )}
          </>
        )}
      </div>

      {selected && (
        <div className="ape-row">
          <label className="ape-label">עוצמה</label>
          <input
            className="ape-range"
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(strength * 100)}
            onChange={(e) => onStrengthChange(Number(e.target.value) / 100)}
            aria-label="עוצמת פריסט פלט"
          />
          <span className="ape-range-value">{Math.round(strength * 100)}%</span>
        </div>
      )}

      {/* Before / after compare slider (shown once a color-managed preview is available). */}
      {beforeUrl && afterUrl && (
        <div className="ape-compare">
          <div className="ape-compare-frame">
            <img src={beforeUrl} alt="before" className="ape-compare-img" />
            <div className="ape-compare-after" style={{ width: `${split}%` }}>
              <img src={afterUrl} alt="after" className="ape-compare-img" />
            </div>
            <div className="ape-compare-divider" style={{ insetInlineStart: `${split}%` }} />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={split}
            onChange={(e) => setSplit(Number(e.target.value))}
            className="ape-compare-range"
            aria-label="השוואת לפני/אחרי"
          />
          <div className="ape-compare-labels">
            <span>לפני</span>
            <span>אחרי</span>
          </div>
        </div>
      )}
    </div>
  );
}
