"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  INVOICE_CATEGORIES,
  INVOICE_CATEGORY_LABELS,
  INVOICE_CHARGED_TO,
  INVOICE_CHARGED_TO_LABELS,
  type InvoiceCategory,
  type InvoiceChargedTo,
} from "@/lib/constants";
import { formatLtLong, isoToLt } from "@/lib/date-format";
import type { Invoice } from "@/lib/invoices";
import { invoiceSubmitBlockReason, invoiceSubmitIssues } from "@/lib/invoice-validation";
import DateInput from "./date-input";

type Props = {
  invoices: Invoice[];
  canEdit: boolean;
  onOpen: (invoice: Invoice) => void;
  onUpdated: (invoice: Invoice) => void;
  onDeleted: (invoiceId: string) => void;
  onAdd?: () => void;
  onReport?: () => void;
  showToast: (message: string) => void;
};

export default function InvoiceList({ invoices, canEdit, onOpen, onUpdated, onDeleted, onAdd, onReport, showToast }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = invoices.find((item) => item.id === activeId) ?? null;
  const [draft, setDraft] = useState<Invoice | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(active ? { ...active } : null);
  }, [active]);

  useEffect(() => {
    if (!activeId) return;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [activeId]);

  function closeDrawer() {
    setActiveId(null);
  }

  function draftSubmitInput(source: Invoice) {
    return {
      file: null,
      supplierName: source.supplierName,
      invoiceNumber: source.invoiceNumber,
      invoiceDate: source.invoiceDate,
      amountExVat: source.amountExVat,
      amountIncVat: source.amountIncVat,
      notes: source.notes,
      chargedTo: source.chargedTo,
      chargedToOther: source.chargedToOther,
    };
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    const input = draftSubmitInput(draft);
    const issues = invoiceSubmitIssues(input, { requireFile: false });
    if (issues.length) {
      showToast(invoiceSubmitBlockReason(input, { requireFile: false }));
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/invoices/${draft.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          supplierName: draft.supplierName,
          invoiceNumber: draft.invoiceNumber,
          invoiceDate: draft.invoiceDate,
          amountExVat: draft.amountExVat,
          amountIncVat: draft.amountIncVat,
          category: draft.category,
          chargedTo: draft.chargedTo,
          chargedToOther: draft.chargedToOther,
          notes: draft.notes.trim(),
        }),
      });
      const payload = await response.json() as { invoice?: Invoice; error?: string };
      if (!response.ok || !payload.invoice) throw new Error(payload.error || "Nepavyko išsaugoti");
      onUpdated(payload.invoice);
      showToast("Sąskaita atnaujinta");
      closeDrawer();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Nepavyko išsaugoti");
    } finally {
      setSaving(false);
    }
  }

  async function deleteInvoice() {
    if (!active || !window.confirm(`Ištrinti sąskaitą ${active.invoiceNumber}?`)) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/invoices/${active.id}`, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nepavyko ištrinti");
      onDeleted(active.id);
      closeDrawer();
      showToast("Sąskaita ištrinta");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Nepavyko ištrinti");
    } finally {
      setSaving(false);
    }
  }

  if (!invoices.length) {
    return (
      <div className="register-empty invoice-empty">
        <strong>Šiame objekte dar nėra sąskaitų</strong>
        <span>Pridėkite PVM sąskaitą — nufotografuokite arba įkelkite PDF.</span>
        {onReport ? <button type="button" className="secondary-button" onClick={onReport}>SF ataskaita / CSV</button> : null}
        {onAdd ? <button type="button" className="primary-button" onClick={onAdd}>＋ Pridėti sąskaitą</button> : null}
      </div>
    );
  }

  return (
    <>
      <div className="invoice-cards">
        {invoices.map((invoice) => (
          <article key={invoice.id} className="invoice-card" onClick={() => { setActiveId(invoice.id); onOpen(invoice); }}>
            <div className="invoice-card-top">
              <strong>{invoice.supplierName}</strong>
              <span>{invoice.invoiceNumber} · {isoToLt(invoice.invoiceDate) || invoice.invoiceDate}</span>
            </div>
            <div className="invoice-card-amounts">
              <strong>{invoice.amountIncVat} €</strong>
              <small>be PVM {invoice.amountExVat} €</small>
            </div>
            <div className="invoice-card-meta">
              <span className="invoice-chip">{invoice.categoryLabel}</span>
              <span className="invoice-chip muted">{invoice.chargedToLabel}</span>
            </div>
            {invoice.notes ? <p className="invoice-card-notes">{invoice.notes}</p> : <p className="invoice-card-notes muted">Be komentaro</p>}
            <small>Įkėlė {invoice.createdByName || invoice.createdByEmail} · {invoice.createdLabel}</small>
          </article>
        ))}
      </div>

      {active && draft ? (
        <div className="modal-layer invoice-drawer-layer" role="dialog" aria-modal="true" aria-labelledby="invoice-drawer-title">
          <button className="modal-scrim" onClick={closeDrawer} aria-label="Uždaryti" />
          <form className="invoice-drawer" onSubmit={saveEdit}>
            <div className="invoice-drawer-head">
              <div className="panel-handle" aria-hidden />
              <div className="panel-title">
                <div>
                  <span>SF {draft.invoiceNumber}</span>
                  <h2 id="invoice-drawer-title">{draft.supplierName}</h2>
                </div>
                <button type="button" onClick={closeDrawer} aria-label="Uždaryti">×</button>
              </div>
            </div>

            <div className="invoice-drawer-scroll">
              <section className="invoice-drawer-summary" aria-label="Sąskaitos suvestinė">
                <article>
                  <small>Suma su PVM</small>
                  <strong>{draft.amountIncVat} €</strong>
                </article>
                <article>
                  <small>Be PVM</small>
                  <strong>{draft.amountExVat} €</strong>
                </article>
                <article>
                  <small>Data</small>
                  <strong>{isoToLt(draft.invoiceDate) || draft.invoiceDate}</strong>
                  {formatLtLong(draft.invoiceDate) ? <span>{formatLtLong(draft.invoiceDate)}</span> : null}
                </article>
                <article>
                  <small>Kategorija · Kam</small>
                  <strong>{draft.categoryLabel}</strong>
                  <span>{draft.chargedToLabel}</span>
                </article>
              </section>

              {active.fileUrl ? (
                <section className="invoice-drawer-preview">
                  <div className="invoice-drawer-preview-head">
                    <strong>SF failas</strong>
                    <a className="secondary-button invoice-drawer-open-full" href={active.fileUrl} target="_blank" rel="noopener noreferrer">
                      Atidaryti pilną SF
                    </a>
                  </div>
                  {active.thumbUrl ? (
                    <a className="invoice-drawer-file" href={active.fileUrl} target="_blank" rel="noopener noreferrer">
                      <img src={active.thumbUrl} alt="Sąskaitos peržiūra" />
                    </a>
                  ) : active.fileUrl.toLowerCase().includes(".pdf") || active.objectKey?.toLowerCase().endsWith(".pdf") ? (
                    <a className="invoice-drawer-file invoice-drawer-file-pdf" href={active.fileUrl} target="_blank" rel="noopener noreferrer">
                      <strong>PDF sąskaita</strong>
                      <span>Spustelėkite atidaryti</span>
                    </a>
                  ) : (
                    <a className="invoice-drawer-file" href={active.fileUrl} target="_blank" rel="noopener noreferrer">
                      <img src={active.fileUrl} alt="Sąskaita" />
                    </a>
                  )}
                </section>
              ) : null}

              {draft.notes && !canEdit ? (
                <section className="invoice-drawer-readonly-note">
                  <strong>Komentaras</strong>
                  <p>{draft.notes}</p>
                </section>
              ) : null}

              {canEdit ? (
                <>
                  <section className="invoice-drawer-section">
                    <h3>Redaguoti duomenis</h3>
                    <div className="form-grid invoice-drawer-fields">
                      <label className="wide"><span>Tiekėjas *</span><input value={draft.supplierName} onChange={(event) => setDraft({ ...draft, supplierName: event.target.value })} required /></label>
                      <label><span>SF nr. *</span><input value={draft.invoiceNumber} onChange={(event) => setDraft({ ...draft, invoiceNumber: event.target.value })} required /></label>
                      <label><span>SF data *</span><DateInput value={draft.invoiceDate} onChange={(value) => setDraft({ ...draft, invoiceDate: value })} required /></label>
                      <label><span>Suma be PVM *</span><input inputMode="decimal" value={draft.amountExVat} onChange={(event) => setDraft({ ...draft, amountExVat: event.target.value })} required /></label>
                      <label><span>Suma su PVM *</span><input inputMode="decimal" value={draft.amountIncVat} onChange={(event) => setDraft({ ...draft, amountIncVat: event.target.value })} required /></label>
                      <label className="wide"><span>Kategorija *</span>
                        <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as InvoiceCategory, categoryLabel: INVOICE_CATEGORY_LABELS[event.target.value as InvoiceCategory] })} required>
                          {INVOICE_CATEGORIES.map((item) => <option key={item} value={item}>{INVOICE_CATEGORY_LABELS[item]}</option>)}
                        </select>
                      </label>
                      <label className="wide"><span>Kam priskiriama *</span>
                        <select value={draft.chargedTo} onChange={(event) => setDraft({ ...draft, chargedTo: event.target.value as InvoiceChargedTo, chargedToLabel: INVOICE_CHARGED_TO_LABELS[event.target.value as InvoiceChargedTo] })} required>
                          {INVOICE_CHARGED_TO.map((item) => <option key={item} value={item}>{INVOICE_CHARGED_TO_LABELS[item]}</option>)}
                        </select>
                      </label>
                    </div>
                  </section>

                  {draft.chargedTo === "kita" ? (
                    <div className="invoice-charged-other-section invoice-charged-other-section-compact">
                      <div className="invoice-notes-head">
                        <strong>Kam dar priskiriama? *</strong>
                        <span>Įrašykite įmonę ar asmenį</span>
                      </div>
                      <input
                        className="invoice-charged-other-input"
                        value={draft.chargedToOther}
                        onChange={(event) => setDraft({ ...draft, chargedToOther: event.target.value.slice(0, 200) })}
                        required
                        placeholder="Pvz.: Subrangovas, kliento atstovas…"
                      />
                    </div>
                  ) : null}

                  <section className="invoice-notes-section invoice-notes-section-compact">
                    <div className="invoice-notes-head">
                      <strong>Komentaras *</strong>
                      <span>Trumpai aprašykite, už ką SF</span>
                    </div>
                    <textarea
                      className="invoice-notes-input"
                      value={draft.notes}
                      onChange={(event) => setDraft({ ...draft, notes: event.target.value.slice(0, 500) })}
                      rows={3}
                      required
                      placeholder="Pvz.: medžiagos, transportas, montavimas…"
                    />
                  </section>

                  {invoiceSubmitIssues(draftSubmitInput(draft), { requireFile: false }).length ? (
                    <div className="invoice-submit-hint" role="status">
                      <strong>Kodėl dar negalima išsaugoti</strong>
                      <ul>
                        {invoiceSubmitIssues(draftSubmitInput(draft), { requireFile: false }).map((issue) => <li key={issue}>{issue}</li>)}
                      </ul>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="invoice-readonly">
                  <p>Įkėlė {active.createdByName || active.createdByEmail} · {active.createdLabel}</p>
                </div>
              )}
            </div>

            {canEdit ? (
              <div className="invoice-drawer-footer panel-actions">
                <button type="button" className="danger-button" onClick={() => void deleteInvoice()} disabled={saving}>Ištrinti</button>
                <button type="submit" className="primary-button" disabled={saving}>{saving ? "Saugoma…" : "Išsaugoti"}</button>
              </div>
            ) : (
              <div className="invoice-drawer-footer panel-actions">
                <button type="button" className="primary-button" onClick={closeDrawer}>Uždaryti</button>
              </div>
            )}
          </form>
        </div>
      ) : null}
    </>
  );
}
