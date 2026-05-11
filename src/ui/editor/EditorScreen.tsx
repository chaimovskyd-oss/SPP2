import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Clipboard,
  Copy,
  Download,
  FileDown,
  FileUp,
  ChevronsDown,
  ChevronsUp,
  GripVertical,
  Eye,
  EyeOff,
  Home,
  ImagePlus,
  Italic,
  Layers,
  Lock,
  MousePointer2,
  Redo2,
  Save,
  Trash2,
  Type,
  Unlock,
  Undo2
} from "lucide-react";
import { useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type DragEvent, type ReactElement } from "react";
import type Konva from "konva";
import type { LucideIcon } from "lucide-react";
import { measureTextLayerSize } from "@/core/text/measurement";
import { BUILTIN_TEXT_PRESETS } from "@/core/text/presets";
import { useDocumentStore } from "@/state/documentStore";
import { useSelectionStore } from "@/state/selectionStore";
import type { Asset } from "@/types/document";
import type { VisualLayer } from "@/types/layers";
import type { TextPreset } from "@/types/text";
import {
  createImageAsset,
  createImageFrameLayer,
  createStarterTextLayer,
  exportStagePdf,
  exportStagePng,
  loadProject,
  readImageDimensions,
  readFileAsDataUrl,
  saveProject
} from "../projectActions";
import { CanvasStage } from "./CanvasStage";

type ToolId = "move" | "text" | "image" | "layers";

interface EditorScreenProps {
  onBackHome: () => void;
}

