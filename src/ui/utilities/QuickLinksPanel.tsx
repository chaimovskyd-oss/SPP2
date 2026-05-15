import { ExternalLink, X } from "lucide-react";
import type { ReactElement } from "react";

const QUICK_LINKS = [
  { label: "ChatGPT", url: "https://chatgpt.com", emoji: "🤖", description: "AI Assistant" },
  { label: "Freepik", url: "https://www.freepik.com", emoji: "🎨", description: "תמונות ו-vectors" },
  { label: "Spotify", url: "https://open.spotify.com", emoji: "🎵", description: "מוזיקה" },
  { label: "Spotify Codes", url: "https://www.spotifycodes.com", emoji: "📲", description: "קודי Spotify" }
];

interface QuickLinksPanelProps {
  onClose: () => void;
}

export function QuickLinksPanel({ onClose }: QuickLinksPanelProps): ReactElement {
  function openLink(url: string): void {
    if (window.spp?.openUrl) {
      void window.spp.openUrl(url);
    } else {
      window.open(url, "_blank", "noopener");
    }
  }

  return (
    <div className="util-panel quick-links-panel">
      <div className="util-panel-header">
        <span>קישורים מהירים</span>
        <button className="icon-btn" onClick={onClose} type="button"><X size={15} /></button>
      </div>
      <div className="util-panel-body">
        <div className="quick-links-grid">
          {QUICK_LINKS.map((link) => (
            <button
              key={link.url}
              className="quick-link-card"
              onClick={() => openLink(link.url)}
              type="button"
            >
              <span className="quick-link-emoji">{link.emoji}</span>
              <span className="quick-link-label">{link.label}</span>
              <span className="quick-link-desc">{link.description}</span>
              <ExternalLink size={12} className="quick-link-icon" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
