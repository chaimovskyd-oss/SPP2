import { useEffect, useState, useCallback, type ReactElement } from "react";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { generateCollageSuggestions } from "@/core/collage/collageModeEngine";
import { mmToPx } from "@/core/units/conversion";
import { matchShortcut, COLLAGE_SHORTCUTS } from "@/core/input/inputSystem";
import { useDocumentStore } from "@/state/documentStore";
import { CollageLeftPanel } from "./CollageLeftPanel";
import { CollageRightPanel } from "./CollageRightPanel";
import { CollageCanvasView } from "./CollageCanvasView";
import type { CollageImageInput, CollageRule, ScoredLayoutSuggestion } from "@/types/collage";
import type { ID } from "@/types/primitives";

interface CollageScreenProps {
  ruleId: ID;
  onBackHome: () => void;
}

export function CollageScreen({ ruleId, onBackHome }: CollageScreenProps): ReactElement {
  const document = useDocumentStore((s) => s.document);
  const applyCollageLayoutFamily = useDocumentStore((s) => s.applyCollageLayoutFamily);
  const [selectedSlotId, setSelectedSlotId] = useState<ID | null>(null);
  const [swapMode, setSwapMode] = useState(false);
  const [suggestions, setSuggestions] = useState<ScoredLayoutSuggestion[]>([]);
  const swapCollageImages = useDocumentStore((s) => s.swapCollageImages);

  const rule: CollageRule | undefined = document?.collageRules.find((r) => r.id === ruleId);
  const page = rule ? document?.pages.find((p) => p.id === rule.pageId) : undefined;

  // Generate suggestions when rule changes
  useEffect(() => {
    if (!rule || !document || !page) return;
    const dpi = page.setup?.dpi ?? 300;
    const spacingPx = mmToPx(rule.spacingMM, dpi);
    const marginPx = mmToPx(rule.marginMM, dpi);
    const imageInputs: CollageImageInput[] = rule.imagePool.map((assetId) => {
      const asset = document.assets.find((a) => a.id === assetId);
      return { assetId, width: asset?.width ?? 800, height: asset?.height ?? 600 };
    });
    const newSuggestions = generateCollageSuggestions(
      imageInputs, page.width, page.height,
      spacingPx, marginPx, "simple"
    );
    setSuggestions(newSuggestions);
  }, [rule?.id, rule?.imagePool.length, page?.width, page?.height]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const action = matchShortcut(e, COLLAGE_SHORTCUTS);
    if (!action || !document || !rule || !page) return;

    if (action.startsWith("collage.layout")) {
      const idx = parseInt(action.slice(-1), 10) - 1;
      const target = suggestions[idx];
      if (target) {
        applyCollageLayoutFamily(ruleId, target.family, page.width, page.height);
        e.preventDefault();
      }
      return;
    }
    if (action === "collage.deselect") { setSelectedSlotId(null); setSwapMode(false); return; }
    if (action === "collage.swapMode") { setSwapMode((v) => !v); return; }
    if (action === "collage.nextCell" || action === "collage.prevCell") {
      const slots = rule.cachedSlots;
      const idx = slots.findIndex((s) => s.id === selectedSlotId);
      const next = action === "collage.nextCell"
        ? slots[(idx + 1) % slots.length]
        : slots[(idx - 1 + slots.length) % slots.length];
      if (next) { setSelectedSlotId(next.id); e.preventDefault(); }
      return;
    }
  }, [document, ruleId, selectedSlotId, suggestions, applyCollageLayoutFamily, rule, page]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Swap mode: clicking two cells swaps their images
  function handleSelectSlot(slotId: ID | null): void {
    if (!swapMode || !slotId) { setSelectedSlotId(slotId); return; }
    if (selectedSlotId && selectedSlotId !== slotId) {
      swapCollageImages(ruleId, selectedSlotId, slotId);
      setSwapMode(false);
      setSelectedSlotId(null);
    } else {
      setSelectedSlotId(slotId);
    }
  }

  function handleRegenerateSuggestions(): void {
    if (!rule || !document || !page) return;
    const dpi = page.setup?.dpi ?? 300;
    const spacingPx = mmToPx(rule.spacingMM, dpi);
    const marginPx = mmToPx(rule.marginMM, dpi);
    const imageInputs: CollageImageInput[] = rule.imagePool.map((assetId) => {
      const asset = document.assets.find((a) => a.id === assetId);
      return { assetId, width: asset?.width ?? 800, height: asset?.height ?? 600 };
    });
    const newSuggestions = generateCollageSuggestions(
      imageInputs, page.width, page.height,
      spacingPx, marginPx, "creative"
    );
    setSuggestions(newSuggestions);
  }

  function handleSelectLayout(family: CollageRule["activeFamily"]): void {
    if (!page) return;
    applyCollageLayoutFamily(ruleId, family, page.width, page.height);
    setSelectedSlotId(null);
  }

  if (!rule || !document || !page) {
    return <div className="collage-screen-empty">טוען קולאז'...</div>;
  }

  const activeSuggestion = suggestions.find((s) => s.family === rule.activeFamily);
  const scorePercent = activeSuggestion ? Math.round(activeSuggestion.score * 100) : 0;
  const familyLabel = activeSuggestion?.nameHe ?? rule.activeFamily;

  return (
    <div className="collage-screen">
      {/* Toolbar */}
      <header className="collage-toolbar">
        <button type="button" className="btn btn-ghost" onClick={onBackHome}>
          <ArrowLeft size={16} /> בית
        </button>
        <div className="collage-toolbar-center">
          <span className="collage-active-label">
            {familyLabel} · {scorePercent}%
          </span>
        </div>
        <div className="collage-toolbar-actions">
          <button type="button" className="btn btn-ghost" onClick={handleRegenerateSuggestions} title="ייצר הצעות מחדש">
            <RefreshCw size={16} />
          </button>
          <button type="button" className="btn btn-primary" title="ייצא קולאז'">
            <Download size={16} /> ייצא
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="collage-main">
        <CollageLeftPanel
          rule={rule}
          suggestions={suggestions}
          onSelectLayout={handleSelectLayout}
        />

        <main className="collage-canvas-area">
          {swapMode && (
            <div className="collage-swap-banner">
              מצב החלפה — בחר תא שני להחלפה | לחץ Esc לביטול
            </div>
          )}
          <CollageCanvasView
            rule={rule}
            page={page}
            assets={document.assets}
            selectedSlotId={selectedSlotId}
            onSelectSlot={handleSelectSlot}
          />
        </main>

        <CollageRightPanel
          rule={rule}
          selectedSlotId={selectedSlotId}
        />
      </div>
    </div>
  );
}
