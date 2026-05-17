import { useEffect, type ReactElement } from "react";
import { useAppSettings } from "@/settings";
import { ColorPicker, SettingsRow, SettingsSection } from "../components";

const SOON = <span className="settings-coming-soon">בקרוב</span>;

export function AppearancePanel(): ReactElement {
  const appearance = useAppSettings((s) => s.settings.appearance);
  const update = useAppSettings((s) => s.updateAppearance);

  // Apply canvas background live — the only color currently wired to the real canvas
  useEffect(() => {
    document.documentElement.style.setProperty("--bg-canvas", appearance.canvasBackgroundColor);
  }, [appearance.canvasBackgroundColor]);

  return (
    <div>
      <SettingsSection title="ערכת נושא" description="מראה כללי של ממשק המשתמש.">
        <SettingsRow label="ערכת נושא">
          <select
            className="settings-select"
            value={appearance.theme}
            onChange={(e) => update({ theme: e.target.value as "dark" | "light" | "system" })}
          >
            <option value="dark">כהה (Dark)</option>
            <option value="light" disabled>בהיר (Light) — בקרוב</option>
            <option value="system" disabled>לפי מערכת — בקרוב</option>
          </select>
        </SettingsRow>

        <SettingsRow
          label={<>צפיפות ממשק {SOON}</>}
          description="גודל וריווח אלמנטי ממשק."
        >
          <select
            className="settings-select"
            value={appearance.uiDensity}
            onChange={(e) => update({ uiDensity: e.target.value as "comfortable" | "compact" })}
            disabled
          >
            <option value="comfortable">נוח (Comfortable)</option>
            <option value="compact">קומפקטי (Compact)</option>
          </select>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="צבעי קנבס" description="רקע אזור העריכה — שינוי מיידי.">
        <SettingsRow label="רקע קנבס" description="צבע הרקע של אזור הציור.">
          <ColorPicker
            value={appearance.canvasBackgroundColor}
            onChange={(v) => update({ canvasBackgroundColor: v })}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title={<>צבעי עזרים {SOON}</>}
        description="צבעי קווי עזר, גריד ואזורים. יחוברו לקנבס בגרסה עתידית."
      >
        <SettingsRow label={<>צבע קווי עזר (Guides) {SOON}</>}>
          <ColorPicker
            value={appearance.guideColor}
            onChange={(v) => update({ guideColor: v })}
          />
        </SettingsRow>

        <SettingsRow label={<>צבע גריד {SOON}</>}>
          <ColorPicker
            value={appearance.gridColor}
            onChange={(v) => update({ gridColor: v })}
          />
        </SettingsRow>

        <SettingsRow label={<>צבע אזור בטוח (Safe Area) {SOON}</>}>
          <ColorPicker
            value={appearance.safeAreaColor}
            onChange={(v) => update({ safeAreaColor: v })}
          />
        </SettingsRow>

        <SettingsRow label={<>צבע כיווץ (Bleed) {SOON}</>}>
          <ColorPicker
            value={appearance.bleedColor}
            onChange={(v) => update({ bleedColor: v })}
          />
        </SettingsRow>

        <SettingsRow label={<>צבע סימון בחירה {SOON}</>}>
          <ColorPicker
            value={appearance.selectionColor}
            onChange={(v) => update({ selectionColor: v })}
          />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
