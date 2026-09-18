"use client";

import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import MediaFileButton from "./media-file-button";
import { MEDIA_BUCKET, type RecordTypeName } from "@/lib/constants";
import { rasterizePlanSource } from "@/lib/plan-raster";
import { PLAN_PIN_COLORS, clampPlanCoord, type ProjectPlan } from "@/lib/plans";
import { preparePhotoThumb } from "@/lib/media";
import { createBrowserSupabase } from "@/lib/supabase/client";

export type PlanPinRecord = {
  id: string;
  code: string;
  title: string;
  recordType: RecordTypeName;
  status: string;
  room?: string;
  photoUrl?: string;
  photoThumbUrl?: string;
  planId: string | null;
  planX: number | null;
  planY: number | null;
};

type PendingDrop = { x: number; y: number };

type Props = {
  projectId: string;
  projectName: string;
  plans: ProjectPlan[];
  records: PlanPinRecord[];
  canUpload: boolean;
  canCreate: boolean;
  canAttach: boolean;
  onClose: () => void;
  onPlansChange: (plans: ProjectPlan[]) => void;
  onCreateRecord: (planId: string, x: number, y: number) => void;
  onAttachRecord: (recordId: string, planId: string, x: number, y: number) => Promise<void>;
  onOpenRecord: (recordId: string) => void;
  showToast: (message: string) => void;
  pickForNewRecord?: boolean;
  finalizeCapture?: boolean;
  finalizeSaving?: boolean;
  finalizeSaveLabel?: string;
  onFinalizeCapture?: (planId: string, x: number, y: number) => void | Promise<void>;
  onCancelFinalizeCapture?: () => void;
};

