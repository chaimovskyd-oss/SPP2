import React, { useEffect, useMemo, useRef, useState } from "react";
import { Lock, Unlock, ZoomIn, ZoomOut, Maximize2, Check } from "lucide-react";
import type { Unit } from "@/types/primitives";
import type { VisualLayer } from "@/types/layers";
import { pxToUnit, unitToPx } from "@/core/units/conversion";

const UNITS: { value: Unit; label: string }[] = [
  { value: "cm", label: "ס״מ" },
  { value: "mm", label: "מ״מ" },
  { value: "inch", label: "אינץ׳" },
  { value: "px", label: "פיקסלים" }
];

const UNIT_SUFFIX: Record<Unit, string> = {
  cm: "ס״מ",
  mm: "מ״מ",
  inch: 'אינץ׳',
  px: "px"
};

const LAYER_TYPE_LABEL_HE: Record<string, string> = {
  image: "תמונה",
  text: "טקסט",
  frame: "מסגרת",
  mask: "מסיכה",
  shape: "צורה",
  group: "קבוצה",
  background: "רקע",
  guide: "קו עזר"
};

const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

const MIN_SIZE_PX = 1;
const MAX_SIZE_PX = 50_000;

function formatNumber(value: number, unit: Unit): string {
  const decimals = unit === "px" ? 0 : 2;
  return value.toFixed(decimals);
}

function layerTypeLabel(layer: VisualLayer): string {
  return LAYER_TYPE_LABEL_HE[layer.type] ?? layer.type;
}

export interface EditorStatusBarProps {
  pageWidthPx: number;
  pageHeightPx: number;
  dpi: number;
  selectedLayer: VisualLayer | null;
  selectedCount: number;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSetZoom: (zoom: number) => void;
  onFitPage: () => void;
  autosaveStatus: string;
  unit: Unit;
  onUnitChange: (unit: Unit) => void;
  onResizeSelectedLayer: (newWidthPx: number, newHeightPx: number) => void;
}

export function EditorStatusBar(props: EditorStatusBarProps): React.ReactElement {
  return (
    <footer className="editor-status-bar" dir="rtl">
      <div className="esb-section esb-canvas-info">
        <CanvasInfoStatus
          pageWidthPx={props.pageWidthPx}
          pageHeightPx={props.pageHeightPx}
          dpi={props.dpi}
          unit={props.unit}
        />
        <UnitSelector unit={props.unit} onChange={props.onUnitChange} />
      </div>

      <div className="esb-section esb-selection">
        <SelectionSizeInspector
          selectedLayer={props.selectedLayer}
          selectedCount={props.selectedCount}
          unit={props.unit}
          dpi={props.dpi}
          onResize={props.onResizeSelectedLayer}
        />
      </div>

      <div className="esb-section esb-right">
        <ZoomStatusControl
          zoom={props.zoom}
          onZoomIn={props.onZoomIn}
          onZoomOut={props.onZoomOut}
          onSetZoom={props.onSetZoom}
          onFitPage={props.onFitPage}
        />
        <AutosaveStatusIndicator status={props.autosaveStatus} />
      </div>
    </footer>
  );
}

function CanvasInfoStatus(props: {
  pageWidthPx: number;
  pageHeightPx: number;
  dpi: number;
  unit: Unit;
}): React.ReactElement {
  const { pageWidthPx, pageHeightPx, dpi, unit } = props;
  const w = pxToUnit(pageWidthPx, unit, dpi);
  const h = pxToUnit(pageHeightPx, unit, dpi);
  const wStr = formatNumber(w, unit);
  const hStr = formatNumber(h, unit);
  const tooltip = `${Math.round(pageWidthPx)}×${Math.round(pageHeightPx)}px`;
  return (
    <span className="esb-canvas" title={tooltip}>
      קנבס: {wStr}×{hStr} {UNIT_SUFFIX[unit]} · {dpi}DPI
    </span>
  );
}

