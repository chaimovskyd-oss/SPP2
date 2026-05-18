import { AlertTriangle, Copy, FileText, Loader2, RotateCw, Trash2 } from "lucide-react";
import { useEffect, useState, type MouseEvent, type ReactElement } from "react";
import { renderPdfPage } from "./pdfRenderService";
import type { PdfStudioPage, PdfStudioSourceFile } from "./pdfStudioTypes";
import { PT_TO_MM } from "./pdfStudioTypes";

interface PdfThumbnailProps {
  page: PdfStudioPage;
  source?: PdfStudioSourceFile;
  index: number;
  active: boolean;
  selected: boolean;
  onSelect: (event: MouseEvent<HTMLElement>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onRotate: () => void;
  onMoveRequest: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (event: React.DragEvent<HTMLElement>) => void;
  onDrop?: () => void;
}

export function PdfThumbnail({
  page,
  source,
  index,
  active,
  selected,
  onSelect,
  onDelete,
  onDuplicate,
  onRotate,
  onMoveRequest,
  draggable,
  onDragStart,
  onDragOver,
  onDrop
}: PdfThumbnailProps): ReactElement {
  const [dataUrl, setDataUrl] = useState<string | null>(page.imageDataUrl ?? null);
  const [loading, setLoading] = useState(page.sourceType !== "image");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void renderPdfPage({ page, source, scale: 0.22, rotation: page.rotation })
      .then((rendered) => {
        if (!cancelled) setDataUrl(rendered.dataUrl);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page, source]);

  return (
    <article
      className={`pdf-page-card ${active ? "active" : ""} ${selected ? "selected" : ""}`}
      draggable={draggable}
      onClick={onSelect}
      onDragOver={onDragOver}
      onDragStart={onDragStart}
      onDrop={onDrop}
    >
      <div className="pdf-page-thumb">
        {loading ? <Loader2 className="pdf-spin" size={20} /> : null}
        {!loading && error !== null ? <AlertTriangle size={20} /> : null}
        {!loading && error === null && dataUrl !== null ? <img alt="" src={dataUrl} /> : null}
      </div>
      <div className="pdf-page-meta">
        <strong>עמוד {index + 1}</strong>
        <span>{page.title}</span>
        <small>{formatSource(page.sourceType)} · {formatMm(page.widthPt)} x {formatMm(page.heightPt)} מ״מ · {page.rotation}°</small>
      </div>
      <div className="pdf-card-actions" onClick={(event) => event.stopPropagation()}>
        <button title="סובב" type="button" onClick={onRotate}><RotateCw size={14} /></button>
        <button title="שכפל" type="button" onClick={onDuplicate}><Copy size={14} /></button>
        <button title="העבר אל עמוד" type="button" onClick={onMoveRequest}><FileText size={14} /></button>
        <button className="danger" title="מחק" type="button" onClick={onDelete}><Trash2 size={14} /></button>
      </div>
    </article>
  );
}

function formatSource(sourceType: PdfStudioPage["sourceType"]): string {
  if (sourceType === "pdf") return "PDF";
  if (sourceType === "office-converted") return "Office";
  if (sourceType === "image") return "תמונה";
  return "ריק";
}

function formatMm(pt: number): string {
  return (pt * PT_TO_MM).toFixed(1);
}
