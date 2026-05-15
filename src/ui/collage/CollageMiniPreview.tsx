import type { ReactElement } from "react";
import { generateCollageSvgThumbnail } from "@/core/collage/collageSvgThumb";
import type { ScoredLayoutSuggestion } from "@/types/collage";

interface CollageMiniPreviewProps {
  suggestion: ScoredLayoutSuggestion;
  isSelected: boolean;
  isTop: boolean;
  onClick: () => void;
}

export function CollageMiniPreview({ suggestion, isSelected, isTop, onClick }: CollageMiniPreviewProps): ReactElement {
  const svgString = generateCollageSvgThumbnail(suggestion.slots, 160, 120);
  const scorePercent = Math.round(suggestion.score * 100);

  return (
    <button
      type="button"
      className={`collage-mini-preview${isSelected ? " selected" : ""}`}
      onClick={onClick}
    >
      {isTop && <span className="collage-badge-top">מומלץ</span>}
      <div
        className="collage-thumb"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG is generated internally
        dangerouslySetInnerHTML={{ __html: svgString }}
      />
      <div className="collage-preview-info">
        <span className="collage-preview-name">{suggestion.nameHe}</span>
        <span className="collage-family-badge">{suggestion.family}</span>
        <span className="collage-score">{scorePercent}%</span>
      </div>
      <div className="collage-score-bar">
        <div className="collage-score-fill" style={{ width: `${scorePercent}%` }} />
      </div>
    </button>
  );
}
