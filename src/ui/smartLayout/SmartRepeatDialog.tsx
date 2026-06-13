import { useMemo, useState, type ReactElement } from "react";
import { pxToMm } from "@/core/units/conversion";
import {
  buildRepeatResult,
  captureDesignUnit,
  unitSupportsRotation,
  type CalcMode,
  type RepeatOptions
} from "@/features/smartLayout";
import type { Page } from "@/types/document";
import "./smartLayout.css";

export interface SmartRepeatDialogProps {
  page: Page;
  selectedLayerIds: string[];
  onClose: () => void;
  onApply: (options: RepeatOptions) => void;
}

const CALC_MODES: { id: CalcMode; label: string }[] = [
  { id: "copiesPerPage", label: "כמות בדף" },
  { id: "unitSizeMm", label: "גודל יחידה" },
  { id: "totalCopies", label: "כמות כוללת" }
];

/**
 * Compact in-editor dialog for Smart Repeat (שכפול חכם לדף). Drives the same
 * `buildRepeatResult` solver for both the live preview and the committed
 * layout, so preview == result.
 */
export function SmartRepeatDialog({ page, selectedLayerIds, onClose, onApply }: SmartRepeatDialogProps): ReactElement {
  const dpi = page.setup.dpi;
  const unit = useMemo(() => captureDesignUnit(page, selectedLayerIds), [page, selectedLayerIds]);
  const canRotate = unit !== null && unitSupportsRotation(unit);

  // Default unit size = the selection's natural footprint, rounded to mm.
  const defaultSize = useMemo(() => {
    if (unit === null) return { w: 50, h: 50 };
    return {
      w: Math.max(1, Math.round(pxToMm(unit.bboxPx.width, dpi))),
      h: Math.max(1, Math.round(pxToMm(unit.bboxPx.height, dpi)))
    };
  }, [unit, dpi]);

  // Intrinsic aspect (w/h) of the selected graphic — used to lock unit size.
  const aspect = unit !== null && unit.bboxPx.height > 0 ? unit.bboxPx.width / unit.bboxPx.height : defaultSize.w / defaultSize.h;

  const [calcMode, setCalcMode] = useState<CalcMode>("copiesPerPage");
  const [copiesPerPage, setCopiesPerPage] = useState(24);
  const [unitWidthMm, setUnitWidthMm] = useState(defaultSize.w);
  const [unitHeightMm, setUnitHeightMm] = useState(defaultSize.h);
  const [keepUnitAspect, setKeepUnitAspect] = useState(true);
  const [totalCopies, setTotalCopies] = useState(100);
  const [marginsMm, setMarginsMm] = useState(0);
  const [gapMm, setGapMm] = useState(0);
  const [allowRotate, setAllowRotate] = useState(false);
  const [cutLines, setCutLines] = useState(false);
  const [replaceOriginal, setReplaceOriginal] = useState(true);

  const handleUnitWidth = (value: number): void => {
    setUnitWidthMm(value);
    if (keepUnitAspect) setUnitHeightMm(Math.max(1, Math.round(value / aspect)));
  };
  const handleUnitHeight = (value: number): void => {
    setUnitHeightMm(value);
    if (keepUnitAspect) setUnitWidthMm(Math.max(1, Math.round(value * aspect)));
  };

  const options: RepeatOptions = {
    calcMode,
    copiesPerPage,
    unitWidthMm,
    unitHeightMm,
    totalCopies,
    marginsMm,
    gapMm,
    allowRotate: allowRotate && canRotate,
    cutLines: cutLines ? "hairlineGrid" : "none",
    dpi,
    replaceOriginal
  };

  const preview = useMemo(() => {
    if (unit === null) return null;
    return buildRepeatResult(unit, options, page.width, page.height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit, page.width, page.height, calcMode, copiesPerPage, unitWidthMm, unitHeightMm, totalCopies, marginsMm, gapMm, allowRotate, cutLines, replaceOriginal]);

  const plan = preview?.plan ?? null;
  const result = preview?.result ?? null;
  const canApply = unit !== null && plan !== null && plan.perPage > 0;

  return (
    <div className="sr-overlay" role="dialog" aria-modal="true">
      <div className="sr-dialog">
        <button className="sr-close" onClick={onClose} type="button" aria-label="סגור">×</button>
        <div className="sr-header">
          <div className="sr-title">שכפול חכם לדף</div>
          <div className="sr-subtitle">
            {unit === null
              ? "בחר תמונה או שכבות לשכפול"
              : unit.layers.length > 1
                ? `פריסה חכמה של ${unit.layers.length} שכבות כיחידה אחת`
                : "פריסה חכמה של הבחירה על פני הדף"}
          </div>
        </div>

        <div className="sr-body">
          <div className="sr-controls">
            <div className="sr-group">
              <div className="sr-group-label">מה ידוע לך?</div>
              <div className="sr-segmented">
                {CALC_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className={`sr-seg${calcMode === mode.id ? " active" : ""}`}
                    onClick={() => setCalcMode(mode.id)}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {calcMode === "copiesPerPage" && (
              <Slider label="עותקים בדף" value={copiesPerPage} min={1} max={120} onChange={setCopiesPerPage} />
            )}
            {(calcMode === "unitSizeMm" || calcMode === "totalCopies") && (
              <>
                <Slider label="רוחב יחידה" value={unitWidthMm} min={5} max={300} unit="מ״מ" onChange={handleUnitWidth} />
                <Slider label="גובה יחידה" value={unitHeightMm} min={5} max={300} unit="מ״מ" onChange={handleUnitHeight} />
                <label className="sr-toggle-row">
                  <span>שמור יחס מקורי (רוחב/גובה)</span>
                  <input type="checkbox" checked={keepUnitAspect} onChange={(e) => setKeepUnitAspect(e.target.checked)} />
                </label>
              </>
            )}
            {calcMode === "totalCopies" && (
              <Slider label="כמות כוללת" value={totalCopies} min={1} max={1000} onChange={setTotalCopies} />
            )}

            <Slider label="שוליים חיצוניים" value={marginsMm} min={0} max={30} unit="מ״מ" onChange={setMarginsMm} />
            <Slider label="מרווח בין עותקים" value={gapMm} min={0} max={30} unit="מ״מ" onChange={setGapMm} />

            <label className="sr-toggle-row">
              <span>אפשר סיבוב 90°{canRotate ? "" : " (יחידה בודדת בלבד)"}</span>
              <input type="checkbox" checked={allowRotate && canRotate} disabled={!canRotate} onChange={(e) => setAllowRotate(e.target.checked)} />
            </label>
            <label className="sr-toggle-row">
              <span>קווי חיתוך דקים</span>
              <input type="checkbox" checked={cutLines} onChange={(e) => setCutLines(e.target.checked)} />
            </label>
            <label className="sr-toggle-row">
              <span>החלף את הבחירה המקורית</span>
              <input type="checkbox" checked={replaceOriginal} onChange={(e) => setReplaceOriginal(e.target.checked)} />
            </label>
          </div>

          <div className="sr-preview">
            <div className="sr-preview-canvas">
              {result !== null && plan !== null && plan.perPage > 0 ? (
                <PreviewSvg
                  pageW={result.pageWidthPx}
                  pageH={result.pageHeightPx}
                  items={result.pages[0]?.items ?? []}
                  showCut={cutLines}
                />
              ) : (
                <span className="sr-stats">אין תצוגה זמינה</span>
              )}
            </div>
            {plan !== null && plan.perPage > 0 && (
              <div className="sr-stats">
                סידור: <b>{plan.cols}×{plan.rows}</b><br />
                עותקים בדף: <b>{plan.perPage}</b><br />
                גודל יחידה: <b>{Math.round(pxToMm(plan.cellWPx, dpi))}×{Math.round(pxToMm(plan.cellHPx, dpi))}</b> מ״מ<br />
                {plan.rotated && <>סובב 90°<br /></>}
                מספר עמודים: <b>{plan.totalPages}</b>
                {plan.totalPages > 1 && <> (אחרון: {plan.lastPageCount})</>}
              </div>
            )}
            {(result?.warnings ?? []).map((warn) => (
              <div className="sr-warn" key={warn}>{warn}</div>
            ))}
          </div>
        </div>

        <div className="sr-footer">
          <button className="sr-btn" onClick={onClose} type="button">ביטול</button>
          <button
            className="sr-btn sr-btn-primary"
            disabled={!canApply}
            onClick={() => canApply && onApply(options)}
            type="button"
          >
            צור פריסה
          </button>
        </div>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  unit,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (value: number) => void;
}): ReactElement {
  const commit = (raw: number): void => {
    if (!Number.isFinite(raw)) return;
    onChange(Math.max(min, Math.round(raw)));
  };
  return (
    <div className="sr-slider-row">
      <div className="sr-slider-head">
        <span>{label}</span>
        <div className="sr-num-wrap">
          <input
            type="number"
            className="sr-num"
            min={min}
            value={value}
            onChange={(e) => commit(Number(e.target.value))}
          />
          {unit ? <span className="sr-num-unit">{unit}</span> : null}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={Math.max(max, value)}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function PreviewSvg({
  pageW,
  pageH,
  items,
  showCut
}: {
  pageW: number;
  pageH: number;
  items: { xPx: number; yPx: number; widthPx: number; heightPx: number }[];
  showCut: boolean;
}): ReactElement {
  const maxW = 240;
  const maxH = 300;
  const scale = Math.min(maxW / pageW, maxH / pageH);
  const w = pageW * scale;
  const h = pageH * scale;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <rect x={0} y={0} width={w} height={h} fill="#ffffff" stroke="#999" strokeWidth={1} />
      {items.map((item, i) => (
        <rect
          key={i}
          x={item.xPx * scale}
          y={item.yPx * scale}
          width={item.widthPx * scale}
          height={item.heightPx * scale}
          fill="rgba(124, 111, 224, 0.35)"
          stroke={showCut ? "#000" : "#7c6fe0"}
          strokeWidth={showCut ? 0.5 : 1}
        />
      ))}
    </svg>
  );
}
