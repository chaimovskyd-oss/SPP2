import {
  Check,
  CheckCircle2,
  Download,
  FolderOpen,
  ImagePlus,
  AlertTriangle,
  Loader2,
  Play,
  SlidersHorizontal,
  X,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent, type ReactElement, type WheelEvent } from "react";
import {
  DEFAULT_PREPARE_OPTIONS,
  analyzeSmartPrintBatch,
  applyDesignPresetToResult,
  buildBatchReport,
  renderPrepared,
  updateRecipeAdjustment,
  type BatchPrepareReport,
  type PrepareCropRect,
  type PrepareOptions,
  type PrepareResult
} from "@/core/smartPrintPrepare";
import { listPresets } from "@/core/presets/smartPresets";
import { PRINT_SIZE_PRESETS } from "@/types/photoPrint";

type RunStatus = "idle" | "analyzing" | "ready" | "exporting" | "done" | "error";
type ReviewTab = "screenshot" | "crop" | "color" | "quality" | "preset";

interface SmartPrintPreparePanelProps {
  onClose: () => void;
}

export function SmartPrintPreparePanel({ onClose }: SmartPrintPreparePanelProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [options, setOptions] = useState<PrepareOptions>(DEFAULT_PREPARE_OPTIONS);
  const [status, setStatus] = useState<RunStatus>("idle");
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState<PrepareResult[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ReviewTab>("screenshot");
  const [outputDir, setOutputDir] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => results.find((result) => result.id === selectedId) ?? results[0] ?? null,
    [results, selectedId]
  );
  const report = useMemo(() => buildBatchReport(results), [results]);
  const safeCount = results.filter((result) => result.recommendedOperations.every((op) => !op.enabled || op.autoApproved)).length;
  const problemCount = results.filter((result) => result.warnings.length > 0).length;
  const presets = useMemo(() => listPresets().filter((preset) => preset.imageAdjustments.length > 0), []);
  const selectedRecipeKey = selected === null ? "" : JSON.stringify(selected.recipe);

  function updateOptions(nextOptions: PrepareOptions): void {
    setOptions(nextOptions);
    setResults((prev) => prev.map((result) => applyDesignPresetToResult(result, nextOptions.designPreset)));
  }

  useEffect(() => {
    setResults((prev) => prev.map((result) => applyDesignPresetToResult(result, options.designPreset)));
  }, [options.designPreset.enabled, options.designPreset.presetId, options.designPreset.strength]);

  function addFiles(nextFiles: FileList | File[]): void {
    const images = Array.from(nextFiles).filter((file) => file.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...images]);
    setResults([]);
    setSelectedId(null);
    setStatus(images.length > 0 ? "idle" : status);
  }

  async function runAnalysis(): Promise<void> {
    if (files.length === 0) return;
    setStatus("analyzing");
    setError(null);
    setProgress("סורק תמונות ובונה recipe...");
    try {
      const batch = await analyzeSmartPrintBatch(files, options);
      setResults(batch.results);
      setSelectedId(batch.results[0]?.id ?? null);
      setStatus("ready");
      setProgress("");
    } catch (err: any) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "ניתוח התמונות נכשל.");
    }
  }

  async function chooseOutputDir(): Promise<void> {
    const response = await window.spp?.smartPrintPrepare?.chooseOutputDir?.(outputDir);
    if (response?.success && response.folderPath) setOutputDir(response.folderPath);
  }

  async function runAutoPrepare(): Promise<void> {
    if (files.length === 0) return;
    setStatus("analyzing");
    setError(null);
    setProgress("Analyzing and exporting prepared images...");
    try {
      const batch = await analyzeSmartPrintBatch(files, options);
      const approved = batch.results.map((result) => ({ ...result, approved: true, keepOriginal: false }));
      setResults(approved);
      setSelectedId(approved[0]?.id ?? null);
      await exportPreparedResults(approved, true);
    } catch (err: any) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Smart Print Prepare failed.");
    }
  }

  async function exportBatch(): Promise<void> {
    if (results.length === 0) return;
    await exportPreparedResults(results, false);
    return;
    setStatus("exporting");
    setError(null);
    try {
      const items = [];
      const active = results.filter((result) => !result.keepOriginal);
      for (let i = 0; i < active.length; i += 1) {
        const result = active[i]!;
        setProgress(`מייצא ${i + 1} / ${active.length}: ${result.fileName}`);
        const rendered = await renderPrepared(result, "export");
        items.push({
          fileName: result.fileName,
          sourcePath: result.filePath,
          dataUrl: rendered.dataUrl
        });
      }
      const saved = await window.spp?.smartPrintPrepare?.saveBatch?.({
        outputDir,
        items,
        report: serializeReport(report)
      });
      if (!saved?.success) throw new Error(saved?.error ?? "שמירת הפלט נכשלה.");
      setOutputDir(saved?.outputDir ?? outputDir);
      setStatus("done");
      setProgress("");
    } catch (err: any) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "שמירת הפלט נכשלה.");
    }
  }

  async function exportPreparedResults(nextResults: PrepareResult[], openOutputDir: boolean): Promise<void> {
    if (nextResults.length === 0) return;
    setStatus("exporting");
    setError(null);
    try {
      const items = [];
      const active = nextResults.filter((result) => !result.keepOriginal);
      for (let i = 0; i < active.length; i += 1) {
        const result = active[i]!;
        setProgress(`Exporting ${i + 1} / ${active.length}: ${result.fileName}`);
        const rendered = await renderPrepared(result, "export");
        items.push({
          fileName: result.fileName,
          sourcePath: result.filePath,
          dataUrl: rendered.dataUrl
        });
      }
      const saved = await window.spp?.smartPrintPrepare?.saveBatch?.({
        outputDir,
        items,
        report: serializeReport(buildBatchReport(nextResults))
      });
      if (!saved?.success) throw new Error(saved?.error ?? "Saving Smart Print Prepare output failed.");
      setOutputDir(saved.outputDir ?? outputDir);
      if (openOutputDir && saved.outputDir) {
        await window.spp?.openFolder?.(saved.outputDir);
      }
      setStatus("done");
      setProgress("");
    } catch (err: any) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Saving Smart Print Prepare output failed.");
    }
  }

  function updateSelected(next: PrepareResult): void {
    setResults((prev) => prev.map((item) => (item.id === next.id ? next : item)));
  }

  function approveSelected(): void {
    if (selected === null) return;
    updateSelected({ ...selected, approved: true, keepOriginal: false });
  }

  function keepOriginalSelected(): void {
    if (selected === null) return;
    updateSelected({ ...selected, approved: true, keepOriginal: true });
  }

  function approveSafeOnly(): void {
    setResults((prev) =>
      prev.map((result) => ({
        ...result,
        approved: result.recommendedOperations.every((op) => !op.enabled || op.autoApproved) ? true : result.approved
      }))
    );
  }

  function setCropEnabled(kind: "screenshotCrop" | "targetCrop", enabled: boolean): void {
    if (selected === null) return;
    updateSelected({
      ...selected,
      recipe: {
        ...selected.recipe,
        [kind]: selected.recipe[kind] === undefined ? undefined : { ...selected.recipe[kind], enabled }
      }
    });
  }

  function setTargetCropRect(rect: PrepareCropRect): void {
    if (selected?.recipe.targetCrop === undefined) return;
    updateSelected({
      ...selected,
      recipe: {
        ...selected.recipe,
        targetCrop: {
          ...selected.recipe.targetCrop,
          enabled: true,
          rect
        }
      }
    });
  }

  function panTargetCrop(deltaX: number, deltaY: number, displayWidth: number, displayHeight: number): void {
    if (selected?.recipe.targetCrop === undefined) return;
    const rect = selected.recipe.targetCrop.rect;
    const base = getCropBaseSize(selected);
    const scaleX = rect.width / Math.max(1, displayWidth);
    const scaleY = rect.height / Math.max(1, displayHeight);
    setTargetCropRect(roundCropRect({
      ...rect,
      x: rect.x - deltaX * scaleX,
      y: rect.y - deltaY * scaleY
    }, base.width, base.height));
  }

  function zoomTargetCrop(factor: number): void {
    if (selected?.recipe.targetCrop === undefined) return;
    const rect = selected.recipe.targetCrop.rect;
    const base = getCropBaseSize(selected);
    const ratio = Math.max(0.01, rect.width / Math.max(1, rect.height));
    const fit = getFitCropSize(base.width, base.height, ratio);
    const currentZoom = clampValue(fit.width / Math.max(1, rect.width), 1, 3);
    const nextZoom = clampValue(currentZoom * factor, 1, 3);
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    const nextWidth = fit.width / nextZoom;
    const nextHeight = fit.height / nextZoom;
    setTargetCropRect(roundCropRect({
      x: clampValue(centerX - nextWidth / 2, 0, Math.max(0, base.width - nextWidth)),
      y: clampValue(centerY - nextHeight / 2, 0, Math.max(0, base.height - nextHeight)),
      width: nextWidth,
      height: nextHeight
    }, base.width, base.height));
  }

  function patchSlider(patch: Parameters<typeof updateRecipeAdjustment>[1]): void {
    if (selected === null) return;
    updateSelected(updateRecipeAdjustment(selected, patch));
  }

  const sliderValues = selected !== null ? readSliderValues(selected) : { brightness: 0, contrast: 0, temperature: 0, saturation: 0, sharpness: 0 };

  return (
    <div className="util-panel spp-prepare-panel" role="dialog" aria-label="הכנה חכמה לדפוס">
      <div className="util-panel-header">
        <h3>הכנה חכמה לדפוס</h3>
        <button className="icon-btn" onClick={onClose} type="button" aria-label="סגור">
          <X size={16} />
        </button>
      </div>

      <div className="spp-prepare-layout">
        <aside className="spp-prepare-sidebar">
          <button className="btn btn-accent btn-full" onClick={() => inputRef.current?.click()} disabled={status === "analyzing" || status === "exporting"} type="button">
            <ImagePlus size={15} />
            בחר תמונות
          </button>
          <input ref={inputRef} hidden multiple type="file" accept="image/*" onChange={(event: ChangeEvent<HTMLInputElement>) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = "";
          }} />

          <div className="spp-prepare-count">
            <strong>{files.length}</strong>
            <span>תמונות נבחרו</span>
          </div>

          <OptionsForm options={options} presets={presets} onChange={updateOptions} />

          <button className="btn btn-accent btn-full" onClick={() => void runAnalysis()} disabled={files.length === 0 || status === "analyzing" || status === "exporting"} type="button">
            {status === "analyzing" ? <Loader2 className="spin" size={15} /> : <Play size={15} />}
            נתח והכן Recipe
          </button>

          <button className="btn btn-accent btn-full" onClick={() => void runAutoPrepare()} disabled={files.length === 0 || status === "analyzing" || status === "exporting"} type="button">
            {status === "exporting" ? <Loader2 className="spin" size={15} /> : <Download size={15} />}
            אוטומטי מלא ופתח תיקייה
          </button>

          <button className="btn btn-ghost btn-full" onClick={chooseOutputDir} disabled={status === "analyzing" || status === "exporting"} type="button">
            <FolderOpen size={15} />
            תיקיית פלט
          </button>
          <div className="spp-prepare-path" title={outputDir}>{outputDir || "ברירת מחדל: תיקייה חדשה ליד המקור"}</div>

          <button className="btn btn-accent btn-full" onClick={() => void exportBatch()} disabled={results.length === 0 || status === "exporting" || status === "analyzing"} type="button">
            {status === "exporting" ? <Loader2 className="spin" size={15} /> : <Download size={15} />}
            שמור פלט ודוח
          </button>

          {progress && <div className="spp-prepare-progress">{progress}</div>}
          {error && <div className="batch-bg-error">{error}</div>}
        </aside>

        <main className="spp-prepare-main">
          <div className="spp-prepare-summary">
            <SummaryChip label="נבדקו" value={results.length} />
            <SummaryChip label="בטוחות" value={safeCount} />
            <SummaryChip label="דורשות בדיקה" value={problemCount} />
            <button className="btn btn-ghost" onClick={approveSafeOnly} disabled={results.length === 0} type="button">
              <CheckCircle2 size={15} />
              אשר רק תיקונים בטוחים
            </button>
          </div>

          {selected === null ? (
            <div className="spp-prepare-empty">
              <SlidersHorizontal size={24} />
              <strong>בחר תמונות והרץ ניתוח</strong>
              <span>המערכת תציג כאן לפני/אחרי, confidence ו-recipe לא-הרסני לכל תמונה.</span>
            </div>
          ) : (
            <div className="spp-review-grid">
              <ResultList results={results} selectedId={selected.id} onSelect={setSelectedId} />
              <section className="spp-review-workbench">
                <div className="spp-review-preview">
                  <PreviewFrame title="לפני" src={selected.sourceUrl} />
                  <PreparedPreviewFrame
                    key={`${selected.id}:${selectedRecipeKey}`}
                    title="אחרי"
                    result={selected}
                    onCropDrag={activeTab === "crop" && selected.recipe.targetCrop?.enabled ? panTargetCrop : undefined}
                    onCropZoom={activeTab === "crop" && selected.recipe.targetCrop?.enabled ? zoomTargetCrop : undefined}
                  />
                </div>

                <div className="spp-review-tabs">
                  {([
                    ["screenshot", "צילום מסך"],
                    ["crop", "התאמה למידה"],
                    ["color", "צבע"],
                    ["quality", "חדות / איכות"],
                    ["preset", "פריסט"]
                  ] as const).map(([id, label]) => (
                    <button key={id} className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)} type="button">
                      {label}
                    </button>
                  ))}
                </div>

                <div className="spp-review-lower">
                <div className="spp-review-controls">
                  {activeTab === "screenshot" && (
                    <ControlSection
                      enabled={selected.recipe.screenshotCrop?.enabled ?? false}
                      onEnabled={(enabled) => setCropEnabled("screenshotCrop", enabled)}
                      title="חיתוך שאריות צילום מסך"
                      detail={selected.recipe.screenshotCrop ? `Confidence ${Math.round(selected.recipe.screenshotCrop.confidence * 100)}%` : "לא זוהה חיתוך בטוח"}
                    />
                  )}
                  {activeTab === "crop" && (
                    <ControlSection
                      enabled={selected.recipe.targetCrop?.enabled ?? false}
                      onEnabled={(enabled) => setCropEnabled("targetCrop", enabled)}
                      title="Smart Crop למידת יעד"
                      detail={selected.recipe.targetCrop ? `${cropSourceLabel(selected.recipe.targetCrop.source)} · Confidence ${Math.round(selected.recipe.targetCrop.confidence * 100)}%` : "לא נבחרה מידת יעד"}
                    />
                  )}
                  {activeTab === "crop" && selected.recipe.targetCrop && (
                    <div className="spp-face-meta">
                      Face crop: {selected.analysis.faces.boxes.length} faces · {selected.analysis.faces.backend} · {selected.recipe.targetCrop.source}
                    </div>
                  )}
                  {activeTab === "crop" && selected.recipe.targetCrop && (
                    <CropEditor result={selected} onChange={setTargetCropRect} />
                  )}
                  {activeTab === "color" && (
                    <SliderGroup
                      values={sliderValues}
                      onChange={patchSlider}
                      sliders={["brightness", "contrast", "temperature", "saturation"]}
                    />
                  )}
                  {activeTab === "quality" && (
                    <SliderGroup values={sliderValues} onChange={patchSlider} sliders={["sharpness"]} extra={selected.analysis.quality.message} />
                  )}
                  {activeTab === "preset" && (
                    <ControlSection
                      enabled={selected.recipe.designPreset?.enabled ?? false}
                      onEnabled={(enabled) => {
                        if (selected.recipe.designPreset === undefined) return;
                        updateSelected({ ...selected, recipe: { ...selected.recipe, designPreset: { ...selected.recipe.designPreset, enabled } } });
                      }}
                      title="לוק עיצובי"
                      detail={selected.recipe.designPreset ? `${selected.recipe.designPreset.presetId} · ${Math.round(selected.recipe.designPreset.strength * 100)}%` : "לא הופעל פריסט"}
                    />
                  )}
                  {activeTab === "preset" && selected.recipe.designPreset && (
                    <div className="spp-face-meta">
                      Preset adjustments: {selected.recipe.designPreset.adjustments.length}
                    </div>
                  )}
                </div>
                </div>

                <div className="spp-review-actions">
                  <button className="btn btn-accent" onClick={approveSelected} type="button">
                    <Check size={15} />
                    אשר תמונה
                  </button>
                  <button className="btn btn-ghost" onClick={keepOriginalSelected} type="button">
                    <XCircle size={15} />
                    השאר מקור
                  </button>
                </div>
              </section>
              <WarningPanel result={selected} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function OptionsForm({ options, presets, onChange }: {
  options: PrepareOptions;
  presets: ReturnType<typeof listPresets>;
  onChange: (options: PrepareOptions) => void;
}): ReactElement {
  const printPreset = PRINT_SIZE_PRESETS.find((preset) => preset.id === options.targetSize.label || preset.id === `${options.targetSize.width}x${options.targetSize.height}`);
  const isCustomSize = options.targetSize.label === "custom";
  return (
    <div className="spp-options">
      <label><input type="checkbox" checked={options.removeScreenshotArtifacts} onChange={(event) => onChange({ ...options, removeScreenshotArtifacts: event.target.checked })} /> חיתוך צילום מסך בטוח</label>
      <label><input type="checkbox" checked={options.autoColorFix} onChange={(event) => onChange({ ...options, autoColorFix: event.target.checked })} /> תיקון צבע עדין</label>
      <label><input type="checkbox" checked={options.sharpenSoftImages} onChange={(event) => onChange({ ...options, sharpenSoftImages: event.target.checked })} /> חדות קלה כשצריך</label>
      <label><input type="checkbox" checked={options.targetSize.enabled} onChange={(event) => onChange({ ...options, targetSize: { ...options.targetSize, enabled: event.target.checked } })} /> התאמה למידה</label>
      <select value={printPreset?.id ?? "10x15"} onChange={(event) => {
        const preset = PRINT_SIZE_PRESETS.find((item) => item.id === event.target.value) ?? PRINT_SIZE_PRESETS[0];
        if (preset.id === "custom") {
          onChange({ ...options, targetSize: { ...options.targetSize, width: 10, height: 15, unit: "cm", label: "custom" } });
        } else {
          onChange({ ...options, targetSize: { ...options.targetSize, width: preset.widthMm, height: preset.heightMm, unit: "mm", label: preset.id } });
        }
      }}>
        {PRINT_SIZE_PRESETS.filter((preset) => preset.category !== "official").map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
      </select>
      {isCustomSize && (
        <div className="spp-custom-size-grid">
          <label>רוחב
            <input min={0.1} step={0.1} type="number" value={options.targetSize.width} onChange={(event) => onChange({ ...options, targetSize: { ...options.targetSize, width: Number(event.target.value) || 0, label: "custom" } })} />
          </label>
          <label>גובה
            <input min={0.1} step={0.1} type="number" value={options.targetSize.height} onChange={(event) => onChange({ ...options, targetSize: { ...options.targetSize, height: Number(event.target.value) || 0, label: "custom" } })} />
          </label>
          <label>יחידות
            <select value={options.targetSize.unit} onChange={(event) => onChange({ ...options, targetSize: { ...options.targetSize, unit: event.target.value as PrepareOptions["targetSize"]["unit"], label: "custom" } })}>
              <option value="cm">ס"מ</option>
              <option value="mm">מ"מ</option>
              <option value="inch">אינץ'</option>
            </select>
          </label>
        </div>
      )}
      <label>פרופיל
        <select value={options.profile} onChange={(event) => onChange({ ...options, profile: event.target.value as PrepareOptions["profile"] })}>
          <option value="gentle">עדין</option>
          <option value="recommended">מומלץ</option>
          <option value="aggressive">אגרסיבי</option>
          <option value="photo_lab">חדיש - פיתוח תמונות</option>
        </select>
      </label>
      <label><input type="checkbox" checked={options.designPreset.enabled} onChange={(event) => onChange({ ...options, designPreset: { ...options.designPreset, enabled: event.target.checked } })} /> החל פריסט על כל התמונות</label>
      <select value={options.designPreset.presetId} onChange={(event) => onChange({ ...options, designPreset: { ...options.designPreset, presetId: event.target.value } })}>
        {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
      </select>
      <label>עוצמת פריסט {Math.round(options.designPreset.strength * 100)}%
        <input type="range" min={0} max={1} step={0.05} value={options.designPreset.strength} onChange={(event) => onChange({ ...options, designPreset: { ...options.designPreset, strength: Number(event.target.value) } })} />
      </label>
    </div>
  );
}

function CropEditor({ result, onChange }: { result: PrepareResult; onChange: (rect: PrepareCropRect) => void }): ReactElement {
  const target = result.recipe.targetCrop;
  const base = getCropBaseSize(result);
  if (target === undefined || base.width <= 0 || base.height <= 0) {
    return (
      <div className="spp-crop-editor">
        <p>No crop recipe is available for this image.</p>
      </div>
    );
  }

  const rect = target.rect;
  const ratio = Math.max(0.01, rect.width / Math.max(1, rect.height));
  const fit = getFitCropSize(base.width, base.height, ratio);
  const zoom = clampValue(fit.width / Math.max(1, rect.width), 1, 3);
  const maxX = Math.max(0, base.width - rect.width);
  const maxY = Math.max(0, base.height - rect.height);

  function setX(x: number): void {
    onChange(roundCropRect({ ...rect, x: clampValue(x, 0, maxX) }, base.width, base.height));
  }

  function setY(y: number): void {
    onChange(roundCropRect({ ...rect, y: clampValue(y, 0, maxY) }, base.width, base.height));
  }

  function setZoom(nextZoom: number): void {
    const safeZoom = clampValue(nextZoom, 1, 3);
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    const nextWidth = fit.width / safeZoom;
    const nextHeight = fit.height / safeZoom;
    onChange(roundCropRect({
      x: clampValue(centerX - nextWidth / 2, 0, Math.max(0, base.width - nextWidth)),
      y: clampValue(centerY - nextHeight / 2, 0, Math.max(0, base.height - nextHeight)),
      width: nextWidth,
      height: nextHeight
    }, base.width, base.height));
  }

  return (
    <div className="spp-crop-editor">
      <div className="spp-crop-editor-head">
        <strong>Manual crop pan / zoom</strong>
        <span>{Math.round(rect.width)} x {Math.round(rect.height)} px</span>
      </div>
      <label>
        <span>Pan X <strong>{Math.round(rect.x)}</strong></span>
        <input type="range" min={0} max={Math.max(0, Math.round(maxX))} step={1} value={Math.round(rect.x)} disabled={maxX < 1} onChange={(event) => setX(Number(event.target.value))} />
      </label>
      <label>
        <span>Pan Y <strong>{Math.round(rect.y)}</strong></span>
        <input type="range" min={0} max={Math.max(0, Math.round(maxY))} step={1} value={Math.round(rect.y)} disabled={maxY < 1} onChange={(event) => setY(Number(event.target.value))} />
      </label>
      <label>
        <span>Zoom <strong>{Math.round(zoom * 100)}%</strong></span>
        <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
      </label>
    </div>
  );
}

function ResultList({ results, selectedId, onSelect }: { results: PrepareResult[]; selectedId: string; onSelect: (id: string) => void }): ReactElement {
  return (
    <aside className="spp-result-list">
      {results.map((result) => (
        <button key={result.id} className={result.id === selectedId ? "active" : ""} onClick={() => onSelect(result.id)} type="button">
          <img src={result.sourceUrl} alt="" />
          <span>
            <strong>{result.fileName}</strong>
            <small>{result.warnings.length > 0 ? `${result.warnings.length} אזהרות` : "בטוח"}</small>
          </span>
          {result.approved ? <CheckCircle2 size={14} /> : <SlidersHorizontal size={14} />}
        </button>
      ))}
    </aside>
  );
}

function WarningPanel({ result }: { result: PrepareResult }): ReactElement {
  const activeWarnings = result.warnings;
  const activeOps = result.recommendedOperations.filter((op) => op.enabled || op.confidence < 0.9);
  const tools = result.recipe.technicalAdjustments.map((adjustment) => adjustmentLabel(adjustment.type));
  return (
    <aside className="spp-warning-panel">
      <div className="spp-warning-head">
        <AlertTriangle size={15} />
        <strong>אזהרות ופעולות</strong>
      </div>
      {activeWarnings.length === 0 ? (
        <p className="spp-warning-empty">אין אזהרות פתוחות לתמונה הזו.</p>
      ) : (
        <div className="spp-warning-list">
          {activeWarnings.map((warning, index) => (
            <div key={`${warning.type}-${index}`} className={`spp-warning-item ${warning.type}`}>
              <strong>{operationLabel(warning.operation)}{warning.confidence !== undefined ? ` · ${Math.round(warning.confidence * 100)}%` : ""}</strong>
              <span>{warning.message}</span>
            </div>
          ))}
        </div>
      )}
      {result.analysis.colorIssues.length > 0 && (
        <div className="spp-warning-item muted">
          <strong>זוהו בעיות צבע</strong>
          <span>{result.analysis.colorIssues.join(", ")}</span>
        </div>
      )}
      {tools.length > 0 && (
        <div className="spp-warning-item muted">
          <strong>כלי תיקון פעילים</strong>
          <span>{Array.from(new Set(tools)).join(", ")}</span>
        </div>
      )}
      {activeOps.length > 0 && (
        <div className="spp-warning-list compact">
          {activeOps.map((op) => (
            <div key={op.operation} className="spp-warning-item muted">
              <strong>{operationLabel(op.operation)} · {Math.round(op.confidence * 100)}%</strong>
              <span>{op.reason}</span>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

function PreparedPreviewFrame({ title, result, onCropDrag, onCropZoom }: {
  title: string;
  result: PrepareResult;
  onCropDrag?: (deltaX: number, deltaY: number, displayWidth: number, displayHeight: number) => void;
  onCropZoom?: (factor: number) => void;
}): ReactElement {
  const [src, setSrc] = useState(result.sourceUrl);
  const recipeKey = JSON.stringify(result.recipe);

  useEffect(() => {
    let alive = true;
    setSrc(result.sourceUrl);
    void renderPrepared(result, "preview")
      .then((preview) => {
        if (alive) setSrc(preview.dataUrl);
      })
      .catch(() => {
        if (alive) setSrc(result.sourceUrl);
      });
    return () => {
      alive = false;
    };
  }, [result.id, result.sourceUrl, recipeKey]);

  return (
    <PreviewFrame
      title={title}
      src={src}
      onCropDrag={onCropDrag}
      onCropZoom={onCropZoom}
      recipeDebug={previewRecipeDebug(result)}
    />
  );
}

function previewRecipeDebug(result: PrepareResult): string {
  const color = result.recipe.technicalAdjustments.find((item) => item.type === "color");
  return [
    `technical:${result.recipe.technicalAdjustments.length}`,
    `temp:${color?.temperature ?? 0}`,
    `preset:${result.recipe.designPreset?.enabled ? "on" : "off"}:${result.recipe.designPreset?.adjustments.length ?? 0}`
  ].join("|");
}

function PreviewFrame({ title, src, onCropDrag, onCropZoom, recipeDebug }: {
  title: string;
  src: string;
  onCropDrag?: (deltaX: number, deltaY: number, displayWidth: number, displayHeight: number) => void;
  onCropZoom?: (factor: number) => void;
  recipeDebug?: string;
}): ReactElement {
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (onCropDrag === undefined) return;
    dragRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>): void {
    if (onCropDrag === undefined || dragRef.current === null) return;
    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    const rendered = getRenderedImageBounds(imageRef.current);
    onCropDrag(dx, dy, rendered.width, rendered.height);
    dragRef.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>): void {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>): void {
    if (onCropZoom === undefined) return;
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    onCropZoom(direction > 0 ? 1.08 : 1 / 1.08);
  }

  return (
    <figure className={`spp-preview-frame${onCropDrag ? " is-draggable" : ""}`} data-recipe-debug={recipeDebug}>
      <figcaption>{title}</figcaption>
      <div
        className="spp-preview-image-wrap"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onWheel={handleWheel}
      >
        <img ref={imageRef} src={src} alt="" />
        {onCropDrag && (
          <div className="spp-crop-interaction-overlay" aria-hidden="true">
            <span>גרור להזזה · גלגלת לזום</span>
          </div>
        )}
      </div>
    </figure>
  );
}

function ControlSection({ title, detail, enabled, onEnabled }: {
  title: string;
  detail: string;
  enabled: boolean;
  onEnabled: (enabled: boolean) => void;
}): ReactElement {
  return (
    <div className="spp-control-section">
      <label>
        <input type="checkbox" checked={enabled} onChange={(event) => onEnabled(event.target.checked)} />
        <strong>{title}</strong>
      </label>
      <span>{detail}</span>
    </div>
  );
}

function SliderGroup({ values, onChange, sliders, extra }: {
  values: ReturnType<typeof readSliderValues>;
  onChange: (patch: Parameters<typeof updateRecipeAdjustment>[1]) => void;
  sliders: Array<keyof ReturnType<typeof readSliderValues>>;
  extra?: string;
}): ReactElement {
  const labels: Record<keyof ReturnType<typeof readSliderValues>, string> = {
    brightness: "בהירות",
    contrast: "קונטרסט",
    temperature: "טמפרטורה",
    saturation: "סטורציה",
    sharpness: "חדות"
  };
  return (
    <div className="spp-slider-group">
      {extra && <p>{extra}</p>}
      {sliders.map((key) => (
        <label key={key}>
          <span>{labels[key]} <strong>{Math.round(values[key])}</strong></span>
          <input type="range" min={-60} max={60} step={1} value={values[key]} onChange={(event) => onChange({ [key]: Number(event.target.value) })} />
        </label>
      ))}
    </div>
  );
}

function SummaryChip({ label, value }: { label: string; value: number }): ReactElement {
  return <div className="spp-summary-chip"><strong>{value}</strong><span>{label}</span></div>;
}

function cropSourceLabel(source: "faces" | "content" | "center"): string {
  if (source === "faces") return "מבוסס פנים";
  if (source === "content") return "מבוסס תוכן";
  return "מרכז";
}

function operationLabel(operation?: PrepareResult["recommendedOperations"][number]["operation"]): string {
  switch (operation) {
    case "screenshot_crop": return "חיתוך צילום מסך";
    case "target_crop": return "התאמה למידה";
    case "technical_color": return "תיקון צבע";
    case "sharpen": return "חדות";
    case "design_preset": return "פריסט";
    case "quality_check": return "איכות הדפסה";
    default: return "אזהרה";
  }
}

function adjustmentLabel(type: PrepareResult["recipe"]["technicalAdjustments"][number]["type"]): string {
  switch (type) {
    case "basicTone": return "Exposure";
    case "highlightsShadows": return "Highlights/Shadows";
    case "color": return "WB/Color";
    case "curves": return "Curves/Levels";
    case "detail": return "Detail";
    case "blackWhite": return "B&W";
    case "gradientMap": return "Gradient";
    case "sepia": return "Sepia";
    case "threshold": return "Threshold";
    case "invert": return "Invert";
    default: return type;
  }
}

function readSliderValues(result: PrepareResult): { brightness: number; contrast: number; temperature: number; saturation: number; sharpness: number } {
  const tone = result.recipe.technicalAdjustments.find((item) => item.type === "basicTone");
  const color = result.recipe.technicalAdjustments.find((item) => item.type === "color");
  const detail = result.recipe.technicalAdjustments.find((item) => item.type === "detail");
  return {
    brightness: tone?.brightness ?? 0,
    contrast: tone?.contrast ?? 0,
    temperature: color?.temperature ?? 0,
    saturation: color?.saturation ?? 0,
    sharpness: detail?.sharpness ?? 0
  };
}

function getCropBaseSize(result: PrepareResult): { width: number; height: number } {
  const screenshotCrop = result.recipe.screenshotCrop;
  if (screenshotCrop?.enabled) {
    return { width: screenshotCrop.rect.width, height: screenshotCrop.rect.height };
  }
  return { width: result.analysis.width, height: result.analysis.height };
}

function getFitCropSize(width: number, height: number, ratio: number): { width: number; height: number } {
  const sourceRatio = width / Math.max(1, height);
  return sourceRatio > ratio
    ? { width: height * ratio, height }
    : { width, height: width / ratio };
}

function getRenderedImageBounds(image: HTMLImageElement | null): { width: number; height: number } {
  if (image === null) return { width: 1, height: 1 };
  const frame = image.getBoundingClientRect();
  const naturalWidth = image.naturalWidth || frame.width;
  const naturalHeight = image.naturalHeight || frame.height;
  const naturalRatio = naturalWidth / Math.max(1, naturalHeight);
  const frameRatio = frame.width / Math.max(1, frame.height);
  if (frameRatio > naturalRatio) {
    return { width: frame.height * naturalRatio, height: Math.max(1, frame.height) };
  }
  return { width: Math.max(1, frame.width), height: frame.width / Math.max(0.01, naturalRatio) };
}

function roundCropRect(rect: PrepareCropRect, imageWidth: number, imageHeight: number): PrepareCropRect {
  const width = clampValue(Math.round(rect.width), 1, imageWidth);
  const height = clampValue(Math.round(rect.height), 1, imageHeight);
  return {
    x: Math.round(clampValue(rect.x, 0, Math.max(0, imageWidth - width))),
    y: Math.round(clampValue(rect.y, 0, Math.max(0, imageHeight - height))),
    width,
    height
  };
}

function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function serializeReport(report: BatchPrepareReport): unknown {
  return {
    ...report,
    results: report.results.map((result) => ({
      id: result.id,
      fileName: result.fileName,
      filePath: result.filePath,
      analysis: result.analysis,
      recommendedOperations: result.recommendedOperations,
      recipe: result.recipe,
      warnings: result.warnings,
      confidence: result.confidence,
      approved: result.approved,
      keepOriginal: result.keepOriginal
    }))
  };
}
