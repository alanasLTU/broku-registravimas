"use client";

import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";

type Tool = "circle" | "arrow" | "draw";
type Point = { x: number; y: number };
type Annotation = { tool: Tool; color: string; width: number; points: Point[] };

type PhotoEditorProps = {
  sourceUrl: string;
  fileName?: string;
  saving: boolean;
  onClose: () => void;
  onSave: (blob: Blob) => Promise<void>;
};

const colors = [
  { value: "#ef3f36", label: "Raudona" },
  { value: "#f4b51d", label: "Geltona" },
  { value: "#2188d9", label: "Mėlyna" },
];

function drawShape(context: CanvasRenderingContext2D, annotation: Annotation, color: string, width: number) {
  const start = annotation.points[0];
  const end = annotation.points.at(-1);
  if (!start || !end) return;

  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();

  if (annotation.tool === "circle") {
    const radiusX = Math.max(2, Math.abs(end.x - start.x) / 2);
    const radiusY = Math.max(2, Math.abs(end.y - start.y) / 2);
    context.ellipse((start.x + end.x) / 2, (start.y + end.y) / 2, radiusX, radiusY, 0, 0, Math.PI * 2);
  } else if (annotation.tool === "arrow") {
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const headLength = Math.max(22, annotation.width * 4.2);
    context.moveTo(end.x, end.y);
    context.lineTo(end.x - headLength * Math.cos(angle - Math.PI / 6), end.y - headLength * Math.sin(angle - Math.PI / 6));
    context.moveTo(end.x, end.y);
    context.lineTo(end.x - headLength * Math.cos(angle + Math.PI / 6), end.y - headLength * Math.sin(angle + Math.PI / 6));
  } else {
    context.moveTo(start.x, start.y);
    for (const point of annotation.points.slice(1)) context.lineTo(point.x, point.y);
  }

  context.stroke();
  context.restore();
}

function paintAnnotation(context: CanvasRenderingContext2D, annotation: Annotation) {
  drawShape(context, annotation, "rgba(255,255,255,.92)", annotation.width + 5);
  drawShape(context, annotation, annotation.color, annotation.width);
}

