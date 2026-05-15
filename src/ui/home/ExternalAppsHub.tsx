import { ExternalLink, FolderOpen, Settings } from "lucide-react";
import type { ReactElement } from "react";
import { useUtilitiesSettings } from "@/utilities/settingsStore";

interface AppCard {
  key: string;
  label: string;
  emoji: string;
  path: string;
  isFolder: boolean;
  alwaysShow?: boolean;
}

function openLink(url: string): void {
  if (window.spp?.openUrl) {
    void window.spp.openUrl(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}

function openApp(execPath: string): void {
  if (window.spp?.openExternalApp) {
    void window.spp.openExternalApp(execPath);
  }
}

function openFolder(folderPath: string): void {
  if (window.spp?.openFolder) {
    void window.spp.openFolder(folderPath);
  }
}

interface ExternalAppsHubProps {
  onOpenSettings?: () => void;
}

export function ExternalAppsHub({ onOpenSettings }: ExternalAppsHubProps): ReactElement {
  const settings = useUtilitiesSettings();

  const cards: AppCard[] = [
    {
      key: "photoshop",
      label: "Photoshop",
      emoji: "🎨",
      path: settings.photoshopPath,
      isFolder: false
    },
    {
      key: "colorlab",
      label: "ColorLab",
      emoji: "🎨",
      path: settings.colorLabPath,
      isFolder: false
    },
    {
      key: "pdf",
      label: "PDF Editor",
      emoji: "📄",
      path: settings.pdfEditorPath,
      isFolder: false
    },
    {
      key: "collage",
      label: "Collage Editor",
      emoji: "🖼️",
      path: settings.collageEditorPath,
      isFolder: false
    },
    {
      key: "projects",
      label: "Projects Folder",
      emoji: "📁",
      path: settings.projectsFolder,
      isFolder: true
    },
    {
      key: "exports",
      label: "Exports Folder",
      emoji: "📤",
      path: settings.exportsFolder,
      isFolder: true
    }
  ];

  function handleCardClick(card: AppCard): void {
    if (!card.path) return;
    if (card.isFolder) {
      openFolder(card.path);
    } else if (card.path.startsWith("http")) {
      openLink(card.path);
    } else {
      openApp(card.path);
    }
  }

  return (
    <section className="ext-hub-section" aria-label="כלים חיצוניים">
      <div className="ext-hub-header">
        <h2>Hadish Tools</h2>
        <button
          className="nav-link ext-hub-settings-btn"
          onClick={onOpenSettings}
          title="הגדרות נתיבים"
          type="button"
        >
          <Settings size={13} />
          הגדרות נתיבים
        </button>
      </div>
      <div className="ext-hub-grid">
        {cards.map((card) => {
          const configured = card.path.trim().length > 0;
          return (
            <button
              key={card.key}
              className={`ext-hub-card ${configured ? "configured" : "unconfigured"}`}
              onClick={() => handleCardClick(card)}
              disabled={!configured}
              title={configured ? card.path : "נתיב לא הוגדר"}
              type="button"
            >
              <span className="ext-hub-card-emoji">{card.emoji}</span>
              <span className="ext-hub-card-label">{card.label}</span>
              {configured ? (
                <span className="ext-hub-card-action">
                  {card.isFolder ? <FolderOpen size={12} /> : <ExternalLink size={12} />}
                  פתח
                </span>
              ) : (
                <span className="ext-hub-card-unconfigured">Path not configured</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
