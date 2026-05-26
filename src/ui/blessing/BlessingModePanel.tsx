import React, { useCallback, useEffect, useState } from "react";
import { fitTextToContainer, maxReadableBlessingFontSize } from "@/core/blessing/textAutoFit";
import { loadBlessingData, searchBlessings, getBlessingFilterOptions, getRandomBlessing } from "@/core/blessing/blessingRepository";
import { createMinimalBlessingAsset, syncBlessingToPage } from "@/core/blessing/blessingModeEngine";
import { BLESSING_BACKGROUNDS, blessingBackgroundUrl } from "@/core/blessing/blessingAssets";
import { useDocumentStore } from "@/state/documentStore";
import type { BlessingItem, BlessingRule, BlessingSearchFilters } from "@/types/blessing";
import type { VisualLayer } from "@/types/layers";
import "./blessing.css";

const EMPTY_FILTERS: BlessingSearchFilters = { event: "", recipient: "", style: "", length: "", query: "" };

interface Props {
  rule: BlessingRule;
  selectedLayer: VisualLayer | null;
}

type SectionKey = "text" | "search" | "background" | "style" | "autofit";

export function BlessingModePanel({ rule, selectedLayer: _ }: Props) {
  const {
    updateBlessingText,
    applyBlessingSelection,
    setBlessingComputedFontSize,
    updateBlessingTextStyle,
    applyDocumentChange
  } = useDocumentStore();
  const document = useDocumentStore((state) => state.document);

  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    text: true,
    search: false,
    background: false,
    style: false,
    autofit: false
  });

  const toggleSection = useCallback((key: SectionKey) => {
    setOpen((s) => ({ ...s, [key]: !s[key] }));
  }, []);

  // ── Text editing ──────────────────────────────────────────────────────────
  const [titleDraft, setTitleDraft] = useState(rule.titleText);
  const [bodyDraft, setBodyDraft] = useState(rule.bodyText);
  const [sigDraft, setSigDraft] = useState(rule.signatureText);
  const bodyLayer = document
    ?.pages.find((p) => p.id === rule.pageId)
    ?.layers.find((layer) => layer.id === rule.bodyLayerId && layer.type === "text");
  const bodyBoxWidth = Math.max(1, bodyLayer?.width ?? 900);
  const bodyBoxHeight = Math.max(1, bodyLayer?.height ?? 1300);

  useEffect(() => { setTitleDraft(rule.titleText); }, [rule.titleText]);
  useEffect(() => { setBodyDraft(rule.bodyText); }, [rule.bodyText]);
  useEffect(() => { setSigDraft(rule.signatureText); }, [rule.signatureText]);

  const commitTitle = () => { if (titleDraft !== rule.titleText) updateBlessingText(rule.id, "titleText", titleDraft); };
  const commitBody = () => { if (bodyDraft !== rule.bodyText) updateBlessingText(rule.id, "bodyText", bodyDraft); };
  const commitSig = () => { if (sigDraft !== rule.signatureText) updateBlessingText(rule.id, "signatureText", sigDraft); };

  // ── Auto-fit ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!rule.bodyAutoFitEnabled) return;
    const bodyStyle = rule.bodyTextStyle;
    const result = fitTextToContainer({
      text: rule.bodyText,
      fontFamily: bodyStyle.fontFamily,
      fontWeight: bodyStyle.fontWeight,
      lineHeight: bodyStyle.lineHeight,
      containerWidthPx: bodyBoxWidth,
      containerHeightPx: bodyBoxHeight,
      maxFontSize: maxReadableBlessingFontSize(bodyBoxWidth, bodyBoxHeight),
      minFontSize: 24
    });
    if (rule.bodyFontSizeComputed === result.fittedFontSize && rule.bodyOverflowWarning === result.overflows) return;
    setBlessingComputedFontSize(rule.id, result.fittedFontSize, result.overflows);
  }, [
    bodyBoxHeight,
    bodyBoxWidth,
    rule.bodyAutoFitEnabled,
    rule.bodyFontSizeComputed,
    rule.bodyOverflowWarning,
    rule.bodyText,
    rule.bodyTextStyle,
    rule.id,
    setBlessingComputedFontSize
  ]);

  // ── Blessing search (mini) ─────────────────────────────────────────────────
  const [dataReady, setDataReady] = useState(false);
  const [filters, setFilters] = useState<BlessingSearchFilters>(EMPTY_FILTERS);
  const [filterOpts, setFilterOpts] = useState({ events: [] as string[], styles: [] as string[], lengths: [] as string[], recipients: [] as string[] });
  const [results, setResults] = useState<BlessingItem[]>([]);

  useEffect(() => {
    loadBlessingData().then(() => {
      setDataReady(true);
      setFilterOpts(getBlessingFilterOptions());
      setResults(searchBlessings(EMPTY_FILTERS, new Set()).slice(0, 100));
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!dataReady) return;
    setResults(searchBlessings(filters, new Set()).slice(0, 100));
  }, [filters, dataReady]);

  const handleSelectBlessing = useCallback((b: BlessingItem) => {
    applyBlessingSelection(rule.id, b);
  }, [rule.id, applyBlessingSelection]);

  const handleRandom = () => {
    const r = getRandomBlessing(filters, new Set());
    if (r) handleSelectBlessing(r);
  };

  // ── Background change ─────────────────────────────────────────────────────
  const handleBgChange = (filename: string) => {
    applyDocumentChange("UpdateBlessingBackground", (doc) => {
      const newRule = { ...rule, backgroundFilename: filename };
      const bgAsset = createMinimalBlessingAsset(filename, "blessing-backgrounds");
      const frameAsset = newRule.frameEnabled && newRule.frameFilename
        ? createMinimalBlessingAsset(newRule.frameFilename, "blessing-frames")
        : null;
      const page = doc.pages.find((p) => p.id === rule.pageId);
      if (!page) return doc;
      const { page: newPage, rule: finalRule } = syncBlessingToPage(page, newRule, doc, bgAsset, frameAsset);
      const existingAsset = doc.assets.find((a) => a.id === bgAsset.id);
      return {
        ...doc,
        assets: existingAsset ? doc.assets : [...doc.assets, bgAsset],
        blessingRules: doc.blessingRules.map((r) => r.id === rule.id ? finalRule : r),
        pages: doc.pages.map((p) => p.id === page.id ? newPage : p)
      };
    });
  };

  const SectionHeader = ({ title, k }: { title: string; k: SectionKey }) => (
    <div className="bl-section-header" onClick={() => toggleSection(k)}>
      <span>{title}</span>
      <span>{open[k] ? "▲" : "▼"}</span>
    </div>
  );

  return (
    <div className="bl-panel">
      {/* ── Text ── */}
      <div className="bl-panel-section">
        <SectionHeader title="עריכת טקסט" k="text" />
        {open.text && (
          <div className="bl-section-body">
            <div>
              <div className="bl-text-label">כותרת</div>
              <textarea
                className="bl-text-area"
                rows={2}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                dir="rtl"
              />
            </div>
            <div>
              <div className="bl-text-label">טקסט ברכה</div>
              <textarea
className="bl-text-area"
                rows={5}
                value={bodyDraft}
                onChange={(e) => setBodyDraft(e.target.value)}
                onBlur={commitBody}
                dir="rtl"
              />
            </div>
            <div>
              <div className="bl-text-label">חתימה</div>
              <textarea
                className="bl-text-area"
                rows={2}
                value={sigDraft}
                onChange={(e) => setSigDraft(e.target.value)}
                onBlur={commitSig}
                dir="rtl"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Auto-fit ── */}
      <div className="bl-panel-section">
        <SectionHeader title="אוטו-התאמת טקסט" k="autofit" />
        {open.autofit && (
          <div className="bl-section-body">
            {rule.bodyOverflowWarning && (
              <div className="bl-overflow-warning">
                ⚠ הטקסט ארוך מדי — שקול לקצר או להקטין גופן
              </div>
            )}
            {!rule.bodyOverflowWarning && rule.bodyFontSizeComputed && (
              <div className="bl-autofit-info">
                גודל גופן מחושב: {rule.bodyFontSizeComputed}px
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Blessing Search ── */}
      <div className="bl-panel-section">
        <SectionHeader title="החלף ברכה" k="search" />
        {open.search && (
          <div className="bl-section-body">
            <div className="bl-search-bar">
              <input
                className="bl-search-input"
                placeholder="חיפוש..."
                value={filters.query}
                onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
                dir="rtl"
                style={{ fontSize: 12 }}
              />
              <button className="bl-random-btn" onClick={handleRandom} title="ברכה אקראית" style={{ fontSize: 12 }}>🎲</button>
            </div>
            <div className="bl-filter-row">
              <select className="bl-filter-select" value={filters.event} onChange={(e) => setFilters((f) => ({ ...f, event: e.target.value }))}>
                <option value="">כל האירועים</option>
                {filterOpts.events.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
              </select>
            </div>
            <div className="bl-blessing-list" style={{ maxHeight: 200 }}>
              {results.map((b) => (
                <div
                  key={b.id}
                  className={`bl-blessing-card ${rule.activeBlessingId === b.id ? "selected" : ""}`}
                  onClick={() => handleSelectBlessing(b)}
                >
                  <div className="bl-blessing-event-tag">{b.event}</div>
                  {b.text.slice(0, 80)}{b.text.length > 80 ? "..." : ""}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Background ── */}
      <div className="bl-panel-section">
        <SectionHeader title="רקע" k="background" />
        {open.background && (
          <div className="bl-section-body">
            <div className="bl-mini-bg-grid">
              {BLESSING_BACKGROUNDS.map((f) => (
                <div
                  key={f}
                  className={`bl-mini-bg-thumb ${rule.backgroundFilename === f ? "selected" : ""}`}
                  onClick={() => handleBgChange(f)}
                >
                  <img src={blessingBackgroundUrl(f)} alt={f} loading="lazy" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Text Style ── */}
      <div className="bl-panel-section">
        <SectionHeader title="עיצוב טקסט" k="style" />
        {open.style && (
          <div className="bl-section-body">
            <div className="bl-text-label">כותרת</div>
            <div className="bl-style-row">
              <span className="bl-style-label">גופן</span>
              <select
                className="bl-style-select"
                value={rule.titleTextStyle.fontFamily}
                onChange={(e) => updateBlessingTextStyle(rule.id, "title", { fontFamily: e.target.value })}
              >
                {["Frank Ruhl Libre", "Heebo", "Assistant", "Rubik", "DM Sans"].map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div className="bl-style-row">
              <span className="bl-style-label">צבע</span>
              <input
                type="color"
                value={rule.titleTextStyle.color}
                onChange={(e) => updateBlessingTextStyle(rule.id, "title", { color: e.target.value })}
                className="bl-color-swatch"
              />
            </div>
            <div className="bl-text-label" style={{ marginTop: 8 }}>גוף</div>
            <div className="bl-style-row">
              <span className="bl-style-label">גופן</span>
              <select
                className="bl-style-select"
                value={rule.bodyTextStyle.fontFamily}
                onChange={(e) => updateBlessingTextStyle(rule.id, "body", { fontFamily: e.target.value })}
              >
                {["Frank Ruhl Libre", "Heebo", "Assistant", "Rubik", "DM Sans"].map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div className="bl-style-row">
              <span className="bl-style-label">צבע</span>
              <input
                type="color"
                value={rule.bodyTextStyle.color}
                onChange={(e) => updateBlessingTextStyle(rule.id, "body", { color: e.target.value })}
                className="bl-color-swatch"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
