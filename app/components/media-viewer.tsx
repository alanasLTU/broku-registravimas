"use client";

import { useEffect, useRef, type TouchEvent } from "react";

export type MediaViewerItem = {
  id: string;
  url: string;
  thumbUrl?: string;
  kind: "photo" | "video";
  caption?: string;
  fileName?: string;
};

type MediaViewerProps = {
  items: MediaViewerItem[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  onAnnotate?: () => void;
};

export default function MediaViewer({ items, index, onClose, onIndexChange, onAnnotate }: MediaViewerProps) {
  const current = items[index];
  const touchStart = useRef<number | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight" && index < items.length - 1) onIndexChange(index + 1);
      if (event.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, onClose, onIndexChange]);

  if (!current) return null;

  function onTouchStart(event: TouchEvent) {
    touchStart.current = event.changedTouches[0]?.clientX ?? null;
  }

  function onTouchEnd(event: TouchEvent) {
    const start = touchStart.current;
    const end = event.changedTouches[0]?.clientX;
    touchStart.current = null;
    if (start == null || end == null) return;
    const delta = end - start;
    if (delta < -48 && index < items.length - 1) onIndexChange(index + 1);
    if (delta > 48 && index > 0) onIndexChange(index - 1);
  }

  return (
    <div className="media-viewer-layer" role="dialog" aria-modal="true" aria-label="Medijos peržiūra">
      <button className="media-viewer-scrim" onClick={onClose} aria-label="Uždaryti peržiūrą" />
      <div className="media-viewer-panel">
        <header className="media-viewer-toolbar">
          <div className="media-viewer-toolbar-side">
            {current.kind === "photo" && onAnnotate ? (
              <button type="button" className="media-viewer-annotate" onClick={(event) => { event.stopPropagation(); onAnnotate(); }}>✎ Žymėti</button>
            ) : null}
          </div>
          <span className="media-viewer-title">{current.kind === "video" ? "Video" : "Nuotrauka"} {index + 1} / {items.length}</span>
          <div className="media-viewer-toolbar-side media-viewer-toolbar-end">
            <button type="button" className="media-viewer-close" onClick={(event) => { event.stopPropagation(); onClose(); }} aria-label="Uždaryti">
              <span className="media-viewer-close-text">Uždaryti</span>
              <span className="media-viewer-close-icon" aria-hidden="true">×</span>
            </button>
          </div>
        </header>
        <div className="media-viewer-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {items.length > 1 && index > 0 && (
            <button type="button" className="media-viewer-nav prev" onClick={() => onIndexChange(index - 1)} aria-label="Ankstesnis">‹</button>
          )}
          {current.kind === "video" ? (
            <video key={current.id} src={current.url} controls playsInline preload="metadata" />
          ) : (
            <img src={current.url} alt={current.caption || "Nuotrauka"} />
          )}
          {items.length > 1 && index < items.length - 1 && (
            <button type="button" className="media-viewer-nav next" onClick={() => onIndexChange(index + 1)} aria-label="Kitas">›</button>
          )}
        </div>
        {items.length > 1 && (
          <div className="media-viewer-dots">
            {items.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                className={itemIndex === index ? "dot-active" : ""}
                onClick={() => onIndexChange(itemIndex)}
                aria-label={item.kind === "video" ? `Video ${itemIndex + 1}` : `Nuotrauka ${itemIndex + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
