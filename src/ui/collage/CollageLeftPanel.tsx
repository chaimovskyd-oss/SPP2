import { useRef, useState, type ChangeEvent, type ReactElement } from "react";
import { ImagePlus, Layout, X } from "lucide-react";
import { CollageMiniPreview } from "./CollageMiniPreview";
import { useDocumentStore } from "@/state/documentStore";
import type { CollageLayoutFamily, CollageRule, ScoredLayoutSuggestion } from "@/types/collage";

interface CollageLeftPanelProps {
  rule: CollageRule;
  suggestions: ScoredLayoutSuggestion[];
  onSelectLayout: (family: CollageLayoutFamily) => void;
}

export function CollageLeftPanel({ rule, suggestions, onSelectLayout }: CollageLeftPanelProps): ReactElement {
  const [tab, setTab] = useState<"images" | "layouts">("layouts");
  const addImages = useDocumentStore((s) => s.addImagesToCollage);
  const removeImage = useDocumentStore((s) => s.removeImageFromCollage);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const document = useDocumentStore((s) => s.document);
  const assignedAssetIds = new Set(rule.imageAssignments.map((a) => a.assetId));
  const unassigned = rule.imagePool.filter((id) => !assignedAssetIds.has(id));

  function handleAddImages(e: ChangeEvent<HTMLInputElement>): void {
    if (!e.target.files) return;
    const names = Array.from(e.target.files).map((f) => f.name);
    addImages(rule.id, names);
    e.target.value = "";
  }

  return (
    <aside className="collage-left-panel">
      <div className="panel-tabs">
        <button type="button" className={`panel-tab${tab === "layouts" ? " active" : ""}`} onClick={() => setTab("layouts")}>
          <Layout size={14} /> פריסות
        </button>
        <button type="button" className={`panel-tab${tab === "images" ? " active" : ""}`} onClick={() => setTab("images")}>
          <ImagePlus size={14} /> תמונות
        </button>
      </div>

      {tab === "layouts" && (
        <div className="collage-layouts-list">
          <div className="collage-layouts-scroll">
            {suggestions.map((suggestion, i) => (
              <CollageMiniPreview
                key={suggestion.family}
                suggestion={suggestion}
                isSelected={suggestion.family === rule.activeFamily}
                isTop={i === 0}
                onClick={() => onSelectLayout(suggestion.family)}
              />
            ))}
          </div>
        </div>
      )}

      {tab === "images" && (
        <div className="collage-images-tab">
          <button
            type="button"
            className="btn btn-primary btn-full"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus size={14} /> הוסף תמונות לקולאז'
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={handleAddImages}
          />

          {/* Image pool */}
          <div className="collage-image-pool">
            {rule.imagePool.map((assetId) => {
              const asset = document?.assets.find((a) => a.id === assetId);
              const isAssigned = assignedAssetIds.has(assetId);
              return (
                <div key={assetId} className={`collage-pool-item${isAssigned ? "" : " unassigned"}`}>
                  {asset?.previewPath ? (
                    <img src={asset.previewPath} alt={asset.name} />
                  ) : (
                    <div className="collage-pool-placeholder">{assetId.slice(-6)}</div>
                  )}
                  <button
                    type="button"
                    className="collage-pool-remove"
                    onClick={() => removeImage(rule.id, assetId)}
                    title="הסר מהקולאז'"
                  >
                    <X size={10} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Unassigned section */}
          {unassigned.length > 0 && (
            <div className="collage-unassigned-section">
              <h4>תמונות לא משויכות ({unassigned.length})</h4>
              <div className="collage-unassigned-grid">
                {unassigned.map((assetId) => {
                  const asset = document?.assets.find((a) => a.id === assetId);
                  return (
                    <div key={assetId} className="collage-unassigned-item">
                      {asset?.previewPath ? (
                        <img src={asset.previewPath} alt={asset.name} />
                      ) : (
                        <div className="collage-pool-placeholder" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
