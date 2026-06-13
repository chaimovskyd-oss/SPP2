import { AlertTriangle, ArrowLeft, BookOpen, Clock, Cloud, FileUp, ImageIcon, Images, Layers, Link2, Printer, QrCode, Search, Settings, SlidersHorizontal, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type ReactElement } from "react";
import { getProjectIndexEntries, type ProjectIndexEntry } from "@/core";
import type { ModeType } from "@/types/template";
import { homeModes } from "../data";
import { ExternalAppsHub } from "./ExternalAppsHub";
import { ExternalAppsSettings } from "../utilities/ExternalAppsSettings";
import { BatchBackgroundRemovePanel } from "../utilities/BatchBackgroundRemovePanel";
import { SmartPrintPreparePanel } from "../utilities/SmartPrintPreparePanel";
import { MaskLibraryPanel } from "../utilities/MaskLibraryPanel";
import { QRGeneratorPanel } from "../utilities/QRGeneratorPanel";
import { QuickLinksPanel } from "../utilities/QuickLinksPanel";
import { QuickSearchPanel } from "../utilities/QuickSearchPanel";
import { PrintHubPanel } from "../printHub/PrintHubPanel";

const USER_GUIDE_URL = "/docs/guide-mapping/spp2-user-guide-he.html";
const USER_GUIDE_NEVER_PROMPT_KEY = "spp2-user-guide-never-prompt";
const USER_GUIDE_SESSION_DISMISSED_KEY = "spp2-user-guide-session-dismissed";

interface HomeScreenProps {
  onOpenMode: (mode: ModeType) => void;
  onOpenProjectFile: (file: File) => void;
  /** Open a recent project directly. Resolve to false to fall back to the file picker. */
  onOpenRecentProject?: (project: ProjectIndexEntry) => Promise<boolean>;
  onImportPsd?: () => void;
  onOpenSettings?: () => void;
  onOpenBatchLibrary?: () => void;
  onOpenCloudLibrary?: () => void;
}

