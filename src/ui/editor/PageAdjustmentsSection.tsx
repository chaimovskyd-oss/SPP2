import { useState, type ReactElement } from "react";
import { useDocumentStore } from "@/state/documentStore";
import { PageLookCard } from "@/ui/editor/PageLookCard";
import { ENABLE_PAGE_LOOK_LAYERS } from "@/core/features/adjustmentFlags";
import { PAGE_LOOK_EFFECT_DEFAULTS, type PageLookEffect, type PageLookLayer } from "@/types/imageAdjustments";

/**
 * Stable empty reference for the pageLooks selector. Returning a fresh `[]` from
 * a zustand selector on every render breaks reference equality and causes an
 * infinite re-render loop (the Layers panel would crash on open).
 */
const EMPTY_LOOKS: PageLookLayer[] = [];

/**
 * "Page Adjustments" block at the TOP of the Layers panel (plan שלב 4 follow-up).
 *
 * Page Looks are page-level overlays, not object layers in the canvas stack — but
 * they MUST be visible and controllable in the Layers panel so the user always
 * knows an effect is applied and can toggle / strengthen / edit / reset / delete
 * it. They live in their own dedicated section above the object layers because
 * they affect the entire page.
 *
 * Each item reuses the shared PageLookCard, prefixed with "Page Look: ", giving
 * eye toggle, strength, the effect recipe sliders, reset and delete.
 */
export function PageAdjustmentsSection(): ReactElement | null {
  const pageId = useDocumentStore((s) => s.activePageId);
  const pageLooks = useDocumentStore(
    (s) => s.document?.pages.find((p) => p.id === s.activePageId)?.pageLooks ?? EMPTY_LOOKS
  );
  const updatePageLook = useDocumentStore((s) => s.updatePageLook);
  const updatePageLookEffect = useDocumentStore((s) => s.updatePageLookEffect);
  const togglePageLook = useDocumentStore((s) => s.togglePageLook);
  const removePageLook = useDocumentStore((s) => s.removePageLook);
  const reorderPageLook = useDocumentStore((s) => s.reorderPageLook);

  const [collapsed, setCollapsed] = useState(false);

  if (!ENABLE_PAGE_LOOK_LAYERS || pageId === null || pageLooks.length === 0) return null;

  const resetLook = (lookId: string, kind: PageLookEffect["kind"]): void => {
    updatePageLook(pageId, lookId, { strength: 1, opacity: 1 });
    updatePageLookEffect(pageId, lookId, { ...PAGE_LOOK_EFFECT_DEFAULTS[kind] } as Partial<PageLookEffect>);
  };

  return (
    <section className="page-adjustments-section" aria-label="התאמות עמוד" style={{ marginBottom: 10 }}>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          background: "none",
          border: "none",
          padding: "2px 0",
          cursor: "pointer",
          color: "var(--color-text-secondary,#aaa)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.3
        }}
      >
        <span style={{ fontSize: 10 }}>{collapsed ? "▶" : "▼"}</span>
        התאמות עמוד
        <span style={{ color: "var(--color-text-tertiary,#666)", fontWeight: 400 }}>({pageLooks.length})</span>
      </button>

      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
          {pageLooks.map((look, index) => (
            <PageLookCard
              key={look.id}
              look={look}
              namePrefix="Page Look: "
              disableUp={index === pageLooks.length - 1}
              disableDown={index === 0}
              onToggle={() => togglePageLook(pageId, look.id)}
              onRemove={() => removePageLook(pageId, look.id)}
              onMoveUp={() => reorderPageLook(pageId, look.id, "up")}
              onMoveDown={() => reorderPageLook(pageId, look.id, "down")}
              onPatchMeta={(patch) => updatePageLook(pageId, look.id, patch)}
              onPatchEffect={(patch) => updatePageLookEffect(pageId, look.id, patch)}
              onReset={() => resetLook(look.id, look.effect.kind)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
