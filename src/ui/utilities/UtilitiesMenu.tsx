import {
  ChevronDown,
  ExternalLink,
  Layers,
  Link2,
  MessageSquare,
  QrCode,
  Search,
  Settings2,
  Users,
  X
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ReactElement
} from "react";
import { CustomerActionsPanel } from "./CustomerActionsPanel";
import { ExternalAppsSettings } from "./ExternalAppsSettings";
import { MaskLibraryPanel } from "./MaskLibraryPanel";
import { QRGeneratorPanel } from "./QRGeneratorPanel";
import { QuickLinksPanel } from "./QuickLinksPanel";
import { QuickSearchPanel } from "./QuickSearchPanel";

type UtilPanel = "qr" | "links" | "search" | "customer" | "settings" | "masks" | null;

interface UtilitiesMenuProps {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  projectName?: string;
  onInsertQRToCanvas?: (dataUrl: string) => void;
}

export function UtilitiesMenu({
  customerName,
  customerPhone,
  customerEmail,
  projectName,
  onInsertQRToCanvas
}: UtilitiesMenuProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<UtilPanel>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasCustomer = !!(customerName || customerPhone || customerEmail);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function openPanel(panel: UtilPanel): void {
    setActivePanel(panel);
    setOpen(false);
  }

  function closePanel(): void {
    setActivePanel(null);
  }

  const MENU_ITEMS = [
    {
      id: "qr" as UtilPanel,
      icon: QrCode,
      label: "קודים ו־QR",
      sub: "יצירת QR Code"
    },
    {
      id: "links" as UtilPanel,
      icon: Link2,
      label: "קישורים מהירים",
      sub: "Freepik, Spotify, ChatGPT"
    },
    {
      id: "search" as UtilPanel,
      icon: Search,
      label: "חיפוש מהיר",
      sub: "Freepik, Spotify, Google Images"
    },
    ...(hasCustomer
      ? [{
          id: "customer" as UtilPanel,
          icon: Users,
          label: "כלי לקוח",
          sub: customerName ?? "WhatsApp & Email"
        }]
      : []),
    {
      id: "masks" as UtilPanel,
      icon: Layers,
      label: "ספריית מסיכות",
      sub: "SVG & PNG עיצובים"
    },
    {
      id: "settings" as UtilPanel,
      icon: Settings2,
      label: "הגדרות אפליקציות",
      sub: "Photoshop, Paths..."
    }
  ];

  return (
    <>
      <div className="util-menu-wrapper" ref={menuRef}>
        <button
          className={`btn btn-ghost util-menu-trigger ${open ? "active" : ""}`}
          onClick={() => setOpen((v) => !v)}
          type="button"
          aria-haspopup="true"
          aria-expanded={open}
        >
          <MessageSquare size={14} />
          כלי עזר
          <ChevronDown size={12} className={`util-menu-chevron ${open ? "rotated" : ""}`} />
        </button>

        {open && (
          <div className="util-dropdown" role="menu">
            <div className="util-dropdown-header">
              <span>כלי עזר</span>
              <button className="icon-btn" onClick={() => setOpen(false)} type="button">
                <X size={13} />
              </button>
            </div>
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className="util-menu-item"
                  onClick={() => openPanel(item.id)}
                  role="menuitem"
                  type="button"
                >
                  <span className="util-menu-item-icon">
                    <Icon size={15} />
                  </span>
                  <span className="util-menu-item-text">
                    <span className="util-menu-item-label">{item.label}</span>
                    <span className="util-menu-item-sub">{item.sub}</span>
                  </span>
                  <ExternalLink size={11} className="util-menu-item-arrow" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating panels */}
      {activePanel === "qr" && (
        <FloatingOverlay onClose={closePanel}>
          <QRGeneratorPanel
            onInsertToCanvas={(url) => {
              onInsertQRToCanvas?.(url);
              closePanel();
            }}
            onClose={closePanel}
          />
        </FloatingOverlay>
      )}
      {activePanel === "links" && (
        <FloatingOverlay onClose={closePanel}>
          <QuickLinksPanel onClose={closePanel} />
        </FloatingOverlay>
      )}
      {activePanel === "search" && (
        <FloatingOverlay onClose={closePanel}>
          <QuickSearchPanel onClose={closePanel} />
        </FloatingOverlay>
      )}
      {activePanel === "customer" && (
        <FloatingOverlay onClose={closePanel}>
          <CustomerActionsPanel
            customerName={customerName}
            customerPhone={customerPhone}
            customerEmail={customerEmail}
            projectName={projectName}
            onClose={closePanel}
          />
        </FloatingOverlay>
      )}
      {activePanel === "masks" && (
        <FloatingOverlay onClose={closePanel}>
          <MaskLibraryPanel onClose={closePanel} />
        </FloatingOverlay>
      )}
      {activePanel === "settings" && (
        <FloatingOverlay onClose={closePanel}>
          <ExternalAppsSettings onClose={closePanel} />
        </FloatingOverlay>
      )}
    </>
  );
}

function FloatingOverlay({ children, onClose }: { children: ReactElement; onClose: () => void }): ReactElement {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="util-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      {children}
    </div>
  );
}
