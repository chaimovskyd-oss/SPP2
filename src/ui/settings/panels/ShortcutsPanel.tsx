import { useEffect, useState, type ReactElement } from "react";
import { X, RotateCcw } from "lucide-react";
import { useAppSettings, DEFAULT_APP_SETTINGS } from "@/settings";
import type { AppShortcut, ShortcutModifiers } from "@/settings";
import { SettingsSection } from "../components";

function formatShortcut(sc: Pick<AppShortcut, "currentKey" | "currentCtrl" | "currentMeta" | "currentShift" | "currentAlt">): string {
  if (!sc.currentKey) return "—";
  const parts: string[] = [];
  if (sc.currentCtrl) parts.push("Ctrl");
  if (sc.currentMeta) parts.push("⌘");
  if (sc.currentShift) parts.push("Shift");
  if (sc.currentAlt) parts.push("Alt");
  const key = sc.currentKey === " " ? "Space" : sc.currentKey;
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join("+");
}

function isEditableTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || (el as HTMLElement).isContentEditable;
}

export function ShortcutsPanel(): ReactElement {
  const shortcuts = useAppSettings((s) => s.settings.shortcuts.shortcuts);
  const nudgeStep = useAppSettings((s) => s.settings.shortcuts.nudgeStepMm);
  const nudgeLarge = useAppSettings((s) => s.settings.shortcuts.nudgeLargeStepMm);
  const updateShortcuts = useAppSettings((s) => s.updateShortcuts);
  const updateShortcutKey = useAppSettings((s) => s.updateShortcutKey);

  const [capturingAction, setCapturingAction] = useState<string | null>(null);
  const [conflictAction, setConflictAction] = useState<string | null>(null);

  function findConflict(action: string, key: string, mods: ShortcutModifiers): string | null {
    const norm = key.toLowerCase();
    const other = shortcuts.find(
      (sc) =>
        sc.action !== action &&
        (sc.currentKey ?? "").toLowerCase() === norm &&
        Boolean(sc.currentCtrl) === Boolean(mods.ctrl) &&
        Boolean(sc.currentMeta) === Boolean(mods.meta) &&
        Boolean(sc.currentShift) === Boolean(mods.shift) &&
        Boolean(sc.currentAlt) === Boolean(mods.alt)
    );
    return other?.action ?? null;
  }

  useEffect(() => {
    if (!capturingAction) return;

    function onKeyDown(e: KeyboardEvent): void {
      // Ignore if focus is in a real text field
      if (isEditableTarget(document.activeElement) && document.activeElement !== document.body) return;

      // Modifier-only presses: skip
      if (["Control", "Meta", "Shift", "Alt"].includes(e.key)) return;

      e.preventDefault();
      e.stopPropagation();

      const mods: ShortcutModifiers = {
        ctrl: e.ctrlKey || undefined,
        meta: e.metaKey || undefined,
        shift: e.shiftKey || undefined,
        alt: e.altKey || undefined
      };

      // Escape cancels capture
      if (e.key === "Escape" && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
        setCapturingAction(null);
        setConflictAction(null);
        return;
      }

      if (!capturingAction) return;
      const conflict = findConflict(capturingAction, e.key, mods);
      setConflictAction(conflict);
      updateShortcutKey(capturingAction, e.key, mods);
      setCapturingAction(null);
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [capturingAction, shortcuts, updateShortcutKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function clearShortcut(action: string): void {
    const def = DEFAULT_APP_SETTINGS.shortcuts.shortcuts.find((s) => s.action === action);
    if (!def) return;
    updateShortcutKey(action, null, {
      ctrl: def.ctrl, meta: def.meta, shift: def.shift, alt: def.alt
    });
    if (conflictAction === action) setConflictAction(null);
  }

  function resetAllShortcuts(): void {
    if (!window.confirm("לאפס את כל קיצורי המקלדת לברירת המחדל?")) return;
    updateShortcuts({ shortcuts: DEFAULT_APP_SETTINGS.shortcuts.shortcuts });
    setCapturingAction(null);
    setConflictAction(null);
  }

  return (
    <div>
      <SettingsSection
        title="קיצורי מקלדת"
        description="לחץ על תא הקיצור כדי לשנות. לחץ Escape לביטול. לחיצה על X מחזירה לברירת המחדל."
      >
        <div className="shortcuts-table">
          {shortcuts.map((sc) => {
            const isCapturing = capturingAction === sc.action;
            const hasConflict = conflictAction === sc.action;
            return (
              <div className="shortcut-row" key={sc.action}>
                <span className="shortcut-action-label">{sc.label}</span>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <button
                    type="button"
                    className={`shortcut-key-badge ${isCapturing ? "capturing" : ""}`}
                    onClick={() => {
                      setCapturingAction(isCapturing ? null : sc.action);
                      setConflictAction(null);
                    }}
                    title={isCapturing ? "הקש את הקיצור החדש..." : "לחץ לשינוי"}
                  >
                    {isCapturing ? (
                      <span style={{ color: "var(--accent-hover)", fontFamily: "inherit" }}>הקש...</span>
                    ) : sc.currentKey ? (
                      formatShortcut(sc)
                    ) : (
                      <span className="shortcut-key-none">ללא</span>
                    )}
                  </button>
                  {hasConflict && (
                    <span className="shortcut-conflict-warn">
                      התנגשות עם: {shortcuts.find((s) => s.action === conflictAction)?.label ?? conflictAction}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  title="איפוס לברירת מחדל"
                  onClick={() => clearShortcut(sc.action)}
                >
                  <RotateCcw size={11} />
                </button>
              </div>
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection title="הגדרות תנועת לחצנים" sub description="צעד התנועה בעת לחיצה על מקשי החצים.">
        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-name">צעד קטן (Arrow)</span>
            <div className="settings-row-desc">מ״מ לצעד בודד</div>
          </div>
          <div className="settings-row-control">
            <input
              type="number"
              className="settings-number-input"
              value={nudgeStep}
              min={0.1} max={10} step={0.1}
              onChange={(e) => updateShortcuts({ nudgeStepMm: parseFloat(e.target.value) || 1 })}
            />
          </div>
        </div>
        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-name">צעד גדול (Shift+Arrow)</span>
            <div className="settings-row-desc">מ״מ לצעד גדול</div>
          </div>
          <div className="settings-row-control">
            <input
              type="number"
              className="settings-number-input"
              value={nudgeLarge}
              min={1} max={100} step={1}
              onChange={(e) => updateShortcuts({ nudgeLargeStepMm: parseFloat(e.target.value) || 10 })}
            />
          </div>
        </div>
      </SettingsSection>

      <div style={{ paddingTop: 16, display: "flex", justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ghost" onClick={resetAllShortcuts}>
          <X size={13} />
          איפוס כל הקיצורים
        </button>
      </div>
    </div>
  );
}
