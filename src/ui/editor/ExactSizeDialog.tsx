import { useState, type KeyboardEvent, type ReactElement } from "react";
import { Lock, Unlock, X } from "lucide-react";
import type { Unit } from "@/types/primitives";
import type { VisualLayer } from "@/types/layers";
import { pxToUnit, unitToPx } from "@/core/units/conversion";

const UNITS: { value: Unit; label: string }[] = [
  { value: "cm", label: "ס״מ" },
  { value: "mm", label: "מ״מ" },
  { value: "inch", label: "אינץ׳" }
];

const MIN_SIZE_PX = 1;
const MAX_SIZE_PX = 50_000;

function formatNumber(value: number): string {
  return value.toFixed(2);
}

interface ExactSizeDialogProps {
  layer: VisualLayer;
  dpi: number;
  defaultUnit: Unit;
  onApply: (widthPx: number, heightPx: number) => void;
  onClose: () => void;
}

export function ExactSizeDialog(props: ExactSizeDialogProps): ReactElement {
  const { layer, dpi, onApply, onClose } = props;
  const initialUnit = props.defaultUnit === "px" ? "cm" : props.defaultUnit;
  const [unit, setUnit] = useState<Unit>(initialUnit);
  const aspect = layer.width / Math.max(layer.height, 0.001);

  const [widthStr, setWidthStr] = useState(() => formatNumber(pxToUnit(layer.width, initialUnit, dpi)));
  const [heightStr, setHeightStr] = useState(() => formatNumber(pxToUnit(layer.height, initialUnit, dpi)));
  const [locked, setLocked] = useState(true);
  const [error, setError] = useState<"width" | "height" | null>(null);

  function parsePx(str: string): number | null {
    const v = Number(str.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) return null;
    const px = unitToPx(v, unit, dpi);
    if (px < MIN_SIZE_PX || px > MAX_SIZE_PX) return null;
    return px;
  }

  function changeUnit(nextUnit: Unit): void {
    const wPx = parsePx(widthStr);
    const hPx = parsePx(heightStr);
    setUnit(nextUnit);
    if (wPx !== null) setWidthStr(formatNumber(pxToUnit(wPx, nextUnit, dpi)));
    if (hPx !== null) setHeightStr(formatNumber(pxToUnit(hPx, nextUnit, dpi)));
    setError(null);
  }

  function handleWidthChange(v: string): void {
    setWidthStr(v);
    if (locked) {
      const wPx = parsePx(v);
      if (wPx !== null) setHeightStr(formatNumber(pxToUnit(wPx / aspect, unit, dpi)));
    }
  }

  function handleHeightChange(v: string): void {
    setHeightStr(v);
    if (locked) {
      const hPx = parsePx(v);
      if (hPx !== null) setWidthStr(formatNumber(pxToUnit(hPx * aspect, unit, dpi)));
    }
  }

  function handleApply(): void {
    const wPx = parsePx(widthStr);
    const hPx = parsePx(heightStr);
    if (wPx === null) {
      setError("width");
      return;
    }
    if (hPx === null) {
      setError("height");
      return;
    }
    onApply(wPx, hPx);
    onClose();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter") {
      e.preventDefault();
      handleApply();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div className="util-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="util-panel exact-size-panel" role="dialog" aria-label="גודל מדויק">
        <div className="util-panel-header">
          <span>גודל מדויק</span>
          <button className="icon-btn" onClick={onClose} type="button"><X size={15} /></button>
        </div>
        <div className="util-panel-body">
          <label className="util-field-label">יחידות מידה</label>
          <div className="seg" style={{ gridTemplateColumns: `repeat(${UNITS.length}, 1fr)` }}>
            {UNITS.map((u) => (
              <button
                key={u.value}
                type="button"
                className={unit === u.value ? "on" : ""}
                onClick={() => changeUnit(u.value)}
              >
                {u.label}
              </button>
            ))}
          </div>

          <div className="wizard-row">
            <input
              className={`util-input compact ${error === "width" ? "esb-input-error" : ""}`}
              type="text"
              inputMode="decimal"
              value={widthStr}
              onChange={(e) => handleWidthChange(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="רוחב"
            />
            <span>×</span>
            <input
              className={`util-input compact ${error === "height" ? "esb-input-error" : ""}`}
              type="text"
              inputMode="decimal"
              value={heightStr}
              onChange={(e) => handleHeightChange(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="גובה"
            />
            <button
              type="button"
              className={`esb-lock-btn ${locked ? "esb-lock-on" : ""}`}
              onClick={() => setLocked(!locked)}
              title={locked ? "שמירת יחס פעילה" : "שמירת יחס כבויה"}
              aria-label={locked ? "שמירת יחס פעילה" : "שמירת יחס כבויה"}
            >
              {locked ? <Lock size={13} /> : <Unlock size={13} />}
            </button>
          </div>

          <button className="btn btn-accent" onClick={handleApply} type="button">
            החל
          </button>
        </div>
      </div>
    </div>
  );
}
