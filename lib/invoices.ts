import {
  INVOICE_CATEGORY_LABELS,
  INVOICE_CHARGED_TO_LABELS,
  type InvoiceCategory,
  type InvoiceChargedTo,
  type InvoiceOcrStatus,
} from "@/lib/constants";

export type InvoiceRow = {
  id: string;
  project_id: string;
  supplier_name: string;
  invoice_number: string;
  invoice_date: string;
  amount_cents_ex_vat: number;
  vat_cents: number;
  amount_cents_inc_vat: number;
  category: InvoiceCategory;
  charged_to: InvoiceChargedTo;
  charged_to_other: string;
  object_key: string;
  thumb_object_key: string | null;
  ocr_status: InvoiceOcrStatus;
  created_by: string | null;
  created_by_email: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  notes?: string;
};

export type Invoice = {
  id: string;
  projectId: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  amountExVat: string;
  vat: string;
  amountIncVat: string;
  amountCentsExVat: number;
  vatCents: number;
  amountCentsIncVat: number;
  category: InvoiceCategory;
  categoryLabel: string;
  chargedTo: InvoiceChargedTo;
  chargedToLabel: string;
  chargedToOther: string;
  objectKey: string;
  thumbObjectKey: string | null;
  fileUrl: string;
  thumbUrl: string | null;
  ocrStatus: InvoiceOcrStatus;
  createdByEmail: string;
  createdByName: string;
  createdAt: string;
  createdLabel: string;
  notes: string;
};

export type InvoicePrefill = {
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  amountExVat: string;
  vat: string;
  amountIncVat: string;
};

export function deriveVatCents(amountCentsExVat: number, amountCentsIncVat: number) {
  return Math.max(0, amountCentsIncVat - amountCentsExVat);
}

export function parseMoneyToCents(value: unknown): number | null {
  const normalized = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

export function formatMoneyFromCents(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function formatMoneyEuro(cents: number) {
  return `${formatMoneyFromCents(cents)} €`;
}

export function invoiceObjectKey(projectId: string, invoiceId: string, fileName: string) {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "invoice.jpg";
  return `${projectId}/invoices/${invoiceId}/${safe}`;
}

export function invoiceMediaUrl(invoiceId: string, variant: "full" | "thumb" = "full") {
  const base = `/api/invoices/${invoiceId}/file`;
  return variant === "thumb" ? `${base}?thumb=1` : base;
}

export function mapInvoice(row: InvoiceRow): Invoice {
  const created = new Date(row.created_at);
  const createdLabel = new Intl.DateTimeFormat("lt-LT", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(created);
  const chargedLabel = row.charged_to === "kita" && row.charged_to_other.trim()
    ? row.charged_to_other.trim()
    : INVOICE_CHARGED_TO_LABELS[row.charged_to];
  return {
    id: row.id,
    projectId: row.project_id,
    supplierName: row.supplier_name,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    amountExVat: formatMoneyFromCents(row.amount_cents_ex_vat),
    vat: formatMoneyFromCents(row.vat_cents),
    amountIncVat: formatMoneyFromCents(row.amount_cents_inc_vat),
    amountCentsExVat: row.amount_cents_ex_vat,
    vatCents: row.vat_cents,
    amountCentsIncVat: row.amount_cents_inc_vat,
    category: row.category,
    categoryLabel: INVOICE_CATEGORY_LABELS[row.category],
    chargedTo: row.charged_to,
    chargedToLabel: chargedLabel,
    chargedToOther: row.charged_to_other,
    objectKey: row.object_key,
    thumbObjectKey: row.thumb_object_key,
    fileUrl: row.object_key ? invoiceMediaUrl(row.id) : "",
    thumbUrl: row.thumb_object_key ? invoiceMediaUrl(row.id, "thumb") : null,
    ocrStatus: row.ocr_status,
    createdByEmail: row.created_by_email,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    createdLabel,
    notes: row.notes ?? "",
  };
}

export function sumInvoiceTotals(invoices: Pick<Invoice, "amountCentsExVat" | "amountCentsIncVat">[]) {
  return invoices.reduce(
    (acc, item) => ({
      exVat: acc.exVat + item.amountCentsExVat,
      incVat: acc.incVat + item.amountCentsIncVat,
    }),
    { exVat: 0, incVat: 0 },
  );
}

export function matchesInvoiceSearch(invoice: Invoice, term: string) {
  const normalized = term.trim().toLocaleLowerCase("lt");
  if (!normalized) return true;
  const amountNeedle = normalized.replace(",", ".");
  return [
    invoice.supplierName,
    invoice.invoiceNumber,
    invoice.amountExVat,
    invoice.amountIncVat,
    invoice.vat,
    invoice.amountExVat.replace(",", "."),
    invoice.amountIncVat.replace(",", "."),
    invoice.notes,
  ].some((value) => value.toLocaleLowerCase("lt").includes(normalized) || value.includes(amountNeedle));
}
