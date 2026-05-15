import { Download, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import QRCode from "qrcode";

type QRType = "url" | "text" | "phone" | "whatsapp" | "wifi" | "maps" | "vcard";

const QR_TYPES: { id: QRType; label: string }[] = [
  { id: "url", label: "קישור URL" },
  { id: "text", label: "טקסט חופשי" },
  { id: "phone", label: "טלפון" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "wifi", label: "WiFi" },
  { id: "maps", label: "Google Maps" },
  { id: "vcard", label: "כרטיס עסקי (vCard)" }
];

function buildQRContent(type: QRType, fields: Record<string, string>): string {
  switch (type) {
    case "url":
      return fields.url ?? "";
    case "text":
      return fields.text ?? "";
    case "phone":
      return `tel:${fields.phone ?? ""}`;
    case "whatsapp": {
      const num = (fields.phone ?? "").replace(/\D/g, "");
      const msg = encodeURIComponent(fields.message ?? "");
      return `https://wa.me/${num}${msg ? `?text=${msg}` : ""}`;
    }
    case "wifi":
      return `WIFI:T:${fields.security ?? "WPA"};S:${fields.ssid ?? ""};P:${fields.password ?? ""};;`;
    case "maps":
      return `https://maps.google.com/?q=${encodeURIComponent(fields.address ?? "")}`;
    case "vcard":
      return [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `FN:${fields.name ?? ""}`,
        `TEL:${fields.phone ?? ""}`,
        `EMAIL:${fields.email ?? ""}`,
        `ORG:${fields.org ?? ""}`,
        "END:VCARD"
      ].join("\n");
    default:
      return "";
  }
}

interface QRGeneratorPanelProps {
  onInsertToCanvas: (dataUrl: string) => void;
  onClose: () => void;
}

export function QRGeneratorPanel({ onInsertToCanvas, onClose }: QRGeneratorPanelProps): ReactElement {
  const [qrType, setQrType] = useState<QRType>("url");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [fgColor, setFgColor] = useState("#000000");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [bgTransparent, setBgTransparent] = useState(false);
  const [errorLevel, setErrorLevel] = useState<"L" | "M" | "Q" | "H">("M");
  const [margin, setMargin] = useState(2);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const setField = (key: string, value: string) => setFields((prev) => ({ ...prev, [key]: value }));

  const generate = useCallback(async () => {
    const content = buildQRContent(qrType, fields);
    if (!content.trim()) return;
    setGenerating(true);
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      await QRCode.toCanvas(canvas, content, {
        errorCorrectionLevel: errorLevel,
        margin,
        color: {
          dark: fgColor,
          light: bgTransparent ? "#00000000" : bgColor
        },
        width: 400
      });
      setQrDataUrl(canvas.toDataURL("image/png"));
    } catch (err) {
      console.error("QR generation failed", err);
    } finally {
      setGenerating(false);
    }
  }, [qrType, fields, fgColor, bgColor, bgTransparent, errorLevel, margin]);

  useEffect(() => {
    setFields({});
    setQrDataUrl(null);
  }, [qrType]);

  function handleDownload(): void {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `qr-${qrType}-${Date.now()}.png`;
    a.click();
  }

  function handleInsert(): void {
    if (!qrDataUrl) return;
    onInsertToCanvas(qrDataUrl);
    onClose();
  }

  return (
    <div className="util-panel qr-panel" role="dialog" aria-label="מחולל QR">
      <div className="util-panel-header">
        <span>יצירת קוד QR</span>
        <button className="icon-btn" onClick={onClose} type="button"><X size={15} /></button>
      </div>

      <div className="util-panel-body">
        <label className="util-field-label">סוג QR</label>
        <div className="qr-type-grid">
          {QR_TYPES.map((t) => (
            <button
              key={t.id}
              className={`qr-type-btn ${qrType === t.id ? "active" : ""}`}
              onClick={() => setQrType(t.id)}
              type="button"
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="qr-fields">
          {qrType === "url" && (
            <input className="util-input" placeholder="https://example.com" value={fields.url ?? ""} onChange={(e) => setField("url", e.target.value)} />
          )}
          {qrType === "text" && (
            <textarea className="util-input util-textarea" placeholder="הכנס טקסט חופשי..." value={fields.text ?? ""} onChange={(e) => setField("text", e.target.value)} rows={3} />
          )}
          {(qrType === "phone" || qrType === "whatsapp") && (
            <>
              <input className="util-input" placeholder="מספר טלפון (+972...)" value={fields.phone ?? ""} onChange={(e) => setField("phone", e.target.value)} />
              {qrType === "whatsapp" && (
                <input className="util-input" placeholder="הודעה (אופציונלי)" value={fields.message ?? ""} onChange={(e) => setField("message", e.target.value)} />
              )}
            </>
          )}
          {qrType === "wifi" && (
            <>
              <input className="util-input" placeholder="שם הרשת (SSID)" value={fields.ssid ?? ""} onChange={(e) => setField("ssid", e.target.value)} />
              <input className="util-input" placeholder="סיסמה" value={fields.password ?? ""} onChange={(e) => setField("password", e.target.value)} />
              <select className="util-input" value={fields.security ?? "WPA"} onChange={(e) => setField("security", e.target.value)}>
                <option value="WPA">WPA/WPA2</option>
                <option value="WEP">WEP</option>
                <option value="nopass">ללא סיסמה</option>
              </select>
            </>
          )}
          {qrType === "maps" && (
            <input className="util-input" placeholder="כתובת / שם מקום" value={fields.address ?? ""} onChange={(e) => setField("address", e.target.value)} />
          )}
          {qrType === "vcard" && (
            <>
              <input className="util-input" placeholder="שם מלא" value={fields.name ?? ""} onChange={(e) => setField("name", e.target.value)} />
              <input className="util-input" placeholder="טלפון" value={fields.phone ?? ""} onChange={(e) => setField("phone", e.target.value)} />
              <input className="util-input" placeholder="אימייל" value={fields.email ?? ""} onChange={(e) => setField("email", e.target.value)} />
              <input className="util-input" placeholder="חברה / ארגון" value={fields.org ?? ""} onChange={(e) => setField("org", e.target.value)} />
            </>
          )}
        </div>

        <div className="qr-style-row">
          <label className="util-field-label">צבע QR
            <input type="color" value={fgColor} onChange={(e) => setFgColor(e.target.value)} className="util-color-input" />
          </label>
          <label className="util-field-label">רקע
            <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="util-color-input" disabled={bgTransparent} />
          </label>
          <label className="util-field-label util-checkbox-label">
            <input type="checkbox" checked={bgTransparent} onChange={(e) => setBgTransparent(e.target.checked)} />
            שקוף
          </label>
          <label className="util-field-label">תיקון שגיאות
            <select className="util-input compact" value={errorLevel} onChange={(e) => setErrorLevel(e.target.value as typeof errorLevel)}>
              <option value="L">L (7%)</option>
              <option value="M">M (15%)</option>
              <option value="Q">Q (25%)</option>
              <option value="H">H (30%)</option>
            </select>
          </label>
          <label className="util-field-label">מרווח
            <input type="range" min={0} max={8} value={margin} onChange={(e) => setMargin(Number(e.target.value))} className="util-range" />
          </label>
        </div>

        <button className="btn btn-accent" onClick={() => void generate()} disabled={generating} type="button">
          {generating ? "מייצר..." : "צור QR"}
        </button>

        {/* Hidden canvas for generation */}
        <canvas ref={canvasRef} style={{ display: "none" }} />

        {qrDataUrl && (
          <div className="qr-preview">
            <img src={qrDataUrl} alt="QR Code preview" className="qr-preview-img" />
            <div className="qr-preview-actions">
              <button className="btn btn-ghost" onClick={handleDownload} type="button">
                <Download size={14} /> הורד PNG
              </button>
              <button className="btn btn-accent" onClick={handleInsert} type="button">
                הכנס לקנבס
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
