import type { ReactElement } from "react";
import { useAppSettings } from "@/settings";
import { SettingsRow, SettingsSection, SettingsToggle } from "../components";

const NOTE = "(חל על פרויקטים חדשים)";

export function WorkspacePanel(): ReactElement {
  const ws = useAppSettings((s) => s.settings.workspace);
  const update = useAppSettings((s) => s.updateWorkspace);

  return (
    <div>
      <SettingsSection title="הגדרות עמוד ברירת מחדל" description="ערכי ברירת מחדל לפרויקטים חדשים.">
        <SettingsRow label="גודל עמוד ברירת מחדל" note={NOTE}>
          <select
            className="settings-select"
            value={ws.defaultPageSizePresetId}
            onChange={(e) => update({ defaultPageSizePresetId: e.target.value })}
          >
            <option value="a4">A4</option>
            <option value="a3">A3</option>
            <option value="a5">A5</option>
            <option value="10x15">10×15 ס״מ</option>
            <option value="13x18">13×18 ס״מ</option>
            <option value="15x20">15×20 ס״מ</option>
            <option value="20x20">20×20 ס״מ</option>
            <option value="20x30">20×30 ס״מ</option>
          </select>
        </SettingsRow>

        <SettingsRow label="כיוון עמוד ברירת מחדל" note={NOTE}>
          <select
            className="settings-select"
            value={ws.defaultOrientation}
            onChange={(e) => update({ defaultOrientation: e.target.value as "portrait" | "landscape" })}
          >
            <option value="portrait">לאורך (Portrait)</option>
            <option value="landscape">לרוחב (Landscape)</option>
          </select>
        </SettingsRow>

        <SettingsRow label="שוליים ברירת מחדל (מ״מ)" note={NOTE}>
          <SettingsToggle
            value={ws.defaultMarginsEnabled}
            onChange={(v) => update({ defaultMarginsEnabled: v })}
          />
          {ws.defaultMarginsEnabled && (
            <input
              type="number"
              className="settings-number-input"
              value={ws.defaultMarginsMm}
              min={0}
              max={50}
              step={0.5}
              onChange={(e) => update({ defaultMarginsMm: parseFloat(e.target.value) || 0 })}
            />
          )}
        </SettingsRow>

        <SettingsRow label="כיווץ (Bleed) ברירת מחדל (מ״מ)" note={NOTE}>
          <input
            type="number"
            className="settings-number-input"
            value={ws.defaultBleedMm}
            min={0}
            max={20}
            step={0.5}
            onChange={(e) => update({ defaultBleedMm: parseFloat(e.target.value) || 0 })}
          />
        </SettingsRow>

        <SettingsRow label="אזור בטוח ברירת מחדל (מ״מ)" note={NOTE}>
          <input
            type="number"
            className="settings-number-input"
            value={ws.defaultSafeAreaMm}
            min={0}
            max={20}
            step={0.5}
            onChange={(e) => update({ defaultSafeAreaMm: parseFloat(e.target.value) || 0 })}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="תצוגה ועזרי עריכה" description="ברירות מחדל לסרגלים, גריד ומצמידים.">
        <SettingsRow label="זום ברירת מחדל">
          <select
            className="settings-select"
            value={ws.defaultZoomBehavior}
            onChange={(e) => update({ defaultZoomBehavior: e.target.value as "fitScreen" | "100" | "rememberLast" })}
          >
            <option value="fitScreen">התאמה למסך</option>
            <option value="100">100%</option>
            <option value="rememberLast">זכור זום אחרון</option>
          </select>
        </SettingsRow>

        <SettingsRow label="הצמדה (Snapping)" description="הפעל הצמדה לגריד ולאובייקטים אחרים.">
          <SettingsToggle value={ws.snappingEnabled} onChange={(v) => update({ snappingEnabled: v })} />
        </SettingsRow>

        <SettingsRow label="קווי עזר (Guides)" description="הצג קווי עזר על הקנבס.">
          <SettingsToggle value={ws.guidesEnabled} onChange={(v) => update({ guidesEnabled: v })} />
        </SettingsRow>

        <SettingsRow label="סרגלים (Rulers)" description="הצג סרגלים בשוליים.">
          <SettingsToggle value={ws.rulersEnabled} onChange={(v) => update({ rulersEnabled: v })} />
        </SettingsRow>

        <SettingsRow label="גריד (Grid)" description="הצג גריד ברקע הקנבס.">
          <SettingsToggle value={ws.gridVisible} onChange={(v) => update({ gridVisible: v })} />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="תמונות ואובייקטים" description="התנהגות ברירת מחדל של תמונות ואלמנטים.">
        <SettingsRow label="רווח ברירת מחדל בין אובייקטים (מ״מ)">
          <input
            type="number"
            className="settings-number-input"
            value={ws.defaultObjectSpacingMm}
            min={0}
            max={50}
            step={0.5}
            onChange={(e) => update({ defaultObjectSpacingMm: parseFloat(e.target.value) || 0 })}
          />
        </SettingsRow>

        <SettingsRow label="מצב מילוי תמונה ברירת מחדל" note={NOTE}>
          <select
            className="settings-select"
            value={ws.defaultImageFillMode}
            onChange={(e) => update({ defaultImageFillMode: e.target.value as "cover" | "contain" | "fit" | "stretch" })}
          >
            <option value="cover">Cover — מכסה את המסגרת</option>
            <option value="contain">Contain — נכנס בתוך המסגרת</option>
            <option value="fit">Fit — מותאם לרוחב</option>
            <option value="stretch">Stretch — נמתח לגמרי</option>
          </select>
        </SettingsRow>

        <SettingsRow
          label="סיבוב אוטומטי של תמונות במסגרות"
          description="סובב תמונה אוטומטית כדי שתתאים לכיוון המסגרת."
        >
          <SettingsToggle
            value={ws.autoRotateImagesInFrames}
            onChange={(v) => update({ autoRotateImagesInFrames: v })}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="ברירות מחדל — מצב חופשי (Free Mode)" sub>
        <SettingsRow label="הצמדה מופעלת">
          <SettingsToggle
            value={ws.freeModeDefaults.snappingEnabled}
            onChange={(v) => update({ freeModeDefaults: { ...ws.freeModeDefaults, snappingEnabled: v } })}
          />
        </SettingsRow>
        <SettingsRow label="הצג קווי יישור חכמים">
          <SettingsToggle
            value={ws.freeModeDefaults.showAlignmentGuides}
            onChange={(v) => update({ freeModeDefaults: { ...ws.freeModeDefaults, showAlignmentGuides: v } })}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="ברירות מחדל — מצב גריד (Grid Mode)" sub>
        <SettingsRow label="רווח ברירת מחדל (מ״מ)">
          <input
            type="number"
            className="settings-number-input"
            value={ws.gridModeDefaults.defaultGapMm}
            min={0} max={30} step={0.5}
            onChange={(e) => update({ gridModeDefaults: { ...ws.gridModeDefaults, defaultGapMm: parseFloat(e.target.value) || 0 } })}
          />
        </SettingsRow>
        <SettingsRow label="שוליים ברירת מחדל (מ״מ)">
          <input
            type="number"
            className="settings-number-input"
            value={ws.gridModeDefaults.defaultMarginsMm}
            min={0} max={50} step={0.5}
            onChange={(e) => update({ gridModeDefaults: { ...ws.gridModeDefaults, defaultMarginsMm: parseFloat(e.target.value) || 0 } })}
          />
        </SettingsRow>
        <SettingsRow label="מילוי אוטומטי של תאים">
          <SettingsToggle
            value={ws.gridModeDefaults.autoFill}
            onChange={(v) => update({ gridModeDefaults: { ...ws.gridModeDefaults, autoFill: v } })}
          />
        </SettingsRow>
        <SettingsRow label="סיבוב אוטומטי של תמונה בתא">
          <SettingsToggle
            value={ws.gridModeDefaults.autoRotateImageInCell}
            onChange={(v) => update({ gridModeDefaults: { ...ws.gridModeDefaults, autoRotateImageInCell: v } })}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="ברירות מחדל — מצב גודל (Size Mode)" sub>
        <SettingsRow label="מרווח ברירת מחדל (מ״מ)">
          <input
            type="number"
            className="settings-number-input"
            value={ws.sizeModeDefaults.defaultSpacingMm}
            min={0} max={50} step={0.5}
            onChange={(e) => update({ sizeModeDefaults: { ...ws.sizeModeDefaults, defaultSpacingMm: parseFloat(e.target.value) || 0 } })}
          />
        </SettingsRow>
        <SettingsRow label="מניעת תאים גדולים מהעמוד">
          <SettingsToggle
            value={ws.sizeModeDefaults.preventOversizedCells}
            onChange={(v) => update({ sizeModeDefaults: { ...ws.sizeModeDefaults, preventOversizedCells: v } })}
          />
        </SettingsRow>
        <SettingsRow label="הצג אזהרה על גדלים חורגים">
          <SettingsToggle
            value={ws.sizeModeDefaults.showOversizeWarning}
            onChange={(v) => update({ sizeModeDefaults: { ...ws.sizeModeDefaults, showOversizeWarning: v } })}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="ברירות מחדל — מצב מסכה (Mask Mode)" sub>
        <SettingsRow label="מצב התאמת תמונה למסכה">
          <select
            className="settings-select"
            value={ws.maskModeDefaults.defaultMaskFitMode}
            onChange={(e) => update({ maskModeDefaults: { ...ws.maskModeDefaults, defaultMaskFitMode: e.target.value as "cover" | "contain" | "fit" } })}
          >
            <option value="cover">Cover</option>
            <option value="contain">Contain</option>
            <option value="fit">Fit</option>
          </select>
        </SettingsRow>
        <SettingsRow label="הצג קו מתאר של המסכה">
          <SettingsToggle
            value={ws.maskModeDefaults.showOutlineByDefault}
            onChange={(v) => update({ maskModeDefaults: { ...ws.maskModeDefaults, showOutlineByDefault: v } })}
          />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