function UnitSelector(props: { unit: Unit; onChange: (u: Unit) => void }): React.ReactElement {
  return (
    <select
      className="esb-unit-select"
      value={props.unit}
      onChange={(e) => props.onChange(e.target.value as Unit)}
      title="יחידת מידה"
      aria-label="יחידת מידה"
    >
      {UNITS.map((u) => (
        <option key={u.value} value={u.value}>{u.label}</option>
      ))}
    </select>
  );
}

function SelectionSizeInspector(props: {
  selectedLayer: VisualLayer | null;
  selectedCount: number;
  unit: Unit;
  dpi: number;
  onResize: (wPx: number, hPx: number) => void;
}): React.ReactElement {
  const { selectedLayer, selectedCount, unit, dpi, onResize } = props;

  if (selectedCount === 0 || selectedLayer === null) {
    return <span className="esb-empty">לא נבחר אובייקט</span>;
  }
  if (selectedCount > 1) {
    return <span className="esb-empty">נבחרו {selectedCount} אובייקטים</span>;
  }

  return (
    <SingleLayerSizeEditor
      key={selectedLayer.id}
      layer={selectedLayer}
      unit={unit}
      dpi={dpi}
      onResize={onResize}
    />
  );
}

function SingleLayerSizeEditor(props: {
  layer: VisualLayer;
  unit: Unit;
  dpi: number;
  onResize: (wPx: number, hPx: number) => void;
}): React.ReactElement {
  const { layer, unit, dpi, onResize } = props;
  const initialWidthPx = Math.max(layer.width, 0.001);
  const initialHeightPx = Math.max(layer.height, 0.001);
  const aspectRef = useRef(initialWidthPx / initialHeightPx);

  const [locked, setLocked] = useState(true);
  const [widthStr, setWidthStr] = useState(() => formatNumber(pxToUnit(initialWidthPx, unit, dpi), unit));
  const [heightStr, setHeightStr] = useState(() => formatNumber(pxToUnit(initialHeightPx, unit, dpi), unit));
  const [error, setError] = useState<"width" | "height" | null>(null);

  // Reset displayed values whenever the layer (or unit/dpi) changes from outside.
  useEffect(() => {
    aspectRef.current = initialWidthPx / initialHeightPx;
    setWidthStr(formatNumber(pxToUnit(initialWidthPx, unit, dpi), unit));
    setHeightStr(formatNumber(pxToUnit(initialHeightPx, unit, dpi), unit));
    setError(null);
  }, [initialWidthPx, initialHeightPx, unit, dpi]);

  function parsePx(str: string): number | null {
    const v = Number(str.replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) return null;
    const px = unitToPx(v, unit, dpi);
    if (px < MIN_SIZE_PX || px > MAX_SIZE_PX) return null;
    return px;
  }

  function commit(): void {
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
    setError(null);

    if (locked) {
      // Use the field that changed most relative to current as the driver.
      const curW = layer.width;
      const curH = layer.height;
      const dW = Math.abs(wPx - curW);
      const dH = Math.abs(hPx - curH);
      if (dW >= dH) {
        const finalH = wPx / aspectRef.current;
        onResize(wPx, finalH);
      } else {
        const finalW = hPx * aspectRef.current;
        onResize(finalW, hPx);
      }
    } else {
      onResize(wPx, hPx);
    }
  }

  function handleWidthChange(v: string): void {
    setWidthStr(v);
    if (locked) {
      const wPx = parsePx(v);
      if (wPx !== null) {
        const hPx = wPx / aspectRef.current;
        setHeightStr(formatNumber(pxToUnit(hPx, unit, dpi), unit));
      }
    }
  }

  function handleHeightChange(v: string): void {
    setHeightStr(v);
    if (locked) {
      const hPx = parsePx(v);
      if (hPx !== null) {
        const wPx = hPx * aspectRef.current;
        setWidthStr(formatNumber(pxToUnit(wPx, unit, dpi), unit));
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setWidthStr(formatNumber(pxToUnit(initialWidthPx, unit, dpi), unit));
      setHeightStr(formatNumber(pxToUnit(initialHeightPx, unit, dpi), unit));
      setError(null);
      (e.target as HTMLInputElement).blur();
    }
  }

  const typeLabel = layerTypeLabel(layer);

  return (
    <div className="esb-size-editor">
      <span className="esb-layer-type">{typeLabel}</span>
      <span className="esb-size-label">· גודל:</span>
      <input
        className={`esb-num-input ${error === "width" ? "esb-input-error" : ""}`}
        type="text"
        inputMode="decimal"
        value={widthStr}
        onChange={(e) => handleWidthChange(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="רוחב"
      />
      <span className="esb-times">×</span>
      <input
        className={`esb-num-input ${error === "height" ? "esb-input-error" : ""}`}
        type="text"
        inputMode="decimal"
        value={heightStr}
        onChange={(e) => handleHeightChange(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="גובה"
      />
      <span className="esb-unit-suffix">{UNIT_SUFFIX[unit]}</span>
      <button
        type="button"
        className={`esb-lock-btn ${locked ? "esb-lock-on" : ""}`}
        onClick={() => {
          if (!locked) {
            // Re-locking: snapshot current ratio from the displayed values.
            const wPx = parsePx(widthStr);
            const hPx = parsePx(heightStr);
            if (wPx !== null && hPx !== null) aspectRef.current = wPx / hPx;
          }
          setLocked(!locked);
        }}
        title={locked ? "שמירת יחס פעילה" : "שמירת יחס כבויה"}
        aria-label={locked ? "שמירת יחס פעילה" : "שמירת יחס כבויה"}
      >
        {locked ? <Lock size={11} /> : <Unlock size={11} />}
      </button>
      <button
        type="button"
        className="esb-apply-btn"
        onClick={commit}
        title="החל גודל חדש"
      >
        <Check size={11} />
        החל
      </button>
    </div>
  );
}

function ZoomStatusControl(props: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSetZoom: (z: number) => void;
  onFitPage: () => void;
}): React.ReactElement {
  const pct = Math.round(props.zoom * 100);
  const presets = useMemo(() => {
    const list = ZOOM_PRESETS.map((z) => Math.round(z * 100));
    if (!list.includes(pct)) list.push(pct);
    list.sort((a, b) => a - b);
    return list;
  }, [pct]);

  return (
    <div className="esb-zoom">
      <button type="button" className="esb-icon-btn" onClick={props.onZoomOut} title="הקטן תצוגה" aria-label="הקטן תצוגה">
        <ZoomOut size={12} />
      </button>
      <select
        className="esb-zoom-select"
        value={pct}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) props.onSetZoom(v / 100);
        }}
        aria-label="זום"
        title="זום"
      >
        {presets.map((p) => (
          <option key={p} value={p}>{p}%</option>
        ))}
      </select>
      <button type="button" className="esb-icon-btn" onClick={props.onZoomIn} title="הגדל תצוגה" aria-label="הגדל תצוגה">
        <ZoomIn size={12} />
      </button>
      <button type="button" className="esb-icon-btn" onClick={props.onFitPage} title="התאם דף" aria-label="התאם דף">
        <Maximize2 size={12} />
      </button>
    </div>
  );
}

function AutosaveStatusIndicator(props: { status: string }): React.ReactElement {
  const s = props.status.toLowerCase();
  let tone: "ok" | "busy" | "warn" = "ok";
  let text = props.status;
  if (s.includes("saving") || s.includes("queued") || s.includes("שומר")) {
    tone = "busy";
    text = "שומר…";
  } else if (s.includes("fail") || s.includes("skipped") || s.includes("quota") || s.includes("שגיאה") || s.includes("בעיית")) {
    tone = "warn";
    text = "⚠ בעיית שמירה";
  } else if (s.includes("disabled") || s.includes("כבוי")) {
    tone = "warn";
    text = "שמירה אוטומטית כבויה";
  } else if (s.includes("saved") || s.includes("נשמר") || s.includes("ready") || s.includes("מוכנה")) {
    tone = "ok";
    text = "✓ נשמר";
  } else {
    text = props.status;
  }
  return <span className={`esb-autosave esb-autosave-${tone}`} title={props.status}>{text}</span>;
}