export default function PhotoEditor({ sourceUrl, fileName, saving, onClose, onSave }: PhotoEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const currentRef = useRef<Annotation | null>(null);
  const [tool, setTool] = useState<Tool>("circle");
  const [color, setColor] = useState(colors[0].value);
  const [lineWidth, setLineWidth] = useState(14);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [current, setCurrent] = useState<Annotation | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !ready) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    annotations.forEach((annotation) => paintAnnotation(context, annotation));
    if (current) paintAnnotation(context, current);
  }, [annotations, current, ready]);

  useEffect(() => {
    currentRef.current = null;
    setReady(false);
    setLoadError("");
    setSaveError("");
    setAnnotations([]);
    setCurrent(null);
    const image = new Image();
    image.decoding = "async";
    if (sourceUrl.startsWith("http")) image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const maxDimension = 2400;
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      imageRef.current = image;
      setReady(true);
    };
    image.onerror = () => setLoadError("Nuotraukos atidaryti nepavyko.");
    image.src = sourceUrl;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [sourceUrl]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        setAnnotations((items) => items.slice(0, -1));
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, saving]);

  function pointFromEvent(event: ReactPointerEvent<HTMLCanvasElement>): Point {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
      y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
    };
  }

  function startDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!ready || saving) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    const annotation: Annotation = { tool, color, width: lineWidth, points: [point, point] };
    currentRef.current = annotation;
    setCurrent(annotation);
  }

  function continueDrawing(event: ReactPointerEvent<HTMLCanvasElement>) {
    const active = currentRef.current;
    if (!active || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const point = pointFromEvent(event);
    const next = active.tool === "draw"
      ? { ...active, points: [...active.points, point] }
      : { ...active, points: [active.points[0], point] };
    currentRef.current = next;
    setCurrent(next);
  }

  function finishDrawing(event: ReactPointerEvent<HTMLCanvasElement>, commit = true) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const finished = currentRef.current;
    currentRef.current = null;
    setCurrent(null);
    if (!finished || !commit) return;
    const start = finished.points[0];
    const end = finished.points.at(-1);
    if (!start || !end || Math.hypot(end.x - start.x, end.y - start.y) < 5) return;
    setAnnotations((items) => [...items, finished]);
  }

  async function savePhoto() {
    const canvas = canvasRef.current;
    if (!canvas || !annotations.length || saving) return;
    setSaveError("");
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.93));
    const output = blob ?? await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!output) {
      setSaveError("Nepavyko sugeneruoti pažymėtos nuotraukos. Bandykite dar kartą.");
      return;
    }
    try {
      await onSave(output);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Išsaugoti nepavyko");
    }
  }

  return (
    <div className="photo-editor-layer" role="dialog" aria-modal="true" aria-labelledby="photo-editor-title">
      <button className="photo-editor-scrim" onClick={saving ? undefined : onClose} aria-label="Uždaryti nuotraukos redagavimą" />
      <section className="photo-editor-panel">
        <header className="photo-editor-head">
          <div><span>Nuotraukos žymėjimas</span><h2 id="photo-editor-title">Pažymėkite pažeidimo vietą</h2><p>{fileName || "Nuotrauka"}</p></div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Uždaryti">×</button>
        </header>
        <div className="photo-editor-toolbar">
          <div className="photo-editor-tools" role="group" aria-label="Žymėjimo įrankiai">
            <button type="button" className={tool === "circle" ? "editor-tool-active" : ""} aria-pressed={tool === "circle"} onClick={() => setTool("circle")}><span>○</span> Apibraukti</button>
            <button type="button" className={tool === "arrow" ? "editor-tool-active" : ""} aria-pressed={tool === "arrow"} onClick={() => setTool("arrow")}><span>➜</span> Rodyklė</button>
            <button type="button" className={tool === "draw" ? "editor-tool-active" : ""} aria-pressed={tool === "draw"} onClick={() => setTool("draw")}><span>✎</span> Piešti</button>
          </div>
          <div className="photo-editor-options">
            <div className="photo-editor-colors" role="group" aria-label="Žymėjimo spalva">
              {colors.map((option) => <button key={option.value} type="button" className={color === option.value ? "editor-color-active" : ""} style={{ backgroundColor: option.value }} onClick={() => setColor(option.value)} aria-label={option.label} aria-pressed={color === option.value} />)}
            </div>
            <label><span>Storis</span><select value={lineWidth} onChange={(event) => setLineWidth(Number(event.target.value))}><option value={8}>Plonas</option><option value={14}>Vidutinis</option><option value={22}>Storas</option></select></label>
            <button type="button" onClick={() => setAnnotations((items) => items.slice(0, -1))} disabled={!annotations.length || saving}>↶ Atšaukti</button>
            <button type="button" onClick={() => setAnnotations([])} disabled={!annotations.length || saving}>Išvalyti</button>
          </div>
        </div>
        <div className="photo-editor-stage">
          <div className="photo-editor-canvas-wrap">
            <canvas
              ref={canvasRef}
              onPointerDown={startDrawing}
              onPointerMove={continueDrawing}
              onPointerUp={(event) => finishDrawing(event)}
              onPointerCancel={(event) => finishDrawing(event, false)}
              aria-label="Redaguojama nuotrauka"
            />
          </div>
          {!ready && <div className="photo-editor-loading">{loadError || "Atidaroma nuotrauka…"}</div>}
        </div>
        <footer className="photo-editor-actions">
          <span className={saveError ? "photo-editor-save-error" : undefined}>{saveError || "Braukite pirštu arba pele. Pažymėjimai bus matomi ir PDF ataskaitoje."}</span>
          <div><button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Atšaukti</button><button type="button" className="primary-button" onClick={savePhoto} disabled={!ready || !annotations.length || saving}>{saving ? "Išsaugoma…" : "Išsaugoti pažymėtą nuotrauką"}</button></div>
        </footer>
      </section>
    </div>
  );
}
