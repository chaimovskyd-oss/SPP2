import { ChevronDown, FlaskConical, Send } from "lucide-react";
import { useEffect, useRef, useState, type ReactElement } from "react";

import "./printHub.css";

interface PrintActionsButtonProps {
  onPrint: () => void;
  onSendRemote: () => void;
  disabled?: boolean;
}

/** Main print button backed by the Advanced Print engine, plus remote Print Hub send. */
export function PrintActionsButton({ onPrint, onSendRemote, disabled }: PrintActionsButtonProps): ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function run(action: () => void): void {
    setOpen(false);
    action();
  }

  return (
    <div className="print-actions" ref={ref}>
      <button className="btn btn-ghost print-actions-main" type="button" title="הדפסה מתקדמת" onClick={() => run(onPrint)} disabled={disabled}>
        <FlaskConical size={14} /> הדפסה מתקדמת
      </button>
      <button
        className="btn btn-ghost print-actions-caret"
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        title="אפשרויות הדפסה"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
      >
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="print-actions-menu" role="menu" dir="rtl">
          <button className="print-actions-item" type="button" onClick={() => run(onSendRemote)}>
            <Send size={14} /> <span>שלח להדפסה מרוחקת</span>
          </button>
        </div>
      )}
    </div>
  );
}
