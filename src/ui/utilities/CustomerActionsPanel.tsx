import { Mail, MessageCircle, X } from "lucide-react";
import type { ReactElement } from "react";

interface CustomerActionsPanelProps {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  projectName?: string;
  onClose: () => void;
}

export function CustomerActionsPanel({
  customerName,
  customerPhone,
  customerEmail,
  projectName,
  onClose
}: CustomerActionsPanelProps): ReactElement {
  const hasPhone = (customerPhone ?? "").trim().length > 0;
  const hasEmail = (customerEmail ?? "").trim().length > 0;

  function openWhatsApp(): void {
    const phone = (customerPhone ?? "").replace(/\D/g, "");
    const name = customerName ?? "לקוח";
    const project = projectName ?? "הפרויקט";
    const msg = encodeURIComponent(`שלום ${name}, הכנתי עבורך את ${project}.`);
    const url = `https://wa.me/${phone}?text=${msg}`;
    openLink(url);
  }

  function openEmail(): void {
    const subject = encodeURIComponent(`${projectName ?? "פרויקט"} - ${customerName ?? "לקוח"}`);
    const body = encodeURIComponent(`שלום ${customerName ?? ""},\n\nצרפתי את הפרויקט שהכנתי עבורך.\n\nבברכה,`);
    const url = `mailto:${customerEmail ?? ""}?subject=${subject}&body=${body}`;
    openLink(url);
  }

  function openLink(url: string): void {
    if (window.spp?.openUrl) {
      void window.spp.openUrl(url);
    } else {
      window.open(url, "_blank", "noopener");
    }
  }

  const noCustomer = !hasPhone && !hasEmail;

  return (
    <div className="util-panel customer-panel">
      <div className="util-panel-header">
        <span>כלי לקוח</span>
        <button className="icon-btn" onClick={onClose} type="button"><X size={15} /></button>
      </div>
      <div className="util-panel-body">
        {customerName && (
          <div className="customer-name-badge">{customerName}</div>
        )}

        {noCustomer ? (
          <p className="util-empty-note">לא הוגדר מידע לקוח בפרויקט זה.</p>
        ) : (
          <div className="customer-actions-grid">
            {hasPhone && (
              <button className="customer-action-btn whatsapp" onClick={openWhatsApp} type="button">
                <MessageCircle size={20} />
                <span>WhatsApp</span>
                <span className="customer-action-sub">{customerPhone}</span>
              </button>
            )}
            {hasEmail && (
              <button className="customer-action-btn email" onClick={openEmail} type="button">
                <Mail size={20} />
                <span>אימייל</span>
                <span className="customer-action-sub">{customerEmail}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
