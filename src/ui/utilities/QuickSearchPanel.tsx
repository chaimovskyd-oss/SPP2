import { Search, X } from "lucide-react";
import { useState, type ReactElement } from "react";

type SearchService = "freepik" | "spotify" | "google-images";

const SEARCH_SERVICES: { id: SearchService; label: string; emoji: string; buildUrl: (q: string) => string }[] = [
  {
    id: "freepik",
    label: "Freepik",
    emoji: "🎨",
    buildUrl: (q) => `https://www.freepik.com/search?query=${encodeURIComponent(q)}`
  },
  {
    id: "spotify",
    label: "Spotify",
    emoji: "🎵",
    buildUrl: (q) => `https://open.spotify.com/search/${encodeURIComponent(q)}`
  },
  {
    id: "google-images",
    label: "Google Images",
    emoji: "🖼️",
    buildUrl: (q) => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`
  }
];

interface QuickSearchPanelProps {
  onClose: () => void;
}

export function QuickSearchPanel({ onClose }: QuickSearchPanelProps): ReactElement {
  const [service, setService] = useState<SearchService>("freepik");
  const [query, setQuery] = useState("");

  function handleSearch(): void {
    if (!query.trim()) return;
    const svc = SEARCH_SERVICES.find((s) => s.id === service);
    if (!svc) return;
    const url = svc.buildUrl(query);
    if (window.spp?.openUrl) {
      void window.spp.openUrl(url);
    } else {
      window.open(url, "_blank", "noopener");
    }
  }

  return (
    <div className="util-panel quick-search-panel">
      <div className="util-panel-header">
        <span>חיפוש מהיר</span>
        <button className="icon-btn" onClick={onClose} type="button"><X size={15} /></button>
      </div>
      <div className="util-panel-body">
        <div className="qs-service-row">
          {SEARCH_SERVICES.map((svc) => (
            <button
              key={svc.id}
              className={`qs-service-btn ${service === svc.id ? "active" : ""}`}
              onClick={() => setService(svc.id)}
              type="button"
            >
              <span>{svc.emoji}</span>
              {svc.label}
            </button>
          ))}
        </div>
        <div className="qs-search-row">
          <input
            className="util-input qs-input"
            placeholder="חיפוש..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            autoFocus
          />
          <button className="btn btn-accent" onClick={handleSearch} type="button">
            <Search size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
