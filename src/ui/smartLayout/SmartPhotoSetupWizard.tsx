import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactElement } from "react";
import { getPagePreset, pageSetupFromPreset } from "@/core/pageSetup/presets";
import {
  HEIC_CONVERSION_ERROR_MESSAGE,
  SUPPORTED_IMAGE_ACCEPT,
  normalizeIncomingImages
} from "@/core/image/normalizeIncomingImage";
import { isImageDropFile } from "@/ui/wizard/GlobalWizardDropTarget";
import { buildPhotoPackResult, type LayoutStyle, type PhotoPackOptions } from "@/features/smartLayout";
import type { PageSetup } from "@/types/primitives";
import "./smartLayout.css";

export interface SmartPhotoWizardImage {
  file: File;
  width: number;
  height: number;
}

export interface SmartPhotoWizardResult {
  images: SmartPhotoWizardImage[];
  pageSetup: PageSetup;
  options: PhotoPackOptions;
}

interface Entry extends SmartPhotoWizardImage {
  id: string;
  url: string;
}

interface SmartPhotoSetupWizardProps {
  onComplete: (result: SmartPhotoWizardResult) => void;
  onCancel: () => void;
}

const PAGE_PRESETS = [
  { id: "a4", label: "A4" },
  { id: "a3", label: "A3" },
  { id: "photo_10x15", label: "10×15" },
  { id: "photo_15x20", label: "15×20" },
  { id: "photo_20x30", label: "20×30" }
];

const STYLES: { id: LayoutStyle; label: string }[] = [
  { id: "balanced", label: "מאוזן" },
  { id: "uniform", label: "אחיד ומסודר" },
  { id: "maximumArea", label: "ניצול מרבי" }
];

/**
 * Smart Photo Packing wizard (סידור תמונות חכם). Collects many mixed-aspect
 * images and options, previews the packed first page live, and on confirm hands
 * a result back to App which builds a NEW document.
 */
