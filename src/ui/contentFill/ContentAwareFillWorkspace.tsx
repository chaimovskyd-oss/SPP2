import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from "react";
import type { Asset } from "@/types/document";
import type { ImageLayer } from "@/types/layers";
import type { SelectionMask } from "@/state/imageEditStore";
import { runContentAwareFill, warmSdEngine, type ContentFillEngine } from "@/services/ai/contentAwareFillService";
import { composeInpaintPatch, loadHtmlImage } from "@/ui/contentFill/composePatch";

type Channel = "target" | "include" | "exclude";
type Tool = "brush" | "rect" | "eraser";
type View = "after" | "before" | "split";

interface Props {
  baseImageDataUrl: string;
  width: number;
  height: number;
  asset: Asset;
  layer: ImageLayer;
  onApplied: (resultDataUrl: string) => void;
  onClose: () => void;
}

const ENGINE_OPTIONS: { value: ContentFillEngine; label: string }[] = [
  { value: "auto", label: "אוטומטי" },
  { value: "lama", label: "LaMa (מהיר)" },
  { value: "sd_inpaint", label: "SD (איכותי)" },
  { value: "texture_fill", label: "טקסטורה (דשא/דפוס)" },
  { value: "quick_heal", label: "תיקון מהיר" }
];
const ENGINE_CYCLE: ContentFillEngine[] = ["lama", "sd_inpaint", "texture_fill"];

const CHANNEL_COLOR: Record<Channel, [number, number, number]> = {
  target: [255, 45, 45],
  include: [45, 205, 95],
  exclude: [70, 130, 255]
};

