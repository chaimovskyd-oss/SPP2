import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Shuffle, X } from "lucide-react";
import { pageSetupFromPreset, type PagePreset } from "@/core/pageSetup/presets";
import { unitToPx } from "@/core/units/conversion";
import { defaultPageSetup } from "@/core/defaults";
import {
  getBlessingFilterOptions,
  getRandomBlessing,
  loadBlessingData,
  searchBlessings,
  searchSourceQuotes
} from "@/core/blessing/blessingRepository";
import { BLESSING_TEMPLATES } from "@/core/blessing/blessingTemplates";
import {
  BLESSING_BACKGROUNDS,
  BLESSING_FRAME_LABELS,
  BLESSING_FRAMES,
  blessingBackgroundUrl,
  blessingFrameUrl
} from "@/core/blessing/blessingAssets";
import type { PageSetup, Unit } from "@/types/primitives";
import type { BlessingItem, BlessingSearchFilters, BlessingTemplateId, BlessingWizardResult, SourceQuoteItem } from "@/types/blessing";
import "./blessing.css";

const BLESSING_PRESETS: PagePreset[] = [
  { id: "photo_10x15", name: "10x15 ס״מ", category: "photo", width: 100, height: 150, units: "mm", dpi: 300, margins: 0, printIntent: "photo" },
  { id: "photo_13x18", name: "13x18 ס״מ", category: "photo", width: 130, height: 180, units: "mm", dpi: 300, margins: 0, printIntent: "photo" },
  { id: "a5", name: "A5", category: "paper", width: 148, height: 210, units: "mm", dpi: 300, margins: 0, printIntent: "press" },
  { id: "a4", name: "A4", category: "paper", width: 210, height: 297, units: "mm", dpi: 300, margins: 0, printIntent: "press" },
  { id: "photo_20x20", name: "20x20 ס״מ", category: "photo", width: 200, height: 200, units: "mm", dpi: 300, margins: 0, printIntent: "photo" },
  { id: "photo_30x30", name: "30x30 ס״מ", category: "photo", width: 300, height: 300, units: "mm", dpi: 300, margins: 0, printIntent: "photo" },
  { id: "photo_4x6", name: "4x6 אינץ׳", category: "photo", width: 4, height: 6, units: "inch", dpi: 300, margins: 0, printIntent: "photo" },
  { id: "photo_5x7", name: "5x7 אינץ׳", category: "photo", width: 5, height: 7, units: "inch", dpi: 300, margins: 0, printIntent: "photo" },
  { id: "photo_8x6", name: "8x6 אינץ׳", category: "photo", width: 8, height: 6, units: "inch", dpi: 300, margins: 0, printIntent: "photo" },
  { id: "custom", name: "מותאם אישית", category: "custom", width: 148, height: 210, units: "mm", dpi: 300, margins: 0, printIntent: "photo" }
];

const EMPTY_FILTERS: BlessingSearchFilters = { event: "", recipient: "", style: "", length: "", query: "" };

interface Props {
  onComplete: (result: BlessingWizardResult) => void;
  onCancel: () => void;
}

type Step = 1 | 2 | 3 | 4;

