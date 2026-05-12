import type { ReactElement } from "react";
import { Crop, MoveHorizontal, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { resetContentTransform } from "@/core/rendering/frameFitEngine";
import type { ContentTransform, FrameLayer } from "@/types/layers";
import type { FitMode } from "@/types/primitives";

interface CropUIProps {
  layer: FrameLayer;
  onPatch: (patch: Partial<FrameLayer>) => void;
}

/**
 * ממשק חיתוך לא-הרסני לפריים עם תמונה.
 * מאפשר הזזת תמונה, זום, שינוי מצב fit ואיפוס.
 */
export function CropUI({ layer, onPatch }: CropUIProps): ReactElement {
  const transform = layer.contentTransform;

  function patchTransform(patch: Partial<ContentTransform>): void {
    onPatch({ contentTransform: { ...transform, ...patch } });
  }

  function handleFitMode(mode: FitMode): void {
    onPatch({ fitMode: mode, contentTransform: resetContentTransform() });
  }

  function handleReset(): void {
    onPatch({ contentTransform: resetContentTransform() });
  }

  return (
    <div className="crop-ui">
      <div className="crop-ui-header">
        <Crop size={13} />
        <span>מיקום תמונה</span>
      </div>

      {/* מצב התאמה */}
      <div className="field">
        <span className="field-label">מצב התאמה</span>
        <div className="seg">
          <button
            className={layer.fitMode === "fill" ? "on" : ""}
            onClick={() => handleFitMode("fill")}
            title="מלא — ממלא את הפריים, חיתוך אפשרי"
            type="button"
          >
            מלא
          </button>
          <button
            className={layer.fitMode === "fit" ? "on" : ""}
            onClick={() => handleFitMode("fit")}
            title="התאם — כל התמונה גלויה"
            type="button"
          >
            התאם
          </button>
          <button
            className={layer.fitMode === "stretch" ? "on" : ""}
            onClick={() => handleFitMode("stretch")}
            title="מתח — התמונה נמתחת לגודל הפריים"
            type="button"
          >
            מתח
          </button>
          <button
            className={layer.fitMode === "smartCrop" ? "on" : ""}
            onClick={() => handleFitMode("smartCrop")}
            title="חיתוך חכם — מתמקד אוטומטית בתוכן"
            type="button"
          >
            חכם
          </button>
        </div>
      </div>

      {layer.fitMode !== "stretch" && (
        <>
          {/* זום תוכן */}
          <label className="field slider-field">
            <div className="slider-header">
              <span className="field-label">
                <ZoomIn size={12} />
                זום
              </span>
              <span className="slider-value">{Math.round(transform.scale * 100)}%</span>
            </div>
            <input
              className="slider"
              max={3}
              min={0.5}
              onChange={(e) => patchTransform({ scale: Number(e.target.value) })}
              step={0.05}
              type="range"
              value={transform.scale}
            />
          </label>

          {/* הזזה אופקית */}
          <label className="field slider-field">
            <div className="slider-header">
              <span className="field-label">
                <MoveHorizontal size={12} />
                הזזה אופקית
              </span>
              <span className="slider-value">{Math.round(transform.offsetX)}</span>
            </div>
            <input
              className="slider"
              max={layer.width}
              min={-layer.width}
              onChange={(e) => patchTransform({ offsetX: Number(e.target.value) })}
              step={1}
              type="range"
              value={transform.offsetX}
            />
          </label>

          {/* הזזה אנכית */}
          <label className="field slider-field">
            <div className="slider-header">
              <span className="field-label">הזזה אנכית</span>
              <span className="slider-value">{Math.round(transform.offsetY)}</span>
            </div>
            <input
              className="slider"
              max={layer.height}
              min={-layer.height}
              onChange={(e) => patchTransform({ offsetY: Number(e.target.value) })}
              step={1}
              type="range"
              value={transform.offsetY}
            />
          </label>
        </>
      )}

      {/* כפתורי פעולה */}
      <div className="button-row">
        <button
          className="toggle"
          onClick={handleReset}
          title="אפס מיקום לברירת מחדל"
          type="button"
        >
          <RotateCcw size={13} />
          איפוס
        </button>
        <button
          className="toggle"
          onClick={() => patchTransform({ scale: Math.min(3, transform.scale * 1.15) })}
          type="button"
        >
          <ZoomIn size={13} />
        </button>
        <button
          className="toggle"
          onClick={() => patchTransform({ scale: Math.max(0.5, transform.scale / 1.15) })}
          type="button"
        >
          <ZoomOut size={13} />
        </button>
      </div>

      {layer.fitMode === "smartCrop" && (
        <p className="crop-ui-note">
          חיתוך חכם: Python מזהה פנים ותוכן. אם השירות אינו זמין — מרכז אוטומטי.
        </p>
      )}
    </div>
  );
}
