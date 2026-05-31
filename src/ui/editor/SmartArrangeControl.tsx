import { useState, type ReactElement } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import type { SmartArrangeMode } from "@/core/smartArrange";

interface MenuEntry {
  mode: SmartArrangeMode;
  label: string;
  hint: string;
}

const MENU: MenuEntry[] = [
  { mode: "auto", label: "סדר חכם", hint: "מנסה לבחור לבד את הסידור המתאים" },
  { mode: "polish", label: "יישור וניקוי בלבד", hint: "משפר יישור ומרווחים בלי לשנות מבנה" },
  { mode: "spacingOnly", label: "מרווחים בלבד", hint: "משווה מרווחים בין השכבות" },
  { mode: "imageText", label: "תמונה + טקסט", hint: "מסדר תמונה מרכזית לצד טקסטים" },
  { mode: "titleText", label: "כותרת + טקסט", hint: "מסדר היררכיית טקסטים" },
  { mode: "fitToSafeArea", label: "התאם לאזור הדפסה", hint: "מכניס שכבות לתוך האזור הבטוח" }
];

/**
 * Compact Smart Arrange control for the Layers toolbar: a ✨ icon (one-click
 * auto) plus a small caret that opens the explicit-mode menu.
 */
export function SmartArrangeControl({
  onArrange
}: {
  onArrange: (mode: SmartArrangeMode) => void;
}): ReactElement {
  const [open, setOpen] = useState(false);

  return (
    <span className="smart-arrange-control">
      <button
        aria-label="סידור חכם"
        className="smart-arrange-icon-btn"
        onClick={() => onArrange("auto")}
        title="סידור חכם: מסדר שכבות נבחרות או את כל העמוד. Ctrl+Z לביטול."
        type="button"
      >
        <Sparkles size={13} />
      </button>
      <button
        aria-expanded={open}
        aria-label="אפשרויות סידור חכם"
        className="smart-arrange-caret-btn"
        onClick={() => setOpen((v) => !v)}
        title="אפשרויות סידור חכם"
        type="button"
      >
        <ChevronDown size={11} />
      </button>
      {open ? (
        <>
          <div className="layer-add-backdrop" onClick={() => setOpen(false)} />
          <div className="layer-add-popover smart-arrange-popover">
            {MENU.map((entry) => (
              <button
                key={entry.mode}
                onClick={() => {
                  onArrange(entry.mode);
                  setOpen(false);
                }}
                title={entry.hint}
                type="button"
              >
                {entry.mode === "auto" ? <Sparkles size={12} /> : <span className="smart-arrange-dot" />}
                <span className="smart-arrange-label">{entry.label}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </span>
  );
}
