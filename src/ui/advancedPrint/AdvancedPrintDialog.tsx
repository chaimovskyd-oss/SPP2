import { FileText, FlaskConical, Printer, Settings2, TestTube2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";

import { computePrintLayout } from "@/core/advancedPrint/pageGeometry";
import { runPreflight } from "@/core/advancedPrint/preflight";
import { resolveColor } from "@/core/advancedPrint/colorManagement";
import { buildTestPageDescriptor, renderTestPagePng } from "@/core/advancedPrint/testPage";
import { recommendForProduct, type ProductKind } from "@/core/advancedPrint/productProfileLink";
import { createDefaultProfile, scaleOutputPreset } from "@/core/advancedPrint/builtInPresets";
import { parsePageRange } from "@/ui/print/printRangeUtils";
import {
  detectMixedSizes,
  executeAdvancedPrint,
  type AdvancedPrintRequest,
  type PageMeta,
  type RenderedPage,
  type RenderPageFn
} from "@/services/advancedPrintService";
import type {
  AdvancedPrinterProfile,
  ColorManagementMode,
  DriverState,
  EdgeInsetsMm,
  PrinterCapabilities,
  ScalingMode
} from "@/types/advancedPrint";
import { AdvancedPrintPreview } from "./AdvancedPrintPreview";
import { PreflightSummary } from "./PreflightSummary";
import { OutputPresetPanel } from "./OutputPresetPanel";
import { ProfileCreationWizard } from "./ProfileCreationWizard";
import { useAdvancedPrintSettings } from "./useAdvancedPrintProfiles";
import "./advancedPrint.css";

interface AdvancedPrintDialogProps {
  /** Cheap per-page metadata for ALL document pages (no render). */
  pagesMeta: PageMeta[];
  /** The editor's active page index (the default "current page" target). */
  currentPageIndex: number;
  /** Optional preselected indices (e.g. from the print range dialog). */
  initialSelection?: number[] | null;
  /** Lazily renders a page (preview or full). */
  renderPage: RenderPageFn;
  documentName?: string;
  productKind?: ProductKind;
  onClose: () => void;
}

type PageSelectionMode = "current" | "all" | "range";

function indicesToRangeText(indices: number[]): string {
  return indices.map((i) => i + 1).join(",");
}

const SCALING_LABELS: Array<{ mode: ScalingMode; label: string }> = [
  { mode: "fit-to-page", label: "התאמה לדף" },
  { mode: "fill-page", label: "מילוי דף" },
  { mode: "actual-size", label: "100%" },
  { mode: "custom-percent", label: "אחוז מותאם" }
];

const COLOR_SUMMARY: Record<string, string> = {
  "app-manages-color": "SPP מנהלת צבע (ICC) — כבה תיקון צבע בדרייבר",
  "printer-manages-color": "המדפסת מנהלת צבע",
  none: "ללא ניהול צבע"
};

export function AdvancedPrintDialog({ pagesMeta, currentPageIndex, initialSelection, renderPage, productKind, onClose }: AdvancedPrintDialogProps): ReactElement {
  const { settings, upsertProfile, setDefaultProfile, duplicatePreset, resetPreset } = useAdvancedPrintSettings();
  const [advanced, setAdvanced] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [driver, setDriver] = useState<DriverState>({ printerExists: true, devmodeApplied: true });
  const [iccProfiles, setIccProfiles] = useState<Array<{ name: string; path: string }>>([]);
  const [driverInfo, setDriverInfo] = useState<{ paperName: string; paperWidthMm: number; paperHeightMm: number; orientation: string; sourceName: string } | null>(null);
  const [printableMargins, setPrintableMargins] = useState<EdgeInsetsMm | null>(null);
  const [colorAfterUrl, setColorAfterUrl] = useState<string | null>(null);
  const [colorBusy, setColorBusy] = useState(false);
  const [showColor, setShowColor] = useState(false);

  // Page selection (which pages to print): current / all / range.
  const totalPages = pagesMeta.length;
  const [selMode, setSelMode] = useState<PageSelectionMode>(
    initialSelection && initialSelection.length > 0 && !(initialSelection.length === 1 && initialSelection[0] === currentPageIndex)
      ? "range"
      : "current"
  );
  const [rangeText, setRangeText] = useState(
    initialSelection && initialSelection.length > 0 ? indicesToRangeText(initialSelection) : ""
  );
  const rangeParse = useMemo(() => parsePageRange(rangeText, totalPages), [rangeText, totalPages]);
  const printIndices = useMemo(() => {
    if (selMode === "all") return pagesMeta.map((m) => m.index);
    if (selMode === "range") return rangeParse.error ? [] : rangeParse.indices;
    return [Math.max(0, Math.min(currentPageIndex, totalPages - 1))];
  }, [selMode, rangeParse, pagesMeta, currentPageIndex, totalPages]);

  // Lazy per-page preview: render only the page being viewed, cached by index.
  const [previewPos, setPreviewPos] = useState(0); // position within printIndices
  const [currentRendered, setCurrentRendered] = useState<RenderedPage | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const previewCache = useRef<Map<number, RenderedPage>>(new Map());
  const previewPageIndex = printIndices[previewPos] ?? printIndices[0];
  const thumbnailUrl = currentRendered?.dataUrl;
  const selectedMeta = useMemo(() => pagesMeta.filter((m) => printIndices.includes(m.index)), [pagesMeta, printIndices]);
  const mixedSizes = useMemo(() => detectMixedSizes(selectedMeta), [selectedMeta]);

  // Keep the preview position valid when the selection changes.
  useEffect(() => {
    setPreviewPos((p) => (p >= printIndices.length ? 0 : p));
  }, [printIndices.length]);

  // Working profile (a live-editable copy so page-setup changes recompute the layout instantly).
  const recommendation = useMemo(
    () => recommendForProduct(productKind ?? "unknown", settings.profiles, settings.outputPresets),
    [productKind, settings.profiles, settings.outputPresets]
  );
  const initialProfileId = recommendation.profileId ?? settings.defaultProfileId ?? settings.profiles[0]?.id ?? "";

  // Two ways to drive printing:
  //  - useProfile = true  → pick a saved profile; its settings load and are saved back on print.
  //  - useProfile = false → manual: just pick an installed printer and configure ad-hoc (not saved).
  const [installedPrinters, setInstalledPrinters] = useState<string[]>([]);
  const [useProfile, setUseProfile] = useState<boolean>(Boolean(initialProfileId));
  const [profileId, setProfileId] = useState(initialProfileId);
  const [manualPrinter, setManualPrinter] = useState<string>("");
  const baseProfile = settings.profiles.find((p) => p.id === profileId);
  const [working, setWorking] = useState<AdvancedPrinterProfile | undefined>(baseProfile);

  const [presetId, setPresetId] = useState<string | undefined>(
    baseProfile?.outputPresetId ?? recommendation.outputPresetId
  );
  const [presetStrength, setPresetStrength] = useState(1);

  // Rebuild the working profile whenever the mode / selected profile / manual printer changes.
  useEffect(() => {
    if (useProfile) {
      const p = settings.profiles.find((pr) => pr.id === profileId);
      setWorking(p ? { ...p } : undefined);
      if (p?.outputPresetId) setPresetId(p.outputPresetId);
    } else {
      setWorking(manualPrinter ? createDefaultProfile(manualPrinter) : undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useProfile, profileId, manualPrinter]);

  // Load installed printers + the real ICC profiles installed on the machine.
  useEffect(() => {
    void (async () => {
      try {
        const list = await window.spp?.advancedPrint?.listPrinters();
        if (list?.printers?.length) {
          setInstalledPrinters(list.printers);
          // Default the manual printer to the profile's printer, else the first installed one.
          setManualPrinter((prev) => prev || baseProfile?.windowsPrinterName || list.printers[0]);
        }
      } catch { /* worker unavailable */ }
      try {
        const res = await window.spp?.advancedPrint?.listIccProfiles();
        if (res?.profiles) setIccProfiles(res.profiles);
      } catch { /* worker unavailable */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Probe worker / driver state for preflight.
  useEffect(() => {
    void (async () => {
      if (!working) return;
      try {
        const health = await window.spp?.advancedPrint?.health();
        const list = await window.spp?.advancedPrint?.listPrinters();
        const exists = Boolean(list?.printers?.includes(working.windowsPrinterName));
        setDriver({ printerExists: exists || !health?.available, devmodeApplied: true });
      } catch {
        setDriver({ printerExists: true, devmodeApplied: true });
      }
    })();
  }, [working]);

  // Query the printer's REAL printable area (hardware margins) for the current paper/DEVMODE,
  // so "scale to fit" fits the design inside what the printer can actually print.
  const printerName = working?.windowsPrinterName;
  const devmodeBase64 = working?.devmode.base64;
  const paperName = working?.printerPaper.name;
  useEffect(() => {
    if (!printerName) { setPrintableMargins(null); return; }
    let cancelled = false;
    void (async () => {
      try {
        const res = await window.spp?.advancedPrint?.getPrintableArea(printerName, devmodeBase64);
        if (cancelled) return;
        setPrintableMargins(res?.available && res.marginsMm ? res.marginsMm : null);
      } catch {
        if (!cancelled) setPrintableMargins(null);
      }
    })();
    return () => { cancelled = true; };
  }, [printerName, devmodeBase64, paperName]);

  // Lazily render the page currently being previewed (cached by index). Kept in a ref so a new
  // renderPage identity from the parent doesn't retrigger renders on every re-render.
  const renderPageRef = useRef(renderPage);
  renderPageRef.current = renderPage;
  useEffect(() => {
    const idx = previewPageIndex;
    if (idx === undefined) { setCurrentRendered(null); return; }
    const cached = previewCache.current.get(idx);
    if (cached) { setCurrentRendered(cached); return; }
    let cancelled = false;
    setPreviewBusy(true);
    void (async () => {
      try {
        const page = await renderPageRef.current(idx, { preview: true });
        if (cancelled || !page) return;
        previewCache.current.set(idx, page);
        setCurrentRendered(page);
      } finally {
        if (!cancelled) setPreviewBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [previewPageIndex]);

  const layout = useMemo(() => {
    if (!working || !currentRendered) return null;
    // Feed the real printable area in as the driver printable-area for this paper, so
    // computePrintLayout's fit/fill/placement honor the hardware margins.
    const caps = printableMargins
      ? ({ printableAreaByPaper: { [working.printerPaper.name]: printableMargins } } as unknown as PrinterCapabilities)
      : undefined;
    return computePrintLayout(currentRendered.rendered, working, caps);
  }, [working, currentRendered, printableMargins]);

  const selectedOutputPreset = settings.outputPresets.find((p) => p.id === presetId);
  const outputPreset = useMemo(
    () => scaleOutputPreset(selectedOutputPreset, presetStrength),
    [selectedOutputPreset, presetStrength]
  );

  // Any change to the color base or the preset invalidates a previously generated color preview.
  useEffect(() => {
    setColorAfterUrl(null);
  }, [working?.color.mode, working?.color.iccProfileId, working?.color.renderingIntent, working?.color.blackPointCompensation, presetId, presetStrength]);

  // When "show color" is on but we have no (fresh) preview, generate it in the background.
  useEffect(() => {
    if (showColor && !colorAfterUrl && !colorBusy && working && thumbnailUrl) void handleColorPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showColor, colorAfterUrl]);
  const report = useMemo(() => {
    if (!layout || !working) return null;
    const base = runPreflight({ layout, profile: working, driver, outputPreset });
    if (mixedSizes) {
      return {
        ...base,
        clean: false,
        warnings: [
          ...base.warnings,
          {
            code: "physical-size-mismatch" as const,
            severity: "warning" as const,
            message: "העמודים בגדלים שונים — ייתכן שהגדרת הנייר/קנה המידה לא תתאים לכולם.",
            hint: "בדוק כל עמוד בתצוגה, או הדפס בקבוצות לפי גודל."
          }
        ]
      };
    }
    return base;
  }, [layout, working, driver, outputPreset, mixedSizes]);

  const summaryLines = useMemo(() => {
    if (!layout || !working) return [];
    const color = resolveColor(working, outputPreset);
    const lines = [
      `נייר: ${working.printerPaper.name} (${Math.round(layout.printerPaperMm.widthMm)}×${Math.round(layout.printerPaperMm.heightMm)} מ"מ)`,
      `מידת הדפסה סופית: ${Math.round(layout.printSizeMm.widthMm)}×${Math.round(layout.printSizeMm.heightMm)} מ"מ · קנה מידה ${Math.round(layout.scalePercent)}%`,
      `כיוון: ${layout.resolvedOrientation === "landscape" ? "לרוחב" : "לאורך"} · DPI: ${layout.dpi}`,
      `צבע: ${COLOR_SUMMARY[color.mode]}`
    ];
    if (printableMargins) {
      lines.splice(1, 0, `אזור הדפסה (שוליי מדפסת): ${Math.round(layout.printableAreaMm.widthMm)}×${Math.round(layout.printableAreaMm.heightMm)} מ"מ · שוליים ${printableMargins.leftMm.toFixed(1)}/${printableMargins.topMm.toFixed(1)}/${printableMargins.rightMm.toFixed(1)}/${printableMargins.bottomMm.toFixed(1)}`);
    }
    return lines;
  }, [layout, working, outputPreset, printableMargins]);

  function patchWorking(patch: Partial<AdvancedPrinterProfile>): void {
    setWorking((w) => (w ? { ...w, ...patch } : w));
  }

  async function handleTestPage(): Promise<void> {
    if (!working || !layout) return;
    setBusy(true);
    setStatusMsg("מכין דף בדיקה…");
    try {
      const descriptor = buildTestPageDescriptor(layout, working);
      const png = renderTestPagePng(descriptor);
      const tmp = await window.spp?.advancedPrint?.writeTempImage(png, "png");
      if (tmp?.path) {
        const res = await window.spp?.advancedPrint?.testPage({
          printerName: working.windowsPrinterName,
          imagePath: tmp.path,
          devmodeBase64: working.devmode.base64 ?? null,
          paperWidthMm: layout.printerPaperMm.widthMm,
          paperHeightMm: layout.printerPaperMm.heightMm,
          placementXmm: 0,
          placementYmm: 0,
          placementWidthMm: layout.printerPaperMm.widthMm,
          placementHeightMm: layout.printerPaperMm.heightMm,
          copies: 1
        });
        const d = res?.diagnostics;
        if (d) {
          setStatusMsg(
            `דף הבדיקה נשלח. נייר במדפסת בפועל: ${Math.round(d.devicePaperWidthMm)}×${Math.round(d.devicePaperHeightMm)} מ"מ · ` +
            `שוליי חומרה: ${d.hardMarginLeftMm.toFixed(1)}/${d.hardMarginTopMm.toFixed(1)} מ"מ` +
            (d.paperMismatch ? ` · ⚠ אי-התאמה לעיצוב (${Math.round(d.jobPaperWidthMm)}×${Math.round(d.jobPaperHeightMm)})` : "")
          );
        } else {
          setStatusMsg("דף הבדיקה נשלח. בדוק מגש, כיוון, ושוליים.");
        }
      }
    } catch (err) {
      setStatusMsg("שגיאה בדף הבדיקה: " + String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenDriver(): Promise<void> {
    if (!working) return;
    // Seed the dialog with the profile's last saved DEVMODE so it reopens on the user's previous
    // choices (paper/tray/borderless) instead of resetting to the driver default.
    const res = await window.spp?.advancedPrint?.openDriverDialog(working.windowsPrinterName, working.devmode.base64);
    if (!res || res.cancelled || !res.devmodeBase64) return;

    // The driver owns paper/orientation/tray — apply what it chose directly to the working profile
    // so the preview and print settings reflect it immediately.
    const patch: Partial<AdvancedPrinterProfile> = {
      devmode: { base64: res.devmodeBase64, capturedForPrinter: working.windowsPrinterName, driverVersion: res.driverVersion, capturedAt: new Date().toISOString() },
      engine: "windows-native"
    };
    if ((res.paperWidthMm ?? 0) > 0 && (res.paperHeightMm ?? 0) > 0) {
      patch.printerPaper = {
        name: res.paperName || working.printerPaper.name,
        widthMm: res.paperWidthMm as number,
        heightMm: res.paperHeightMm as number,
        custom: false
      };
    }
    if (res.sourceName) {
      patch.traySource = { ...working.traySource, label: res.sourceName, verified: true };
    }
    if (res.orientation === "landscape") patch.orientationPolicy = "force-landscape";
    else if (res.orientation === "portrait") patch.orientationPolicy = "force-portrait";

    patchWorking(patch);
    setDriverInfo({
      paperName: res.paperName || (patch.printerPaper?.name ?? working.printerPaper.name),
      paperWidthMm: res.paperWidthMm ?? working.printerPaper.widthMm,
      paperHeightMm: res.paperHeightMm ?? working.printerPaper.heightMm,
      orientation: res.orientation === "landscape" ? "לרוחב" : "לאורך",
      sourceName: res.sourceName || working.traySource.label
    });
    setStatusMsg("הגדרות הדרייבר הוחלו: " + (res.paperName || "נייר") + " · " + (res.sourceName || "מגש ברירת מחדל"));
  }

  async function handleColorPreview(): Promise<void> {
    if (!working || !thumbnailUrl) return;
    setColorBusy(true);
    setStatusMsg("מריץ תצוגת צבע…");
    try {
      const color = resolveColor(working, outputPreset);
      const iccPath = color.mode === "app-manages-color" ? working.color.iccProfileId : undefined;
      const res = await window.spp?.advancedPrint?.colorPreview({
        dataUrl: thumbnailUrl,
        preset: outputPreset ?? null,
        colorMode: color.mode,
        applyIcc: color.applyIcc,
        iccProfilePath: iccPath,
        renderingIntent: color.renderingIntent,
        blackPointCompensation: color.blackPointCompensation,
        maxPx: 700
      });
      if (res?.dataUrl) {
        setColorAfterUrl(res.dataUrl);
        setStatusMsg(null);
      } else {
        setStatusMsg("תצוגת הצבע אינה זמינה (מנוע הצבע לא הגיב).");
      }
    } catch (err) {
      setStatusMsg("שגיאה בתצוגת צבע: " + String(err instanceof Error ? err.message : err));
    } finally {
      setColorBusy(false);
    }
  }

  async function runPrint(engineOverride?: "pdf"): Promise<void> {
    if (!working) return;
    setBusy(true);
    setStatusMsg(engineOverride === "pdf" ? "מייצר PDF…" : "שולח להדפסה…");
    // ICC is profile-level and stores the absolute profile path directly as its id.
    const iccPath = working.color.mode === "app-manages-color" ? working.color.iccProfileId : undefined;
    const caps = printableMargins
      ? ({ printableAreaByPaper: { [working.printerPaper.name]: printableMargins } } as unknown as PrinterCapabilities)
      : undefined;
    const req: AdvancedPrintRequest = {
      pageIndices: printIndices,
      renderPage,
      profile: engineOverride === "pdf" ? { ...working, engine: "pdf" } : working,
      outputPreset,
      iccProfilePath: iccPath,
      copies: 1,
      caps
    };
    try {
      const total = printIndices.length;
      const outcome = await executeAdvancedPrint(req, driver, {
        onProgress: total > 1 ? (done) => setStatusMsg(`מדפיס עמוד ${done} מתוך ${total}…`) : undefined
      });
      if (outcome.status === "blocked") {
        setStatusMsg("ההדפסה נחסמה עקב אזהרה קריטית. תקן את הבעיה והדפס שוב.");
      } else if (outcome.status === "success") {
        if (outcome.pdfDataUrl) {
          const tmp = await window.spp?.advancedPrint?.writeTempImage(outcome.pdfDataUrl, "pdf");
          if (tmp?.path) await window.spp?.openFolder?.(tmp.path);
          setStatusMsg("ה-PDF נוצר.");
        } else {
          const d = outcome.diagnostics;
          if (d?.paperMismatch) {
            setStatusMsg(
              `אזהרה: המדפסת הדפיסה על נייר ${Math.round(d.devicePaperWidthMm)}×${Math.round(d.devicePaperHeightMm)} מ"מ ` +
              `אך העיצוב חושב לנייר ${Math.round(d.jobPaperWidthMm)}×${Math.round(d.jobPaperHeightMm)} מ"מ. ` +
              `${d.recentered ? "מירכזתי על הנייר בפועל. " : ""}פתח "הגדרות מדפסת (דרייבר)" ובחר את גודל הנייר הנכון.`
            );
          } else {
            setStatusMsg("ההדפסה נשלחה בהצלחה.");
          }
          // Persist settings only in profile mode (manual mode is intentionally ephemeral).
          if (!engineOverride && useProfile) upsertProfile(working);
        }
      } else if (outcome.status === "canceled") {
        setStatusMsg("ההדפסה בוטלה.");
      } else {
        setStatusMsg("ההדפסה נכשלה: " + (outcome.error ?? "שגיאה לא ידועה"));
      }
    } catch (err) {
      setStatusMsg("שגיאה: " + String(err instanceof Error ? err.message : err));
    } finally {
      setBusy(false);
    }
  }

  if (showWizard) {
    return (
      <ProfileCreationWizard
        onCancel={() => setShowWizard(false)}
        onSave={(profile) => {
          upsertProfile(profile);
          setDefaultProfile(profile.id);
          setProfileId(profile.id);
          setUseProfile(true);
          setShowWizard(false);
        }}
      />
    );
  }

  return (
    <div className="ape-overlay">
      <div className="ape-dialog">
        <div className="ape-dialog-head">
          <h3><FlaskConical size={16} /> הדפסה מתקדמת <span className="ape-exp">ניסיוני</span></h3>
          <div className="ape-head-actions">
            <label className="ape-toggle">
              <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
              מצב מתקדם
            </label>
            <button className="ape-icon-btn" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div className="ape-dialog-body">
          <div className="ape-left">
            {layout ? (
              <AdvancedPrintPreview layout={layout} thumbnailUrl={showColor && colorAfterUrl ? colorAfterUrl : thumbnailUrl} />
            ) : (
              <div className="ape-empty">{previewBusy ? "טוען תצוגה מקדימה…" : "בחר מדפסת כדי להציג תצוגה מקדימה."}</div>
            )}
            {working && thumbnailUrl && (
              <label className="ape-check ape-color-toggle">
                <input type="checkbox" checked={showColor} onChange={(e) => setShowColor(e.target.checked)} disabled={colorBusy} />
                {colorBusy ? "מחשב צבע…" : "הצג צבע סופי (ICC + פריסט)"}
              </label>
            )}
            {printIndices.length > 1 && (
              <div className="ape-page-nav">
                <button
                  className="ape-icon-btn"
                  onClick={() => setPreviewPos((p) => Math.max(0, p - 1))}
                  disabled={previewPos === 0 || previewBusy}
                  title="עמוד קודם"
                >‹</button>
                <span className="ape-page-indicator">
                  {previewPageIndex !== undefined ? `עמוד ${previewPageIndex + 1}` : ""} ({previewPos + 1}/{printIndices.length})
                  {previewBusy ? " · טוען…" : ""}
                </span>
                <button
                  className="ape-icon-btn"
                  onClick={() => setPreviewPos((p) => Math.min(printIndices.length - 1, p + 1))}
                  disabled={previewPos >= printIndices.length - 1 || previewBusy}
                  title="עמוד הבא"
                >›</button>
              </div>
            )}
            {driverInfo && (
              <div className="ape-driver-info">
                <div className="ape-driver-info-title">מהדרייבר ✓</div>
                <div>נייר: {driverInfo.paperName} ({Math.round(driverInfo.paperWidthMm)}×{Math.round(driverInfo.paperHeightMm)} מ"מ)</div>
                <div>כיוון: {driverInfo.orientation} · מקור: {driverInfo.sourceName}</div>
              </div>
            )}

          </div>

          <div className="ape-right">
            {/* Printer — always available; lets you print without a profile. */}
            <div className="ape-row">
              <label className="ape-label">מדפסת</label>
              <select
                className="ape-select"
                value={working?.windowsPrinterName ?? manualPrinter}
                onChange={(e) => {
                  const name = e.target.value;
                  if (useProfile) patchWorking({ windowsPrinterName: name });
                  else setManualPrinter(name);
                }}
              >
                {installedPrinters.length === 0 && <option value="">לא נמצאו מדפסות</option>}
                {installedPrinters.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            {/* Toggle between manual configuration and a saved profile. */}
            <div className="ape-row">
              <label className="ape-check">
                <input
                  type="checkbox"
                  checked={useProfile}
                  onChange={(e) => {
                    const on = e.target.checked;
                    if (on && !profileId && settings.profiles[0]) setProfileId(settings.profiles[0].id);
                    setUseProfile(on);
                  }}
                />
                הגדר לפי פרופיל (ושמור הגדרות)
              </label>
            </div>

            {useProfile && (
              <div className="ape-row">
                <label className="ape-label">פרופיל</label>
                <select className="ape-select" value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                  {settings.profiles.length === 0 && <option value="">אין פרופילים — צור חדש</option>}
                  {settings.profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button className="ape-btn" onClick={() => setShowWizard(true)}><Settings2 size={14} /> חדש</button>
              </div>
            )}

            {/* Which pages to send to print. */}
            <div className="ape-row">
              <label className="ape-label">עמודים</label>
              <div className="ape-chip-grid inline">
                <button className={`ape-chip-btn ${selMode === "current" ? "active" : ""}`} onClick={() => setSelMode("current")}>עמוד נוכחי</button>
                <button className={`ape-chip-btn ${selMode === "all" ? "active" : ""}`} onClick={() => setSelMode("all")}>כל העמודים ({totalPages})</button>
                <button className={`ape-chip-btn ${selMode === "range" ? "active" : ""}`} onClick={() => setSelMode("range")}>טווח</button>
              </div>
            </div>
            {selMode === "range" && (
              <div className="ape-row">
                <label className="ape-label" />
                <input
                  className="ape-input"
                  value={rangeText}
                  onChange={(e) => setRangeText(e.target.value)}
                  placeholder="לדוגמה: 1-3,6,9-12"
                  dir="ltr"
                />
              </div>
            )}
            {selMode === "range" && rangeParse.error && rangeText.trim() && (
              <div className="ape-color-mode-note" style={{ color: "#e06b6b" }}>{rangeParse.error}</div>
            )}

            {working && (
              <>
                {/* Driver access — available in BOTH simple and advanced modes. */}
                <button className="ape-btn full" onClick={handleOpenDriver}>
                  <Settings2 size={14} /> הגדרות מדפסת (דרייבר)…
                </button>

                <div className="ape-row">
                  <label className="ape-label">התאמה</label>
                  <div className="ape-chip-grid inline">
                    {SCALING_LABELS.map(({ mode, label }) => (
                      <button
                        key={mode}
                        className={`ape-chip-btn ${working.scaling.mode === mode ? "active" : ""}`}
                        onClick={() => patchWorking({ scaling: { ...working.scaling, mode } })}
                      >{label}</button>
                    ))}
                  </div>
                </div>

                {working.scaling.mode === "custom-percent" && (
                  <div className="ape-row">
                    <label className="ape-label">אחוז</label>
                    <input
                      type="number" className="ape-input narrow" min={1} max={1000}
                      value={working.scaling.percent ?? 100}
                      onChange={(e) => patchWorking({ scaling: { ...working.scaling, percent: Number(e.target.value) } })}
                    />
                  </div>
                )}

                {advanced && (
                  <>
                    <div className="ape-row">
                      <label className="ape-label">כיוון</label>
                      <select
                        className="ape-select"
                        value={working.orientationPolicy}
                        onChange={(e) => patchWorking({ orientationPolicy: e.target.value as AdvancedPrinterProfile["orientationPolicy"] })}
                      >
                        <option value="from-rendered-output">לפי העיצוב</option>
                        <option value="force-portrait">אלץ לאורך</option>
                        <option value="force-landscape">אלץ לרוחב</option>
                      </select>
                    </div>
                    <div className="ape-row">
                      <label className="ape-label">מיקום</label>
                      <select
                        className="ape-select"
                        value={working.position.mode}
                        onChange={(e) => patchWorking({ position: { ...working.position, mode: e.target.value as AdvancedPrinterProfile["position"]["mode"] } })}
                      >
                        <option value="center">מרכז</option>
                        <option value="top-left">פינה עליונה</option>
                        <option value="custom">מותאם (X/Y)</option>
                      </select>
                    </div>
                    <div className="ape-row">
                      <label className="ape-label">שוליים</label>
                      <select
                        className="ape-select"
                        value={working.marginsPolicy}
                        onChange={(e) => patchWorking({ marginsPolicy: e.target.value as AdvancedPrinterProfile["marginsPolicy"] })}
                      >
                        <option value="use-driver-printable-area">לפי הדרייבר</option>
                        <option value="force-none">ללא שוליים</option>
                        <option value="custom-margins">מותאם</option>
                      </select>
                    </div>
                  </>
                )}

                {/* Color management base layer: pick who manages color, then the real system ICC. */}
                <div className="ape-preset-panel">
                  <div className="ape-row">
                    <label className="ape-label">ניהול צבע</label>
                    <div className="ape-chip-grid inline">
                      {([
                        ["printer-manages-color", "המדפסת"],
                        ["app-manages-color", "SPP + ICC"],
                        ["none", "ללא"]
                      ] as Array<[ColorManagementMode, string]>).map(([mode, label]) => (
                        <button
                          key={mode}
                          className={`ape-chip-btn ${working.color.mode === mode ? "active" : ""}`}
                          onClick={() => patchWorking({ color: { ...working.color, mode } })}
                        >{label}</button>
                      ))}
                    </div>
                  </div>

                  {working.color.mode === "app-manages-color" && (
                    <>
                      <div className="ape-row">
                        <label className="ape-label">פרופיל ICC</label>
                        <select
                          className="ape-select"
                          value={working.color.iccProfileId ?? ""}
                          onChange={(e) => patchWorking({ color: { ...working.color, iccProfileId: e.target.value || undefined } })}
                        >
                          <option value="">בחר פרופיל מהמערכת…</option>
                          {iccProfiles.map((p) => <option key={p.path} value={p.path}>{p.name}</option>)}
                        </select>
                      </div>
                      {advanced && (
                        <div className="ape-row">
                          <label className="ape-label">Rendering intent</label>
                          <select
                            className="ape-select"
                            value={working.color.renderingIntent}
                            onChange={(e) => patchWorking({ color: { ...working.color, renderingIntent: e.target.value as AdvancedPrinterProfile["color"]["renderingIntent"] } })}
                          >
                            <option value="perceptual">Perceptual</option>
                            <option value="relative-colorimetric">Relative Colorimetric</option>
                            <option value="saturation">Saturation</option>
                            <option value="absolute-colorimetric">Absolute Colorimetric</option>
                          </select>
                        </div>
                      )}
                      <div className="ape-color-mode-note">חשוב: כבה את תיקון הצבע בהגדרות הדרייבר (ICM / Color Management = Off).</div>
                    </>
                  )}
                  {working.color.mode === "printer-manages-color" && (
                    <div className="ape-color-mode-note">SPP לא תבצע המרת ICC. ניתן עדיין להחיל פריסט פלט לתיקונים קלים.</div>
                  )}
                </div>

                <OutputPresetPanel
                  presets={settings.outputPresets}
                  selectedId={presetId}
                  strength={presetStrength}
                  onSelect={(id) => setPresetId(id || undefined)}
                  onStrengthChange={setPresetStrength}
                  onDuplicate={(p) => { const c = duplicatePreset(p); setPresetId(c.id); }}
                  onReset={(p) => resetPreset(p)}
                />

                {report && <PreflightSummary report={report} summaryLines={summaryLines} />}
              </>
            )}

            {statusMsg && <div className="ape-status">{statusMsg}</div>}
          </div>
        </div>

        <div className="ape-dialog-foot">
          <button className="ape-btn ghost" onClick={onClose} disabled={busy}>ביטול</button>
          <div className="ape-foot-nav">
            <button className="ape-btn" onClick={handleTestPage} disabled={busy || !working}><TestTube2 size={14} /> דף בדיקה</button>
            <button className="ape-btn" onClick={() => runPrint("pdf")} disabled={busy || !working || printIndices.length === 0}><FileText size={14} /> הדפס דרך PDF ({printIndices.length})</button>
            <button
              className="ape-btn primary"
              onClick={() => runPrint()}
              disabled={busy || !working || printIndices.length === 0 || (report?.hasBlocker ?? false)}
            ><Printer size={14} /> שלח להדפסה ({printIndices.length})</button>
          </div>
        </div>
      </div>
    </div>
  );
}
