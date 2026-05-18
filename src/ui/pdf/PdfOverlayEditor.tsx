import { ImagePlus, Minus, MousePointer2, Square, Trash2, Type, X, Check } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactElement } from "react";
import { Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import type Konva from "konva";
import { renderPdfPage } from "./pdfRenderService";
import type { PdfOverlayObject, PdfStudioPage, PdfStudioSourceFile } from "./pdfStudioTypes";

type OverlayTool = "select" | "text" | "rect" | "line";

interface PdfOverlayEditorProps {
  page: PdfStudioPage;
  source?: PdfStudioSourceFile;
  onDone: (objects: PdfOverlayObject[]) => void;
  onCancel: () => void;
}

export function PdfOverlayEditor({ page, source, onDone, onCancel }: PdfOverlayEditorProps): ReactElement {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const nodeRefs = useRef<Record<string, Konva.Node | null>>({});
  const [objects, setObjects] = useState<PdfOverlayObject[]>(() => page.overlayObjects.map(normalizeOverlayObject));
  const [tool, setTool] = useState<OverlayTool>("select");
  const [background, setBackground] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lineDraft, setLineDraft] = useState<{ x: number; y: number } | null>(null);
  const selectedObject = selectedId !== null ? objects.find((object) => object.id === selectedId) ?? null : null;

  const stageSize = useMemo(() => {
    const maxWidth = 860;
    const maxHeight = 620;
    const scale = Math.min(maxWidth / page.widthPt, maxHeight / page.heightPt, 1.4);
    return {
      scale,
      width: Math.round(page.widthPt * scale),
      height: Math.round(page.heightPt * scale)
    };
  }, [page.heightPt, page.widthPt]);

  useEffect(() => {
    let cancelled = false;
    void renderPdfPage({ page, source, scale: stageSize.scale, rotation: page.rotation })
      .then((rendered) => {
        if (!cancelled) setBackground(rendered.dataUrl);
      })
      .catch(() => {
        if (!cancelled) setBackground(null);
      });
    return () => {
      cancelled = true;
    };
  }, [page, source, stageSize.scale]);

  useEffect(() => {
    const transformer = transformerRef.current;
    if (transformer === null) return;
    const node = selectedId !== null ? nodeRefs.current[selectedId] : null;
    transformer.nodes(node !== null && node !== undefined ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedId, objects]);

  function addObjectAt(x: number, y: number): void {
    const pageX = x / stageSize.scale;
    const pageY = y / stageSize.scale;
    if (tool === "text") {
      const id = crypto.randomUUID();
      setObjects((current) => [...current, {
        id,
        type: "text",
        x: pageX,
        y: pageY,
        width: 170,
        height: 48,
        text: "טקסט",
        fontFamily: "Arial",
        fontSize: 22,
        color: "#111827"
      }]);
      setSelectedId(id);
      setTool("select");
    }
    if (tool === "rect") {
      const id = crypto.randomUUID();
      setObjects((current) => [...current, {
        id,
        type: "rect",
        x: pageX,
        y: pageY,
        width: 150,
        height: 90,
        stroke: "#1d4ed8",
        fill: "rgba(255,255,255,0)",
        strokeWidth: 3
      }]);
      setSelectedId(id);
      setTool("select");
    }
    if (tool === "line") {
      if (lineDraft === null) {
        setLineDraft({ x: pageX, y: pageY });
      } else {
        const id = crypto.randomUUID();
        setObjects((current) => [...current, {
          id,
          type: "line",
          x: lineDraft.x,
          y: lineDraft.y,
          width: pageX - lineDraft.x,
          height: pageY - lineDraft.y,
          stroke: "#dc2626",
          strokeWidth: 3
        }]);
        setLineDraft(null);
        setSelectedId(id);
        setTool("select");
      }
    }
  }

  function updateObject(next: PdfOverlayObject): void {
    setObjects((current) => current.map((object) => object.id === next.id ? next : object));
  }

  function updateSelectedText(patch: Partial<Extract<PdfOverlayObject, { type: "text" }>>): void {
    if (selectedObject?.type !== "text") return;
    updateObject({ ...selectedObject, ...patch });
  }

  function deleteSelected(): void {
    if (selectedId === null) return;
    setObjects((current) => current.filter((object) => object.id !== selectedId));
    setSelectedId(null);
  }

  function handleImageInput(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) return;
    const reader = new FileReader();
    reader.onload = () => {
      const id = crypto.randomUUID();
      setObjects((current) => [...current, {
        id,
        type: "image",
        x: page.widthPt * 0.2,
        y: page.heightPt * 0.2,
        width: page.widthPt * 0.35,
        height: page.heightPt * 0.22,
        dataUrl: String(reader.result)
      }]);
      setSelectedId(id);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="pdf-overlay-modal" dir="rtl">
      <div className="pdf-overlay-editor">
        <header className="pdf-overlay-toolbar">
          <strong>עריכה על העמוד</strong>
          <button className={tool === "select" ? "active" : ""} type="button" onClick={() => setTool("select")}><MousePointer2 size={16} /> בחירה</button>
          <button className={tool === "text" ? "active" : ""} type="button" onClick={() => setTool("text")}><Type size={16} /> טקסט</button>
          <button className={tool === "rect" ? "active" : ""} type="button" onClick={() => setTool("rect")}><Square size={16} /> מלבן</button>
          <button className={tool === "line" ? "active" : ""} type="button" onClick={() => setTool("line")}><Minus size={16} /> קו</button>
          <button type="button" onClick={() => fileInputRef.current?.click()}><ImagePlus size={16} /> תמונה</button>
          <button className="danger" disabled={selectedId === null} type="button" onClick={deleteSelected}><Trash2 size={16} /> מחק</button>
          <span className="pdf-toolbar-spacer" />
          <button type="button" onClick={onCancel}><X size={16} /> ביטול</button>
          <button className="primary" type="button" onClick={() => onDone(objects)}><Check size={16} /> סיום</button>
        </header>
        <input ref={fileInputRef} accept="image/*" hidden type="file" onChange={handleImageInput} />
        {selectedObject?.type === "text" ? (
          <section className="pdf-overlay-text-tools">
            <label>
              <span>טקסט</span>
              <textarea dir="auto" value={selectedObject.text} onChange={(event) => updateSelectedText({ text: event.target.value })} />
            </label>
            <label>
              <span>גופן</span>
              <select value={selectedObject.fontFamily ?? "Arial"} onChange={(event) => updateSelectedText({ fontFamily: event.target.value })}>
                <option value="Arial">Arial</option>
                <option value="Assistant">Assistant</option>
                <option value="Noto Sans Hebrew">Noto Sans Hebrew</option>
                <option value="David">David</option>
                <option value="Tahoma">Tahoma</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="DM Sans">DM Sans</option>
              </select>
            </label>
            <label>
              <span>גודל</span>
              <input min={6} max={180} type="number" value={selectedObject.fontSize} onChange={(event) => updateSelectedText({ fontSize: Number(event.target.value) || selectedObject.fontSize })} />
            </label>
            <label>
              <span>צבע</span>
              <input type="color" value={selectedObject.color} onChange={(event) => updateSelectedText({ color: event.target.value })} />
            </label>
          </section>
        ) : null}
        <div className="pdf-overlay-stage-wrap">
          <Stage
            width={stageSize.width}
            height={stageSize.height}
            onMouseDown={(event) => {
              if (event.target === event.target.getStage()) setSelectedId(null);
              const pointer = event.target.getStage()?.getPointerPosition();
              if (pointer !== undefined && pointer !== null && tool !== "select") addObjectAt(pointer.x, pointer.y);
            }}
          >
            <Layer>
              <Rect width={stageSize.width} height={stageSize.height} fill="#ffffff" />
              {background !== null ? <BackgroundImage src={background} width={stageSize.width} height={stageSize.height} /> : null}
              {objects.map((object) => (
                <OverlayNode
                  key={object.id}
                  object={object}
                  scale={stageSize.scale}
                  selected={object.id === selectedId}
                  setNode={(node) => { nodeRefs.current[object.id] = node; }}
                  onSelect={() => setSelectedId(object.id)}
                  onChange={updateObject}
                />
              ))}
              <Transformer ref={transformerRef} rotateEnabled />
            </Layer>
          </Stage>
        </div>
      </div>
    </div>
  );
}

function BackgroundImage({ src, width, height }: { src: string; width: number; height: number }): ReactElement | null {
  const image = useHtmlImage(src);
  return image === null ? null : <KonvaImage image={image} width={width} height={height} listening={false} />;
}

function OverlayNode({
  object,
  scale,
  selected,
  setNode,
  onSelect,
  onChange
}: {
  object: PdfOverlayObject;
  scale: number;
  selected: boolean;
  setNode: (node: Konva.Node | null) => void;
  onSelect: () => void;
  onChange: (object: PdfOverlayObject) => void;
}): ReactElement | null {
  const common = {
    ref: setNode,
    draggable: true,
    onClick: onSelect,
    onTap: onSelect,
    onDragEnd: (event: Konva.KonvaEventObject<DragEvent>) => {
      onChange({ ...object, x: event.target.x() / scale, y: event.target.y() / scale } as PdfOverlayObject);
    },
    onTransformEnd: (event: Konva.KonvaEventObject<Event>) => {
      const node = event.target;
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      node.scale({ x: 1, y: 1 });
      onChange({
        ...object,
        x: node.x() / scale,
        y: node.y() / scale,
        width: Math.max(8, object.width * scaleX),
        height: Math.max(8, object.height * scaleY),
        rotation: node.rotation()
      } as PdfOverlayObject);
    },
    shadowColor: selected ? "#facc15" : undefined,
    shadowBlur: selected ? 8 : 0
  };

  if (object.type === "text") {
    return <Text {...common} x={object.x * scale} y={object.y * scale} width={object.width * scale} height={object.height * scale} text={object.text} fontFamily={object.fontFamily ?? "Arial"} fontSize={object.fontSize * scale} fill={object.color} rotation={object.rotation ?? 0} />;
  }
  if (object.type === "rect") {
    return <Rect {...common} x={object.x * scale} y={object.y * scale} width={object.width * scale} height={object.height * scale} stroke={object.stroke} fill={object.fill} strokeWidth={object.strokeWidth * scale} rotation={object.rotation ?? 0} />;
  }
  if (object.type === "line") {
    return <Line {...common} x={0} y={0} points={[object.x * scale, object.y * scale, (object.x + object.width) * scale, (object.y + object.height) * scale]} stroke={object.stroke} strokeWidth={object.strokeWidth * scale} />;
  }
  return <OverlayImage object={object} scale={scale} common={common} />;
}

function normalizeOverlayObject(object: PdfOverlayObject): PdfOverlayObject {
  return object.type === "text" ? { ...object, fontFamily: object.fontFamily ?? "Arial" } : object;
}

function OverlayImage({ object, scale, common }: { object: Extract<PdfOverlayObject, { type: "image" }>; scale: number; common: Record<string, unknown> }): ReactElement | null {
  const image = useHtmlImage(object.dataUrl);
  if (image === null) return null;
  return <KonvaImage {...common} image={image} x={object.x * scale} y={object.y * scale} width={object.width * scale} height={object.height * scale} rotation={object.rotation ?? 0} />;
}

function useHtmlImage(src: string): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    const next = new Image();
    next.onload = () => {
      if (!cancelled) setImage(next);
    };
    next.onerror = () => {
      if (!cancelled) setImage(null);
    };
    next.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);
  return image;
}
