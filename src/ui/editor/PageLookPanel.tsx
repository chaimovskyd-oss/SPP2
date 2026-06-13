import { useState, type ReactElement } from "react";
import { useDocumentStore } from "@/state/documentStore";
import { ToolLibrary } from "@/ui/editor/ToolLibrary";
import { PageLookCard } from "@/ui/editor/PageLookCard";
import type { LibraryItem } from "@/core/presets/toolLibrary";
import { ENABLE_PAGE_LOOK_LAYERS } from "@/core/features/adjustmentFlags";
import { createPageLookLayer, type ImageAdjustmentTemplate, type PageLookLayer } from "@/types/imageAdjustments";

/** Stable empty reference — see PageAdjustmentsSection for why this matters. */
const EMPTY_LOOKS: PageLookLayer[] = [];

export function PageLookPanel(): ReactElement | null {
  const pageId = useDocumentStore((s) => s.activePageId);
  const pageCount = useDocumentStore((s) => s.document?.pages.length ?? 1);
  const pageLooks = useDocumentStore(
    (s) => s.document?.pages.find((p) => p.id === s.activePageId)?.pageLooks ?? EMPTY_LOOKS
  );
  const addPageLook = useDocumentStore((s) => s.addPageLook);
  const updatePageLook = useDocumentStore((s) => s.updatePageLook);
  const updatePageLookEffect = useDocumentStore((s) => s.updatePageLookEffect);
  const togglePageLook = useDocumentStore((s) => s.togglePageLook);
  const removePageLook = useDocumentStore((s) => s.removePageLook);
  const reorderPageLook = useDocumentStore((s) => s.reorderPageLook);
  const applyPresetAsPageLook = useDocumentStore((s) => s.applyPresetAsPageLook);
  const addPageLookToAllPages = useDocumentStore((s) => s.addPageLookToAllPages);
  const applyPresetAsPageLookToAllPages = useDocumentStore((s) => s.applyPresetAsPageLookToAllPages);

  const [libraryOpen, setLibraryOpen] = useState(false);

  if (!ENABLE_PAGE_LOOK_LAYERS || pageId === null) return null;

  const handleLibraryApply = (item: LibraryItem, strength: number, _applyToAll: boolean, _duplicate: boolean, _extra: ImageAdjustmentTemplate[], applyToAllPages: boolean): void => {
    if (item.kind === "effect" && item.effectKind !== undefined) {
      if (applyToAllPages) addPageLookToAllPages({ kind: item.effectKind });
      else addPageLook(pageId, createPageLookLayer({ kind: item.effectKind }));
    } else if (item.kind === "pageLookPreset" && item.presetId !== undefined) {
      if (applyToAllPages) applyPresetAsPageLookToAllPages(item.presetId, strength);
      else applyPresetAsPageLook(pageId, item.presetId, strength);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-secondary,#888)", lineHeight: 1.5 }}>
        שכבות אווירה עליונות שמוחלות מעל כל העמוד. רצות מעל התוכן בלי לשמור cache של מה שמתחת — תצוגה וייצוא זהים.
      </p>

      <button className="btn btn-primary" type="button" onClick={() => setLibraryOpen(true)}>
        + ספריית כלים
      </button>

      {libraryOpen && (
        <ToolLibrary context="page" pageCount={pageCount} onApply={handleLibraryApply} onClose={() => setLibraryOpen(false)} />
      )}

      {pageLooks.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-tertiary,#666)" }}>אין שכבות אווירה בעמוד זה.</p>
      ) : (
        pageLooks.map((look, index) => (
          <PageLookCard
            key={look.id}
            look={look}
            disableUp={index === pageLooks.length - 1}
            disableDown={index === 0}
            onToggle={() => togglePageLook(pageId, look.id)}
            onRemove={() => removePageLook(pageId, look.id)}
            onMoveUp={() => reorderPageLook(pageId, look.id, "up")}
            onMoveDown={() => reorderPageLook(pageId, look.id, "down")}
            onPatchMeta={(patch) => updatePageLook(pageId, look.id, patch)}
            onPatchEffect={(patch) => updatePageLookEffect(pageId, look.id, patch)}
          />
        ))
      )}
    </div>
  );
}