export function EditorScreen({ onBackHome }: EditorScreenProps): ReactElement {
  const stageRef = useRef<Konva.Stage | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const [tool, setTool] = useState<ToolId>("move");
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [status, setStatus] = useState("שמירה אוטומטית מוכנה");
  const document = useDocumentStore((state) => state.document);
  const activePageId = useDocumentStore((state) => state.activePageId);
  const setDocument = useDocumentStore((state) => state.setDocument);
  const addLayer = useDocumentStore((state) => state.addLayer);
  const addAssetAndLayer = useDocumentStore((state) => state.addAssetAndLayer);
  const updateLayer = useDocumentStore((state) => state.updateLayer);
  const removeLayer = useDocumentStore((state) => state.removeLayer);
  const moveLayer = useDocumentStore((state) => state.moveLayer);
  const reorderLayers = useDocumentStore((state) => state.reorderLayers);
  const applyTextPreset = useDocumentStore((state) => state.applyTextPreset);
  const copyTextStyle = useDocumentStore((state) => state.copyTextStyle);
  const pasteTextStyle = useDocumentStore((state) => state.pasteTextStyle);
  const hasTextStyleClipboard = useDocumentStore((state) => state.textStyleClipboard !== null);
  const undo = useDocumentStore((state) => state.undo);
  const redo = useDocumentStore((state) => state.redo);
  const canUndo = useDocumentStore((state) => state.canUndo);
  const canRedo = useDocumentStore((state) => state.canRedo);
  const selectedLayerIds = useSelectionStore((state) => state.selectedLayerIds);
  const selectedLayerId = selectedLayerIds[0] ?? null;
  const setSelection = useSelectionStore((state) => state.setSelection);
  const clearSelection = useSelectionStore((state) => state.clearSelection);

  const activePage = useMemo(
    () => document?.pages.find((page) => page.id === activePageId) ?? document?.pages[0] ?? null,
    [activePageId, document]
  );
  const selectedLayer = useMemo(
    () => activePage?.layers.find((layer) => layer.id === selectedLayerId) ?? null,
    [activePage, selectedLayerId]
  );

  if (document === null || activePage === null) {
    return (
      <main className="empty-state">
        <button className="btn btn-accent" onClick={onBackHome} type="button">
          חזרה למסך הבית
        </button>
      </main>
    );
  }

  const currentDocument = document;
  const currentPage = activePage;

  function handleAddText(): void {
    const layer = createStarterTextLayer(currentPage.width, currentPage.height);
    addLayer(currentPage.id, layer);
    setSelection([layer.id]);
    setTool("text");
    setStatus("נוספה שכבת טקסט");
  }

  async function handleImageFiles(files: FileList | File[]): Promise<void> {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
    for (const file of imageFiles) {
      const dataUrl = await readFileAsDataUrl(file);
      const dimensions = await readImageDimensions(dataUrl);
      const asset = createImageAsset(file, dataUrl, dimensions);
      const layer = createImageFrameLayer(asset, currentPage.width, currentPage.height);
      addAssetAndLayer(currentPage.id, asset, layer);
      setSelection([layer.id]);
    }
    if (imageFiles.length > 0) {
      setTool("image");
      setStatus(`נוספו ${imageFiles.length} תמונות`);
    }
  }

  async function handleProjectLoad(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (file === undefined) {
      return;
    }
    const envelope = await loadProject(file);
    setDocument(envelope.document);
    clearSelection();
    setStatus("הפרויקט נטען");
    event.target.value = "";
  }

  function handleImageInput(event: ChangeEvent<HTMLInputElement>): void {
    const files = event.target.files;
    if (files !== null) {
      void handleImageFiles(files);
    }
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    void handleImageFiles(event.dataTransfer.files);
  }

  function handleSave(): void {
    saveProject(currentDocument);
    setStatus("קובץ הפרויקט נשמר");
  }

  function handleExportPng(): void {
    const stage = stageRef.current;
    if (stage === null) {
      return;
    }
    exportStagePng(stage, currentDocument.name, currentPage);
    setStatus("PNG יוצא");
  }

  async function handleExportPdf(): Promise<void> {
    const stage = stageRef.current;
    if (stage === null) {
      return;
    }
    await exportStagePdf(stage, currentDocument.name, currentPage);
    setStatus("PDF יוצא");
  }

  function handleDeleteSelected(): void {
    if (selectedLayerIds.length === 0) {
      return;
    }
    selectedLayerIds.forEach((layerId) => removeLayer(currentPage.id, layerId));
    clearSelection();
    setStatus("השכבה נמחקה");
  }

  function updateSelectedText(text: string): void {
    if (selectedLayer?.type !== "text") {
      return;
    }
    const nextLayer = {
      ...selectedLayer,
      text
    };
    const size = measureTextLayerSize(nextLayer);
    updateLayer(currentPage.id, {
      ...nextLayer,
      width: size.width,
      height: size.height
    });
  }

  function patchSelectedLayer(patch: Partial<VisualLayer>): void {
    if (selectedLayer === null) {
      return;
    }
    const nextLayer = {
      ...selectedLayer,
      ...patch
    } as VisualLayer;
    if (nextLayer.type === "text") {
      const size = measureTextLayerSize(nextLayer);
      updateLayer(currentPage.id, {
        ...nextLayer,
        width: size.width,
        height: size.height
      });
      return;
    }
    updateLayer(currentPage.id, nextLayer);
  }

  return (
    <main className="canvas-shell" data-testid="editor-screen">
      <header className="topbar">
        <div className="topbar-side">
          <button className="icon-btn" onClick={onBackHome} title="בית" type="button">
            <Home size={16} />
          </button>
          <span className="topbar-divider" />
          <button className={`icon-btn ${canUndo ? "" : "disabled"}`} disabled={!canUndo} onClick={undo} title="Undo" type="button">
            <Undo2 size={16} />
          </button>
          <button className={`icon-btn ${canRedo ? "" : "disabled"}`} disabled={!canRedo} onClick={redo} title="Redo" type="button">
            <Redo2 size={16} />
          </button>
          <span className="project-name">{currentDocument.name}</span>
        </div>

        <div className="topbar-center">
          <span className="mode-label">עיצוב חופשי</span>
          <span className="mode-chip">
            <span />
            Free Mode
          </span>
        </div>

        <div className="topbar-side topbar-actions">
          <button className="btn btn-ghost" onClick={() => projectInputRef.current?.click()} type="button">
            <FileUp size={14} />
            טעינה
          </button>
          <button className="btn btn-ghost" onClick={handleSave} type="button">
            <Save size={14} />
            שמירה
          </button>
          <button className="btn btn-success-outline" onClick={handleExportPng} type="button">
            <Download size={14} />
            PNG
          </button>
          <button className="btn btn-accent" onClick={() => void handleExportPdf()} type="button">
            <FileDown size={14} />
            PDF
          </button>
        </div>
      </header>

      <section className="stage">
        <aside className="left-rail" aria-label="כלים">
          <ToolButton active={tool === "move"} icon={MousePointer2} label="הזזה" onClick={() => setTool("move")} testId="tool-move" />
          <ToolButton active={tool === "text"} icon={Type} label="טקסט" onClick={handleAddText} testId="tool-text" />
          <ToolButton active={tool === "image"} icon={ImagePlus} label="תמונה" onClick={() => imageInputRef.current?.click()} testId="tool-image" />
          <span className="rail-sep" />
          <ToolButton active={tool === "layers"} icon={Layers} label="שכבות" onClick={() => setTool("layers")} testId="tool-layers" />
        </aside>

        <div
          className="canvas-area"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="ruler-top" />
          <div className="ruler-side" />
          <CanvasStage
            assets={currentDocument.assets}
            editingLayerId={editingLayerId}
            page={currentPage}
            selectedLayerIds={selectedLayerIds}
            selectedLayerId={selectedLayerId}
            stageRef={stageRef}
            onBeginTextEdit={(layerId) => {
              setSelection([layerId]);
              setEditingLayerId(layerId);
              setTool("text");
            }}
            onEndTextEdit={() => setEditingLayerId(null)}
            onLayerChange={(layer) => updateLayer(currentPage.id, layer)}
            onSelectLayer={(layerId) => (layerId === null ? clearSelection() : setSelection([layerId]))}
            onSelectLayers={(layerIds) => setSelection(layerIds)}
          />
          <div className="drop-hint">גרור תמונות אל הקנבס או לחץ על כלי התמונה</div>
        </div>

        <aside className="right-panel">
          <PanelHeader selectedLayer={selectedLayer} />
          <LayerInspector
            selectedLayer={selectedLayer}
            hasTextStyleClipboard={hasTextStyleClipboard}
            onDelete={handleDeleteSelected}
            onPatch={patchSelectedLayer}
            onApplyPreset={(preset) => {
              if (selectedLayer?.type === "text") {
                applyTextPreset(currentPage.id, selectedLayer.id, preset);
              }
            }}
            onCopyTextStyle={() => {
              if (selectedLayer?.type === "text") {
                copyTextStyle(currentPage.id, selectedLayer.id);
                setStatus("׳¡׳’׳ ׳•׳ ׳˜׳§׳¡׳˜ ׳”׳•׳¢׳×׳§");
              }
            }}
            onPasteTextStyle={() => {
              if (selectedLayer?.type === "text") {
                pasteTextStyle(currentPage.id, [selectedLayer.id]);
                setStatus("׳¡׳’׳ ׳•׳ ׳˜׳§׳¡׳˜ ׳”׳•׳“׳‘׳§");
              }
            }}
            onTextChange={updateSelectedText}
          />
          <span className="panel-sep" />
          <LayerList
            assets={currentDocument.assets}
            layers={currentPage.layers}
            selectedLayerIds={selectedLayerIds}
            selectedLayerId={selectedLayerId}
            onMove={(layerId, direction) => moveLayer(currentPage.id, layerId, direction)}
            onReorder={(layerIdsTopToBottom) => reorderLayers(currentPage.id, layerIdsTopToBottom)}
            onSelect={(layerId) => setSelection([layerId])}
          />
        </aside>
      </section>

      <footer className="bottombar">
        <div className="bottom-side">
          <span>עמוד 1 מתוך {currentDocument.pages.length}</span>
          <span className="progress-pill">{status}</span>
        </div>
        <div className="bottom-side bottom-left">
          <span>{Math.round(currentPage.width)} x {Math.round(currentPage.height)} px</span>
          <span>Zoom Fit</span>
        </div>
      </footer>

      <input ref={imageInputRef} accept="image/*" hidden multiple onChange={handleImageInput} type="file" />
      <input ref={projectInputRef} accept=".json,.spp.json" hidden onChange={(event) => void handleProjectLoad(event)} type="file" />
    </main>
  );
}

