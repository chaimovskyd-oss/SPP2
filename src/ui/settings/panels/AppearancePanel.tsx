import { useEffect, type ReactElement } from "react";
import { useAppSettings } from "@/settings";
import { ColorPicker, SettingsRow, SettingsSection } from "../components";

export function AppearancePanel(): ReactElement {
  const appearance = useAppSettings((s) => s.settings.appearance);
  const update = useAppSettings((s) => s.updateAppearance);

  // Apply appearance colors live as CSS custom properties
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--app-guide-color", appearance.guideColor);
    root.style.setProperty("--app-grid-color", appearance.gridColor);
    root.style.setProperty("--app-safe-area-color", appearance.safeAreaColor);
    root.style.setProperty("--app-bleed-color", appearance.bleedColor);
    root.style.setProperty("--app-selection-color", appearance.selectionColor);
    root.style.setProperty("--bg-canvas", appearance.canvasBackgroundColor);
  }, [appearance]);

  return (
    <div>
      <SettingsSection title="ערכת נושא" description="מראה כללי של ממשק המשתמש.">
        <SettingsRow
          label="ערכת נושא"
          description="צבעי הממשק."
        >
          <select
            className="settings-select"
            value={appearance.theme}
            onChange={(e) => update({ theme: e.target.value as "dark" | "light" | "system" })}
          >
            <option value="dark">כהה (Dark)</option>
            <option value="light" disabled title="בקרוב">
              בהיר (Light) — בקרוב
            </option>
            <option value="system" disabled title="בקרוב">
              לפי מערכת — בקרוב
            </option>
          </select>
        </SettingsRow>

        <SettingsRow label="צפיפות ממשק" description="גודל וריווח אלמנטי ממשק.">
          <select
            className="settings-select"
            value={appearance.uiDensity}
            onChange={(e) => update({ uiDensity: e.target.value as "comfortable" | "compact" })}
          >
            <option value="comfortable">נוח (Comfortable)</option>
            <option value="compact">
              קומפקטי (Compact)
            </option>
          </select>
          {/* TODO: wire uiDensity to CSS body class */}
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="צבעי קנבס" description="צבעי הרקע והאלמנטים הוויזואליים של אזור העריכה. שינויים מיידיים.">
        <SettingsRow label="רקע קנבס" description="צבע הרקע של אזור הציור.">
          <ColorPicker
            value={appearance.canvasBackgroundColor}
            onChange={(v) => update({ canvasBackgroundColor: v })}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="צבעי עזרים" description="צבע קווי עזר, גריד ואזורים מיוחדים.">
        <SettingsRow label="צבע קווי עזר (Guides)">
          <ColorPicker
            value={appearance.guideColor}
            onChange={(v) => update({ guideColor: v })}
          />
          {/* TODO: connect to canvas guide rendering */}
        </SettingsRow>

        <SettingsRow label="צבע גריד">
          <ColorPicker
            value={appearance.gridColor}
            onChange={(v) => update({ gridColor: v })}
          />
          {/* TODO: connect to canvas grid rendering */}
        </SettingsRow>

        <SettingsRow label="צבע אזור בטוח (Safe Area)">
          <ColorPicker
            value={appearance.safeAreaColor}
            onChange={(v) => update({ safeAreaColor: v })}
          />
          {/* TODO: connect to safe area overlay */}
        </SettingsRow>

        <SettingsRow label="צבע כיווץ (Bleed)">
          <ColorPicker
            value={appearance.bleedColor}
            onChange={(v) => update({ bleedColor: v })}
          />
          {/* TODO: connect to bleed overlay */}
        </SettingsRow>

        <SettingsRow label="צבע סימון בחירה">
          <ColorPicker
            value={appearance.selectionColor}
            onChange={(v) => update({ selectionColor: v })}
          />
          {/* TODO: connect to selection transformer */}
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
