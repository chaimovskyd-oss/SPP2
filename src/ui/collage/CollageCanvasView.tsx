import { useRef, useState, type ReactElement } from "react";
import { Stage, Layer, Line as KonvaLine } from "react-konva";
import type Konva from "konva";
import { CanvasStage } from "@/ui/editor/CanvasStage";
import { collectDividers, updateSplitRatio } from "@/core/collage/collageSplitTree";
import { useDocumentStore } from "@/state/documentStore";
import { useViewportStore } from "@/state/viewportStore";
import type { CollageRule } from "@/types/collage";
import type { Asset, Page } from "@/types/document";
import type { ID } from "@/types/primitives";

interface CollageCanvasViewProps {
  rule: CollageRule;
  page: Page;
  assets: Asset[];
  selectedSlotId: ID | null;
  onSelectSlot: (slotId: ID | null) => void;
}

const DIVIDER_COLOR = "rgba(34,211,238,0.7)";
/* Non-SplitTree layouts are intentionally not editable with canvas dividers. */

export function CollageCanvasView({
  rule,
  page,
  assets,
  selectedSlotId,
  onSelectSlot
}: CollageCanvasViewProps): ReactElement {
  const applyChange = useDocumentStore((s) => s.applyDocumentChange);
  const viewport = useViewportStore();
  const stageRef = useRef<Konva.Stage | null>(null);
  const [draggingDivider, setDraggingDivider] = useState<string | null>(null);
  void draggingDivider;

  const isSplitTree = rule.activeFamily === "splitTree" && rule.splitTree;

  const scale = Math.min(0.42, 720 / page.height, 820 / page.width) * viewport.zoom;
  const stageW = Math.round(page.width * scale);
  const stageH = Math.round(page.height * scale);

  // Split tree dividers (only for splitTree family)
  const splitDividers = isSplitTree && rule.splitTree
    ? collectDividers(rule.splitTree)
    : [];


  function handleSplitDividerDrag(nodeId: string, e: Konva.KonvaEventObject<DragEvent>): void {
    const node = e.target;
    const divider = splitDividers.find((d) => d.nodeId === nodeId);
    if (!divider || !rule.splitTree) return;

    let newRatio: number;
    if (divider.direction === "H") {
      const newX = node.x() / page.width;
      newRatio = Math.max(0.05, Math.min(0.95, newX));
    } else {
      const newY = node.y() / page.height;
      newRatio = Math.max(0.05, Math.min(0.95, newY));
    }

    const newTree = updateSplitRatio(rule.splitTree, nodeId, newRatio);

    applyChange("AdjustCollageDividerAction", (doc) => ({
      ...doc,
      collageRules: doc.collageRules.map((r) =>
        r.id === rule.id ? { ...r, splitTree: newTree } : r
      )
    }));
  }



  // Map slotId → frameId for selection bridging
  const slotToFrame = new Map<ID, ID>();
  for (const layer of page.layers) {
    const meta = layer.metadata["collageFrame"] as { slotId?: string; collageRuleId?: string } | undefined;
    if (meta?.collageRuleId === rule.id && meta.slotId) {
      slotToFrame.set(meta.slotId, layer.id);
    }
  }
  const selectedFrameId = selectedSlotId ? (slotToFrame.get(selectedSlotId) ?? null) : null;

  return (
    <div className="collage-canvas-view" style={{ transform: `translate(${viewport.panX}px, ${viewport.panY}px)` }}>
      <CanvasStage
        page={page}
        assets={assets}
        selectedLayerId={selectedFrameId}
        selectedLayerIds={selectedFrameId ? [selectedFrameId] : []}
        layoutEditMode={false}
        onSelectLayer={(layerId) => {
          if (!layerId) { onSelectSlot(null); return; }
          const layer = page.layers.find((l) => l.id === layerId);
          const meta = layer?.metadata["collageFrame"] as { slotId?: string } | undefined;
          onSelectSlot(meta?.slotId ?? null);
        }}
        onSelectLayers={() => {}}
        onLayerChange={() => {}}
        editingLayerId={null}
        onBeginTextEdit={() => {}}
        onEndTextEdit={() => {}}
        stageRef={stageRef}
      />

      {/* Dividers overlay (split tree) */}
      {isSplitTree && splitDividers.length > 0 && (
        <Stage
          width={stageW}
          height={stageH}
          scaleX={scale}
          scaleY={scale}
          style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
        >
          <Layer>
            {splitDividers.map((d) => {
              const pts = d.direction === "H"
                ? [d.position * page.width, d.start * page.height, d.position * page.width, d.end * page.height]
                : [d.start * page.width, d.position * page.height, d.end * page.width, d.position * page.height];
              return (
                <KonvaLine
                  key={d.nodeId}
                  points={pts}
                  stroke={DIVIDER_COLOR}
                  strokeWidth={2 / scale}
                  hitStrokeWidth={18 / scale}
                  draggable
                  listening
                  style={{ pointerEvents: "auto" }}
                  onDragStart={() => setDraggingDivider(d.nodeId)}
                  onDragEnd={(e) => handleSplitDividerDrag(d.nodeId, e)}
                />
              );
            })}
          </Layer>
        </Stage>
      )}
    </div>
  );
}
