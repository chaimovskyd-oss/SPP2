import { PDFDocument } from "pdf-lib";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  FileDown,
  FilePlus2,
  FileText,
  ImagePlus,
  Loader2,
  Maximize2,
  Minus,
  Plus,
  Printer,
  RotateCw,
  Save,
  Settings,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { useMemo, useRef, useState, type ChangeEvent, type DragEvent, type MouseEvent, type ReactElement } from "react";
import { buildPdfStudioPdf } from "./pdfStudioExportService";
import { PdfOverlayEditor } from "./PdfOverlayEditor";
import { PdfPagePreview } from "./PdfPagePreview";
import { PdfThumbnail } from "./PdfThumbnail";
import { openPdfStudioPrintPreview } from "./pdfStudioToPrintPreviewAdapter";
import { HEIC_CONVERSION_ERROR_MESSAGE, SUPPORTED_IMAGE_ACCEPT, isSupportedIncomingImageFile, normalizeIncomingImages } from "@/core/image/normalizeIncomingImage";
import {
  DEFAULT_ADJUSTMENTS,
  DEFAULT_RESIZE_BEHAVIOR,
  MM_TO_PT,
  PT_TO_MM,
  type PdfApplyScope,
  type PdfOrientationMode,
  type PdfPageAdjustments,
  type PdfResizeBehavior,
  type PdfStudioDocument,
  type PdfStudioPage,
  type PdfStudioSourceFile,
  type PdfUnit
} from "./pdfStudioTypes";
import "./pdfStudio.css";

type PagePresetId = "a4" | "a5" | "a3" | "10x15" | "13x18" | "15x20" | "20x30" | "custom";

interface PagePreset {
  id: PagePresetId;
  label: string;
  widthMm: number;
  heightMm: number;
}

interface PdfStudioScreenProps {
  onBackHome: () => void;
  initialDocument?: PdfStudioDocument;
}

const PAGE_PRESETS: PagePreset[] = [
  { id: "a4", label: "A4", widthMm: 210, heightMm: 297 },
  { id: "a5", label: "A5", widthMm: 148, heightMm: 210 },
  { id: "a3", label: "A3", widthMm: 297, heightMm: 420 },
  { id: "10x15", label: "10x15", widthMm: 100, heightMm: 150 },
  { id: "13x18", label: "13x18", widthMm: 130, heightMm: 180 },
  { id: "15x20", label: "15x20", widthMm: 150, heightMm: 200 },
  { id: "20x30", label: "20x30", widthMm: 200, heightMm: 300 },
  { id: "custom", label: "מותאם אישית", widthMm: 210, heightMm: 297 }
];

