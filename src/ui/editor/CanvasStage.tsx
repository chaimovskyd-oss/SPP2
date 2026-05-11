import { useEffect, useMemo, useRef, useState } from "react";
import { Layer, Rect, Stage, Transformer } from "react-konva";
import type Konva from "konva";
import { getVisualLayerBounds, measureTextLayerSize, normalizeRect, rectsIntersect } from "@/core/text/measurement";
import type { Asset, Page } from "@/types/document";
import type { Rect as RectType } from "@/types/primitives";
import type { TextLayer, VisualLayer } from "@/types/layers";
import { SCREEN_HELPER_NODE_NAME } from "./canvasNodeNames";
import { KonvaLayerNode } from "./KonvaLayerNode";

interface CanvasStageProps {
  page: Page;
  assets: Asset[];
  selectedLayerId: string | null;
  selectedLayerIds: string[];
  onSelectLayer: (layerId: string | null) => void;
  onSelectLayers: (layerIds: string[]) => void;
  onLayerChange: (layer: VisualLayer) => void;
  editingLayerId: string | null;
  onBeginTextEdit: (layerId: string) => void;
  onEndTextEdit: () => void;
  stageRef: React.RefObject<Konva.Stage | null>;
}

export function CanvasStage({
  page,
  assets,
  selectedLayerId,
  selectedLayerIds,
  onSelectLayer,
  onSelectLayers,
  onLayerChange,
  editingLayerId,
  onBeginTextEdit,
  onEndTextEdit,
  stageRef
}: CanvasStageProps): React.ReactElement {
  const transformerRef = useRef<Konva.Transformer>(null);
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<RectType | null>(null);
  const scale = useMemo(() => Math.min(0.42, 720 / page.height), [page.height]);
  const stageWidth = Math.round(page.width * scale);
  const stageHeight = Math.round(page.height * scale);
  const selectedTextLayer = useMemo(
    () => page.layers.find((layer): layer is TextLayer => layer.type === "text" && layer.id === selectedLayerId) ?? null,
    [page.layers, selectedLayerId]
  );
  const editingLayer = useMemo(
    () => page.layers.find((layer): layer is TextLayer => layer.type === "text" && layer.id === editingLayerId) ?? null,
    [editingLayerId, page.layers]
  );

  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (transformer === null || stage === null) {
      return;
    }
    const nodes = selectedLayerIds
      .map((layerId) => stage.findOne(`#${layerId}`))
      .filter((node): node is Konva.Node => node !== undefined);
    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [selectedLayerIds, stageRef, page.layers]);

  function getPointerPosition(): { x: number; y: number } | null {
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (stage === undefined || stage === null || pointer === undefined || pointer === null) {
      return null;
    }
    return {
      x: pointer.x / scale,
      y: pointer.y / scale
    };
  }

  function finishMarqueeSelection(): void {
    if (marqueeRect === null || marqueeRect.width < 4 || marqueeRect.height < 4) {
      marqueeStartRef.current = null;
      setMarqueeRect(null);
      return;
    }
    const selectedIds = page.layers
      .filter((layer) => layer.visible && !layer.locked && rectsIntersect(getVisualLayerBounds(layer), marqueeRect))
      .map((layer) => layer.id);
    onSelectLayers(selectedIds);
    marqueeStartRef.current = null;
    setMarqueeRect(null);
  }

  return (
    <div className="canvas-frame" data-testid="canvas-frame">
      <Stage
        ref={stageRef}
        width={stageWidth}
        height={stageHeight}
        scaleX={scale}
        scaleY={scale}
        onMouseDown={(event) => {
          if (event.target === event.target.getStage()) {
            const pointer = getPointerPosition();
            marqueeStartRef.current = pointer;
            setMarqueeRect(pointer === null ? null : { ...pointer, width: 0, height: 0 });
          }
        }}
        onMouseMove={() => {
          const start = marqueeStartRef.current;
          const pointer = getPointerPosition();
          if (start !== null && pointer !== null) {
            setMarqueeRect(normalizeRect(start, pointer));
          }
        }}
        onMouseUp={() => {
          if (marqueeStartRef.current === null) {
            return;
          }
          if (marqueeRect === null || marqueeRect.width < 4 || marqueeRect.height < 4) {
            onSelectLayer(null);
            marqueeStartRef.current = null;
            setMarqueeRect(null);
            return;
          }
          finishMarqueeSelection();
        }}
        onTouchStart={(event) => {
          if (event.target === event.target.getStage()) {
            onSelectLayer(null);
          }
        }}
      >
        <Layer>
          <Rect x={0} y={0} width={page.width} height={page.height} fill="#fbfafa" listening={false} />
          <Rect
            name={SCREEN_HELPER_NODE_NAME}
            x={page.margins.left}
            y={page.margins.top}
            width={page.width - page.margins.left - page.margins.right}
            height={page.height - page.margins.top - page.margins.bottom}
            stroke="#7C6FE0"
            strokeWidth={2}
            dash={[14, 10]}
            opacity={0.32}
            listening={false}
          />
          {[...page.layers]
            .sort((a, b) => a.zIndex - b.zIndex)
            .map((layer) => (
              <KonvaLayerNode
                assets={assets}
                key={layer.id}
                layer={layer}
                selected={selectedLayerIds.includes(layer.id)}
                onBeginTextEdit={onBeginTextEdit}
                onChange={onLayerChange}
                onSelect={(layerId) => onSelectLayer(layerId)}
              />
            ))}
          {marqueeRect !== null ? (
            <Rect
              name={SCREEN_HELPER_NODE_NAME}
              x={marqueeRect.x}
              y={marqueeRect.y}
              width={marqueeRect.width}
              height={marqueeRect.height}
              fill="rgba(124, 111, 224, 0.12)"
              stroke="#7C6FE0"
              strokeWidth={1.5}
              dash={[8, 6]}
              listening={false}
            />
          ) : null}
          <Transformer
            ref={transformerRef}
            name={SCREEN_HELPER_NODE_NAME}
            rotateEnabled
            anchorSize={10}
            borderStroke="#7C6FE0"
            anchorStroke="#9B8FF0"
            anchorFill="#17161C"
          />
        </Layer>
      </Stage>
      {selectedTextLayer !== null && editingLayer === null ? (
        <TextContextBar layer={selectedTextLayer} scale={scale} onChange={onLayerChange} />
      ) : null}
      {editingLayer !== null ? (
        <InlineTextEditor layer={editingLayer} scale={scale} onChange={onLayerChange} onClose={onEndTextEdit} />
      ) : null}
    </div>
  );
}

