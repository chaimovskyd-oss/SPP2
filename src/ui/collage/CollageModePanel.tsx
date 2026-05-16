import type { ReactElement } from "react";
import { CollageRightPanel } from "./CollageRightPanel";
import type { CollageRule } from "@/types/collage";
import type { VisualLayer } from "@/types/layers";

interface CollageModePanelProps {
  rule: CollageRule;
  selectedLayer: VisualLayer | null;
}

export function CollageModePanel({ rule, selectedLayer }: CollageModePanelProps): ReactElement {
  const selectedSlotId = selectedLayer?.type === "frame"
    ? ((selectedLayer.metadata["collageFrame"] as { slotId?: string } | undefined)?.slotId ?? null)
    : null;

  return <CollageRightPanel rule={rule} selectedLayer={selectedLayer} selectedSlotId={selectedSlotId} />;
}