export function PdfStudioScreen({ onBackHome, initialDocument }: PdfStudioScreenProps): ReactElement {
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const officeInputRef = useRef<HTMLInputElement>(null);
  const lastSelectedIndexRef = useRef<number | null>(null);
  const draggedPageIdsRef = useRef<string[]>([]);

  const [documentModel, setDocumentModel] = useState<PdfStudioDocument>(initialDocument ?? {
    id: crypto.randomUUID(),
    title: "PDF Studio",
    files: {},
    pages: [],
    selectedPageIds: []
  });
  const [status, setStatus] = useState("מוכן");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [overlayPage, setOverlayPage] = useState<PdfStudioPage | null>(null);

  const [presetId, setPresetId] = useState<PagePresetId>("a4");
  const [unit, setUnit] = useState<PdfUnit>("mm");
  const [orientation, setOrientation] = useState<PdfOrientationMode>("source");
  const [customWidth, setCustomWidth] = useState(210);
  const [customHeight, setCustomHeight] = useState(297);
  const [applyScope, setApplyScope] = useState<PdfApplyScope>("current");
  const [resizeBehavior, setResizeBehavior] = useState<PdfResizeBehavior>("fit");
  const [libreOfficeStatus, setLibreOfficeStatus] = useState("לא נבדק");

  const activePage = useMemo(
    () => documentModel.pages.find((page) => page.id === documentModel.activePageId) ?? documentModel.pages[0] ?? null,
    [documentModel.activePageId, documentModel.pages]
  );
  const activeSource = activePage?.sourceFileId !== undefined ? documentModel.files[activePage.sourceFileId] : undefined;
  const selectedPreset = PAGE_PRESETS.find((preset) => preset.id === presetId) ?? PAGE_PRESETS[0];
  const targetSizeMm = getTargetSizeMm(selectedPreset, presetId, unit, customWidth, customHeight, orientation);
  const electronAvailable = typeof window.spp !== "undefined";

  async function importPdfFiles(files: FileList | File[], sourceType: PdfStudioSourceFile["sourceType"] = "pdf"): Promise<void> {
    const fileArray = Array.from(files).filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (fileArray.length === 0) return;

    await runBusy(`מייבא ${fileArray.length} קובצי PDF...`, async () => {
      const nextFiles: Record<string, PdfStudioSourceFile> = {};
      const nextPages: PdfStudioPage[] = [];
      for (const file of fileArray) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const source: PdfStudioSourceFile = { id: crypto.randomUUID(), name: file.name, sourceType, bytes };
        nextFiles[source.id] = source;
        const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        pdfDoc.getPages().forEach((page, index) => {
          const { width, height } = page.getSize();
          nextPages.push(createPdfPage(source, index, width, height));
        });
      }
      appendPages(nextPages, nextFiles);
      setStatus(`יובאו ${nextPages.length} עמודים`);
    });
  }

  async function importImageFiles(files: FileList | File[]): Promise<void> {
    const { files: fileArray, failed } = await normalizeIncomingImages(Array.from(files).filter(isSupportedIncomingImageFile));
    if (failed.length > 0) setError(HEIC_CONVERSION_ERROR_MESSAGE);
    if (fileArray.length === 0) return;

    await runBusy(`מוסיף ${fileArray.length} תמונות כעמודים...`, async () => {
      const imagePages: PdfStudioPage[] = [];
      for (const file of fileArray) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const dataUrl = await readFileAsDataUrl(file);
        const size = await readImageSize(dataUrl);
        const widthPt = Math.max(1, size.widthPx * 72 / 300);
        const heightPt = Math.max(1, size.heightPx * 72 / 300);
        imagePages.push({
          id: crypto.randomUUID(),
          sourceType: "image",
          title: file.name,
          imageBytes: bytes,
          imageMime: file.type || guessImageMime(file.name),
          imageDataUrl: dataUrl,
          widthPt,
          heightPt,
          originalWidthPt: widthPt,
          originalHeightPt: heightPt,
          rotation: 0,
          resizeBehavior: DEFAULT_RESIZE_BEHAVIOR,
          overlayObjects: [],
          adjustments: { ...DEFAULT_ADJUSTMENTS },
          flattened: false
        });
      }
      appendPages(imagePages, {});
      setStatus(`נוספו ${imagePages.length} עמודי תמונה`);
    });
  }

  async function importOfficeFiles(files: FileList | File[]): Promise<void> {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    if (!electronAvailable || window.spp.convertOfficeToPdf === undefined) {
      setError("המרת Office זמינה רק בהרצת Electron מלאה.");
      return;
    }

    await runBusy("ממיר קובצי Office ל-PDF דרך LibreOffice...", async () => {
      for (const file of fileArray) {
        const filePath = await getElectronFilePath(file);
        if (filePath === undefined) throw new Error(`לא ניתן לקבל נתיב מקומי עבור ${file.name}.`);
        const result = await window.spp.convertOfficeToPdf!(filePath);
        if (!result.success || result.pdfBase64 === undefined) throw new Error(result.error ?? `המרת ${file.name} נכשלה`);
        const bytes = base64ToUint8Array(result.pdfBase64);
        await appendPdfBytes(bytes, result.outputName ?? `${file.name}.pdf`, "office-converted");
      }
      setStatus("קובצי Office הומרו ונוספו למסמך");
    });
  }

  async function importDroppedFiles(files: File[]): Promise<void> {
    const pdfFiles = files.filter(isPdfFile);
    const imageFiles = files.filter(isSupportedIncomingImageFile);
    const officeFiles = files.filter(isOfficeFile);
    const supportedCount = pdfFiles.length + imageFiles.length + officeFiles.length;
    if (supportedCount === 0) {
      setError("לא נמצאו קבצים נתמכים. אפשר לגרור PDF, תמונות או קובצי Office.");
      return;
    }
    if (pdfFiles.length > 0) await importPdfFiles(pdfFiles);
    if (imageFiles.length > 0) await importImageFiles(imageFiles);
    if (officeFiles.length > 0) await importOfficeFiles(officeFiles);
  }

  function handleStudioDragOver(event: DragEvent<HTMLElement>): void {
    if (event.dataTransfer.types.includes("Files")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  }

  function handleStudioDrop(event: DragEvent<HTMLElement>): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".pdf-page-card") !== null) return;
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files);
    void importDroppedFiles(files);
  }

  async function appendPdfBytes(bytes: Uint8Array, name: string, sourceType: PdfStudioSourceFile["sourceType"]): Promise<void> {
    const source: PdfStudioSourceFile = { id: crypto.randomUUID(), name, sourceType, bytes };
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages().map((page, index) => {
      const { width, height } = page.getSize();
      return createPdfPage(source, index, width, height);
    });
    appendPages(pages, { [source.id]: source });
  }

  function appendPages(pages: PdfStudioPage[], files: Record<string, PdfStudioSourceFile>): void {
    setDocumentModel((current) => {
      const mergedPages = [...current.pages, ...pages];
      return {
        ...current,
        files: { ...current.files, ...files },
        pages: mergedPages,
        activePageId: current.activePageId ?? mergedPages[0]?.id,
        selectedPageIds: current.selectedPageIds.length > 0 ? current.selectedPageIds : mergedPages[0] !== undefined ? [mergedPages[0].id] : []
      };
    });
  }

  function handleSelectPage(pageId: string, index: number, event: MouseEvent<HTMLElement>): void {
    setDocumentModel((current) => {
      let selectedPageIds: string[];
      if (event.shiftKey && lastSelectedIndexRef.current !== null) {
        const start = Math.min(lastSelectedIndexRef.current, index);
        const end = Math.max(lastSelectedIndexRef.current, index);
        selectedPageIds = current.pages.slice(start, end + 1).map((page) => page.id);
      } else if (event.ctrlKey || event.metaKey) {
        selectedPageIds = current.selectedPageIds.includes(pageId)
          ? current.selectedPageIds.filter((id) => id !== pageId)
          : [...current.selectedPageIds, pageId];
      } else {
        selectedPageIds = [pageId];
      }
      lastSelectedIndexRef.current = index;
      return { ...current, activePageId: pageId, selectedPageIds };
    });
  }

  function getActionIds(current: PdfStudioDocument = documentModel): string[] {
    if (current.selectedPageIds.length > 0) return current.selectedPageIds;
    return current.activePageId !== undefined ? [current.activePageId] : [];
  }

  function deletePages(ids = getActionIds()): void {
    if (ids.length === 0) return;
    setDocumentModel((current) => {
      const nextPages = current.pages.filter((page) => !ids.includes(page.id));
      return {
        ...current,
        pages: nextPages,
        selectedPageIds: [],
        activePageId: nextPages[0]?.id
      };
    });
    setStatus(`נמחקו ${ids.length} עמודים`);
  }

  function duplicatePages(ids = getActionIds()): void {
    if (ids.length === 0) return;
    setDocumentModel((current) => {
      const nextPages: PdfStudioPage[] = [];
      current.pages.forEach((page) => {
        nextPages.push(page);
        if (ids.includes(page.id)) {
          nextPages.push({ ...page, id: crypto.randomUUID(), title: `${page.title} · עותק`, overlayObjects: page.overlayObjects.map((object) => ({ ...object, id: crypto.randomUUID() })) });
        }
      });
      return { ...current, pages: nextPages };
    });
    setStatus(`שוכפלו ${ids.length} עמודים`);
  }

  function rotatePages(ids = getActionIds()): void {
    if (ids.length === 0) return;
    setDocumentModel((current) => ({
      ...current,
      pages: current.pages.map((page) => ids.includes(page.id) ? { ...page, rotation: ((page.rotation + 90) % 360) as PdfStudioPage["rotation"] } : page)
    }));
  }

  function moveSelectedToPrompt(ids = getActionIds()): void {
    if (ids.length === 0) return;
    const raw = window.prompt("לאיזה מספר עמוד להעביר?", "1");
    if (raw === null) return;
    const target = Number(raw);
    if (!Number.isFinite(target)) {
      setError("מספר יעד לא תקין.");
      return;
    }
    movePagesToIndex(ids, Math.max(0, Math.min(documentModel.pages.length - ids.length, target - 1)));
  }

  function movePagesToIndex(ids: string[], targetIndex: number): void {
    setDocumentModel((current) => {
      const moving = current.pages.filter((page) => ids.includes(page.id));
      const rest = current.pages.filter((page) => !ids.includes(page.id));
      const safeIndex = Math.max(0, Math.min(rest.length, targetIndex));
      return {
        ...current,
        pages: [...rest.slice(0, safeIndex), ...moving, ...rest.slice(safeIndex)],
        activePageId: moving[0]?.id ?? current.activePageId,
        selectedPageIds: moving.map((page) => page.id)
      };
    });
  }

  function applyPageSize(): void {
    const ids = getTargetPageIds();
    if (ids.length === 0) return;
    const widthPt = Math.max(1, targetSizeMm.widthMm * MM_TO_PT);
    const heightPt = Math.max(1, targetSizeMm.heightMm * MM_TO_PT);
    setDocumentModel((current) => ({
      ...current,
      pages: current.pages.map((page) => ids.includes(page.id) ? { ...page, widthPt, heightPt, resizeBehavior } : page)
    }));
    setStatus(`גודל הדף עודכן ל-${targetSizeMm.widthMm.toFixed(1)} x ${targetSizeMm.heightMm.toFixed(1)} מ״מ`);
  }

  function getTargetPageIds(): string[] {
    if (applyScope === "all") return documentModel.pages.map((page) => page.id);
    if (applyScope === "selected") return documentModel.selectedPageIds;
    if (applyScope === "from-current") {
      const activeIndex = documentModel.pages.findIndex((page) => page.id === activePage?.id);
      return activeIndex >= 0 ? documentModel.pages.slice(activeIndex).map((page) => page.id) : [];
    }
    return activePage !== null ? [activePage.id] : [];
  }

  function addBlankPage(): void {
    const widthPt = targetSizeMm.widthMm * MM_TO_PT;
    const heightPt = targetSizeMm.heightMm * MM_TO_PT;
    const blank: PdfStudioPage = {
      id: crypto.randomUUID(),
      sourceType: "blank",
      title: "עמוד ריק",
      widthPt,
      heightPt,
      originalWidthPt: widthPt,
      originalHeightPt: heightPt,
      rotation: 0,
      resizeBehavior,
      overlayObjects: [],
      adjustments: { ...DEFAULT_ADJUSTMENTS },
      flattened: false
    };
    appendPages([blank], {});
  }

  function updateActiveAdjustments(next: PdfPageAdjustments): void {
    if (activePage === null) return;
    if ((activePage.sourceType === "pdf" || activePage.sourceType === "office-converted") && !activePage.flattened) {
      const approved = window.confirm("עריכת בהירות/קונטרסט לעמוד PDF תשטח את העמוד לתמונה באותו עמוד. להמשיך?");
      if (!approved) return;
    }
    setDocumentModel((current) => ({
      ...current,
      pages: current.pages.map((page) => page.id === activePage.id ? { ...page, adjustments: next, flattened: page.sourceType !== "image" } : page)
    }));
  }

  async function exportPdf(saveToDisk: boolean): Promise<void> {
    if (documentModel.pages.length === 0) {
      setError("אין עמודים לייצוא.");
      return;
    }
    await runBusy("בונה PDF חדש...", async () => {
      const bytes = await buildPdfStudioPdf(documentModel);
      const base64 = uint8ArrayToBase64(bytes);
      if (saveToDisk && window.spp?.savePdfDialog !== undefined) {
        const result = await window.spp.savePdfDialog(base64, "SPP2-PDF-Studio.pdf");
        if (!result.success) throw new Error(result.error ?? "שמירת PDF נכשלה.");
        setStatus(`נשמר: ${result.filePath ?? "PDF"}`);
      } else {
        downloadInBrowser(bytes, "SPP2-PDF-Studio.pdf");
        setStatus(saveToDisk ? "שמירה דרך Electron לא זמינה, הקובץ הורד דרך הדפדפן." : "ה-PDF יוצא בהצלחה.");
      }
    });
  }

  async function openPrintPreview(): Promise<void> {
    if (!electronAvailable) {
      setError("תצוגת הדפסה זמינה רק בהרצת Electron.");
      return;
    }
    await runBusy("מכין תצוגת הדפסה...", async () => {
      const result = await openPdfStudioPrintPreview(documentModel);
      if (!result.success) throw new Error(result.error ?? "פתיחת Print Preview נכשלה.");
      setStatus("תצוגת ההדפסה נפתחה");
    });
  }

  async function openSeparatePdfStudioWindow(): Promise<void> {
    if (window.spp?.openModeWindow === undefined && window.spp?.openPdfStudioWindow === undefined) {
      setError("פתיחת PDF Studio בחלון נפרד זמינה רק בהרצת Electron.");
      return;
    }
    const result = window.spp.openModeWindow !== undefined
      ? await window.spp.openModeWindow({
          mode: "pdf-studio",
          title: "SPP2-PDF EDITOR",
          snapshot: { pdfStudioDocument: documentModel }
        })
      : await window.spp.openPdfStudioWindow!();
    if (!result.success) setError(result.error ?? "פתיחת חלון PDF Studio נכשלה.");
  }

  async function checkLibreOffice(): Promise<void> {
    if (window.spp?.checkLibreOffice === undefined) {
      setLibreOfficeStatus("זמין רק ב-Electron");
      return;
    }
    const result = await window.spp.checkLibreOffice();
    setLibreOfficeStatus(result.found ? `נמצא: ${result.path}` : `לא נמצא: ${result.error ?? ""}`);
  }

  async function chooseLibreOffice(): Promise<void> {
    if (window.spp?.chooseLibreOfficePath === undefined) {
      setError("בחירת LibreOffice זמינה רק בהרצת Electron.");
      return;
    }
    const result = await window.spp.chooseLibreOfficePath();
    if (result.success) setLibreOfficeStatus(`נבחר: ${result.path}`);
    else if (result.error !== undefined) setError(result.error);
  }

  function clearAll(): void {
    setDocumentModel({ id: crypto.randomUUID(), title: "PDF Studio", files: {}, pages: [], selectedPageIds: [] });
    setError(null);
    setStatus("נוקה");
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

  return (
    <main className="pdf-studio-shell" dir="rtl" onDragOver={handleStudioDragOver} onDrop={handleStudioDrop}>
      <header className="pdf-studio-topbar">
        <button className="pdf-icon-btn" type="button" onClick={onBackHome} title="חזרה למסך הבית"><ArrowRight size={18} /></button>
        <div className="pdf-studio-title">
          <strong>PDF Studio</strong>
          <span>ארגון, הכנה להדפסה, המרת Office ועריכת שכבות מעל PDF</span>
        </div>
        <div className="pdf-studio-status">{isBusy ? <Loader2 className="pdf-spin" size={15} /> : <CheckCircle2 size={15} />}{status}</div>
      </header>

      <section className="pdf-studio-toolbar" aria-label="פעולות PDF">
        <button className="pdf-action primary" onClick={() => pdfInputRef.current?.click()} type="button"><Upload size={16} /> פתח PDF</button>
        <button className="pdf-action" onClick={() => imageInputRef.current?.click()} type="button"><ImagePlus size={16} /> הוסף תמונות</button>
        <button className="pdf-action" onClick={() => officeInputRef.current?.click()} type="button"><FilePlus2 size={16} /> הוסף Office</button>
        <button className="pdf-action" onClick={addBlankPage} type="button"><FileText size={16} /> עמוד ריק</button>
        <span className="pdf-toolbar-divider" />
        <button className="pdf-action" disabled={activePage === null} onClick={() => rotatePages()} type="button"><RotateCw size={16} /> סובב</button>
        <button className="pdf-action" disabled={activePage === null} onClick={() => duplicatePages()} type="button"><Copy size={16} /> שכפל</button>
        <button className="pdf-action" disabled={activePage === null} onClick={() => moveSelectedToPrompt()} type="button"><FileText size={16} /> העבר אל...</button>
        <button className="pdf-action danger" disabled={activePage === null} onClick={() => deletePages()} type="button"><Trash2 size={16} /> מחק</button>
        <button className="pdf-action" disabled={documentModel.pages.length === 0} onClick={() => setDocumentModel((current) => ({ ...current, selectedPageIds: current.pages.map((page) => page.id) }))} type="button">בחר הכל</button>
        <span className="pdf-toolbar-spacer" />
        <button className="pdf-action" disabled={documentModel.pages.length === 0 || isBusy} onClick={() => void exportPdf(false)} type="button"><FileDown size={16} /> ייצוא PDF</button>
        <button className="pdf-action primary" disabled={documentModel.pages.length === 0 || isBusy} onClick={() => void exportPdf(true)} type="button"><Save size={16} /> שמור PDF</button>
        <button className="pdf-action primary" disabled={documentModel.pages.length === 0 || isBusy} onClick={() => void openPrintPreview()} type="button"><Printer size={16} /> הדפס / תצוגת הדפסה</button>
        <button className="pdf-action" onClick={() => void openSeparatePdfStudioWindow()} type="button">פתח בחלון נפרד</button>
        <button className="pdf-action ghost" disabled={documentModel.pages.length === 0} onClick={clearAll} type="button"><X size={16} /> נקה</button>
      </section>

      <input ref={pdfInputRef} accept="application/pdf,.pdf" hidden multiple onChange={(event) => { if (event.target.files !== null) void importPdfFiles(event.target.files); event.target.value = ""; }} type="file" />
      <input ref={imageInputRef} accept={SUPPORTED_IMAGE_ACCEPT} hidden multiple onChange={(event) => { if (event.target.files !== null) void importImageFiles(event.target.files); event.target.value = ""; }} type="file" />
      <input ref={officeInputRef} accept=".doc,.docx,.ppt,.pptx,.xls,.xlsx,.odt,.ods,.odp" hidden multiple onChange={(event) => { if (event.target.files !== null) void importOfficeFiles(event.target.files); event.target.value = ""; }} type="file" />

      {!electronAvailable ? <div className="pdf-warning">חלק מפעולות הקבצים זמינות רק בהרצת Electron מלאה. התצוגה והייצוא בדפדפן עדיין יעבדו.</div> : null}
      {error !== null ? <div className="pdf-error">{error}</div> : null}

      <div className="pdf-studio-layout">
        <aside className="pdf-pages-panel">
          <div className="pdf-panel-heading">
            <strong>עמודים</strong>
            <span>{documentModel.pages.length} עמודים · {documentModel.selectedPageIds.length} נבחרו</span>
          </div>
          <div className="pdf-page-list">
            {documentModel.pages.length === 0 ? (
              <div className="pdf-empty-state"><FileText size={34} /><strong>אין עדיין עמודים</strong><span>ייבא קובץ כדי להתחיל.</span></div>
            ) : documentModel.pages.map((page, index) => (
              <PdfThumbnail
                key={page.id}
                page={page}
                source={page.sourceFileId !== undefined ? documentModel.files[page.sourceFileId] : undefined}
                index={index}
                active={page.id === activePage?.id}
                selected={documentModel.selectedPageIds.includes(page.id)}
                draggable
                onSelect={(event) => handleSelectPage(page.id, index, event)}
                onDelete={() => deletePages([page.id])}
                onDuplicate={() => duplicatePages([page.id])}
                onRotate={() => rotatePages([page.id])}
                onMoveRequest={() => moveSelectedToPrompt([page.id])}
                onDragStart={() => { draggedPageIdsRef.current = documentModel.selectedPageIds.includes(page.id) ? documentModel.selectedPageIds : [page.id]; }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => movePagesToIndex(draggedPageIdsRef.current, index)}
              />
            ))}
          </div>
        </aside>

        <section className="pdf-preview-panel">
          <div className="pdf-preview-controls">
            <button type="button" onClick={() => setZoom((current) => Math.max(0.35, current - 0.15))}><Minus size={15} /></button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((current) => Math.min(2.5, current + 0.15))}><Plus size={15} /></button>
            <button type="button" onClick={() => setZoom(1)}><Maximize2 size={15} /> התאמה</button>
          </div>
          <PdfPagePreview page={activePage} source={activeSource} zoom={zoom} />
        </section>

        <aside className="pdf-settings-panel">
          <div className="pdf-panel-heading"><strong>פעולות עמוד</strong><span>{activePage !== null ? formatPageSize(activePage) : "אין עמוד פעיל"}</span></div>
          <button className="pdf-action primary full" disabled={activePage === null} type="button" onClick={() => activePage !== null && setOverlayPage(activePage)}><Settings size={16} /> עריכה על העמוד</button>

          <div className="pdf-panel-heading compact"><strong>גודל דף</strong><span>Custom פותח רוחב/גובה</span></div>
          <label className="pdf-field"><span>גודל</span><select value={presetId} onChange={(event) => setPresetId(event.target.value as PagePresetId)}>{PAGE_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
          <label className="pdf-field"><span>יחידות</span><select value={unit} onChange={(event) => setUnit(event.target.value as PdfUnit)}><option value="mm">מ״מ</option><option value="cm">ס״מ</option><option value="in">אינץ׳</option></select></label>
          <label className="pdf-field"><span>כיוון</span><select value={orientation} onChange={(event) => setOrientation(event.target.value as PdfOrientationMode)}><option value="source">שמור לפי המקור</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
          <div className="pdf-field-grid">
            <label className="pdf-field"><span>רוחב</span><input disabled={presetId !== "custom"} min={1} type="number" value={customWidth} onChange={(event) => setCustomWidth(Number(event.target.value))} /></label>
            <label className="pdf-field"><span>גובה</span><input disabled={presetId !== "custom"} min={1} type="number" value={customHeight} onChange={(event) => setCustomHeight(Number(event.target.value))} /></label>
          </div>
          <label className="pdf-field"><span>החל על</span><select value={applyScope} onChange={(event) => setApplyScope(event.target.value as PdfApplyScope)}><option value="current">עמוד נוכחי</option><option value="selected">עמודים נבחרים</option><option value="all">כל העמודים</option><option value="from-current">מהעמוד הנוכחי והלאה</option></select></label>
          <label className="pdf-field"><span>התנהגות תוכן</span><select value={resizeBehavior} onChange={(event) => setResizeBehavior(event.target.value as PdfResizeBehavior)}><option value="fit">Fit proportionally</option><option value="fill">Fill / Crop</option><option value="stretch">Stretch</option><option value="center">Center no scale</option><option value="fit-width">Fit width</option><option value="fit-height">Fit height</option></select></label>
          <button className="pdf-action primary full" disabled={activePage === null} onClick={applyPageSize} type="button">החל גודל דף</button>

          <div className="pdf-panel-heading compact"><strong>Adjust</strong><span>לעמוד הפעיל</span></div>
          <AdjustmentControls page={activePage} onChange={updateActiveAdjustments} />

          <div className="pdf-panel-heading compact"><strong>LibreOffice</strong><span>{libreOfficeStatus}</span></div>
          <div className="pdf-button-row">
            <button className="pdf-action" type="button" onClick={() => void checkLibreOffice()}>בדוק LibreOffice</button>
            <button className="pdf-action" type="button" onClick={() => void chooseLibreOffice()}>בחר נתיב</button>
          </div>

          <div className="pdf-info-box"><strong>OCR</strong><span>זיהוי טקסט יתווסף בהמשך. כרגע המיקוד הוא Organizer/Print Prep יציב.</span></div>
        </aside>
      </div>

      {overlayPage !== null ? (
        <PdfOverlayEditor
          page={overlayPage}
          source={overlayPage.sourceFileId !== undefined ? documentModel.files[overlayPage.sourceFileId] : undefined}
          onCancel={() => setOverlayPage(null)}
          onDone={(objects) => {
            setDocumentModel((current) => ({ ...current, pages: current.pages.map((page) => page.id === overlayPage.id ? { ...page, overlayObjects: objects } : page) }));
            setOverlayPage(null);
          }}
        />
      ) : null}
    </main>
  );
}