export function BlessingSetupWizard({ onComplete, onCancel }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [selectedPresetId, setSelectedPresetId] = useState("photo_10x15");
  const [customW, setCustomW] = useState("14.8");
  const [customH, setCustomH] = useState("21");
  const [customUnit, setCustomUnit] = useState<Unit>("cm");
  const [selectedBg, setSelectedBg] = useState<string>(BLESSING_BACKGROUNDS[0]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<BlessingTemplateId>("classic_card");
  const [frameEnabled, setFrameEnabled] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState<string | undefined>(undefined);

  const [dataReady, setDataReady] = useState(false);
  const [activeTab, setActiveTab] = useState<"blessings" | "sources" | "free">("blessings");
  const [filters, setFilters] = useState<BlessingSearchFilters>(EMPTY_FILTERS);
  const [filterOptions, setFilterOptions] = useState({ events: [] as string[], recipients: [] as string[], styles: [] as string[], lengths: [] as string[] });
  const [blessingResults, setBlessingResults] = useState<BlessingItem[]>([]);
  const [sourceResults, setSourceResults] = useState<SourceQuoteItem[]>([]);
  const [selectedBlessing, setSelectedBlessing] = useState<BlessingItem | null>(null);
  const [selectedSource, setSelectedSource] = useState<SourceQuoteItem | null>(null);
  const [titleText, setTitleText] = useState("ברכה חמה");
  const [bodyText, setBodyText] = useState("");
  const [signatureText, setSignatureText] = useState("");

  const selectedTemplate = useMemo(
    () => BLESSING_TEMPLATES.find((tpl) => tpl.id === selectedTemplateId) ?? BLESSING_TEMPLATES[0],
    [selectedTemplateId]
  );
  const selectedPreset = BLESSING_PRESETS.find((p) => p.id === selectedPresetId) ?? BLESSING_PRESETS[0];

  useEffect(() => {
    loadBlessingData()
      .then(() => {
        setDataReady(true);
        setFilterOptions(getBlessingFilterOptions());
        setBlessingResults(searchBlessings(EMPTY_FILTERS, new Set()).slice(0, 200));
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!dataReady) return;
    setBlessingResults(searchBlessings(filters, new Set()).slice(0, 200));
  }, [filters, dataReady]);

  useEffect(() => {
    if (!dataReady) return;
    setSourceResults(searchSourceQuotes({ query: filters.query, event: filters.event, style: filters.style }, new Set()).slice(0, 200));
  }, [filters.query, filters.event, filters.style, dataReady]);

  useEffect(() => {
    setSelectedBg(selectedTemplate.defaultBackgroundFilename);
    setFrameEnabled(selectedTemplate.showFrame);
    setSelectedFrame(selectedTemplate.defaultFrameFilename);
  }, [selectedTemplate]);

  const handleSelectBlessing = useCallback((b: BlessingItem) => {
    setSelectedBlessing(b);
    setBodyText(b.text);
    if (selectedTemplate.defaultEvent !== "כללי" && b.event) setTitleText(b.event);
  }, [selectedTemplate.defaultEvent]);

  const handleSelectSource = useCallback((s: SourceQuoteItem) => {
    setSelectedSource(s);
    setSelectedBlessing(null);
    setBodyText(s.text);
  }, []);

  const handleRandom = () => {
    const result = getRandomBlessing(filters, new Set());
    if (result) handleSelectBlessing(result);
  };

  const buildPageSetup = (): PageSetup => {
    if (selectedPresetId !== "custom") {
      const orientation = selectedPreset.width > selectedPreset.height ? "landscape" : "portrait";
      return pageSetupFromPreset(selectedPreset, orientation);
    }

    const dpi = 300;
    const width = Math.max(1, parseFloat(customW) || 14.8);
    const height = Math.max(1, parseFloat(customH) || 21);
    return {
      ...defaultPageSetup,
      units: customUnit,
      dpi,
      orientation: width > height ? "landscape" : "portrait",
      size: {
        width: Math.round(unitToPx(width, customUnit, dpi)),
        height: Math.round(unitToPx(height, customUnit, dpi))
      },
      bleed: { top: 0, right: 0, bottom: 0, left: 0 },
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
      printIntent: "photo",
      metadata: { presetId: "custom", presetName: "מותאם אישית" }
    };
  };

  const handleComplete = () => {
    onComplete({
      name: titleText || "ברכה",
      pageSetup: buildPageSetup(),
      templateId: selectedTemplateId,
      backgroundFilename: selectedBg,
      frameEnabled,
      frameFilename: frameEnabled ? selectedFrame : undefined,
      titleText,
      bodyText,
      signatureText,
      activeBlessingId: selectedBlessing?.id,
      activeSourceQuoteId: selectedSource?.id
    });
  };

  const canAdvance = step < 4 || bodyText.trim().length > 0;
  const stepLabels: Record<Step, string> = { 1: "גודל", 2: "רקע", 3: "תבנית", 4: "ברכה" };

  return (
    <div className="bl-overlay">
      <div className="bl-dialog bl-dialog-wide">
        <button className="bl-dialog-close" onClick={onCancel} title="סגור"><X size={16} /></button>

        <div className="bl-dialog-header">
          <div className="bl-dialog-title">מצב ברכות</div>
          <div className="bl-wizard-steps">
            {([1, 2, 3, 4] as Step[]).map((item) => (
              <button
                key={item}
                className={`bl-wizard-step-pill ${item === step ? "active" : item < step ? "done" : ""}`}
                onClick={() => item <= step && setStep(item)}
                type="button"
              >
                {item}. {stepLabels[item]}
              </button>
            ))}
          </div>
        </div>

        <div className="bl-wizard-shell">
          <div className="bl-wizard-body">
            {step === 1 && (
              <>
                <h2 className="bl-wizard-title">בחר גודל דף</h2>
                <div className="bl-size-grid">
                  {BLESSING_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      className={`bl-size-card ${selectedPresetId === preset.id ? "selected" : ""}`}
                      onClick={() => setSelectedPresetId(preset.id)}
                      type="button"
                    >
                      <span className="bl-size-name">{preset.name}</span>
                      <span className="bl-size-dims">{preset.id === "custom" ? "רוחב וגובה לבחירה" : `${preset.width} x ${preset.height} ${preset.units}`}</span>
                    </button>
                  ))}
                </div>
                {selectedPresetId === "custom" && (
                  <div className="bl-custom-size-row">
                    <label>רוחב</label>
                    <input type="number" min={1} value={customW} onChange={(e) => setCustomW(e.target.value)} />
                    <label>גובה</label>
                    <input type="number" min={1} value={customH} onChange={(e) => setCustomH(e.target.value)} />
                    <select className="bl-filter-select" value={customUnit} onChange={(e) => setCustomUnit(e.target.value as Unit)}>
                      <option value="cm">ס״מ</option>
                      <option value="mm">מ״מ</option>
                      <option value="inch">אינץ׳</option>
                    </select>
                  </div>
                )}
              </>
            )}

            {step === 2 && (
              <>
                <h2 className="bl-wizard-title">בחר רקע</h2>
                <div className="bl-bg-grid">
                  {BLESSING_BACKGROUNDS.map((filename) => (
                    <button
                      key={filename}
                      className={`bl-bg-thumb ${selectedBg === filename ? "selected" : ""}`}
                      onClick={() => setSelectedBg(filename)}
                      type="button"
                    >
                      <img src={blessingBackgroundUrl(filename)} alt={filename} loading="lazy" />
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h2 className="bl-wizard-title">בחר תבנית</h2>
                <div className="bl-template-grid">
                  {BLESSING_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.id}
                      className={`bl-template-card ${selectedTemplateId === tpl.id ? "selected" : ""}`}
                      onClick={() => setSelectedTemplateId(tpl.id)}
                      type="button"
                    >
                      <span className="bl-template-name">{tpl.name}</span>
                      <span className="bl-template-event">{tpl.defaultEvent}</span>
                    </button>
                  ))}
                </div>
                <div className="bl-frame-section">
                  <label className="bl-check-row">
                    <input type="checkbox" checked={frameEnabled} onChange={(e) => setFrameEnabled(e.target.checked)} />
                    הוסף מסגרת
                  </label>
                  {frameEnabled && (
                    <div className="bl-frame-options">
                      {BLESSING_FRAMES.map((frame) => (
                        <button
                          key={frame}
                          className={`bl-frame-thumb ${selectedFrame === frame ? "selected" : ""}`}
                          onClick={() => setSelectedFrame(frame)}
                          title={BLESSING_FRAME_LABELS[frame]}
                          type="button"
                        >
                          <img src={blessingFrameUrl(frame)} alt={BLESSING_FRAME_LABELS[frame]} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <h2 className="bl-wizard-title">בחר או כתוב ברכה</h2>
                <label className="bl-text-label">כותרת</label>
                <input className="bl-search-input bl-full-width" value={titleText} onChange={(e) => setTitleText(e.target.value)} dir="rtl" />
                <div className="bl-tabs">
                  <button className={`bl-tab ${activeTab === "blessings" ? "active" : ""}`} onClick={() => setActiveTab("blessings")} type="button">ברכות ({blessingResults.length})</button>
                  <button className={`bl-tab ${activeTab === "sources" ? "active" : ""}`} onClick={() => setActiveTab("sources")} type="button">מקורות ({sourceResults.length})</button>
                  <button className={`bl-tab ${activeTab === "free" ? "active" : ""}`} onClick={() => setActiveTab("free")} type="button">כתיבה חופשית</button>
                </div>
                {activeTab !== "free" && (
                  <>
                    <div className="bl-search-bar">
                      <input className="bl-search-input" placeholder="חיפוש חופשי..." value={filters.query} onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))} dir="rtl" />
                      <button className="bl-random-btn" onClick={handleRandom} title="ברכה אקראית" type="button"><Shuffle size={15} /></button>
                    </div>
                    <div className="bl-filter-row">
                      <select className="bl-filter-select" value={filters.event} onChange={(e) => setFilters((f) => ({ ...f, event: e.target.value }))}>
                        <option value="">כל האירועים</option>
                        {filterOptions.events.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
                      </select>
                      <select className="bl-filter-select" value={filters.style} onChange={(e) => setFilters((f) => ({ ...f, style: e.target.value }))}>
                        <option value="">כל הסגנונות</option>
                        {filterOptions.styles.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                      <select className="bl-filter-select" value={filters.length} onChange={(e) => setFilters((f) => ({ ...f, length: e.target.value as BlessingSearchFilters["length"] }))}>
                        <option value="">כל האורכים</option>
                        {filterOptions.lengths.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </div>
                  </>
                )}
                {!dataReady && <p className="bl-muted">טוען ברכות...</p>}
                {dataReady && activeTab === "blessings" && (
                  <div className="bl-blessing-list">
                    {blessingResults.map((item) => (
                      <button key={item.id} className={`bl-blessing-card ${selectedBlessing?.id === item.id ? "selected" : ""}`} onClick={() => handleSelectBlessing(item)} type="button">
                        <span className="bl-blessing-event-tag">{item.event} · {item.style.slice(0, 2).join(", ")}</span>
                        {item.text}
                      </button>
                    ))}
                    {blessingResults.length === 0 && <div className="bl-muted">לא נמצאו ברכות</div>}
                  </div>
                )}
                {dataReady && activeTab === "sources" && (
                  <div className="bl-blessing-list">
                    {sourceResults.map((item) => (
                      <button key={item.id} className={`bl-blessing-card ${selectedSource?.id === item.id ? "selected" : ""}`} onClick={() => handleSelectSource(item)} type="button">
                        <span className="bl-blessing-event-tag">{item.category} · {item.source}</span>
                        {item.text}
                      </button>
                    ))}
                  </div>
                )}
                <div className="bl-selected-text">
                  <label className="bl-text-label">טקסט הברכה המלא</label>
                  <textarea className="bl-selected-textarea bl-body-editor" value={bodyText} onChange={(e) => setBodyText(e.target.value)} dir="rtl" />
                </div>
                <div className="bl-selected-text">
                  <label className="bl-text-label">חתימה ידנית</label>
                  <textarea className="bl-selected-textarea" rows={3} value={signatureText} onChange={(e) => setSignatureText(e.target.value)} dir="rtl" />
                </div>
              </>
            )}
          </div>

          <BlessingLivePreview
            bodyText={bodyText}
            frameEnabled={frameEnabled}
            frameFilename={selectedFrame}
            pageLabel={selectedPresetId === "custom" ? `${customW} x ${customH} ${customUnit}` : selectedPreset.name}
            selectedBg={selectedBg}
            signatureText={signatureText}
            template={selectedTemplate}
            titleText={titleText}
          />
        </div>

        <div className="bl-wizard-footer">
          {step < 4 ? (
            <button className="btn btn-primary" disabled={!canAdvance} onClick={() => setStep((s) => (s + 1) as Step)} type="button">המשך</button>
          ) : (
            <button className="btn btn-primary" disabled={bodyText.trim().length === 0} onClick={handleComplete} type="button">צור ברכה בעורך</button>
          )}
          {step > 1 && <button className="btn btn-ghost" onClick={() => setStep((s) => (s - 1) as Step)} type="button">חזרה</button>}
          <button className="btn btn-ghost" onClick={onCancel} type="button">ביטול</button>
        </div>
      </div>
    </div>
  );
}

function BlessingLivePreview({
  bodyText,
  frameEnabled,
  frameFilename,
  pageLabel,
  selectedBg,
  signatureText,
  template,
  titleText
}: {
  bodyText: string;
  frameEnabled: boolean;
  frameFilename?: string;
  pageLabel: string;
  selectedBg: string;
  signatureText: string;
  template: (typeof BLESSING_TEMPLATES)[number];
  titleText: string;
}) {
  return (
    <aside className="bl-preview-pane">
      <div className="bl-preview-head">
        <span>תצוגה מקדימה</span>
        <span>{pageLabel}</span>
      </div>
      <div className="bl-card-preview" style={{ backgroundImage: `url("${blessingBackgroundUrl(selectedBg)}")` }}>
        {frameEnabled && frameFilename ? <img className="bl-preview-frame" src={blessingFrameUrl(frameFilename)} alt="" /> : null}
        <div className="bl-preview-title" style={{ color: template.titleColor, fontFamily: template.titleFontFamily }}>
          {titleText || "כותרת הברכה"}
        </div>
        <div className="bl-preview-body" style={{ color: template.bodyColor, fontFamily: template.bodyFontFamily }}>
          {bodyText || "בחר ברכה מהרשימה או כתוב טקסט חופשי. כאן תופיע הברכה המלאה לפני יצירת הדף בעורך."}
        </div>
        <div className="bl-preview-signature">{signatureText}</div>
      </div>
    </aside>
  );
}
