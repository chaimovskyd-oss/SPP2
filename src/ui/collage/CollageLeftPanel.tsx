import { useRef, type ChangeEvent, type ReactElement } from "react";
import { ImagePlus, X } from "lucide-react";
import { useDocumentStore } from "@/state/documentStore";
import type { CollageRule } from "@/types/collage";

interface CollageLeftPanelProps {
  rule: CollageRule;
}

export function CollageLeftPanel({ rule }: CollageLeftPanelProps): ReactElement {
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
      <div className="collage-images-tab">
        <button
          type="button"
          className="btn btn-primary btn-full"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus size={14} /> הוסף תמונות לקולאז&apos;
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
    </aside>
  );
}