function ToolButton({
  active,
  icon: Icon,
  label,
  onClick,
  testId
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  testId: string;
}): ReactElement {
  return (
    <button className={`tool ${active ? "active" : ""}`} data-testid={testId} onClick={onClick} type="button">
      <Icon size={18} strokeWidth={1.8} />
      <span className="tip">{label}</span>
    </button>
  );
}

function PanelHeader({ selectedLayer }: { selectedLayer: VisualLayer | null }): ReactElement {
  return (
    <header className="panel-header">
      <h2 className="panel-title">{selectedLayer === null ? "מסמך" : selectedLayer.name}</h2>
      <span className="panel-pill">{selectedLayer === null ? "No selection" : selectedLayer.type}</span>
    </header>
  );
}

function LayerInspector({
  selectedLayer,
  hasTextStyleClipboard,
  onDelete,
  onApplyPreset,
  onCopyTextStyle,
  onPatch,
  onPasteTextStyle,
  onTextChange
}: {
  selectedLayer: VisualLayer | null;
  hasTextStyleClipboard: boolean;
  onDelete: () => void;
  onApplyPreset: (preset: TextPreset) => void;
  onCopyTextStyle: () => void;
  onPatch: (patch: Partial<VisualLayer>) => void;
  onPasteTextStyle: () => void;
  onTextChange: (text: string) => void;
}): ReactElement {
  if (selectedLayer === null) {
    return (
      <div className="empty-panel">
        <strong>לא נבחרה שכבה</strong>
        <span>בחר שכבה בקנבס או ברשימה כדי לערוך מאפיינים בסיסיים.</span>
      </div>
    );
  }

  return (
    <div className="inspector">
      <div className="field-grid">
        <Metric label="X" value={selectedLayer.x} />
        <Metric label="Y" value={selectedLayer.y} />
        <Metric label="W" value={selectedLayer.width} />
        <Metric label="H" value={selectedLayer.height} />
      </div>
      <div className="quick-controls">
        <button className={selectedLayer.visible ? "toggle on" : "toggle"} onClick={() => onPatch({ visible: !selectedLayer.visible })} type="button">
          {selectedLayer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
          תצוגה
        </button>
        <button className={selectedLayer.locked ? "toggle on" : "toggle"} onClick={() => onPatch({ locked: !selectedLayer.locked })} type="button">
          {selectedLayer.locked ? <Lock size={14} /> : <Unlock size={14} />}
          נעילה
        </button>
      </div>
      {selectedLayer.type === "text" ? (
        <TextControls
          hasTextStyleClipboard={hasTextStyleClipboard}
          layer={selectedLayer}
          onApplyPreset={onApplyPreset}
          onCopyTextStyle={onCopyTextStyle}
          onPasteTextStyle={onPasteTextStyle}
          onPatch={onPatch}
          onTextChange={onTextChange}
        />
      ) : null}
      {selectedLayer.type === "frame" && selectedLayer.contentType === "image" ? (
        <ImageControls layer={selectedLayer} onPatch={onPatch} />
      ) : null}
      <button className="btn-block btn-danger" onClick={onDelete} type="button">
        <Trash2 size={14} />
        מחק שכבה
      </button>
    </div>
  );
}

function ImageControls({
  layer,
  onPatch
}: {
  layer: Extract<VisualLayer, { type: "frame" }>;
  onPatch: (patch: Partial<VisualLayer>) => void;
}): ReactElement {
  return (
    <div className="field">
      <span className="field-label">התאמת תמונה</span>
      <div className="seg">
        <button className={layer.fitMode === "fit" ? "on" : ""} onClick={() => onPatch({ fitMode: "fit" } as Partial<VisualLayer>)} type="button">
          Fit
        </button>
        <button className={layer.fitMode === "fill" ? "on" : ""} onClick={() => onPatch({ fitMode: "fill" } as Partial<VisualLayer>)} type="button">
          Fill
        </button>
        <button className={layer.fitMode === "stretch" ? "on" : ""} onClick={() => onPatch({ fitMode: "stretch" } as Partial<VisualLayer>)} type="button">
          Stretch
        </button>
      </div>
    </div>
  );
}

function TextControls({
  hasTextStyleClipboard,
  layer,
  onApplyPreset,
  onCopyTextStyle,
  onPasteTextStyle,
  onPatch,
  onTextChange
}: {
  hasTextStyleClipboard: boolean;
  layer: Extract<VisualLayer, { type: "text" }>;
  onApplyPreset: (preset: TextPreset) => void;
  onCopyTextStyle: () => void;
  onPasteTextStyle: () => void;
  onPatch: (patch: Partial<VisualLayer>) => void;
  onTextChange: (text: string) => void;
}): ReactElement {
  const [tab, setTab] = useState<"type" | "effects" | "presets">("type");
  const shadowDistance = Math.round(Math.hypot(layer.shadow?.offsetX ?? 0, layer.shadow?.offsetY ?? 0));
  return (
    <div className="text-pro-controls">
      <label className="field">
        <span className="field-label">טקסט</span>
        <textarea className="text-area" dir="auto" value={layer.text} onChange={(event) => onTextChange(event.target.value)} />
      </label>
      <div className="text-tabs" role="tablist" aria-label="Text controls">
        <button className={tab === "type" ? "on" : ""} onClick={() => setTab("type")} type="button">
          Type
        </button>
        <button className={tab === "effects" ? "on" : ""} onClick={() => setTab("effects")} type="button">
          FX
        </button>
        <button className={tab === "presets" ? "on" : ""} onClick={() => setTab("presets")} type="button">
          Presets
        </button>
      </div>

      {tab === "type" ? (
        <div className="text-tab-panel">
          <label className="field">
            <span className="field-label">גופן</span>
            <select className="text-input" onChange={(event) => onPatch({ fontFamily: event.target.value } as Partial<VisualLayer>)} value={layer.fontFamily}>
              <option value="DM Sans">DM Sans</option>
              <option value="Noto Sans Hebrew, Arial">Noto Sans Hebrew</option>
              <option value="Arial">Arial</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Georgia">Georgia</option>
            </select>
          </label>
          <div className="field-grid">
            <NumberField label="גודל" max={240} min={8} onChange={(fontSize) => onPatch({ fontSize } as Partial<VisualLayer>)} value={layer.fontSize} />
            <NumberField label="משקל" max={900} min={100} onChange={(fontWeight) => onPatch({ fontWeight } as Partial<VisualLayer>)} step={100} value={layer.fontWeight} />
            <NumberField label="גובה שורה" max={3} min={0.7} onChange={(lineHeight) => onPatch({ lineHeight } as Partial<VisualLayer>)} step={0.05} value={layer.lineHeight} />
            <NumberField label="ריווח" max={40} min={-10} onChange={(letterSpacing) => onPatch({ letterSpacing } as Partial<VisualLayer>)} value={layer.letterSpacing} />
          </div>
          <div className="button-row">
            <button className={layer.fontWeight >= 700 ? "toggle on" : "toggle"} onClick={() => onPatch({ fontWeight: layer.fontWeight >= 700 ? 400 : 700 } as Partial<VisualLayer>)} type="button">
              <Bold size={14} />
            </button>
            <button className={layer.fontStyle === "italic" ? "toggle on" : "toggle"} onClick={() => onPatch({ fontStyle: layer.fontStyle === "italic" ? "normal" : "italic" } as Partial<VisualLayer>)} type="button">
              <Italic size={14} />
            </button>
            <button className={layer.alignment === "right" ? "toggle on" : "toggle"} onClick={() => onPatch({ alignment: "right" } as Partial<VisualLayer>)} type="button">
              <AlignRight size={14} />
            </button>
            <button className={layer.alignment === "center" ? "toggle on" : "toggle"} onClick={() => onPatch({ alignment: "center" } as Partial<VisualLayer>)} type="button">
              <AlignCenter size={14} />
            </button>
            <button className={layer.alignment === "left" ? "toggle on" : "toggle"} onClick={() => onPatch({ alignment: "left" } as Partial<VisualLayer>)} type="button">
              <AlignLeft size={14} />
            </button>
          </div>
          <div className="field-grid">
            <label className="field">
              <span className="field-label">צבע</span>
              <input className="color-input" onChange={(event) => onPatch({ color: event.target.value, autoContrastOverridden: true } as Partial<VisualLayer>)} type="color" value={layer.color} />
            </label>
            <NumberField label="Opacity" max={1} min={0} onChange={(fillOpacity) => onPatch({ fillOpacity } as Partial<VisualLayer>)} step={0.05} value={layer.fillOpacity} />
          </div>
          <div className="seg">
            <button className={layer.direction === "rtl" ? "on" : ""} onClick={() => onPatch({ direction: "rtl" } as Partial<VisualLayer>)} type="button">
              RTL
            </button>
            <button className={layer.direction === "auto" ? "on" : ""} onClick={() => onPatch({ direction: "auto" } as Partial<VisualLayer>)} type="button">
              Auto
            </button>
            <button className={layer.direction === "ltr" ? "on" : ""} onClick={() => onPatch({ direction: "ltr" } as Partial<VisualLayer>)} type="button">
              LTR
            </button>
          </div>
        </div>
      ) : null}

      {tab === "effects" ? (
        <div className="text-tab-panel">
          <div className="effect-card">
            <label className="check-line">
              <input
                checked={layer.stroke !== undefined}
                onChange={(event) => onPatch({ stroke: event.target.checked ? { version: 1, color: "#111111", width: 2, opacity: 1 } : undefined } as Partial<VisualLayer>)}
                type="checkbox"
              />
              Stroke
            </label>
            {layer.stroke !== undefined ? (
              <div className="field-grid">
                <label className="field">
                  <span className="field-label">צבע קו</span>
                  <input className="color-input" onChange={(event) => onPatch({ stroke: { ...layer.stroke, color: event.target.value } } as Partial<VisualLayer>)} type="color" value={layer.stroke.color} />
                </label>
                <NumberField label="עובי" max={20} min={0} onChange={(width) => onPatch({ stroke: { ...layer.stroke, width } } as Partial<VisualLayer>)} value={layer.stroke.width} />
              </div>
            ) : null}
          </div>
          <div className="effect-card">
            <label className="check-line">
              <input
                checked={layer.shadow !== undefined}
                onChange={(event) => onPatch({ shadow: event.target.checked ? { version: 1, color: "#000000", blur: 8, offsetX: 0, offsetY: 5, opacity: 0.3 } : undefined } as Partial<VisualLayer>)}
                type="checkbox"
              />
              Shadow / Glow
            </label>
            {layer.shadow !== undefined ? (
              <>
                <div className="field-grid">
                  <label className="field">
                    <span className="field-label">צבע צל</span>
                    <input className="color-input" onChange={(event) => onPatch({ shadow: { ...layer.shadow, color: event.target.value } } as Partial<VisualLayer>)} type="color" value={layer.shadow.color} />
                  </label>
                  <NumberField label="טשטוש" max={60} min={0} onChange={(blur) => onPatch({ shadow: { ...layer.shadow, blur } } as Partial<VisualLayer>)} value={layer.shadow.blur} />
                  <NumberField label="מרחק" max={80} min={0} onChange={(distance) => onPatch({ shadow: { ...layer.shadow, offsetX: 0, offsetY: distance } } as Partial<VisualLayer>)} value={shadowDistance} />
                  <NumberField label="Opacity" max={1} min={0} onChange={(opacity) => onPatch({ shadow: { ...layer.shadow, opacity } } as Partial<VisualLayer>)} step={0.05} value={layer.shadow.opacity} />
                </div>
                <button className="mini-action" onClick={() => layer.shadow !== undefined ? onPatch({ shadow: { ...layer.shadow, offsetX: 0, offsetY: 0, blur: Math.max(layer.shadow.blur, 18) } } as Partial<VisualLayer>) : undefined} type="button">
                  Glow mode
                </button>
              </>
            ) : null}
          </div>
          <div className="field">
            <span className="field-label">Shape / Warp metadata</span>
            <div className="seg">
              {(["none", "arc", "wave"] as const).map((type) => (
                <button className={layer.warpSettings.type === type ? "on" : ""} key={type} onClick={() => onPatch({ warpSettings: { ...layer.warpSettings, enabled: type !== "none", type } } as Partial<VisualLayer>)} type="button">
                  {type}
                </button>
              ))}
            </div>
            <NumberField
              label="עוצמה"
              max={100}
              min={-100}
              onChange={(amount) => onPatch({ warpSettings: { ...layer.warpSettings, enabled: amount !== 0, amount, intensity: amount } } as Partial<VisualLayer>)}
              value={layer.warpSettings.amount}
            />
          </div>
        </div>
      ) : null}

      {tab === "presets" ? (
        <div className="text-tab-panel">
          <div className="button-row">
            <button className="toggle" onClick={onCopyTextStyle} type="button">
              <Copy size={14} />
              Copy FX
            </button>
            <button className="toggle" disabled={!hasTextStyleClipboard} onClick={onPasteTextStyle} type="button">
              <Clipboard size={14} />
              Paste FX
            </button>
          </div>
          <div className="preset-grid">
            {BUILTIN_TEXT_PRESETS.map((preset) => (
              <button className="preset-chip" key={preset.presetId} onClick={() => onApplyPreset(preset)} type="button">
                <span style={presetPreviewStyle(preset)}>{layer.text.trim().slice(0, 2) || "טק"}</span>
                <strong>{preset.name}</strong>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
  return (
    <>
      <label className="field">
        <span className="field-label">טקסט</span>
        <textarea className="text-area" value={layer.text} onChange={(event) => onTextChange(event.target.value)} />
      </label>
      <div className="field-grid">
        <label className="field">
          <span className="field-label">גודל</span>
          <input
            className="text-input"
            min={8}
            max={240}
            onChange={(event) => onPatch({ fontSize: Number(event.target.value) || layer.fontSize } as Partial<VisualLayer>)}
            type="number"
            value={layer.fontSize}
          />
        </label>
        <label className="field">
          <span className="field-label">צבע</span>
          <input
            className="color-input"
            onChange={(event) => onPatch({ color: event.target.value } as Partial<VisualLayer>)}
            type="color"
            value={layer.color}
          />
        </label>
      </div>
      <div className="seg">
        <button className={layer.alignment === "right" ? "on" : ""} onClick={() => onPatch({ alignment: "right" } as Partial<VisualLayer>)} type="button">
          ימין
        </button>
        <button className={layer.alignment === "center" ? "on" : ""} onClick={() => onPatch({ alignment: "center" } as Partial<VisualLayer>)} type="button">
          מרכז
        </button>
        <button className={layer.alignment === "left" ? "on" : ""} onClick={() => onPatch({ alignment: "left" } as Partial<VisualLayer>)} type="button">
          שמאל
        </button>
      </div>
    </>
  );
}

function NumberField({
  label,
  max,
  min,
  onChange,
  step = 1,
  value
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step?: number;
  value: number;
}): ReactElement {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="text-input"
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value) || min)}
        step={step}
        type="number"
        value={value}
      />
    </label>
  );
}

function presetPreviewStyle(preset: TextPreset): CSSProperties {
  return {
    color: preset.style.color ?? "#ffffff",
    fontFamily: preset.style.fontFamily,
    textShadow:
      preset.style.shadow === undefined
        ? undefined
        : `${preset.style.shadow.offsetX}px ${preset.style.shadow.offsetY}px ${preset.style.shadow.blur}px ${preset.style.shadow.color}`,
    WebkitTextStroke: preset.style.stroke === undefined ? undefined : `${preset.style.stroke.width}px ${preset.style.stroke.color}`
  };
}

function Metric({ label, value }: { label: string; value: number }): ReactElement {
  return (
    <span className="metric">
      <span>{label}</span>
      <strong>{Math.round(value)}</strong>
    </span>
  );
}

function LayerList({
  assets,
  layers,
  selectedLayerIds,
  selectedLayerId,
  onMove,
  onReorder,
  onSelect
}: {
  assets: Asset[];
  layers: VisualLayer[];
  selectedLayerIds: string[];
  selectedLayerId: string | null;
  onMove: (layerId: string, direction: "forward" | "backward" | "front" | "back") => void;
  onReorder: (layerIdsTopToBottom: string[]) => void;
  onSelect: (layerId: string) => void;
}): ReactElement {
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null);
  const ordered = [...layers].sort((a, b) => b.zIndex - a.zIndex);

  function handleDrop(targetLayerId: string): void {
    if (draggingLayerId === null || draggingLayerId === targetLayerId) {
      setDraggingLayerId(null);
      return;
    }
    const nextIds = ordered.map((layer) => layer.id).filter((layerId) => layerId !== draggingLayerId);
    const targetIndex = nextIds.indexOf(targetLayerId);
    nextIds.splice(targetIndex < 0 ? 0 : targetIndex, 0, draggingLayerId);
    onReorder(nextIds);
    setDraggingLayerId(null);
  }

  return (
    <section className="layer-list" aria-label="שכבות">
      <h3>שכבות</h3>
      {ordered.length === 0 ? <p>אין שכבות עדיין.</p> : null}
      {ordered.map((layer) => (
        <div
          className={`layer-row ${selectedLayerIds.includes(layer.id) ? "active" : ""} ${draggingLayerId === layer.id ? "dragging" : ""}`}
          draggable
          key={layer.id}
          onDragEnd={() => setDraggingLayerId(null)}
          onDragOver={(event) => event.preventDefault()}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", layer.id);
            setDraggingLayerId(layer.id);
          }}
          onDrop={() => handleDrop(layer.id)}
        >
          <GripVertical className="layer-drag-handle" size={14} />
          <button className="layer-main" onClick={() => onSelect(layer.id)} type="button">
            <LayerThumbnail assets={assets} layer={layer} />
            <strong>{layer.name}</strong>
          </button>
          <span className="layer-actions">
            <button
              aria-label="שלח אחורה"
              onClick={() => onMove(layer.id, "backward")}
              type="button"
            >
              <ChevronsDown size={12} />
            </button>
            <button
              aria-label="הבא קדימה"
              onClick={() => onMove(layer.id, "forward")}
              type="button"
            >
              <ChevronsUp size={12} />
            </button>
          </span>
        </div>
      ))}
    </section>
  );
}

function LayerThumbnail({ assets, layer }: { assets: Asset[]; layer: VisualLayer }): ReactElement {
  if (layer.type === "frame" && layer.contentType === "image") {
    const asset = assets.find((item) => item.id === layer.imageAssetId);
    if (asset?.previewPath !== undefined) {
      return <img alt="" className="layer-thumb image" src={asset.previewPath} />;
    }
  }

  if (layer.type === "text") {
    const effectCount = layer.effects.filter((effect) => effect.enabled).length;
    return (
      <span className="layer-thumb text" style={{ color: layer.color }}>
        {layer.text.trim().charAt(0) || "T"}
        {effectCount > 0 ? <em>{effectCount}</em> : null}
      </span>
    );
  }

  return <span className="layer-thumb">{layer.type.slice(0, 3).toUpperCase()}</span>;
}