export default function PlanViewer({
  projectId,
  projectName,
  plans,
  records,
  canUpload,
  canCreate,
  canAttach,
  onClose,
  onPlansChange,
  onCreateRecord,
  onAttachRecord,
  onOpenRecord,
  showToast,
  pickForNewRecord = false,
  finalizeCapture = false,
  finalizeSaving = false,
  finalizeSaveLabel = "Išsaugoti",
  onFinalizeCapture,
  onCancelFinalizeCapture,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ dist: number; scale: number; tx: number; ty: number } | null>(null);
  const panStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const moved = useRef(false);
  const viewState = useRef({ scale: 1, tx: 0, ty: 0 });
  const fitScaleRef = useRef(1);
  const activePointerId = useRef<number | null>(null);

  const [activePlanId, setActivePlanId] = useState(plans[0]?.id ?? "");
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drop, setDrop] = useState<PendingDrop | null>(null);
  const [attachQuery, setAttachQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [imageSize, setImageSize] = useState({ w: 1, h: 1 });

  const activePlan = plans.find((item) => item.id === activePlanId) ?? plans[0] ?? null;

  useEffect(() => {
    if (!plans.length) {
      setActivePlanId("");
      return;
    }
    if (!plans.some((item) => item.id === activePlanId)) setActivePlanId(plans[0].id);
  }, [plans, activePlanId]);

  useEffect(() => {
    setSelectedId(null);
    setDrop(null);
    setAttachQuery("");
  }, [activePlanId]);

  const pins = useMemo(
    () => records.filter((item) => item.planId === activePlan?.id && item.planX != null && item.planY != null),
    [records, activePlan?.id],
  );

  const attachable = useMemo(() => {
    const q = attachQuery.trim().toLowerCase();
    return records.filter((item) => {
      if (item.planId === activePlan?.id) return false;
      if (!q) return true;
      return `${item.code} ${item.title} ${item.room ?? ""}`.toLowerCase().includes(q);
    });
  }, [records, activePlan?.id, attachQuery]);

  const selected = pins.find((item) => item.id === selectedId) ?? null;

  function minScale() {
    return fitScaleRef.current * 0.92;
  }

  function maxScale() {
    return fitScaleRef.current * 8;
  }

  function clampScale(value: number) {
    return Math.min(maxScale(), Math.max(minScale(), value));
  }

  function fitImage(width: number, height: number) {
    const box = viewportRef.current;
    if (!box || !width || !height) return;
    const cw = box.clientWidth;
    const ch = box.clientHeight;
    const nextScale = Math.min(cw / width, ch / height);
    fitScaleRef.current = nextScale;
    const nextTx = (cw - width * nextScale) / 2;
    const nextTy = (ch - height * nextScale) / 2;
    viewState.current = { scale: nextScale, tx: nextTx, ty: nextTy };
    setScale(nextScale);
    setTx(nextTx);
    setTy(nextTy);
    setImageSize({ w: width, h: height });
  }

  function viewportPoint(clientX: number, clientY: number) {
    const box = viewportRef.current?.getBoundingClientRect();
    if (!box) return null;
    return { x: clientX - box.left, y: clientY - box.top };
  }

  function zoomAtPoint(px: number, py: number, nextScale: number, base: { scale: number; tx: number; ty: number }) {
    const clamped = clampScale(nextScale);
    const ratio = clamped / base.scale;
    return {
      scale: clamped,
      tx: px - (px - base.tx) * ratio,
      ty: py - (py - base.ty) * ratio,
    };
  }

  function applyZoomAtPoint(px: number, py: number, nextScale: number, base?: { scale: number; tx: number; ty: number }) {
    const current = base ?? viewState.current;
    const next = zoomAtPoint(px, py, nextScale, current);
    viewState.current = next;
    setScale(next.scale);
    setTx(next.tx);
    setTy(next.ty);
    return next;
  }

  function clientToPlan(clientX: number, clientY: number) {
    const box = viewportRef.current?.getBoundingClientRect();
    const { scale: currentScale, tx: currentTx, ty: currentTy } = viewState.current;
    if (!box || currentScale === 0) return null;
    const x = (clientX - box.left - currentTx) / (imageSize.w * currentScale);
    const y = (clientY - box.top - currentTy) / (imageSize.h * currentScale);
    if (x < 0 || y < 0 || x > 1 || y > 1) return null;
    return { x: clampPlanCoord(x), y: clampPlanCoord(y) };
  }

  function findPinAt(clientX: number, clientY: number) {
    const box = viewportRef.current?.getBoundingClientRect();
    if (!box) return null;
    const { scale: currentScale, tx: currentTx, ty: currentTy } = viewState.current;
    const px = clientX - box.left;
    const py = clientY - box.top;
    const planX = (px - currentTx) / (imageSize.w * currentScale);
    const planY = (py - currentTy) / (imageSize.h * currentScale);
    if (planX < -0.05 || planY < -0.05 || planX > 1.05 || planY > 1.05) return null;

    let closest: PlanPinRecord | null = null;
    let closestDist = Infinity;
    for (const pin of pins) {
      const dx = (planX - (pin.planX ?? 0)) * imageSize.w * currentScale;
      const dy = (planY - (pin.planY ?? 0)) * imageSize.h * currentScale;
      const dist = Math.hypot(dx, dy);
      if (dist < 32 && dist < closestDist) {
        closest = pin;
        closestDist = dist;
      }
    }
    return closest;
  }

  function isInteractiveTarget(target: EventTarget | null) {
    return target instanceof Element
      && Boolean(target.closest(".plan-pin, .plan-pin-card, .plan-sheet, .plan-viewer-tabs, .plan-viewer-head, button, input, a, label"));
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (isInteractiveTarget(event.target)) return;
    activePointerId.current = event.pointerId;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    moved.current = false;
    if (pointers.current.size === 1) {
      panStart.current = { x: event.clientX, y: event.clientY, tx: viewState.current.tx, ty: viewState.current.ty };
      pinchStart.current = null;
    } else if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStart.current = { dist: Math.max(1, dist), ...viewState.current };
      panStart.current = null;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && pinchStart.current) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const center = viewportPoint((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
      if (center) {
        const nextScale = pinchStart.current.scale * (dist / pinchStart.current.dist);
        applyZoomAtPoint(center.x, center.y, nextScale, pinchStart.current);
      }
      moved.current = true;
      return;
    }
    if (panStart.current && pointers.current.size === 1) {
      const dx = event.clientX - panStart.current.x;
      const dy = event.clientY - panStart.current.y;
      if (Math.hypot(dx, dy) > 8) {
        moved.current = true;
        if (activePointerId.current === event.pointerId) {
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      }
      const nextTx = panStart.current.tx + dx;
      const nextTy = panStart.current.ty + dy;
      viewState.current = { ...viewState.current, tx: nextTx, ty: nextTy };
      setTx(nextTx);
      setTy(nextTy);
    }
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (isInteractiveTarget(event.target)) return;
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) panStart.current = null;
    if (activePointerId.current === event.pointerId) activePointerId.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore if capture was never set
    }
    if (moved.current || event.button > 0) return;

    const tappedPin = findPinAt(event.clientX, event.clientY);
    if (tappedPin) {
      setDrop(null);
      setSelectedId(tappedPin.id);
      return;
    }

    const coords = clientToPlan(event.clientX, event.clientY);
    if (!coords || !activePlan) {
      setSelectedId(null);
      setDrop(null);
      return;
    }
    setSelectedId(null);
    if (!canCreate && !canAttach) return;
    setDrop(coords);
  }

  useEffect(() => {
    viewState.current = { scale, tx, ty };
  }, [scale, tx, ty]);

  useEffect(() => {
    const box = viewportRef.current;
    if (!box) return undefined;
    const onWheelNative = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.9 : 1.1;
      const rect = box.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const current = viewState.current;
      const next = zoomAtPoint(px, py, current.scale * factor, current);
      viewState.current = next;
      setScale(next.scale);
      setTx(next.tx);
      setTy(next.ty);
    };
    box.addEventListener("wheel", onWheelNative, { passive: false });
    return () => box.removeEventListener("wheel", onWheelNative);
  }, []);

  async function uploadFiles(files: FileList | File[]) {
    if (!canUpload || uploading) return;
    const list = Array.from(files);
    if (!list.length) return;
    setUploading(true);
    try {
      const supabase = createBrowserSupabase();
      const created: ProjectPlan[] = [];
      for (const source of list) {
        const pages = await rasterizePlanSource(source);
        for (const page of pages) {
          const title = pages.length > 1
            ? `${source.name.replace(/\.[^.]+$/, "")} · ${page.page} p.`
            : source.name.replace(/\.[^.]+$/, "") || "Planas";
          const response = await fetch("/api/plans", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              projectId,
              title: title.slice(0, 120),
              width: page.width,
              height: page.height,
            }),
          });
          const payload = await response.json() as { plan?: ProjectPlan; upload?: { objectKey: string; thumbObjectKey: string }; error?: string };
          if (!response.ok || !payload.plan || !payload.upload) throw new Error(payload.error || "Nepavyko įkelti plano");
          const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(payload.upload.objectKey, page.file, {
            contentType: "image/jpeg",
            upsert: true,
          });
          if (error) throw error;
          const thumb = await preparePhotoThumb(page.file);
          if (thumb) {
            await supabase.storage.from(MEDIA_BUCKET).upload(payload.upload.thumbObjectKey, thumb, {
              contentType: "image/jpeg",
              upsert: true,
            });
          }
          created.push(payload.plan);
        }
      }
      const next = [...plans, ...created];
      onPlansChange(next);
      if (created[0]) setActivePlanId(created[0].id);
      showToast(created.length > 1 ? `Įkelti ${created.length} planai` : "Planas įkeltas");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Nepavyko įkelti plano");
    } finally {
      setUploading(false);
    }
  }

  async function removePlan(plan: ProjectPlan) {
    if (!canUpload || !window.confirm(`Ištrinti planą „${plan.title}“? Smeigtukai nuo šio plano nusimes, įrašai liks.`)) return;
    const response = await fetch(`/api/plans/${plan.id}`, { method: "DELETE" });
    const payload = await response.json() as { error?: string };
    if (!response.ok) {
      showToast(payload.error || "Nepavyko ištrinti");
      return;
    }
    onPlansChange(plans.filter((item) => item.id !== plan.id));
    showToast("Planas ištrintas");
  }

  const pinPx = 24;
  const pinCounterScale = 1 / Math.max(scale, 0.01);

  return (
    <div className="plan-viewer-layer" role="dialog" aria-modal="true" aria-labelledby="plan-viewer-title">
      <header className="plan-viewer-head">
        <div>
          <span>Objekto planas</span>
          <h2 id="plan-viewer-title">{projectName}</h2>
        </div>
        <div className="plan-viewer-head-actions">
          {canUpload ? (
            <MediaFileButton className="secondary-button plan-upload-cta" accept="application/pdf,.pdf,image/*" multiple disabled={uploading} onFiles={(files) => void uploadFiles(files)}>
              {uploading ? "Keliama…" : "＋ Planas"}
            </MediaFileButton>
          ) : null}
          <button type="button" onClick={onClose} aria-label="Uždaryti">×</button>
        </div>
      </header>

      {plans.length > 1 ? (
        <div className="plan-viewer-tabs" role="tablist">
          {plans.map((plan) => (
            <button
              key={plan.id}
              type="button"
              role="tab"
              className={plan.id === activePlan?.id ? "plan-tab-active" : ""}
              onClick={() => setActivePlanId(plan.id)}
            >
              {plan.title}
            </button>
          ))}
        </div>
      ) : null}

      {pickForNewRecord ? (
        <div className="plan-viewer-pick-hint">
          <strong>{finalizeCapture ? "Pasirinkite vietą ir išsaugokite" : "Pasirinkite vietą plane"}</strong>
          <span>{finalizeCapture ? "Forma jau užpildyta — palieskite planą, patvirtinkite smeigtuką ir išsaugokite." : "Palieskite planą — tada pasirinksite tipą ir užpildysite formą."}</span>
        </div>
      ) : null}

      <div
        ref={viewportRef}
        className="plan-viewer-viewport"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {activePlan ? (
          <div className="plan-viewer-world" style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}>
            <img
              ref={imageRef}
              src={activePlan.fileUrl}
              alt={activePlan.title}
              draggable={false}
              onLoad={(event) => fitImage(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
            />
            {pins.map((pin) => (
              <button
                key={pin.id}
                type="button"
                className={`plan-pin${selectedId === pin.id ? " plan-pin-active" : ""}`}
                style={{
                  left: `${(pin.planX ?? 0) * 100}%`,
                  top: `${(pin.planY ?? 0) * 100}%`,
                  background: PLAN_PIN_COLORS[pin.recordType],
                  width: `${pinPx}px`,
                  height: `${pinPx}px`,
                  transform: `translate(-50%, -50%) scale(${pinCounterScale})`,
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onPointerUp={(event) => {
                  event.stopPropagation();
                  if (event.button > 0) return;
                  setDrop(null);
                  setSelectedId(pin.id);
                }}
                aria-label={`${pin.code} ${pin.title}`}
              />
            ))}
            {drop ? (
              <span className="plan-drop-mark" style={{ left: `${drop.x * 100}%`, top: `${drop.y * 100}%` }} />
            ) : null}
          </div>
        ) : (
          <div
            className="plan-viewer-empty"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              if (!canUpload || uploading) return;
              const target = event.target as HTMLElement;
              if (target.closest(".plan-upload-cta")) return;
              const button = event.currentTarget.querySelector(".plan-upload-cta") as HTMLButtonElement | null;
              button?.click();
            }}
          >
            <div className="plan-viewer-empty-copy">
              <strong>Šiam objektui dar nėra plano</strong>
              <span>Įkelkite PDF arba nuotrauką — suspausime, kad neužimtų Storage.</span>
            </div>
            {canUpload ? (
              <MediaFileButton className="primary-button plan-upload-cta" accept="application/pdf,.pdf,image/*" multiple disabled={uploading} onFiles={(files) => void uploadFiles(files)}>
                {uploading ? "Keliama…" : "Įkelti planą"}
              </MediaFileButton>
            ) : (
              <span>Paprašykite Distyle įkelti brėžinį.</span>
            )}
          </div>
        )}
      </div>

      <div className="plan-viewer-legend" aria-hidden>
        {Object.entries(PLAN_PIN_COLORS).map(([type, color]) => (
          <span key={type}><i style={{ background: color }} />{type}</span>
        ))}
      </div>

      {selected ? (
        <article
          className="plan-pin-card"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
        >
          <small style={{ color: PLAN_PIN_COLORS[selected.recordType] }}>{selected.recordType} · {selected.code}</small>
          <strong>{selected.title}</strong>
          <span>{selected.room || "Be patalpos"} · {selected.status}</span>
          {selected.photoUrl ? (
            <button type="button" className="plan-pin-card-photo" onClick={() => onOpenRecord(selected.id)}>
              <img src={selected.photoThumbUrl || selected.photoUrl} alt={`${selected.code} nuotrauka`} loading="lazy" decoding="async" />
              <span>Peržiūrėti įrašą</span>
            </button>
          ) : (
            <p className="plan-pin-card-no-photo">Nuotraukos nėra</p>
          )}
          <div className="plan-pin-card-actions">
            <button type="button" className="secondary-button" onClick={() => setSelectedId(null)}>Uždaryti</button>
            <button type="button" className="primary-button" onClick={() => onOpenRecord(selected.id)}>Atidaryti įrašą</button>
          </div>
        </article>
      ) : null}

      {drop && activePlan ? (
        <div
          className="plan-sheet"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
        >
          <div className="panel-handle" />
          <strong>{finalizeCapture ? "Patvirtinkite vietą" : pickForNewRecord ? "Nauja vieta plane" : "Kas čia?"}</strong>
          <p>{finalizeCapture ? "Smeigtukas bus čia. Išsaugokite įrašą arba grįžkite redaguoti formą." : pickForNewRecord ? "Čia bus naujas smeigtukas. Toliau pasirinksite tipą ir užpildysite formą." : "Smeigtukas bus šioje vietoje. Galite sukurti naują įrašą arba prisegti jau esamą."}</p>
          {finalizeCapture ? (
            <>
              <button type="button" className="primary-button complete-action-button" disabled={finalizeSaving} onClick={() => void onFinalizeCapture?.(activePlan.id, drop.x, drop.y)}>
                {finalizeSaving ? "Saugoma…" : finalizeSaveLabel}
              </button>
              <button type="button" className="secondary-button" disabled={finalizeSaving} onClick={() => { setDrop(null); onCancelFinalizeCapture?.(); }}>Grįžti į formą</button>
            </>
          ) : null}
          {!finalizeCapture && canCreate ? (
            <button type="button" className="primary-button" onClick={() => onCreateRecord(activePlan.id, drop.x, drop.y)}>
              {pickForNewRecord ? "⌖ Toliau · pasirinkti tipą" : "＋ Naujas įrašas čia"}
            </button>
          ) : null}
          {canAttach && !pickForNewRecord && !finalizeCapture ? (
            <>
              <label className="plan-attach-search">
                <span>Prisegti esamą</span>
                <input value={attachQuery} onChange={(event) => setAttachQuery(event.target.value)} placeholder="Kodas, pavadinimas, patalpa…" />
              </label>
              <div className="plan-attach-list">
                {attachable.slice(0, 40).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void onAttachRecord(item.id, activePlan.id, drop.x, drop.y).then(() => setDrop(null))}
                  >
                    <em style={{ background: PLAN_PIN_COLORS[item.recordType] }} />
                    <span><b>{item.code}</b> {item.title}</span>
                  </button>
                ))}
                {!attachable.length ? <small>Nėra neprisegtų įrašų</small> : null}
              </div>
            </>
          ) : null}
          {!finalizeCapture ? (
            <button type="button" className="secondary-button" onClick={() => setDrop(null)}>Atšaukti</button>
          ) : null}
        </div>
      ) : null}

      {activePlan && canUpload ? (
        <button type="button" className="plan-delete-link" onClick={() => void removePlan(activePlan)}>Ištrinti šį planą</button>
      ) : null}
    </div>
  );
}
