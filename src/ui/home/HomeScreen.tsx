import { AlertTriangle, ArrowLeft, Clock, FileUp, ImageIcon, Search, Settings } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type ReactElement } from "react";
import { getProjectIndexEntries, type ProjectIndexEntry } from "@/core";
import type { ModeType } from "@/types/template";
import { homeModes } from "../data";
import { ExternalAppsHub } from "./ExternalAppsHub";
import { ExternalAppsSettings } from "../utilities/ExternalAppsSettings";

interface HomeScreenProps {
  onOpenMode: (mode: ModeType) => void;
  onOpenProjectFile: (file: File) => void;
  onOpenSettings?: () => void;
}

export function HomeScreen({ onOpenMode, onOpenProjectFile, onOpenSettings }: HomeScreenProps): ReactElement {
  const projectInputRef = useRef<HTMLInputElement>(null);
  const [projects, setProjects] = useState<ProjectIndexEntry[]>(() => getProjectIndexEntries());
  const [query, setQuery] = useState("");
  const [showExtSettings, setShowExtSettings] = useState(false);

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
            <button className="nav-link" type="button">
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
            const isReady = mode.id === "free" || mode.id === "grid" || mode.id === "mask" || mode.id === "collage" || mode.id === "photo_print";
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
            <button className="recent-card project-index-card" key={project.projectUuid} onClick={() => projectInputRef.current?.click()} type="button">
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
