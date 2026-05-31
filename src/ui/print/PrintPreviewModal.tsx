import { useState, useEffect, useRef, useCallback } from "react";
import type Konva from "konva";
import { X, Printer } from "lucide-react";
import type { Page } from "@/types/document";
import { PrintPreviewQueue } from "@/services/printPreviewQueue";

// ─── PrintPreviewModal ────────────────────────────────────────────────────────
// Opens instantly with skeleton placeholders and lazily fills in low-resolution
// JPEG thumbnails as the background queue renders them.
//
// IMPORTANT: The thumbnails shown here are PREVIEW QUALITY ONLY (max 600 px,
// JPEG 0.70).  Clicking "הדפסה" hands off to the full high-quality render path;
// nothing in this component touches final print, PDF, or PNG export quality.

export interface PrintPreviewModalProps {
  pages: Page[];
  selectedIndices: number[]; // which pages to display, in order
  stage: Konva.Stage;
  originalPageId: string; // restored when the modal closes
  setActivePage: (id: string) => void;
  documentName: string;
  onClose: () => void; // aborts queue + restores page
  onPrint: () => void; // triggers the unchanged high-quality print flow
}

// How far outside the visible scroll area to pre-render (gives a head start).
const OBSERVER_ROOT_MARGIN = "800px";

// Number of pages to enqueue immediately on mount before the observer fires.
const COLD_START_COUNT = 4;

export function PrintPreviewModal({
  pages,
  selectedIndices,
  stage,
  originalPageId,
  setActivePage,
  documentName,
  onClose,
  onPrint,
}: PrintPreviewModalProps) {
  // Map from selectedIndices position (0…N-1) to rendered thumbnail dataUrl.
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(() => new Map());
  const queueRef = useRef<PrintPreviewQueue | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const addThumbnail = useCallback((pos: number, dataUrl: string) => {
    setThumbnails((prev) => {
      const next = new Map(prev);
      next.set(pos, dataUrl);
      return next;
    });
  }, []);

  // Build queue and observer on mount; tear down on unmount.
  useEffect(() => {
    const queue = new PrintPreviewQueue({ stage, setActivePage });
    queueRef.current = queue;

    function enqueuePos(pos: number, priority: number) {
      const pageIndex = selectedIndices[pos];
      if (pageIndex === undefined) return;
      const page = pages[pageIndex];
      if (!page) return;
      queue.enqueue(
        pageIndex,
        page,
        priority,
        (url) => addThumbnail(pos, url),
        () => { /* ignore per-page errors silently */ },
      );
    }

    // Immediately enqueue the first few pages so thumbnails start appearing
    // before the IntersectionObserver fires.
    for (let i = 0; i < Math.min(COLD_START_COUNT, selectedIndices.length); i++) {
      enqueuePos(i, 0);
    }

    // Observe each card to trigger lazy rendering as the user scrolls.
    const observer = new IntersectionObserver(
      (entries) => {
        const visiblePositions: number[] = [];
        for (const entry of entries) {
          const pos = Number((entry.target as HTMLElement).dataset["previewPos"]);
          if (entry.isIntersecting) {
            visiblePositions.push(pos);
            enqueuePos(pos, 0);
          }
        }
        if (visiblePositions.length > 0) {
          queue.reprioritize(visiblePositions.map((p) => selectedIndices[p] ?? -1));
        }
      },
      { rootMargin: OBSERVER_ROOT_MARGIN },
    );
    observerRef.current = observer;

    // Observe any cards already mounted.
    cardRefs.current.forEach((el) => { if (el) observer.observe(el); });

    return () => {
      observer.disconnect();
      // Stop the queue and restore the original page so the editor is left in
      // the same state it was in before the modal opened.
      queue.stop().then(() => setActivePage(originalPageId));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount

  function handleClose() {
    onClose();
  }

  function handlePrint() {
    // onPrint is responsible for closing the modal and running the full-quality
    // render + Python print preview. We do not do any rendering here.
    onPrint();
  }

  // Aspect ratio for a page card.
  function pageAspectRatio(pageIndex: number): number {
    const page = pages[pageIndex];
    if (!page || page.width === 0) return 297 / 210; // A4 fallback
    return page.height / page.width;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-base, #1a1820)",
        direction: "rtl",
      }}
    >
      {/* ── Toolbar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 20px",
          borderBottom: "1px solid var(--border, #35323f)",
          background: "var(--bg-elevated, #2c2a35)",
          flexShrink: 0,
        }}
      >
        {/* Right side: close button */}
        <button
          onClick={handleClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-secondary, #8b88a0)",
            padding: 6,
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
          }}
          title="סגור תצוגה מקדימה"
          type="button"
        >
          <X size={18} />
        </button>

        {/* Centre: title */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 14 }}>
          <Printer size={15} style={{ color: "var(--accent, #7c6fe0)" }} />
          תצוגת הדפסה
          <span style={{ color: "var(--text-secondary, #8b88a0)", fontWeight: 400 }}>
            — {documentName}
          </span>
          <span style={{ color: "var(--text-secondary, #8b88a0)", fontWeight: 400, fontSize: 12 }}>
            ({selectedIndices.length} עמודים)
          </span>
        </div>

        {/* Left side: print button */}
        <button
          onClick={handlePrint}
          style={{
            background: "var(--accent, #7c6fe0)",
            border: "none",
            borderRadius: 7,
            color: "#fff",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 13,
            padding: "7px 18px",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
          type="button"
        >
          <Printer size={14} />
          הדפסה
        </button>
      </div>

      {/* ── Page grid ── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "28px 32px",
          display: "flex",
          flexWrap: "wrap",
          gap: 24,
          alignContent: "flex-start",
          justifyContent: "flex-end",
        }}
      >
        {selectedIndices.map((pageIndex, pos) => {
          const thumb = thumbnails.get(pos);
          const ar = pageAspectRatio(pageIndex);
          const cardW = 220;
          const cardH = Math.round(cardW * ar);
          const pageName =
            typeof pages[pageIndex]?.metadata["name"] === "string"
              ? (pages[pageIndex]!.metadata["name"] as string)
              : `עמוד ${pageIndex + 1}`;

          return (
            <div
              key={pageIndex}
              ref={(el) => {
                cardRefs.current[pos] = el;
                if (el && observerRef.current) observerRef.current.observe(el);
              }}
              data-preview-pos={pos}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
            >
              <div
                style={{
                  width: cardW,
                  height: cardH,
                  borderRadius: 6,
                  overflow: "hidden",
                  border: "1px solid var(--border, #35323f)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                  background: "var(--bg-surface, #201e2b)",
                  position: "relative",
                }}
              >
                {thumb !== undefined ? (
                  // Rendered preview thumbnail — intentionally lower quality than final print
                  <img
                    src={thumb}
                    alt={pageName}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    draggable={false}
                  />
                ) : (
                  // Skeleton placeholder shown while the thumbnail is being rendered
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      background:
                        "linear-gradient(90deg, var(--bg-surface, #201e2b) 25%, var(--bg-elevated, #2c2a35) 50%, var(--bg-surface, #201e2b) 75%)",
                      backgroundSize: "200% 100%",
                      animation: "preview-skeleton-shimmer 1.4s infinite linear",
                    }}
                  />
                )}
              </div>

              {/* Page label */}
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-secondary, #8b88a0)",
                  textAlign: "center",
                  maxWidth: cardW,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {pageName}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
