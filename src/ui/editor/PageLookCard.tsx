import { type ReactElement } from "react";
import { ThrottledSlider } from "@/ui/editor/ThrottledSlider";
import type { PageLookEffect, PageLookEffectKind, PageLookLayer } from "@/types/imageAdjustments";

/**
 * Shared per-page-look editor card. Used both in the Page Look settings panel and
 * in the Layers-panel "Page Adjustments" section so the controls stay identical
 * and edit the same store state. Pure presentational — all mutations flow through
 * the callbacks the parent wires to the document store.
 */

interface EffectSlider {
  key: string;
  label: string;
  min: number;
  max: number;
  step?: number;
}

const EFFECT_SLIDERS: Record<PageLookEffectKind, EffectSlider[]> = {
  colorOverlay: [{ key: "opacity", label: "אטימות", min: 0, max: 1, step: 0.01 }],
  wash: [{ key: "opacity", label: "אטימות", min: 0, max: 1, step: 0.01 }],
  gradientOverlay: [
    { key: "opacity", label: "אטימות", min: 0, max: 1, step: 0.01 },
    { key: "angle", label: "זווית", min: 0, max: 360 }
  ],
  vignette: [
    { key: "amount", label: "עוצמה", min: 0, max: 1, step: 0.01 },
    { key: "softness", label: "ריכוך", min: 0, max: 1, step: 0.01 },
    { key: "roundness", label: "עגלגלות", min: 0, max: 1, step: 0.01 }
  ],
  grain: [
    { key: "amount", label: "עוצמה", min: 0, max: 1, step: 0.01 },
    { key: "size", label: "גודל", min: 0.2, max: 3, step: 0.1 }
  ]
};

export interface PageLookCardProps {
  look: PageLookLayer;
  disableUp: boolean;
  disableDown: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onPatchMeta: (patch: Partial<Omit<PageLookLayer, "id" | "effect">>) => void;
  onPatchEffect: (patch: Partial<PageLookEffect>) => void;
  /** Optional reset-to-defaults handler. When provided, a ↺ button appears in the header. */
  onReset?: () => void;
  /** Optional title prefix, e.g. "Page Look: ". */
  namePrefix?: string;
  /** Hide the up/down reorder buttons (when the host has its own ordering UI). */
  hideReorder?: boolean;
}

export function PageLookCard({
  look,
  disableUp,
  disableDown,
  onToggle,
  onRemove,
  onMoveUp,
  onMoveDown,
  onPatchMeta,
  onPatchEffect,
  onReset,
  namePrefix,
  hideReorder = false
}: PageLookCardProps): ReactElement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const effect = look.effect as any;
  const sliders = EFFECT_SLIDERS[look.effect.kind];
  const hasColor = look.effect.kind === "colorOverlay" || look.effect.kind === "wash" || look.effect.kind === "vignette";

  return (
    <div
      style={{
        border: "1px solid var(--color-border,#2a2a3e)",
        borderRadius: 6,
        padding: "8px 10px",
        opacity: look.enabled ? 1 : 0.5,
        display: "flex",
        flexDirection: "column",
        gap: 6
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          <input type="checkbox" checked={look.enabled} onChange={onToggle} style={{ accentColor: "var(--accent)" }} />
          {namePrefix !== undefined ? `${namePrefix}${look.name}` : look.name}
        </label>
        <div style={{ display: "flex", gap: 2 }}>
          {!hideReorder && (
            <>
              <button type="button" onClick={onMoveUp} disabled={disableUp} title="העלה" style={iconBtn}>▲</button>
              <button type="button" onClick={onMoveDown} disabled={disableDown} title="הורד" style={iconBtn}>▼</button>
            </>
          )}
          {onReset !== undefined && (
            <button type="button" onClick={onReset} title="איפוס לברירת מחדל" style={iconBtn}>↺</button>
          )}
          <button type="button" onClick={onRemove} title="הסר" style={{ ...iconBtn, fontSize: 16 }}>✕</button>
        </div>
      </div>

      <ThrottledSlider
        label="עוצמה (Strength)"
        value={look.strength}
        min={0}
        max={1}
        step={0.01}
        onCommit={(v) => onPatchMeta({ strength: v })}
        format={(v) => String(Math.round(v * 100) / 100)}
      />

      {hasColor && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-secondary,#888)" }}>
          צבע
          <input
            type="color"
            value={typeof effect.color === "string" ? effect.color : "#000000"}
            onChange={(e) => onPatchEffect({ color: e.target.value } as Partial<PageLookEffect>)}
            style={{ width: 36, height: 26 }}
          />
        </label>
      )}

      {sliders.map((cfg) => {
        const value = typeof effect[cfg.key] === "number" ? (effect[cfg.key] as number) : cfg.min;
        return (
          <ThrottledSlider
            key={cfg.key}
            label={cfg.label}
            value={value}
            min={cfg.min}
            max={cfg.max}
            step={cfg.step ?? 1}
            onCommit={(v) => onPatchEffect({ [cfg.key]: v } as Partial<PageLookEffect>)}
            format={(v) => String(Math.round(v * 100) / 100)}
          />
        );
      })}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--color-text-secondary,#888)",
  cursor: "pointer",
  fontSize: 11,
  padding: "0 3px"
};
