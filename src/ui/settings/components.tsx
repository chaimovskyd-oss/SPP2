import type { ReactElement, ReactNode } from "react";

// ─── Shared building blocks used by all settings panels ───────────────────────

interface SettingsRowProps {
  label: string;
  description?: string;
  note?: string;
  children: ReactNode;
}

export function SettingsRow({ label, description, note, children }: SettingsRowProps): ReactElement {
  return (
    <div className="settings-row">
      <div className="settings-row-label">
        <span className="settings-row-name">
          {label}
          {note && <span className="settings-row-note">{note}</span>}
        </span>
        {description && <div className="settings-row-desc">{description}</div>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

interface SettingsToggleProps {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

export function SettingsToggle({ value, onChange, disabled }: SettingsToggleProps): ReactElement {
  return (
    <button
      type="button"
      className={`settings-toggle ${value ? "on" : ""}`}
      onClick={() => !disabled && onChange(!value)}
      aria-checked={value}
      role="switch"
      disabled={disabled}
      style={disabled ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
    >
      <span className="settings-toggle-thumb" />
    </button>
  );
}

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  danger?: boolean;
  sub?: boolean;
}

export function SettingsSection({ title, description, children, danger, sub }: SettingsSectionProps): ReactElement {
  return (
    <div className={`settings-section ${sub ? "settings-subsection" : ""} ${danger ? "settings-danger-zone" : ""}`}>
      <h3 className="settings-section-title">{title}</h3>
      {description && <p className="settings-section-desc">{description}</p>}
      <div className="settings-field-list">{children}</div>
    </div>
  );
}

interface ColorPickerProps {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}

export function ColorPicker({ value, onChange, label }: ColorPickerProps): ReactElement {
  return (
    <div className="settings-color-row">
      {label && <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>}
      <div className="settings-color-wrap" title={value}>
        <div
          className="settings-color-preview"
          style={{ background: value }}
        />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="settings-color-input-hidden"
        />
      </div>
      <span style={{ fontSize: 11, color: "var(--text-tertiary)", direction: "ltr" }}>{value}</span>
    </div>
  );
}