export function HomeScreen({ onOpenMode, onOpenProjectFile, onOpenRecentProject, onImportPsd, onOpenSettings, onOpenBatchLibrary, onOpenCloudLibrary }: HomeScreenProps): ReactElement {
  const projectInputRef = useRef<HTMLInputElement>(null);
  const [projects, setProjects] = useState<ProjectIndexEntry[]>(() => getProjectIndexEntries());
  const [query, setQuery] = useState("");
  const [showExtSettings, setShowExtSettings] = useState(false);
  const [showGuidePrompt, setShowGuidePrompt] = useState(false);
  const [utilPanel, setUtilPanel] = useState<"masks" | "qr" | "links" | "search" | "batch-bg" | "smart-prepare" | "print-hub" | null>(null);

  useEffect(() => {
    function refreshProjects(): void {
      setProjects(getProjectIndexEntries());
    }
    refreshProjects();
    window.addEventListener("focus", refreshProjects);
    window.addEventListener("storage", refreshProjects);
    return () => {
      window.removeEventListener("focus", refreshProjects);
      window.removeEventListener("storage", refreshProjects);
    };
  }, []);

  useEffect(() => {
    try {
      const neverPrompt = window.localStorage.getItem(USER_GUIDE_NEVER_PROMPT_KEY) === "1";
      const dismissedThisSession = window.sessionStorage.getItem(USER_GUIDE_SESSION_DISMISSED_KEY) === "1";
      setShowGuidePrompt(!neverPrompt && !dismissedThisSession);
    } catch {
      setShowGuidePrompt(false);
    }
  }, []);

  const filteredProjects = useMemo(() => {
    const normalized = normalizeSearch(query);
    return normalized.length === 0 ? projects : projects.filter((project) => projectMatches(project, normalized));
  }, [projects, query]);

  function handleProjectFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file !== undefined) {
      onOpenProjectFile(file);
    }
    event.target.value = "";
  }

  async function handleOpenRecent(project: ProjectIndexEntry): Promise<void> {
    if (onOpenRecentProject !== undefined) {
      const handled = await onOpenRecentProject(project);
      if (handled) return;
    }
    // No on-disk path (or not running in Electron) — let the user locate the file.
    projectInputRef.current?.click();
  }

  async function openSmartPrepareWindow(): Promise<void> {
    if (window.spp?.openModeWindow !== undefined) {
      const result = await window.spp.openModeWindow({
        mode: "smart-prepare",
        title: "SPP2-SMART PRINT PREPARE"
      });
      if (result.success) return;
    }
    const url = `${window.location.origin}${window.location.pathname}#/window/smart-prepare`;
    const opened = window.open(url, "spp-smart-print-prepare", "width=1500,height=950,noopener");
    if (opened === null) {
      setUtilPanel("smart-prepare");
    }
  }

  function openUserGuide(): void {
    // Open via the main process (shell.openPath → default browser). A renderer
    // window.open(file://) is blocked by the navigation guard's setWindowOpenHandler.
    const api = window.spp;
    if (api?.openUserGuide) {
      void api.openUserGuide().then((res) => {
        if (res?.error) {
          console.error("Failed to open user guide:", res.error);
          window.open(USER_GUIDE_URL, "spp2-user-guide", "noopener");
        }
      });
      return;
    }
    window.open(USER_GUIDE_URL, "spp2-user-guide", "noopener");
  }

  function dismissGuidePrompt(): void {
    try {
      window.sessionStorage.setItem(USER_GUIDE_SESSION_DISMISSED_KEY, "1");
    } catch {
      // Non-critical: the prompt can simply reappear next load.
    }
    setShowGuidePrompt(false);
  }

  function openGuideFromPrompt(): void {
    dismissGuidePrompt();
    openUserGuide();
  }

  function neverShowGuidePrompt(): void {
    try {
      window.localStorage.setItem(USER_GUIDE_NEVER_PROMPT_KEY, "1");
      window.sessionStorage.setItem(USER_GUIDE_SESSION_DISMISSED_KEY, "1");
    } catch {
      // Non-critical: keep the UI responsive even if storage is unavailable.
    }
    setShowGuidePrompt(false);
  }

  return (
    <main className="home-shell" data-testid="home-screen">
      <div className="home-wrap">
        <header className="topnav">
          <div className="logo">
            <span className="logo-dot" />
            SPP <span>v2</span>
          </div>
          <nav className="nav-links" aria-label="ניווט ראשי">
            <button className="nav-link" type="button">
              <Clock size={14} />
              פרויקטים אחרונים
            </button>
            <button
              className="nav-link"
              type="button"
              onClick={onOpenSettings}
              title="הגדרות (Ctrl+,)"
            >
              <Settings size={14} />
              הגדרות
            </button>
          </nav>
        </header>

        <section className="home-actions" aria-label="פעולות פרויקט">
          <button className="btn btn-accent" onClick={() => projectInputRef.current?.click()} type="button">
            <FileUp size={15} />
            פתח פרויקט קיים
          </button>
          <button className="btn btn-ghost" onClick={openUserGuide} type="button">
            <BookOpen size={15} />
            מדריך משתמש
          </button>
          {onImportPsd !== undefined ? (
            <button className="btn btn-ghost" onClick={onImportPsd} type="button">
              <Layers size={15} />
              ייבוא PSD
            </button>
          ) : null}
          {onOpenCloudLibrary !== undefined ? (
            <button className="btn btn-ghost" onClick={onOpenCloudLibrary} type="button">
              <Cloud size={15} />
              הענן שלי
            </button>
          ) : null}
          <label className="project-search">
            <Search size={15} />
            <input
              aria-label="חיפוש פרויקטים"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="חיפוש לפי לקוח, טלפון, סוג, שם קובץ..."
              type="search"
              value={query}
            />
          </label>
          <input ref={projectInputRef} accept=".json,.spp.json,.spp,.spp2" hidden onChange={handleProjectFileChange} type="file" />
        </section>

        <section className="hero">
          <h1>מה תרצה ליצור היום?</h1>
          <p>בחר מצב עבודה כדי להתחיל, או פתח פרויקט קיים מההיסטוריה ומהקבצים שלך.</p>
        </section>

        <section className="modes-grid" aria-label="מצבי עבודה">
          {homeModes.map((mode) => {
            const Icon = mode.icon;
            const isReady = mode.id === "free" || mode.id === "grid" || mode.id === "mask" || mode.id === "collage" || mode.id === "photo_print" || mode.id === "pdf_tools" || mode.id === "class_photo" || mode.id === "blessing";
            return (
              <button
                className="mode-card"
                data-testid={`mode-${mode.id}`}
                key={mode.id}
                onClick={() => onOpenMode(mode.id)}
                style={{ "--mode-color": mode.color } as CSSProperties}
                type="button"
              >
                <span className="mode-icon">
                  <Icon size={24} strokeWidth={1.8} />
                </span>
                <span className="mode-title">{mode.title}</span>
                <span className="mode-desc">{mode.description}</span>
                <span className="mode-state">{isReady ? "זמין" : "בהמשך"}</span>
                <ArrowLeft className="mode-arrow" size={16} />
              </button>
            );
          })}
        </section>

        {/* ── Utilities quick access ── */}
        <section className="util-hub-section" aria-label="כלי עזר">
          <div className="ext-hub-header">
            <h2>כלי עזר</h2>
          </div>
          <div className="util-hub-grid">
            <button
              className="util-hub-card"
              onClick={() => void openSmartPrepareWindow()}
              type="button"
            >
              <span className="util-hub-card-icon"><SlidersHorizontal size={18} /></span>
              <span className="util-hub-card-label">הכנה חכמה לדפוס</span>
              <span className="util-hub-card-sub">Crop, צבע, DPI</span>
            </button>
            {([
              { id: "masks" as const, icon: Layers, label: "ספריית מסיכות", sub: "SVG & PNG" },
              { id: "batch-bg" as const, icon: Images, label: "הסרת רקע כמותית", sub: "PNG שקוף" },
              { id: "qr" as const, icon: QrCode, label: "קודים ו-QR", sub: "יצירת QR Code" },
              { id: "links" as const, icon: Link2, label: "קישורים מהירים", sub: "Freepik, ChatGPT..." },
              { id: "search" as const, icon: Search, label: "חיפוש מהיר", sub: "Google Images..." },
              { id: "print-hub" as const, icon: Printer, label: "מרכז הדפסות", sub: "תור הדפסה ושרת" }
            ]).map(({ id, icon: Icon, label, sub }) => (
              <button
                key={id}
                className="util-hub-card"
                onClick={() => setUtilPanel(id)}
                type="button"
              >
                <span className="util-hub-card-icon"><Icon size={18} /></span>
                <span className="util-hub-card-label">{label}</span>
                <span className="util-hub-card-sub">{sub}</span>
              </button>
            ))}
          </div>
        </section>

        {onOpenBatchLibrary && (
          <section className="util-hub-section" aria-label="ייצור סדרתי">
            <div className="ext-hub-header">
              <h2>ייצור סדרתי</h2>
            </div>
            <div className="util-hub-grid">
              <button
                className="util-hub-card"
                onClick={onOpenBatchLibrary}
                type="button"
                style={{ "--mode-color": "#a855f7" } as React.CSSProperties}
              >
                <span className="util-hub-card-icon"><Zap size={18} /></span>
                <span className="util-hub-card-label">תבניות ייצור</span>
                <span className="util-hub-card-sub">Batch Production</span>
              </button>
            </div>
          </section>
        )}

        <ExternalAppsHub onOpenSettings={onOpenSettings ?? (() => setShowExtSettings(true))} />

        <section className="section-title">
          <h2>פרויקטים אחרונים</h2>
          <button onClick={() => projectInputRef.current?.click()} type="button">
            פתח מקובץ
            <ArrowLeft size={12} />
          </button>
        </section>

        <section className="recent-grid" aria-label="פרויקטים אחרונים">
          {filteredProjects.length === 0 ? (
            <div className="recent-empty">
              <strong>{projects.length === 0 ? "אין עדיין פרויקטים באינדקס" : "לא נמצאו פרויקטים"}</strong>
              <span>{projects.length === 0 ? "צור פרויקט או פתח קובץ קיים כדי שיופיע כאן." : "נסה שם לקוח, טלפון, סוג פרויקט או חלק מנתיב הקובץ."}</span>
            </div>
          ) : null}
          {filteredProjects.slice(0, 12).map((project) => (
            <button className="recent-card project-index-card" key={project.projectUuid} onClick={() => void handleOpenRecent(project)} type="button">
              {project.thumbnailPath !== undefined ? (
                <img alt="" className="recent-thumb image" src={project.thumbnailPath} />
              ) : (
                <span className="recent-thumb">
                  <ImageIcon size={18} />
                </span>
              )}
              <span className="recent-copy">
                <strong>{project.displayName}</strong>
                <span>{project.customerName || "ללא שם לקוח"} · {project.customerPhone || "ללא טלפון"}</span>
                <span>{project.projectType} · {formatProjectTime(project.lastOpenedAt ?? project.lastSavedAt ?? project.updatedAt)}</span>
                {project.filePath !== undefined ? <span className="recent-path">{project.filePath}</span> : null}
              </span>
              <ProjectStatus project={project} />
            </button>
          ))}
        </section>
      </div>

      {showExtSettings && (
        <div className="util-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowExtSettings(false); }}>
          <ExternalAppsSettings onClose={() => setShowExtSettings(false)} />
        </div>
      )}
      {showGuidePrompt && (
        <div className="util-overlay" onClick={(e) => { if (e.target === e.currentTarget) dismissGuidePrompt(); }}>
          <section className="first-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="first-guide-title">
            <div className="first-guide-icon"><BookOpen size={22} /></div>
            <div className="first-guide-copy">
              <h2 id="first-guide-title">חדש ב-SPP2?</h2>
              <p>יש מדריך משתמש אינטראקטיבי עם חיפוש, הסברים לפי מצב עבודה וצילומי מסך מסומנים. מומלץ לפתוח אותו בפעם הראשונה כדי להכיר את הכלים המרכזיים.</p>
            </div>
            <div className="first-guide-actions">
              <button className="btn btn-accent" onClick={openGuideFromPrompt} type="button">
                <BookOpen size={15} />
                היכנס למדריך
              </button>
              <button className="btn btn-ghost" onClick={dismissGuidePrompt} type="button">
                לא כרגע
              </button>
              <button className="btn btn-ghost first-guide-muted-action" onClick={neverShowGuidePrompt} type="button">
                אל תציע שוב
              </button>
            </div>
          </section>
        </div>
      )}
      {utilPanel === "masks" && (
        <div className="util-overlay" onClick={(e) => { if (e.target === e.currentTarget) setUtilPanel(null); }}>
          <MaskLibraryPanel onClose={() => setUtilPanel(null)} />
        </div>
      )}
      {utilPanel === "batch-bg" && (
        <div className="util-overlay" onClick={(e) => { if (e.target === e.currentTarget) setUtilPanel(null); }}>
          <BatchBackgroundRemovePanel onClose={() => setUtilPanel(null)} />
        </div>
      )}
      {utilPanel === "smart-prepare" && (
        <div className="util-overlay" onClick={(e) => { if (e.target === e.currentTarget) setUtilPanel(null); }}>
          <SmartPrintPreparePanel onClose={() => setUtilPanel(null)} />
        </div>
      )}
      {utilPanel === "print-hub" && (
        <div className="util-overlay" onClick={(e) => { if (e.target === e.currentTarget) setUtilPanel(null); }}>
          <PrintHubPanel onClose={() => setUtilPanel(null)} />
        </div>
      )}
      {utilPanel === "qr" && (
        <div className="util-overlay" onClick={(e) => { if (e.target === e.currentTarget) setUtilPanel(null); }}>
          <QRGeneratorPanel onInsertToCanvas={() => setUtilPanel(null)} onClose={() => setUtilPanel(null)} />
        </div>
      )}
      {utilPanel === "links" && (
        <div className="util-overlay" onClick={(e) => { if (e.target === e.currentTarget) setUtilPanel(null); }}>
          <QuickLinksPanel onClose={() => setUtilPanel(null)} />
        </div>
      )}
      {utilPanel === "search" && (
        <div className="util-overlay" onClick={(e) => { if (e.target === e.currentTarget) setUtilPanel(null); }}>
          <QuickSearchPanel onClose={() => setUtilPanel(null)} />
        </div>
      )}
    </main>
  );
}

function ProjectStatus({ project }: { project: ProjectIndexEntry }): ReactElement {
  if (project.isCorrupted) {
    return <span className="project-status danger"><AlertTriangle size={13} /> פגום</span>;
  }
  if (!project.fileExists) {
    return <span className="project-status warning"><AlertTriangle size={13} /> חסר</span>;
  }
  if (project.hasRecovery) {
    return <span className="project-status recovery">שחזור</span>;
  }
  return <ArrowLeft className="recent-open-icon" size={14} />;
}

function projectMatches(project: ProjectIndexEntry, normalizedQuery: string): boolean {
  return [
    project.displayName,
    project.customerName,
    project.customerPhone,
    project.customerEmail,
    project.projectType,
    project.filePath,
    project.projectState
  ].some((value) => normalizeSearch(value ?? "").includes(normalizedQuery));
}

function normalizeSearch(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function formatProjectTime(value: string | undefined): string {
  if (value === undefined) {
    return "ללא תאריך";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("he-IL", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}