function TextContextBar({
  layer,
  scale,
  onChange
}: {
  layer: TextLayer;
  scale: number;
  onChange: (layer: VisualLayer) => void;
}): React.ReactElement {
  const top = Math.max(8, layer.y * scale - 44);
  const left = Math.max(8, layer.x * scale);
  return (
    <div className="text-context-bar" style={{ top, left }} data-testid="text-context-bar">
      <button
        className={layer.fontWeight >= 700 ? "on" : ""}
        onClick={() => onChange(withMeasuredTextSize({ ...layer, fontWeight: layer.fontWeight >= 700 ? 400 : 700 }))}
        title="Bold"
        type="button"
      >
        B
      </button>
      <button
        className={layer.fontStyle === "italic" ? "on" : ""}
        onClick={() => onChange(withMeasuredTextSize({ ...layer, fontStyle: layer.fontStyle === "italic" ? "normal" : "italic" }))}
        title="Italic"
        type="button"
      >
        I
      </button>
      <input
        aria-label="Font size"
        max={240}
        min={8}
        onChange={(event) => onChange(withMeasuredTextSize({ ...layer, fontSize: Number(event.target.value) || layer.fontSize }))}
        type="number"
        value={layer.fontSize}
      />
      <input
        aria-label="Text color"
        onChange={(event) => onChange(withMeasuredTextSize({ ...layer, color: event.target.value, autoContrastOverridden: true }))}
        type="color"
        value={layer.color}
      />
    </div>
  );
}

function InlineTextEditor({
  layer,
  scale,
  onChange,
  onClose
}: {
  layer: TextLayer;
  scale: number;
  onChange: (layer: VisualLayer) => void;
  onClose: () => void;
}): React.ReactElement {
  const [value, setValue] = useState(layer.text);

  useEffect(() => {
    setValue(layer.text);
  }, [layer.id, layer.text]);

  function commit(): void {
    onChange(withMeasuredTextSize({
      ...layer,
      text: value
    }));
    onClose();
  }

  return (
    <textarea
      autoFocus
      className="inline-text-editor"
      data-testid="inline-text-editor"
      dir={layer.direction === "auto" ? "auto" : layer.direction}
      onBlur={commit}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          commit();
        }
      }}
      style={{
        left: layer.x * scale,
        top: layer.y * scale,
        width: Math.max(40, layer.width * scale),
        minHeight: Math.max(28, layer.height * scale),
        transform: `rotate(${layer.rotation}deg)`,
        fontFamily: layer.fontFamily,
        fontSize: Math.max(12, layer.fontSize * scale),
        fontStyle: layer.fontStyle,
        fontWeight: layer.fontWeight,
        lineHeight: layer.lineHeight,
        letterSpacing: layer.letterSpacing * scale,
        textAlign: layer.alignment === "justify" ? "justify" : layer.alignment,
        color: layer.color
      }}
      value={value}
    />
  );
}

function withMeasuredTextSize(layer: TextLayer): TextLayer {
  const size = measureTextLayerSize(layer);
  return {
    ...layer,
    width: size.width,
    height: size.height
  };
}
