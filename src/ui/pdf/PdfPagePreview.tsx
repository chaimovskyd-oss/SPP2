import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";
import { renderPdfPage } from "./pdfRenderService";
import type { PdfStudioPage, PdfStudioSourceFile } from "./pdfStudioTypes";

interface PdfPagePreviewProps {
  page: PdfStudioPage | null;
  source?: PdfStudioSourceFile;
  zoom: number;
}

export function PdfPagePreview({ page, source, zoom }: PdfPagePreviewProps): ReactElement {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (page === null) {
      setDataUrl(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    void renderPdfPage({ page, source, scale: Math.max(0.2, zoom), rotation: page.rotation })
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
  }, [page, source, zoom]);

  if (page === null) {
    return (
      <div className="pdf-preview-empty">
        <strong>PDF Studio מוכן</strong>
        <span>ייבא PDF, תמונות או קובצי Office כדי להתחיל לסדר עמודים.</span>
      </div>
    );
  }

  const adjustedStyle = {
    filter: `brightness(${100 + page.adjustments.brightness}%) contrast(${100 + page.adjustments.contrast}%) saturate(${100 + page.adjustments.saturation}%) grayscale(${page.adjustments.grayscale ? 1 : 0})`
  };

  return (
    <div className="pdf-preview-page-wrap" style={{ width: `${Math.min(96, Math.max(36, zoom * 72))}%` }}>
      <div className="pdf-preview-page" style={{ aspectRatio: `${page.widthPt} / ${page.heightPt}` }}>
        {loading ? (
          <div className="pdf-preview-placeholder"><Loader2 className="pdf-spin" size={34} /><span>טוען תצוגה...</span></div>
        ) : null}
        {!loading && error !== null ? (
          <div className="pdf-preview-placeholder"><AlertTriangle size={34} /><strong>העמוד לא נטען</strong><span>{error}</span></div>
        ) : null}
        {!loading && error === null && dataUrl !== null ? (
          <img alt="" src={dataUrl} style={adjustedStyle} />
        ) : null}
        {!loading && page.overlayObjects.length > 0 ? <span className="pdf-overlay-badge">Overlay</span> : null}
      </div>
    </div>
  );
}