function AdjustmentControls({ page, onChange }: { page: PdfStudioPage | null; onChange: (adjustments: PdfPageAdjustments) => void }): ReactElement {
  const adjustments = page?.adjustments ?? DEFAULT_ADJUSTMENTS;
  return (
    <div className="pdf-adjustments">
      <label><span>בהירות</span><input disabled={page === null} min={-50} max={50} type="range" value={adjustments.brightness} onChange={(event) => onChange({ ...adjustments, brightness: Number(event.target.value) })} /></label>
      <label><span>קונטרסט</span><input disabled={page === null} min={-40} max={60} type="range" value={adjustments.contrast} onChange={(event) => onChange({ ...adjustments, contrast: Number(event.target.value) })} /></label>
      <label><span>רוויה</span><input disabled={page === null} min={-60} max={60} type="range" value={adjustments.saturation} onChange={(event) => onChange({ ...adjustments, saturation: Number(event.target.value) })} /></label>
      <label className="pdf-checkbox"><input disabled={page === null} checked={adjustments.grayscale} type="checkbox" onChange={(event) => onChange({ ...adjustments, grayscale: event.target.checked })} /> שחור־לבן</label>
      <button className="pdf-action full" disabled={page === null} type="button" onClick={() => onChange({ ...DEFAULT_ADJUSTMENTS })}>Reset</button>
    </div>
  );
}

