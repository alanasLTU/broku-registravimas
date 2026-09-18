"use client";

import { DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import MediaFileButton from "./media-file-button";
import {
  INVOICE_CATEGORIES,
  INVOICE_CATEGORY_LABELS,
  INVOICE_CHARGED_TO,
  INVOICE_CHARGED_TO_LABELS,
  MEDIA_BUCKET,
  type InvoiceCategory,
  type InvoiceChargedTo,
} from "@/lib/constants";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { isImageFile, isInvoicePdfFile, mediaFileName, mimeOf, pickInvoiceUploadFile, preparePhotoForUpload, preparePhotoThumb } from "@/lib/media";
import type { Invoice, InvoicePrefill } from "@/lib/invoices";
import { invoiceSubmitBlockReason, invoiceSubmitIssues } from "@/lib/invoice-validation";
import DateInput from "./date-input";
import ProjectContactsBar from "./project-contacts-bar";

type Props = {
  projectId: string;
  projectName: string;
  saving: boolean;
  onBack: () => void;
  onClose: () => void;
  onSaved: (invoice: Invoice) => void;
  setSaving: (value: boolean) => void;
  showToast: (message: string) => void;
  contactsRefreshKey?: number;
  onEditProject?: () => void;
  initialFile?: File | null;
  onInitialFileUsed?: () => void;
};

const EMPTY: InvoicePrefill = {
  supplierName: "",
  invoiceNumber: "",
  invoiceDate: "",
  amountExVat: "",
  vat: "",
  amountIncVat: "",
};

export default function InvoiceCapture({
  projectId,
  projectName,
  saving,
  onBack,
  onClose,
  onSaved,
  setSaving,
  showToast,
  contactsRefreshKey = 0,
  onEditProject,
  initialFile = null,
  onInitialFileUsed,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [invoiceDragActive, setInvoiceDragActive] = useState(false);
  const consumedInitialFileRef = useRef<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [parseLoading, setParseLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<string>("skipped");
  const [fields, setFields] = useState<InvoicePrefill>(EMPTY);
  const [category, setCategory] = useState<InvoiceCategory>("brokas");
  const [chargedTo, setChargedTo] = useState<InvoiceChargedTo>("distyle");
  const [chargedToOther, setChargedToOther] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => () => {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const submitInput = useMemo(() => ({
    file,
    supplierName: fields.supplierName,
    invoiceNumber: fields.invoiceNumber,
    invoiceDate: fields.invoiceDate,
    amountExVat: fields.amountExVat,
    amountIncVat: fields.amountIncVat,
    notes,
    chargedTo,
    chargedToOther,
  }), [file, fields, notes, chargedTo, chargedToOther]);

  const submitIssues = useMemo(() => invoiceSubmitIssues(submitInput), [submitInput]);
  const canSubmit = submitIssues.length === 0;

  useEffect(() => {
    if (!initialFile || consumedInitialFileRef.current === initialFile) return;
    consumedInitialFileRef.current = initialFile;
    void handleFile(initialFile);
    onInitialFileUsed?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- handleFile uses current setters only
  }, [initialFile, onInitialFileUsed]);

  function handleInvoiceDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    setInvoiceDragActive(false);
    if (parseLoading || saving) return;
    const picked = pickInvoiceUploadFile(event.dataTransfer.files);
    if (!picked) {
      showToast("Nutempkite nuotrauką arba PDF failą");
      return;
    }
    void handleFile(picked);
  }

  async function handleFile(next: File) {
    if (isInvoicePdfFile(next)) {
      if (next.size > 8 * 1024 * 1024) {
        showToast("PDF per didelis (iki 8 MB)");
        return;
      }
      setFile(next);
      setPreviewUrl(null);
      setOcrStatus("skipped");
      return;
    }
    if (!isImageFile(next)) {
      showToast("Pasirinkite nuotrauką arba PDF");
      return;
    }
    setParseLoading(true);
    setFields(EMPTY);
    try {
      const prepared = await preparePhotoForUpload(next);
      setFile(prepared);
      setPreviewUrl(URL.createObjectURL(prepared));
      const body = new FormData();
      body.append("file", prepared);
      const response = await fetch("/api/invoices/parse", { method: "POST", body });
      const payload = await response.json() as { fields?: InvoicePrefill; ocrStatus?: string; error?: string };
      if (payload.fields) setFields({ ...EMPTY, ...payload.fields });
      setOcrStatus(payload.ocrStatus ?? "failed");
      if (payload.ocrStatus === "failed" || payload.ocrStatus === "partial") {
        showToast("Nuskaityti nepavyko — užpildykite ranka.");
      }
    } catch {
      setOcrStatus("failed");
      showToast("Nuskaityti nepavyko — užpildykite ranka.");
    } finally {
      setParseLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (parseLoading || saving) return;
    if (!canSubmit) {
      showToast(invoiceSubmitBlockReason(submitInput));
      return;
    }
    if (!file) return;
    setSaving(true);
    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId,
          supplierName: fields.supplierName.trim(),
          invoiceNumber: fields.invoiceNumber.trim(),
          invoiceDate: fields.invoiceDate.trim(),
          amountExVat: fields.amountExVat.trim(),
          amountIncVat: fields.amountIncVat.trim(),
          category,
          chargedTo,
          chargedToOther,
          notes: notes.trim(),
          ocrStatus,
          fileName: mediaFileName(file, "photo"),
        }),
      });
      const payload = await response.json() as { invoice?: Invoice; upload?: { objectKey: string; thumbObjectKey?: string | null }; error?: string };
      if (!response.ok || !payload.invoice || !payload.upload?.objectKey) {
        throw new Error(payload.error || "Nepavyko išsaugoti sąskaitos");
      }

      const supabase = createBrowserSupabase();
      const uploadFile = isImageFile(file) ? await preparePhotoForUpload(file) : file;
      const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(payload.upload.objectKey, uploadFile, {
        contentType: mimeOf(uploadFile, "photo"),
        upsert: true,
      });
      if (uploadError) throw uploadError;

      let thumbObjectKey: string | null = null;
      if (isImageFile(uploadFile)) {
        const thumbFile = await preparePhotoThumb(uploadFile);
        if (thumbFile) {
          thumbObjectKey = `${payload.upload.objectKey.replace(/\.[^.]+$/, "")}-thumb.jpg`;
          await supabase.storage.from(MEDIA_BUCKET).upload(thumbObjectKey, thumbFile, {
            contentType: "image/jpeg",
            upsert: true,
          });
        }
      }

      if (thumbObjectKey) {
        await fetch(`/api/invoices/${payload.invoice.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ thumbObjectKey }),
        });
      }

      onSaved(payload.invoice);
      showToast("Sąskaita išsaugota");
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Nepavyko išsaugoti sąskaitos");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className={`capture-panel invoice-capture-panel${invoiceDragActive ? " invoice-drop-active" : ""}`}
      onSubmit={submit}
      onDragEnter={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setInvoiceDragActive(true); } }}
      onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setInvoiceDragActive(true); } }}
      onDragLeave={(event) => {
        if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setInvoiceDragActive(false);
      }}
      onDrop={handleInvoiceDrop}
    >
      <div className="panel-handle" />
      <div className="panel-title">
        <div><span>Nauja sąskaita</span><h2 id="capture-title">PVM SF</h2></div>
        <button type="button" onClick={onClose} aria-label="Uždaryti">×</button>
      </div>
      <button type="button" className="capture-back" onClick={onBack}>← Keisti tipą</button>
      <div className="capture-project">
        <span className="live-dot" />
        <div><small>Objektas</small><strong>{projectName}</strong></div>
      </div>

      <ProjectContactsBar
        projectId={projectId}
        refreshKey={contactsRefreshKey}
        showEdit={Boolean(onEditProject)}
        onEdit={() => onEditProject?.()}
      />

      <p className="invoice-capture-hint">Viena sąskaita, visas lapas, be šešėlio.</p>

      <section className="invoice-file-block">
        {previewUrl ? (
          <div className="invoice-preview-wrap">
            <img src={previewUrl} alt="Sąskaitos peržiūra" className={`invoice-preview-image${parseLoading ? " invoice-preview-dimmed" : ""}`} />
            {parseLoading ? (
              <div className="invoice-preview-loading" role="status" aria-live="polite">
                <span className="sync-refresh-icon is-spinning" aria-hidden>↻</span>
                <strong>Skaitome duomenis iš SF</strong>
                <small>Palaukite kelias sekundes…</small>
              </div>
            ) : null}
          </div>
        ) : file ? (
          <div className="invoice-preview-pdf"><strong>{file.name}</strong><span>PDF failas</span></div>
        ) : (
          <div className="invoice-drop-empty">
            <span aria-hidden>⇩</span>
            <div>
              <strong>Nutempkite SF failą čia</strong>
              <small>Nuotrauka (JPG, PNG) arba PDF iš kompiuterio</small>
            </div>
          </div>
        )}
        <div className={`invoice-file-actions${parseLoading ? " invoice-file-actions-disabled" : ""}`}>
          <MediaFileButton className="photo-add-tile photo-upload-tile" accept="image/*" capture="environment" disabled={parseLoading || saving} onFiles={(files) => void handleFile(files[0])}>
            <b>◎</b><span>Fotografuoti</span>
          </MediaFileButton>
          <MediaFileButton className="photo-add-tile photo-upload-tile" accept="image/*" disabled={parseLoading || saving} onFiles={(files) => void handleFile(files[0])}>
            <b>⇧</b><span>Iš galerijos</span>
          </MediaFileButton>
          <MediaFileButton className="photo-add-tile photo-upload-tile" accept="application/pdf,.pdf" disabled={parseLoading || saving} onFiles={(files) => void handleFile(files[0])}>
            <b>PDF</b><span>PDF failas</span>
          </MediaFileButton>
        </div>
        {file || previewUrl ? (
          <p className="invoice-drop-hint">Arba nutempkite kitą failą — pakeis dabartinį</p>
        ) : null}
      </section>

      {parseLoading ? (
        <div className="invoice-parse-banner" role="status" aria-live="polite">
          <span className="sync-refresh-icon is-spinning" aria-hidden>↻</span>
          <div>
            <strong>Krauname duomenis iš sąskaitos</strong>
            <span>Tiekėjas, SF nr., data ir sumos bus užpildyti automatiškai</span>
          </div>
        </div>
      ) : null}

      <fieldset className="invoice-form-body" disabled={parseLoading || saving}>
      <div className="form-grid capture-essentials invoice-fields">
        <label className="wide"><span>Tiekėjas *</span><input value={fields.supplierName} onChange={(event) => setFields((current) => ({ ...current, supplierName: event.target.value }))} required /></label>
        <label><span>SF nr. *</span><input value={fields.invoiceNumber} onChange={(event) => setFields((current) => ({ ...current, invoiceNumber: event.target.value }))} required /></label>
        <label><span>SF data *</span><DateInput value={fields.invoiceDate} onChange={(value) => setFields((current) => ({ ...current, invoiceDate: value }))} required /></label>
        <label><span>Suma be PVM *</span><input inputMode="decimal" value={fields.amountExVat} onChange={(event) => setFields((current) => ({ ...current, amountExVat: event.target.value }))} required /></label>
        <label><span>Suma su PVM *</span><input inputMode="decimal" value={fields.amountIncVat} onChange={(event) => setFields((current) => ({ ...current, amountIncVat: event.target.value }))} required /></label>
      </div>

      <section className="invoice-notes-section">
        <div className="invoice-notes-head">
          <strong>Komentaras *</strong>
          <span>Privaloma — trumpai aprašykite, už ką ši sąskaita</span>
        </div>
        <textarea
          className="invoice-notes-input"
          value={notes}
          onChange={(event) => setNotes(event.target.value.slice(0, 500))}
          rows={3}
          required
          placeholder="Pvz.: medžiagos broko taisymui, transportas į objektą, papildomas montavimas…"
        />
      </section>

      <section className="invoice-chip-section">
        <strong>Kategorija</strong>
        <div className="invoice-chip-grid">
          {INVOICE_CATEGORIES.map((item) => (
            <button key={item} type="button" className={category === item ? "invoice-chip-active" : ""} onClick={() => setCategory(item)}>
              {INVOICE_CATEGORY_LABELS[item]}
            </button>
          ))}
        </div>
      </section>

      <section className="invoice-chip-section">
        <strong>Kam priskiriama</strong>
        <div className="invoice-chip-grid">
          {INVOICE_CHARGED_TO.map((item) => (
            <button key={item} type="button" className={chargedTo === item ? "invoice-chip-active" : ""} onClick={() => setChargedTo(item)}>
              {INVOICE_CHARGED_TO_LABELS[item]}
            </button>
          ))}
        </div>
        {chargedTo === "kita" ? (
          <div className="invoice-charged-other-section">
            <div className="invoice-notes-head">
              <strong>Kam dar priskiriama? *</strong>
              <span>Įrašykite įmonę ar asmenį — privaloma, kai pasirinkta „Kita“</span>
            </div>
            <input
              className="invoice-charged-other-input"
              value={chargedToOther}
              onChange={(event) => setChargedToOther(event.target.value.slice(0, 200))}
              required
              autoFocus
              placeholder="Pvz.: Subrangovas, kliento atstovas, tiekėjas…"
            />
          </div>
        ) : null}
      </section>
      </fieldset>

      {!canSubmit && !parseLoading && !saving ? (
        <div className="invoice-submit-hint" role="status">
          <strong>Kodėl dar negalima išsaugoti</strong>
          <ul>
            {submitIssues.map((issue) => <li key={issue}>{issue}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="panel-actions">
        <button type="button" className="secondary-button" onClick={onClose} disabled={saving || parseLoading}>Atšaukti</button>
        <button type="submit" className="primary-button" disabled={saving || parseLoading}>{saving ? "Saugoma…" : parseLoading ? "Skaitoma SF…" : "Išsaugoti sąskaitą"}</button>
      </div>
    </form>
  );
}
