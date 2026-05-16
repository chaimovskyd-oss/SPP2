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

  // Broadcast swap state to KonvaLayerNode instances so they can show/hide the swap dots.
  // slotId = null  → no swap mode, hide dots
  // slotId = actual ID → swap mode active; that slot gets the "source" (purple) style, others cyan
  useEffect(() => {
    const slotId = swapMode ? (selectedSlotId ?? "__swap__") : null;
    window.dispatchEvent(new CustomEvent("spp2:collage-swap-mode-change", { detail: { slotId } }));
  }, [swapMode, selectedSlotId]);

  // Handle blue-dot anchor clicks: first click activates swap mode and selects the source;
  // second click on a different slot performs the swap; clicking the source again cancels.
  const handleAnchorClick = useCallback((slotId: ID): void => {
    if (!selectedSlotId || !swapMode) {
      setSwapMode(true);
      setSelectedSlotId(slotId);
    } else if (selectedSlotId === slotId) {
      setSwapMode(false);
      setSelectedSlotId(null);
    } else {
      swapCollageImages(ruleId, selectedSlotId, slotId);
      setSwapMode(false);
      setSelectedSlotId(null);
    }
  }, [selectedSlotId, swapMode, ruleId, swapCollageImages]);

  useEffect(() => {
    function onAnchorClick(event: Event): void {
      const slotId = (event as CustomEvent<{ slotId: string }>).detail?.slotId;
      if (slotId) handleAnchorClick(slotId);
    }
    window.addEventListener("spp2:collage-slot-anchor-click", onAnchorClick);
    return () => window.removeEventListener("spp2:collage-slot-anchor-click", onAnchorClick);
  }, [handleAnchorClick]);

  // Swap mode: clicking a frame (not a dot) in swap mode selects target or completes swap.
  // Clicking outside (null) cancels swap mode.
  function handleSelectSlot(slotId: ID | null): void {
    if (!slotId) { setSelectedSlotId(null); setSwapMode(false); return; }
    if (!swapMode) { setSelectedSlotId(slotId); return; }
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
        />

        <main className="collage-canvas-area">
          {swapMode && selectedSlotId && (
            <div className="collage-swap-banner">
              מצב החלפה — לחץ על נקודה כחולה בתמונה שנייה להחלפה | Esc לביטול
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
          suggestions={suggestions}
          onSelectLayout={handleSelectLayout}
        />
      </div>
    </div>
  );
}
