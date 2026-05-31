import type Konva from "konva";
import type { Page } from "@/types/document";
import { renderPagePreviewThumbnail } from "@/ui/projectActions";
import { getPreviewCached, setPreviewCached } from "@/services/printPreviewCache";

// ─── Async render queue for print preview thumbnails ─────────────────────────
// Renders one page at a time, yields between jobs so the UI stays responsive.
// IMPORTANT: Only produces low-resolution JPEG thumbnails for the preview modal.
//            Final print quality is unaffected — those renders happen separately.

interface PreviewJob {
  pageIndex: number;
  page: Page;
  priority: number; // 0 = visible, 1 = buffer
  onDone: (dataUrl: string) => void;
  onError: (err: Error) => void;
}

function rafTwice(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );
}

export class PrintPreviewQueue {
  private jobs: PreviewJob[] = [];
  private running = false;
  private aborted = false;
  private stopResolve: (() => void) | null = null;

  private readonly stage: Konva.Stage;
  private readonly setActivePage: (id: string) => void;

  constructor(opts: {
    stage: Konva.Stage;
    setActivePage: (id: string) => void;
  }) {
    this.stage = opts.stage;
    this.setActivePage = opts.setActivePage;
  }

  /**
   * Add a job for the given page.  If a job for the same pageIndex already
   * exists, only its priority is updated (no duplicate renders).
   */
  enqueue(
    pageIndex: number,
    page: Page,
    priority: number,
    onDone: (url: string) => void,
    onError: (e: Error) => void,
  ): void {
    if (this.aborted) return;

    const existing = this.jobs.find((j) => j.pageIndex === pageIndex);
    if (existing !== undefined) {
      existing.priority = Math.min(existing.priority, priority);
      return;
    }

    this.jobs.push({ pageIndex, page, priority, onDone, onError });
    if (!this.running) this.processLoop();
  }

  /** Promote visible pages to priority 0; push the rest to priority 1. */
  reprioritize(visibleIndices: number[]): void {
    const visibleSet = new Set(visibleIndices);
    for (const job of this.jobs) {
      job.priority = visibleSet.has(job.pageIndex) ? 0 : 1;
    }
  }

  /**
   * Signal the queue to stop.  Returns a promise that resolves once the
   * currently in-flight render (if any) finishes.
   */
  stop(): Promise<void> {
    this.aborted = true;
    if (!this.running) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.stopResolve = resolve;
    });
  }

  private async processLoop(): Promise<void> {
    this.running = true;
    try {
      while (this.jobs.length > 0 && !this.aborted) {
        // Sort so priority 0 jobs come first; stable within same priority.
        this.jobs.sort((a, b) => a.priority - b.priority);
        const job = this.jobs.shift()!;

        // Cache hit — resolve immediately, no page switch needed.
        const cached = getPreviewCached(job.page);
        if (cached !== null) {
          job.onDone(cached);
          // Still yield so we don't monopolise the event loop on a full cache.
          await new Promise<void>((r) => setTimeout(r, 0));
          continue;
        }

        // Switch to this page and wait for Konva to repaint before capturing.
        this.setActivePage(job.page.id);
        await rafTwice();

        if (this.aborted) break;

        try {
          // Low-resolution capture — preview quality only, not final output.
          const dataUrl = renderPagePreviewThumbnail(this.stage, job.page);
          setPreviewCached(job.page, dataUrl);
          job.onDone(dataUrl);
        } catch (err) {
          job.onError(err instanceof Error ? err : new Error(String(err)));
        }

        // Yield to the UI thread between renders to keep scrolling smooth.
        await new Promise<void>((r) => setTimeout(r, 0));
      }
    } finally {
      this.running = false;
      if (this.stopResolve !== null) {
        this.stopResolve();
        this.stopResolve = null;
      }
    }
  }
}