export function ContentAwareFillWorkspace({ baseImageDataUrl, width, height, asset, layer, onApplied, onClose }: Props): ReactElement {
  const displayRef = useRef<HTMLCanvasElement | null>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskRefs = useRef<Record<Channel, HTMLCanvasElement | null>>({ target: null, include: null, exclude: null });
  const tintRef = useRef<HTMLCanvasElement | null>(null);
  const previewImgRef = useRef<HTMLImageElement | null>(null);
  const paintingRef = useRef(false);
  const rectStartRef = useRef<{ x: number; y: number } | null>(null);
  const rectNowRef = useRef<{ x: number; y: number } | null>(null);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);

  const [ready, setReady] = useState(false);
  const [engine, setEngine] = useState<ContentFillEngine>("auto");
  const [channel, setChannel] = useState<Channel>("target");
  const [tool, setTool] = useState<Tool>("brush");
  const [brushSize, setBrushSize] = useState(() => Math.max(12, Math.round(Math.max(width, height) / 18)));
  const [view, setView] = useState<View>("after");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("סמן אזור להסרה (אדום), והרץ תצוגה מקדימה");
  const [hasPreview, setHasPreview] = useState(false);

  // ── Build base + mask canvases once ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const img = await loadHtmlImage(baseImageDataUrl).catch(() => null);
      if (cancelled || img === null) return;
      const base = document.createElement("canvas");
      base.width = width;
      base.height = height;
      base.getContext("2d")?.drawImage(img, 0, 0, width, height);
      baseCanvasRef.current = base;
      for (const ch of ["target", "include", "exclude"] as Channel[]) {
        const c = document.createElement("canvas");
        c.width = width;
        c.height = height;
        maskRefs.current[ch] = c;
      }
      const tint = document.createElement("canvas");
      tint.width = width;
      tint.height = height;
      tintRef.current = tint;
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [baseImageDataUrl, width, height]);

  const draw = useCallback(() => {
    const disp = displayRef.current;
    const base = baseCanvasRef.current;
    if (disp === null || base === null) return;
    const ctx = disp.getContext("2d");
    if (ctx === null) return;
    const dw = disp.width;
    const dh = disp.height;
    ctx.clearRect(0, 0, dw, dh);

    const preview = previewImgRef.current;
    if ((view === "after" || view === "split") && preview !== null) {
      ctx.drawImage(preview, 0, 0, dw, dh);
      if (view === "split") {
        ctx.save();
        ctx.beginPath();
        ctx.rect(dw / 2, 0, dw / 2, dh);
        ctx.clip();
        ctx.drawImage(base, 0, 0, dw, dh);
        ctx.restore();
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(dw / 2, 0);
        ctx.lineTo(dw / 2, dh);
        ctx.stroke();
      }
    } else {
      ctx.drawImage(base, 0, 0, dw, dh);
    }

    // Mask overlays are hidden in pure "after" view so the result is seen cleanly.
    if (view !== "after") {
      const tint = tintRef.current;
      if (tint !== null) {
        const tctx = tint.getContext("2d");
        if (tctx !== null) {
          for (const ch of ["include", "exclude", "target"] as Channel[]) {
            const mc = maskRefs.current[ch];
            if (mc === null) continue;
            tctx.clearRect(0, 0, tint.width, tint.height);
            tctx.globalCompositeOperation = "source-over";
            tctx.drawImage(mc, 0, 0);
            tctx.globalCompositeOperation = "source-in";
            const [r, g, b] = CHANNEL_COLOR[ch];
            tctx.fillStyle = `rgb(${r},${g},${b})`;
            tctx.fillRect(0, 0, tint.width, tint.height);
            tctx.globalCompositeOperation = "source-over";
            ctx.globalAlpha = ch === "target" ? 0.5 : 0.34;
            ctx.drawImage(tint, 0, 0, dw, dh);
            ctx.globalAlpha = 1;
          }
        }
      }
    }

    // Live rectangle preview
    const rs = rectStartRef.current;
    const rn = rectNowRef.current;
    if (tool === "rect" && rs !== null && rn !== null) {
      const sx = (Math.min(rs.x, rn.x) / width) * dw;
      const sy = (Math.min(rs.y, rn.y) / height) * dh;
      const sw = (Math.abs(rn.x - rs.x) / width) * dw;
      const sh = (Math.abs(rn.y - rs.y) / height) * dh;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.setLineDash([]);
    }
  }, [view, tool, width, height]);

  useEffect(() => { if (ready) draw(); }, [ready, draw]);

  // ── Painting ────────────────────────────────────────────────────────────────
  function toImage(e: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const disp = displayRef.current;
    if (disp === null) return { x: 0, y: 0 };
    const rect = disp.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    const y = ((e.clientY - rect.top) / rect.height) * height;
    return { x, y };
  }

  function stroke(from: { x: number; y: number } | null, to: { x: number; y: number }): void {
    const mc = maskRefs.current[channel];
    if (mc === null) return;
    const ctx = mc.getContext("2d");
    if (ctx === null) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = brushSize;
    if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.fillStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgba(255,255,255,1)";
      ctx.fillStyle = "rgba(255,255,255,1)";
    }
    ctx.beginPath();
    ctx.arc(to.x, to.y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
    if (from !== null) {
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>): void {
    if (busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toImage(e);
    if (tool === "rect") {
      rectStartRef.current = p;
      rectNowRef.current = p;
      paintingRef.current = true;
      return;
    }
    paintingRef.current = true;
    lastPtRef.current = p;
    if (view === "after") setView("before");
    stroke(null, p);
    draw();
  }
  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>): void {
    if (!paintingRef.current) return;
    const p = toImage(e);
    if (tool === "rect") {
      rectNowRef.current = p;
      draw();
      return;
    }
    stroke(lastPtRef.current, p);
    lastPtRef.current = p;
    draw();
  }
  function onPointerUp(): void {
    if (tool === "rect" && rectStartRef.current !== null && rectNowRef.current !== null) {
      const mc = maskRefs.current[channel];
      const ctx = mc?.getContext("2d") ?? null;
      if (ctx !== null) {
        const rs = rectStartRef.current;
        const rn = rectNowRef.current;
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "rgba(255,255,255,1)";
        ctx.fillRect(Math.min(rs.x, rn.x), Math.min(rs.y, rn.y), Math.abs(rn.x - rs.x), Math.abs(rn.y - rs.y));
      }
    }
    paintingRef.current = false;
    rectStartRef.current = null;
    rectNowRef.current = null;
    lastPtRef.current = null;
    draw();
  }

  function maskFromCanvas(c: HTMLCanvasElement | null): SelectionMask | null {
    if (c === null) return null;
    const ctx = c.getContext("2d");
    if (ctx === null) return null;
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const out = new Uint8Array(c.width * c.height);
    let any = false;
    for (let i = 0; i < out.length; i += 1) {
      const a = data[i * 4 + 3];
      if (a > 12) { out[i] = 255; any = true; }
    }
    return any ? { data: out, width: c.width, height: c.height } : null;
  }

  const runFill = useCallback(async (preview: boolean): Promise<string | null> => {
    const target = maskFromCanvas(maskRefs.current.target);
    if (target === null) { setStatus("סמן אזור להסרה (אדום) תחילה"); return null; }
    const base = baseCanvasRef.current;
    if (base === null) return null;
    setBusy(true);
    setStatus(preview ? "מחשב תצוגה מקדימה..." : "מחיל מילוי...");
    try {
      const result = await runContentAwareFill({
        asset,
        layer,
        targetMask: target,
        renderedImageDataUrl: baseImageDataUrl,
        engine,
        preview,
        sdWorkingSize: preview ? 384 : 512,
        sdSteps: preview ? 16 : 24,
        samplingInclude: maskFromCanvas(maskRefs.current.include),
        samplingExclude: maskFromCanvas(maskRefs.current.exclude)
      });
      if (result === null) { setStatus("מנוע המילוי לא זמין"); return null; }
      const url = await composeInpaintPatch(base, result.patchPngBase64, result.roi);
      setStatus(result.fallback ? `הושלם (גיבוי: ${result.modelId})` : `הושלם • ${result.modelId}`);
      return url;
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "המילוי נכשל");
      return null;
    } finally {
      setBusy(false);
    }
  }, [asset, layer, baseImageDataUrl, engine]);

  async function handlePreview(): Promise<void> {
    const url = await runFill(true);
    if (url === null) return;
    const img = await loadHtmlImage(url).catch(() => null);
    if (img === null) return;
    previewImgRef.current = img;
    setHasPreview(true);
    setView("after");
    draw();
  }
  async function handleApply(): Promise<void> {
    const url = await runFill(false);
    if (url === null) return;
    onApplied(url);
  }
  // runFill bound to an explicit engine (for Try Again, avoiding stale state).
  const runFillWith = useCallback(async (eng: ContentFillEngine, preview: boolean): Promise<string | null> => {
    const target = maskFromCanvas(maskRefs.current.target);
    if (target === null) { setStatus("סמן אזור להסרה תחילה"); return null; }
    const base = baseCanvasRef.current;
    if (base === null) return null;
    setBusy(true);
    try {
      const result = await runContentAwareFill({
        asset, layer, targetMask: target, renderedImageDataUrl: baseImageDataUrl, engine: eng, preview,
        sdWorkingSize: preview ? 384 : 512, sdSteps: preview ? 16 : 24,
        samplingInclude: maskFromCanvas(maskRefs.current.include),
        samplingExclude: maskFromCanvas(maskRefs.current.exclude)
      });
      if (result === null) { setStatus("מנוע המילוי לא זמין"); return null; }
      return await composeInpaintPatch(base, result.patchPngBase64, result.roi);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "המילוי נכשל");
      return null;
    } finally { setBusy(false); }
  }, [asset, layer, baseImageDataUrl]);

  async function handleTryAgain(): Promise<void> {
    const idx = ENGINE_CYCLE.indexOf(engine as ContentFillEngine);
    const next = ENGINE_CYCLE[(idx + 1) % ENGINE_CYCLE.length] ?? "lama";
    setEngine(next);
    if (next === "sd_inpaint") void warmSdEngine();
    setStatus(`מנוע: ${next} — מריץ תצוגה מקדימה`);
    const url = await runFillWith(next, true);
    if (url === null) return;
    const img = await loadHtmlImage(url).catch(() => null);
    if (img === null) return;
    previewImgRef.current = img;
    setHasPreview(true);
    setView("after");
    draw();
  }

  function resetSampling(): void {
    for (const ch of ["include", "exclude"] as Channel[]) {
      const c = maskRefs.current[ch];
      c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    }
    setStatus("אזורי הדגימה אופסו");
    draw();
  }
  function clearAll(): void {
    for (const ch of ["target", "include", "exclude"] as Channel[]) {
      const c = maskRefs.current[ch];
      c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    }
    previewImgRef.current = null;
    setHasPreview(false);
    setView("after");
    draw();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "Enter") { e.preventDefault(); void handleApply(); }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fit display canvas size to the image aspect within the stage area.
  const displaySize = fitInto(width, height, 980, 680);

  return (
    <div className="caf-overlay" role="dialog" aria-modal="true" dir="rtl">
      <div className="caf-modal">
        <header className="caf-header">
          <strong>מילוי חכם / מחיקה חכמה</strong>
          <span className="caf-status">{status}</span>
          <button className="caf-x" type="button" onClick={onClose} title="סגור (Esc)">✕</button>
        </header>

        <div className="caf-body">
          <aside className="caf-rail">
            <div className="caf-group-title">ערוץ</div>
            <button className={`caf-chip target${channel === "target" ? " on" : ""}`} type="button" onClick={() => setChannel("target")}>אזור להסרה</button>
            <button className={`caf-chip include${channel === "include" ? " on" : ""}`} type="button" onClick={() => setChannel("include")}>דגום מכאן</button>
            <button className={`caf-chip exclude${channel === "exclude" ? " on" : ""}`} type="button" onClick={() => setChannel("exclude")}>אל תדגום מכאן</button>

            <div className="caf-group-title">כלי</div>
            <button className={`caf-tool${tool === "brush" ? " on" : ""}`} type="button" onClick={() => setTool("brush")}>מברשת</button>
            <button className={`caf-tool${tool === "rect" ? " on" : ""}`} type="button" onClick={() => setTool("rect")}>מלבן</button>
            <button className={`caf-tool${tool === "eraser" ? " on" : ""}`} type="button" onClick={() => setTool("eraser")}>מחק</button>

            <div className="caf-group-title">גודל מברשת: {brushSize}px</div>
            <input type="range" min={4} max={Math.round(Math.max(width, height) / 4)} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} />

            <button className="caf-tool" type="button" onClick={resetSampling}>איפוס דגימה</button>
            <button className="caf-tool" type="button" onClick={clearAll}>נקה הכל</button>
          </aside>

          <div className="caf-stage">
            <canvas
              ref={displayRef}
              width={displaySize.w}
              height={displaySize.h}
              className="caf-canvas"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              style={{ cursor: busy ? "wait" : "crosshair" }}
            />
            {busy && <div className="caf-busy">מעבד…</div>}
          </div>

          <aside className="caf-options">
            <div className="caf-group-title">מנוע מילוי</div>
            <select className="context-select full" value={engine} onChange={(e) => { const v = e.target.value as ContentFillEngine; setEngine(v); if (v === "sd_inpaint") void warmSdEngine(); }}>
              {ENGINE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            <div className="caf-group-title">תצוגה</div>
            <div className="caf-seg">
              <button className={view === "before" ? "on" : ""} type="button" onClick={() => { setView("before"); draw(); }}>לפני</button>
              <button className={view === "after" ? "on" : ""} type="button" disabled={!hasPreview} onClick={() => { setView("after"); draw(); }}>אחרי</button>
              <button className={view === "split" ? "on" : ""} type="button" disabled={!hasPreview} onClick={() => { setView("split"); draw(); }}>מפוצל</button>
            </div>

            <p className="caf-hint">אדום = להסרה · ירוק = לדגום · כחול = לא לדגום. דגימה משפיעה רק על מנוע הטקסטורה.</p>
          </aside>
        </div>

        <footer className="caf-footer">
          <button className="btn" type="button" disabled={busy} onClick={() => void handlePreview()}>תצוגה מקדימה</button>
          <button className="btn" type="button" disabled={busy || !hasPreview} onClick={() => void handleTryAgain()}>נסה מנוע אחר</button>
          <span style={{ flex: 1 }} />
          <button className="btn" type="button" onClick={onClose}>ביטול</button>
          <button className="btn btn-accent" type="button" disabled={busy} onClick={() => void handleApply()}>החל</button>
        </footer>
      </div>
    </div>
  );
}

function fitInto(w: number, h: number, maxW: number, maxH: number): { w: number; h: number } {
  const s = Math.min(maxW / w, maxH / h, 1);
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}