function createPdfPage(source: PdfStudioSourceFile, index: number, width: number, height: number): PdfStudioPage {
  return {
    id: crypto.randomUUID(),
    sourceType: source.sourceType,
    title: `${source.name} · עמוד ${index + 1}`,
    sourceFileId: source.id,
    sourcePageIndex: index,
    widthPt: width,
    heightPt: height,
    originalWidthPt: width,
    originalHeightPt: height,
    rotation: 0,
    resizeBehavior: DEFAULT_RESIZE_BEHAVIOR,
    overlayObjects: [],
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    flattened: false
  };
}

function getTargetSizeMm(preset: PagePreset, presetId: PagePresetId, unit: PdfUnit, customWidth: number, customHeight: number, orientation: PdfOrientationMode): { widthMm: number; heightMm: number } {
  const factor = unit === "cm" ? 10 : unit === "in" ? 25.4 : 1;
  let widthMm = presetId === "custom" ? customWidth * factor : preset.widthMm;
  let heightMm = presetId === "custom" ? customHeight * factor : preset.heightMm;
  if (orientation === "portrait" && widthMm > heightMm) [widthMm, heightMm] = [heightMm, widthMm];
  if (orientation === "landscape" && heightMm > widthMm) [widthMm, heightMm] = [heightMm, widthMm];
  return { widthMm, heightMm };
}

function formatPageSize(page: PdfStudioPage): string {
  return `${(page.widthPt * PT_TO_MM).toFixed(1)} x ${(page.heightPt * PT_TO_MM).toFixed(1)} מ״מ`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("קריאת הקובץ נכשלה."));
    reader.readAsDataURL(file);
  });
}

function readImageSize(dataUrl: string): Promise<{ widthPx: number; heightPx: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ widthPx: image.naturalWidth || 1000, heightPx: image.naturalHeight || 1000 });
    image.onerror = () => reject(new Error("לא ניתן לקרוא את ממדי התמונה."));
    image.src = dataUrl;
  });
}

function guessImageMime(name: string): string {
  return name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isOfficeFile(file: File): boolean {
  return /\.(doc|docx|ppt|pptx|xls|xlsx|odt|odp|ods)$/i.test(file.name);
}

async function getElectronFilePath(file: File): Promise<string | undefined> {
  if (window.spp?.getFilePath !== undefined) return window.spp.getFilePath(file);
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
