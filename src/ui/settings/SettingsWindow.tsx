import {
  useEffect,
  useState,
  type ReactElement,
  type ReactNode
} from "react";
import {
  Settings,
  LayoutTemplate,
  Keyboard,
  Palette,
  Zap,
  Save,
  Printer,
  CreditCard,
  Wrench,
  Search,
  X,
  RotateCcw
} from "lucide-react";
import { useAppSettings } from "@/settings";
import type { SettingsCategory } from "@/settings";
import { GeneralPanel } from "./panels/GeneralPanel";
import { WorkspacePanel } from "./panels/WorkspacePanel";
import { ShortcutsPanel } from "./panels/ShortcutsPanel";
import { AppearancePanel } from "./panels/AppearancePanel";
import { PerformancePanel } from "./panels/PerformancePanel";
import { FilesPanel } from "./panels/FilesPanel";
import { ExportPanel } from "./panels/ExportPanel";
import { PassportPanel } from "./panels/PassportPanel";
import { AdvancedPanel } from "./panels/AdvancedPanel";

interface CategoryDef {
  id: SettingsCategory;
  label: string;
  icon: ReactNode;
  panel: ReactElement;
}

const CATEGORIES: CategoryDef[] = [
  { id: "general",       label: "כללי",            icon: <Settings size={15} />,      panel: <GeneralPanel /> },
  { id: "workspace",     label: "סביבת עבודה",     icon: <LayoutTemplate size={15} />, panel: <WorkspacePanel /> },
  { id: "shortcuts",     label: "קיצורי מקלדת",    icon: <Keyboard size={15} />,      panel: <ShortcutsPanel /> },
  { id: "appearance",    label: "מראה",             icon: <Palette size={15} />,       panel: <AppearancePanel /> },
  { id: "performance",   label: "ביצועים",          icon: <Zap size={15} />,           panel: <PerformancePanel /> },
  { id: "filesAutosave", label: "קבצים ושמירה",    icon: <Save size={15} />,          panel: <FilesPanel /> },
  { id: "exportPrint",   label: "ייצוא והדפסה",    icon: <Printer size={15} />,       panel: <ExportPanel /> },
  { id: "passport",      label: "פספורט",           icon: <CreditCard size={15} />,    panel: <PassportPanel /> },
  { id: "advanced",      label: "מתקדם",            icon: <Wrench size={15} />,        panel: <AdvancedPanel /> }
];

interface SettingsWindowProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsWindow({ open, onClose }: SettingsWindowProps): ReactElement | null {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>("general");
  const [searchQuery, setSearchQuery] = useState("");
  const resetCategory = useAppSettings((s) => s.resetCategory);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose]);

  // Restore scroll position when category changes
  useEffect(() => {
    const el = document.querySelector(".settings-content-area");
    if (el) el.scrollTop = 0;
  }, [activeCategory]);

  if (!open) return null;

  const filteredCategories = searchQuery.trim()
    ? CATEGORIES.filter((c) => c.label.includes(searchQuery.trim()))
    : CATEGORIES;

  const activePanel = CATEGORIES.find((c) => c.id === activeCategory)?.panel ?? null;
  const activeCategoryLabel = CATEGORIES.find((c) => c.id === activeCategory)?.label ?? "";

  function handleResetCategory(): void {
    if (!window.confirm(`לאפס את הגדרות "${activeCategoryLabel}" לברירת המחדל?`)) return;
    resetCategory(activeCategory);
  }

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>): void {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="util-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="הגדרות"
    >
      <div className="settings-window">
        {/* ── Header ── */}
        <div className="settings-header">
          <Settings size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />
          <span className="settings-header-title">הגדרות</span>
          <div className="settings-search-wrap">
            <Search size={13} className="settings-search-icon" />
            <input
              type="text"
              className="settings-search-input"
              placeholder="חפש הגדרה..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                // Auto-navigate if search narrows to a single category
                const matches = CATEGORIES.filter((c) =>
                  c.label.includes(e.target.value.trim())
                );
                if (matches.length === 1) setActiveCategory(matches[0].id);
              }}
            />
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            title="סגור (Escape)"
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="settings-window-body">
          {/* ── Content area ── */}
          <div className="settings-content-area">
            {filteredCategories.length === 0 ? (
              <div className="settings-no-results">
                <Search size={28} style={{ opacity: 0.3 }} />
                <span>לא נמצאו הגדרות תואמות</span>
              </div>
            ) : searchQuery.trim() ? (
              // Search mode: show matching panels
              filteredCategories.map((cat) => (
                <div key={cat.id}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--text-tertiary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      paddingBottom: 8,
                      marginBottom: 4,
                      borderBottom: "1px solid var(--border-soft)"
                    }}
                  >
                    {cat.label}
                  </div>
                  {cat.panel}
                </div>
              ))
            ) : (
              // Normal mode: show active panel
              activePanel
            )}
          </div>

          {/* ── Sidebar ── */}
          <div className="settings-sidebar">
            {CATEGORIES.map((cat) => {
              const isMatch = !searchQuery.trim() || cat.label.includes(searchQuery.trim());
              if (!isMatch) return null;
              return (
                <button
                  key={cat.id}
                  type="button"
                  className={`settings-sidebar-item ${activeCategory === cat.id && !searchQuery.trim() ? "active" : ""}`}
                  onClick={() => {
                    setActiveCategory(cat.id);
                    setSearchQuery("");
                  }}
                >
                  <span className="settings-sidebar-icon">{cat.icon}</span>
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="settings-footer-bar">
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            SPP2 — הגדרות נשמרות אוטומטית
          </span>
          <div className="settings-footer-bar-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleResetCategory}
              title={`אפס את הגדרות "${activeCategoryLabel}"`}
            >
              <RotateCcw size={13} />
              אפס קטגוריה
            </button>
            <button type="button" className="btn btn-accent" onClick={onClose}>
              סגור
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