export function SmartPhotoSetupWizard({ onComplete, onCancel }: SmartPhotoSetupWizardProps): ReactElement {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pagePresetId, setPagePresetId] = useState("a4");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [photosPerPage, setPhotosPerPage] = useState(8);
  const [minSizeMm, setMinSizeMm] = useState(0);
  const [maxSizeMm, setMaxSizeMm] = useState(0);
  const [marginsMm, setMarginsMm] = useState(5);
  const [gapMm, setGapMm] = useState(2);
  const [allowRotate, setAllowRotate] = useState(true);
  const [layoutStyle, setLayoutStyle] = useState<LayoutStyle>("balanced");
  const [cutLines, setCutLines] = useState(false);

  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  useEffect(() => () => {
    for (const e of entriesRef.current) {
      try { URL.revokeObjectURL(e.url); } catch { /* ignore */ }
    }
  }, []);

  const setup = useMemo(
    () => pageSetupFromPreset(getPagePreset(pagePresetId), orientation),
    [pagePresetId, orientation]
  );

  const options: PhotoPackOptions = {
    photosPerPage,
    minSizeMm,
    maxSizeMm,
    layoutStyle,
    marginsMm,
    gapMm,
    allowRotate,
    cutLines: cutLines ? "hairlineGrid" : "none",
    dpi: setup.dpi
  };

  const preview = useMemo(() => {
    if (entries.length === 0) return null;
    const inputs = entries.map((e) => ({ id: e.id, aspect: e.width / Math.max(1, e.height) }));
    return buildPhotoPackResult(inputs, options, setup.size.width, setup.size.height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, setup, photosPerPage, minSizeMm, maxSizeMm, marginsMm, gapMm, allowRotate, layoutStyle, cutLines]);

  async function addFiles(files: FileList | File[]): Promise<void> {
    const { files: normalized, failed } = await normalizeIncomingImages(Array.from(files).filter(isImageDropFile));
    if (failed.length > 0) window.alert(HEIC_CONVERSION_ERROR_MESSAGE);
    const todo = normalized.filter(isImageDropFile);
    if (todo.length === 0) return;
    let pending = todo.length;
    const toAdd: Entry[] = [];
    for (const file of todo) {
      const url = URL.createObjectURL(file);
      const img = new window.Image();
      img.onload = () => {
        toAdd.push({ id: crypto.randomUUID(), file, url, width: img.naturalWidth, height: img.naturalHeight });
        pending -= 1;
        if (pending === 0) setEntries((prev) => [...prev, ...toAdd]);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        pending -= 1;
        if (pending === 0 && toAdd.length > 0) setEntries((prev) => [...prev, ...toAdd]);
      };
      img.src = url;
    }
  }

  function removeEntry(id: string): void {
    setEntries((prev) => {
      const target = prev.find((e) => e.id === id);
      if (target) { try { URL.revokeObjectURL(target.url); } catch { /* ignore */ } }
      return prev.filter((e) => e.id !== id);
    });
  }

  function onDrop(e: DragEvent): void {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer?.files?.length) void addFiles(e.dataTransfer.files);
  }

  const result = preview;
  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const canCreate = entries.length > 0 && result !== null && result.pages.length > 0;

  return (
    <div className="sr-overlay" role="dialog" aria-modal="true">
      <div className="sr-dialog sp-dialog">
        <button className="sr-close" onClick={onCancel} type="button" aria-label="סגור">×</button>
        <div className="sr-header">
          <div className="sr-title">סידור תמונות חכם</div>
          <div className="sr-subtitle">מסדר תמונות בגדלים שונים בדף — בלי חיתוך, עם ניצול שטח מיטבי</div>
        </div>

        <div className="sr-body">
          <div className="sr-controls">
            <div className="sr-group">
              <div className="sr-group-label">תמונות ({entries.length})</div>
              <div
                className={`sp-dropzone${dragging ? " dragging" : ""}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                גרור תמונות לכאן או לחץ לבחירה
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={SUPPORTED_IMAGE_ACCEPT}
                multiple
                hidden
                onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }}
              />
              {entries.length > 0 && (
                <div className="sp-thumbs">
                  {entries.map((e) => (
                    <div className="sp-thumb" key={e.id}>
                      <img src={e.url} alt="" />
                      <button className="sp-thumb-del" type="button" onClick={() => removeEntry(e.id)} aria-label="הסר">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="sr-group">
              <div className="sr-group-label">גודל דף</div>
              <div className="sp-presets">
                {PAGE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`sr-seg${pagePresetId === p.id ? " active" : ""}`}
                    onClick={() => setPagePresetId(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="sp-presets">
                <button type="button" className={`sr-seg${orientation === "portrait" ? " active" : ""}`} onClick={() => setOrientation("portrait")}>לאורך</button>
                <button type="button" className={`sr-seg${orientation === "landscape" ? " active" : ""}`} onClick={() => setOrientation("landscape")}>לרוחב</button>
              </div>
            </div>

            <Slider label="תמונות בעמוד" value={photosPerPage} min={1} max={40} onChange={setPhotosPerPage} />

            <div className="sr-group">
              <div className="sr-group-label">סגנון סידור</div>
              <div className="sr-segmented">
                {STYLES.map((s) => (
                  <button key={s.id} type="button" className={`sr-seg${layoutStyle === s.id ? " active" : ""}`} onClick={() => setLayoutStyle(s.id)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <Slider label="גודל מינימלי (צלע קצרה)" value={minSizeMm} min={0} max={150} unit="מ״מ" onChange={setMinSizeMm} />
            <Slider label="גודל מקסימלי (צלע ארוכה)" value={maxSizeMm} min={0} max={300} unit="מ״מ" onChange={setMaxSizeMm} />
            <Slider label="שוליים חיצוניים" value={marginsMm} min={0} max={30} unit="מ״מ" onChange={setMarginsMm} />
            <Slider label="מרווח בין תמונות" value={gapMm} min={0} max={30} unit="מ״מ" onChange={setGapMm} />

            <label className="sr-toggle-row">
              <span>אפשר סיבוב 90°</span>
              <input type="checkbox" checked={allowRotate} onChange={(e) => setAllowRotate(e.target.checked)} />
            </label>
            <label className="sr-toggle-row">
              <span>קווי חיתוך דקים</span>
              <input type="checkbox" checked={cutLines} onChange={(e) => setCutLines(e.target.checked)} />
            </label>
          </div>

          <div className="sr-preview">
            <div className="sr-preview-canvas">
              {result !== null && result.pages.length > 0 ? (
                <PackPreviewSvg
                  pageW={result.pageWidthPx}
                  pageH={result.pageHeightPx}
                  items={result.pages[0].items}
                  urlOf={(id) => byId.get(id)?.url}
                />
              ) : (
                <span className="sr-stats">הוסף תמונות לתצוגה מקדימה</span>
              )}
            </div>
            {result !== null && result.pages.length > 0 && (
              <div className="sr-stats">
                מספר עמודים: <b>{result.pages.length}</b><br />
                תמונות בעמוד: <b>{photosPerPage}</b>
                {result.pages.length > 1 && <> (אחרון: {result.pages.at(-1)!.items.length})</>}
              </div>
            )}
            {(result?.warnings ?? []).map((warn) => (
              <div className="sr-warn" key={warn}>{warn}</div>
            ))}
          </div>
        </div>

        <div className="sr-footer">
          <button className="sr-btn" onClick={onCancel} type="button">ביטול</button>
          <button
            className="sr-btn sr-btn-primary"
            disabled={!canCreate}
            onClick={() => canCreate && onComplete({
              images: entries.map((e) => ({ file: e.file, width: e.width, height: e.height })),
              pageSetup: setup,
              options
            })}
            type="button"
          >
            צור עמודים
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
          <input type="number" className="sr-num" min={min} value={value} onChange={(e) => commit(Number(e.target.value))} />
          {unit ? <span className="sr-num-unit">{unit}</span> : null}
        </div>
      </div>
      <input type="range" min={min} max={Math.max(max, value)} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function PackPreviewSvg({
  pageW,
  pageH,
  items,
  urlOf
}: {
  pageW: number;
  pageH: number;
  items: { xPx: number; yPx: number; widthPx: number; heightPx: number; rotated: boolean; sourceRef: string }[];
  urlOf: (id: string) => string | undefined;
}): ReactElement {
  const scale = Math.min(260 / pageW, 320 / pageH);
  const w = pageW * scale;
  const h = pageH * scale;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <rect x={0} y={0} width={w} height={h} fill="#ffffff" stroke="#999" strokeWidth={1} />
      {items.map((item, i) => {
        const bx = item.xPx * scale;
        const by = item.yPx * scale;
        const bw = item.widthPx * scale;
        const bh = item.heightPx * scale;
        const url = urlOf(item.sourceRef);
        const fallback = <rect x={bx} y={by} width={bw} height={bh} fill="rgba(124,111,224,0.35)" stroke="#7c6fe0" strokeWidth={0.5} />;
        if (url === undefined) return <g key={i}>{fallback}</g>;
        if (!item.rotated) {
          return <image key={i} href={url} x={bx} y={by} width={bw} height={bh} preserveAspectRatio="none" />;
        }
        const cx = bx + bw / 2;
        const cy = by + bh / 2;
        return (
          <g key={i} transform={`rotate(90 ${cx} ${cy})`}>
            <image href={url} x={cx - bh / 2} y={cy - bw / 2} width={bh} height={bw} preserveAspectRatio="none" />
          </g>
        );
      })}
    </svg>
  );
}
