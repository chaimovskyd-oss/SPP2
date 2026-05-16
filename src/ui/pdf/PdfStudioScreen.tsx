import { PDFDocument, degrees } from "pdf-lib";
import {
  ArrowRight,
  Copy,
  FileDown,
  FileImage,
  FilePlus2,
  FileText,
  ImagePlus,
  Loader2,
  Maximize2,
  RotateCw,
  Save,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { useMemo, useRef, useState, type ChangeEvent, type ReactElement } from "react";
import "./pdfStudio.css";

type PdfPageKind = "pdf" | "image" | "blank";
type ResizeBehavior = "fit" | "fill" | "stretch" | "center";
type ApplyScope = "current" | "selected" | "all";

type PdfSource = {
  id: string;
  name: string;
  bytes: Uint8Array;
};

type PdfStudioPage = {
  id: string;
  kind: PdfPageKind;
  title: string;
  sourceId?: string;
  sourcePageIndex?: number;
  imageBytes?: Uint8Array;
  imageMime?: string;
  imageUrl?: string;
  widthPt: number;
  heightPt: number;
  originalWidthPt: number;
  originalHeightPt: number;
  rotation: 0 | 90 | 180 | 270;
};

type PagePreset = {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
};

const MM_TO_PT = 72 / 25.4;
const PT_TO_MM = 25.4 / 72;

const PAGE_PRESETS: PagePreset[] = [
  { id: "a4", label: "A4", widthMm: 210, heightMm: 297 },
  { id: "a5", label: "A5", widthMm: 148, heightMm: 210 },
  { id: "a3", label: "A3", widthMm: 297, heightMm: 420 },
  { id: "10x15", label: "10×15", widthMm: 100, heightMm: 150 },
  { id: "13x18", label: "13×18", widthMm: 130, heightMm: 180 },
  { id: "custom", label: "מותאם אישית", widthMm: 210, heightMm: 297 }
];

interface PdfStudioScreenProps {
  onBackHome: () => void;
}

export function PdfStudioScreen({ onBackHome }: PdfStudioScreenProps): ReactElement {
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const officeInputRef = useRef<HTMLInputElement>(null);

  const [sources, setSources] = useState<PdfSource[]>([]);
  const [pages, setPages] = useState<PdfStudioPage[]>([]);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [status, setStatus] = useState("מוכן");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [presetId, setPresetId] = useState("a4");
  const [customWidthMm, setCustomWidthMm] = useState(210);
  const [customHeightMm, setCustomHeightMm] = useState(297);
  const [applyScope, setApplyScope] = useState<ApplyScope>("current");
  const [resizeBehavior, setResizeBehavior] = useState<ResizeBehavior>("fit");

  const activePage = useMemo(
    () => pages.find((page) => page.id === activePageId) ?? pages[0] ?? null,
    [activePageId, pages]
  );

  const selectedPagesCount = selectedPageIds.length;
  const selectedPreset = PAGE_PRESETS.find((preset) => preset.id === presetId) ?? PAGE_PRESETS[0];
  const targetWidthMm = presetId === "custom" ? customWidthMm : selectedPreset.widthMm;
  const targetHeightMm = presetId === "custom" ? customHeightMm : selectedPreset.heightMm;

  async function importPdfFiles(files: FileList | File[]): Promise<void> {
    const fileArray = Array.from(files).filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (fileArray.length === 0) return;

    await runBusy(`מייבא ${fileArray.length} קובצי PDF...`, async () => {
      const nextSources: PdfSource[] = [];
      const nextPages: PdfStudioPage[] = [];

      for (const file of fileArray) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const source: PdfSource = { id: crypto.randomUUID(), name: file.name, bytes };
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pdfPages = doc.getPages();
        nextSources.push(source);

        pdfPages.forEach((page, index) => {
          const { width, height } = page.getSize();
          nextPages.push({
            id: crypto.randomUUID(),
            kind: "pdf",
            title: `${file.name} · עמוד ${index + 1}`,
            sourceId: source.id,
            sourcePageIndex: index,
            widthPt: width,
            heightPt: height,
            originalWidthPt: width,
            originalHeightPt: height,
            rotation: 0
          });
        });
      }

      setSources((current) => [...current, ...nextSources]);
      setPages((current) => {
        const merged = [...current, ...nextPages];
        if (activePageId === null && merged[0] !== undefined) setActivePageId(merged[0].id);
        return merged;
      });
      setStatus(`יובאו ${nextPages.length} עמודים`);
    });
  }

  async function importImageFiles(files: FileList | File[]): Promise<void> {
    const fileArray = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (fileArray.length === 0) return;

    await runBusy(`מוסיף ${fileArray.length} תמונות כעמודים...`, async () => {
      const imagePages: PdfStudioPage[] = [];
      for (const file of fileArray) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const size = await readImageSize(file);
        const widthPt = Math.max(1, size.widthPx * 72 / 300);
        const heightPt = Math.max(1, size.heightPx * 72 / 300);
        imagePages.push({
          id: crypto.randomUUID(),
          kind: "image",
          title: file.name,
          imageBytes: bytes,
          imageMime: file.type || guessImageMime(file.name),
          imageUrl: URL.createObjectURL(file),
          widthPt,
          heightPt,
          originalWidthPt: widthPt,
          originalHeightPt: heightPt,
          rotation: 0
        });
      }
      setPages((current) => {
        const merged = [...current, ...imagePages];
        if (activePageId === null && merged[0] !== undefined) setActivePageId(merged[0].id);
        return merged;
      });
      setStatus(`נוספו ${imagePages.length} עמודי תמונה`);
    });
  }

  async function importOfficeFiles(files: FileList | File[]): Promise<void> {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    if (window.spp?.convertOfficeToPdf === undefined) {
      setError("חיבור Electron להמרת Office עדיין לא זמין. ודא שהקבצים electron/main.cjs ו-preload.cjs עודכנו.");
      return;
    }

    await runBusy("ממיר קבצי Office ל-PDF דרך LibreOffice...", async () => {
      for (const file of fileArray) {
        const filePath = getElectronFilePath(file);
        if (filePath === undefined) {
          throw new Error(`לא ניתן לקבל נתיב מקומי עבור ${file.name}. במצב Electron מלא זה אמור להיות זמין.`);
        }
        const result = await window.spp.convertOfficeToPdf!(filePath);
        if (!result.success || result.pdfBase64 === undefined) {
          throw new Error(result.error ?? `המרת ${file.name} נכשלה`);
        }
        const bytes = base64ToUint8Array(result.pdfBase64);
        await appendPdfBytes(bytes, result.outputName ?? `${file.name}.pdf`);
      }
      setStatus("קבצי Office הומרו ונוספו למסמך");
    });
  }

  async function appendPdfBytes(bytes: Uint8Array, name: string): Promise<void> {
    const source: PdfSource = { id: crypto.randomUUID(), name, bytes };
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const importedPages = doc.getPages().map((page, index): PdfStudioPage => {
      const { width, height } = page.getSize();
      return {
        id: crypto.randomUUID(),
        kind: "pdf",
        title: `${name} · עמוד ${index + 1}`,
        sourceId: source.id,
        sourcePageIndex: index,
        widthPt: width,
        heightPt: height,
        originalWidthPt: width,
        originalHeightPt: height,
        rotation: 0
      };
    });
    setSources((current) => [...current, source]);
    setPages((current) => {
      const merged = [...current, ...importedPages];
      if (activePageId === null && merged[0] !== undefined) setActivePageId(merged[0].id);
      return merged;
    });
  }

  function toggleSelectPage(pageId: string, additive: boolean): void {
    setActivePageId(pageId);
    setSelectedPageIds((current) => {
      if (!additive) return [pageId];
      return current.includes(pageId) ? current.filter((id) => id !== pageId) : [...current, pageId];
    });
  }

  function movePage(pageId: string, direction: -1 | 1): void {
    setPages((current) => {
      const index = current.findIndex((page) => page.id === pageId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const copy = [...current];
      const [item] = copy.splice(index, 1);
      if (item === undefined) return current;
      copy.splice(nextIndex, 0, item);
      return copy;
    });
  }

  function deleteSelectedPages(): void {
    const ids = selectedPageIds.length > 0 ? selectedPageIds : activePageId !== null ? [activePageId] : [];
    if (ids.length === 0) return;
    setPages((current) => {
      const next = current.filter((page) => !ids.includes(page.id));
      setActivePageId(next[0]?.id ?? null);
      return next;
    });
    setSelectedPageIds([]);
    setStatus(`נמחקו ${ids.length} עמודים`);
  }

  function duplicateSelectedPages(): void {
    const ids = selectedPageIds.length > 0 ? selectedPageIds : activePageId !== null ? [activePageId] : [];
    if (ids.length === 0) return;
    setPages((current) => {
      const clones: PdfStudioPage[] = [];
      const next: PdfStudioPage[] = [];
      current.forEach((page) => {
        next.push(page);
        if (ids.includes(page.id)) {
          const clone = { ...page, id: crypto.randomUUID(), title: `${page.title} · עותק` };
          clones.push(clone);
          next.push(clone);
        }
      });
      return next;
    });
    setStatus(`שוכפלו ${ids.length} עמודים`);
  }

  function rotateSelectedPages(): void {
    const ids = selectedPageIds.length > 0 ? selectedPageIds : activePageId !== null ? [activePageId] : [];
    if (ids.length === 0) return;
    setPages((current) => current.map((page) => ids.includes(page.id) ? { ...page, rotation: ((page.rotation + 90) % 360) as PdfStudioPage["rotation"] } : page));
  }

  function applyPageSize(): void {
    const targetIds = getTargetPageIds();
    if (targetIds.length === 0) return;
    const widthPt = Math.max(1, targetWidthMm * MM_TO_PT);
    const heightPt = Math.max(1, targetHeightMm * MM_TO_PT);
    setPages((current) => current.map((page) => targetIds.includes(page.id) ? { ...page, widthPt, heightPt } : page));
    setStatus(`גודל הדף עודכן ל-${formatMm(widthPt)} × ${formatMm(heightPt)} מ״מ`);
  }

  function getTargetPageIds(): string[] {
    if (applyScope === "all") return pages.map((page) => page.id);
    if (applyScope === "selected") return selectedPageIds;
    return activePageId !== null ? [activePageId] : [];
  }

  function addBlankPage(): void {
    const widthPt = Math.max(1, targetWidthMm * MM_TO_PT);
    const heightPt = Math.max(1, targetHeightMm * MM_TO_PT);
    const blank: PdfStudioPage = {
      id: crypto.randomUUID(),
      kind: "blank",
      title: "עמוד ריק",
      widthPt,
      heightPt,
      originalWidthPt: widthPt,
      originalHeightPt: heightPt,
      rotation: 0
    };
    setPages((current) => [...current, blank]);
    setActivePageId(blank.id);
    setSelectedPageIds([blank.id]);
  }

  async function exportPdf(saveToDisk: boolean): Promise<void> {
    if (pages.length === 0) {
      setError("אין עמודים לייצוא");
      return;
    }

    await runBusy("בונה PDF חדש...", async () => {
      const pdfDoc = await PDFDocument.create();
      const loadedSources = new Map<string, PDFDocument>();

      for (const pageEntry of pages) {
        if (pageEntry.kind === "pdf") {
          const source = sources.find((item) => item.id === pageEntry.sourceId);
          if (source === undefined || pageEntry.sourcePageIndex === undefined) continue;
          let sourceDoc = loadedSources.get(source.id);
          if (sourceDoc === undefined) {
            sourceDoc = await PDFDocument.load(source.bytes, { ignoreEncryption: true });
            loadedSources.set(source.id, sourceDoc);
          }
          const [copiedPage] = await pdfDoc.copyPages(sourceDoc, [pageEntry.sourcePageIndex]);
          if (copiedPage !== undefined) {
            applyPageTransform(copiedPage, pageEntry, resizeBehavior);
            pdfDoc.addPage(copiedPage);
          }
        } else if (pageEntry.kind === "image" && pageEntry.imageBytes !== undefined) {
          const page = pdfDoc.addPage([pageEntry.widthPt, pageEntry.heightPt]);
          const image = pageEntry.imageMime?.includes("png")
            ? await pdfDoc.embedPng(pageEntry.imageBytes)
            : await pdfDoc.embedJpg(pageEntry.imageBytes);
          const fit = image.scaleToFit(pageEntry.widthPt, pageEntry.heightPt);
          page.drawImage(image, {
            x: (pageEntry.widthPt - fit.width) / 2,
            y: (pageEntry.heightPt - fit.height) / 2,
            width: fit.width,
            height: fit.height,
            rotate: degrees(pageEntry.rotation)
          });
        } else {
          pdfDoc.addPage([pageEntry.widthPt, pageEntry.heightPt]);
        }
      }

      const bytes = await pdfDoc.save();
      const base64 = uint8ArrayToBase64(bytes);
      if (saveToDisk) {
        if (window.spp?.savePdfDialog === undefined) {
          downloadInBrowser(bytes, "SPP2-PDF-Studio.pdf");
          setStatus("ה-PDF הורד דרך הדפדפן כי שמירה דרך Electron לא זמינה");
          return;
        }
        const result = await window.spp.savePdfDialog(base64, "SPP2-PDF-Studio.pdf");
        if (!result.success) throw new Error(result.error ?? "שמירת PDF נכשלה");
        setStatus(`נשמר: ${result.filePath ?? "PDF"}`);
      } else {
        downloadInBrowser(bytes, "SPP2-PDF-Studio.pdf");
        setStatus("ה-PDF יוצא בהצלחה");
      }
    });
  }

  function clearAll(): void {
    pages.forEach((page) => {
      if (page.imageUrl !== undefined) URL.revokeObjectURL(page.imageUrl);
    });
    setPages([]);
    setSources([]);
    setSelectedPageIds([]);
    setActivePageId(null);
    setStatus("נוקה");
    setError(null);
  }

  async function runBusy(message: string, job: () => Promise<void>): Promise<void> {
    setIsBusy(true);
    setStatus(message);
    setError(null);
    try {
      await job();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  }

  function handlePdfInput(event: ChangeEvent<HTMLInputElement>): void {
    if (event.target.files !== null) void importPdfFiles(event.target.files);
    event.target.value = "";
  }

  function handleImageInput(event: ChangeEvent<HTMLInputElement>): void {
    if (event.target.files !== null) void importImageFiles(event.target.files);
    event.target.value = "";
  }

  function handleOfficeInput(event: ChangeEvent<HTMLInputElement>): void {
    if (event.target.files !== null) void importOfficeFiles(event.target.files);
    event.target.value = "";
  }

  return (
    <main className="pdf-studio-shell" dir="rtl">
      <header className="pdf-studio-topbar">
        <button className="pdf-icon-btn" type="button" onClick={onBackHome} title="חזרה למסך הבית">
          <ArrowRight size={18} />
        </button>
        <div className="pdf-studio-title">
          <strong>PDF Studio</strong>
          <span>סידור, מיזוג, שינוי גודל והמרת קבצים ל-PDF</span>
        </div>
        <div className="pdf-studio-status">
          {isBusy ? <Loader2 className="pdf-spin" size={15} /> : null}
          {status}
        </div>
      </header>

      <section className="pdf-studio-toolbar" aria-label="פעולות PDF">
        <button className="pdf-action primary" onClick={() => pdfInputRef.current?.click()} type="button"><Upload size={16} /> ייבוא PDF</button>
        <button className="pdf-action" onClick={() => imageInputRef.current?.click()} type="button"><ImagePlus size={16} /> תמונות כעמודים</button>
        <button className="pdf-action" onClick={() => officeInputRef.current?.click()} type="button"><FilePlus2 size={16} /> Office ל-PDF</button>
        <button className="pdf-action" onClick={addBlankPage} type="button"><FileText size={16} /> עמוד ריק</button>
        <span className="pdf-toolbar-divider" />
        <button className="pdf-action" disabled={activePage === null} onClick={rotateSelectedPages} type="button"><RotateCw size={16} /> סובב</button>
        <button className="pdf-action" disabled={activePage === null} onClick={duplicateSelectedPages} type="button"><Copy size={16} /> שכפל</button>
        <button className="pdf-action danger" disabled={activePage === null} onClick={deleteSelectedPages} type="button"><Trash2 size={16} /> מחק</button>
        <span className="pdf-toolbar-spacer" />
        <button className="pdf-action" disabled={pages.length === 0 || isBusy} onClick={() => void exportPdf(false)} type="button"><FileDown size={16} /> הורד</button>
        <button className="pdf-action primary" disabled={pages.length === 0 || isBusy} onClick={() => void exportPdf(true)} type="button"><Save size={16} /> שמור PDF</button>
        <button className="pdf-action ghost" disabled={pages.length === 0} onClick={clearAll} type="button"><X size={16} /> נקה</button>
      </section>

      <input ref={pdfInputRef} accept="application/pdf,.pdf" hidden multiple onChange={handlePdfInput} type="file" />
      <input ref={imageInputRef} accept="image/png,image/jpeg,image/jpg,image/webp" hidden multiple onChange={handleImageInput} type="file" />
      <input ref={officeInputRef} accept=".doc,.docx,.ppt,.pptx,.xls,.xlsx,.odt,.ods,.odp" hidden multiple onChange={handleOfficeInput} type="file" />

      {error !== null ? <div className="pdf-error">{error}</div> : null}

      <div className="pdf-studio-layout">
        <aside className="pdf-pages-panel">
          <div className="pdf-panel-heading">
            <strong>עמודים</strong>
            <span>{pages.length} עמודים · {selectedPagesCount} נבחרו</span>
          </div>
          <div className="pdf-page-list">
            {pages.length === 0 ? (
              <div className="pdf-empty-state">
                <FileImage size={34} />
                <strong>אין עדיין עמודים</strong>
                <span>ייבא PDF, תמונות או קובצי Office כדי להתחיל.</span>
              </div>
            ) : pages.map((page, index) => (
              <article
                className={`pdf-page-card ${page.id === activePage?.id ? "active" : ""} ${selectedPageIds.includes(page.id) ? "selected" : ""}`}
                key={page.id}
                onClick={(event) => toggleSelectPage(page.id, event.ctrlKey || event.metaKey)}
              >
                <div className="pdf-page-thumb">
                  {page.kind === "image" && page.imageUrl !== undefined ? <img alt="" src={page.imageUrl} /> : <span>{index + 1}</span>}
                </div>
                <div className="pdf-page-meta">
                  <strong>עמוד {index + 1}</strong>
                  <span>{page.title}</span>
                  <small>{formatMm(page.widthPt)} × {formatMm(page.heightPt)} מ״מ · {page.rotation}°</small>
                </div>
                <div className="pdf-page-move">
                  <button disabled={index === 0} onClick={(event) => { event.stopPropagation(); movePage(page.id, -1); }} type="button">↑</button>
                  <button disabled={index === pages.length - 1} onClick={(event) => { event.stopPropagation(); movePage(page.id, 1); }} type="button">↓</button>
                </div>
              </article>
            ))}
          </div>
        </aside>

        <section className="pdf-preview-panel">
          {activePage === null ? (
            <div className="pdf-preview-empty">
              <Maximize2 size={44} />
              <h2>PDF Studio מוכן</h2>
              <p>הכלי מחובר כמסך עצמאי בתוך SPP2. גרור/ייבא קבצים והתחל לסדר עמודים.</p>
            </div>
          ) : (
            <div className="pdf-preview-page-wrap">
              <div
                className="pdf-preview-page"
                style={{ aspectRatio: `${activePage.widthPt} / ${activePage.heightPt}` }}
              >
                {activePage.kind === "image" && activePage.imageUrl !== undefined ? (
                  <img alt="" src={activePage.imageUrl} style={{ transform: `rotate(${activePage.rotation}deg)` }} />
                ) : (
                  <div className="pdf-preview-placeholder">
                    <FileText size={52} />
                    <strong>{activePage.title}</strong>
                    <span>{formatMm(activePage.widthPt)} × {formatMm(activePage.heightPt)} מ״מ</span>
                    <small>תצוגת תוכן PDF ויזואלית מלאה תתחבר בשלב PDF.js; הייצוא משתמש בעמודי המקור.</small>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <aside className="pdf-settings-panel">
          <div className="pdf-panel-heading">
            <strong>גודל דף</strong>
            <span>לדף נוכחי / נבחרים / הכל</span>
          </div>

          <label className="pdf-field">
            <span>גודל</span>
            <select value={presetId} onChange={(event) => setPresetId(event.target.value)}>
              {PAGE_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
            </select>
          </label>

          <div className="pdf-field-grid">
            <label className="pdf-field">
              <span>רוחב מ״מ</span>
              <input disabled={presetId !== "custom"} min={1} onChange={(event) => setCustomWidthMm(Number(event.target.value))} type="number" value={targetWidthMm} />
            </label>
            <label className="pdf-field">
              <span>גובה מ״מ</span>
              <input disabled={presetId !== "custom"} min={1} onChange={(event) => setCustomHeightMm(Number(event.target.value))} type="number" value={targetHeightMm} />
            </label>
          </div>

          <label className="pdf-field">
            <span>החל על</span>
            <select value={applyScope} onChange={(event) => setApplyScope(event.target.value as ApplyScope)}>
              <option value="current">עמוד נוכחי</option>
              <option value="selected">עמודים נבחרים</option>
              <option value="all">כל העמודים</option>
            </select>
          </label>

          <label className="pdf-field">
            <span>התנהגות תוכן בייצוא</span>
            <select value={resizeBehavior} onChange={(event) => setResizeBehavior(event.target.value as ResizeBehavior)}>
              <option value="fit">התאם פנימה ושמור יחס</option>
              <option value="fill">מלא דף ושמור יחס</option>
              <option value="stretch">מתח לגודל החדש</option>
              <option value="center">מרכז ללא שינוי גודל</option>
            </select>
          </label>

          <button className="pdf-action primary full" disabled={activePage === null} onClick={applyPageSize} type="button">החל גודל דף</button>

          <div className="pdf-info-box">
            <strong>הערה חשובה</strong>
            <span>בגרסה הזו פעולות PDF נשמרות כ-PDF חדש. דפי PDF מקוריים נשארים וקטוריים ככל האפשר; תמונות מוטמעות כעמודים חדשים.</span>
          </div>
        </aside>
      </div>
    </main>
  );
}

function applyPageTransform(page: import("pdf-lib").PDFPage, entry: PdfStudioPage, behavior: ResizeBehavior): void {
  const originalWidth = page.getWidth();
  const originalHeight = page.getHeight();
  const targetWidth = entry.widthPt;
  const targetHeight = entry.heightPt;
  const changed = Math.abs(originalWidth - targetWidth) > 0.01 || Math.abs(originalHeight - targetHeight) > 0.01;

  if (changed) {
    page.setSize(targetWidth, targetHeight);
    const scaleX = targetWidth / originalWidth;
    const scaleY = targetHeight / originalHeight;
    if (behavior === "stretch") {
      page.scaleContent(scaleX, scaleY);
    } else if (behavior === "center") {
      page.translateContent((targetWidth - originalWidth) / 2, (targetHeight - originalHeight) / 2);
    } else {
      const scale = behavior === "fill" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
      page.scaleContent(scale, scale);
      page.translateContent((targetWidth - originalWidth * scale) / 2, (targetHeight - originalHeight * scale) / 2);
    }
  }

  if (entry.rotation !== 0) {
    page.setRotation(degrees(entry.rotation));
  }
}

function readImageSize(file: File): Promise<{ widthPx: number; heightPx: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ widthPx: img.naturalWidth || 1000, heightPx: img.naturalHeight || 1000 });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`לא ניתן לקרוא את ממדי התמונה: ${file.name}`));
    };
    img.src = url;
  });
}

function guessImageMime(name: string): string {
  return name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
}

function getElectronFilePath(file: File): string | undefined {
  return (file as File & { path?: string }).path;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function downloadInBrowser(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatMm(pt: number): string {
  return (pt * PT_TO_MM).toFixed(1);
}
