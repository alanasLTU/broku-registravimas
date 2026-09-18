import { apiError, requirePermission, requireUser } from "@/lib/auth";
import {
  INVOICE_OCR_STATUSES,
  isInvoiceCategory,
  isInvoiceChargedTo,
} from "@/lib/constants";
import { deriveVatCents, invoiceObjectKey, mapInvoice, parseMoneyToCents, type InvoiceRow } from "@/lib/invoices";

export const dynamic = "force-dynamic";

function parsePayload(payload: Record<string, unknown>) {
  const projectId = String(payload.projectId ?? "").trim();
  const supplierName = String(payload.supplierName ?? "").trim().slice(0, 300);
  const invoiceNumber = String(payload.invoiceNumber ?? "").trim().slice(0, 120);
  const invoiceDate = String(payload.invoiceDate ?? "").trim();
  const category = String(payload.category ?? "").trim();
  const chargedTo = String(payload.chargedTo ?? "").trim();
  const chargedToOther = String(payload.chargedToOther ?? "").trim().slice(0, 200);
  const amountCentsExVat = parseMoneyToCents(payload.amountExVat);
  const amountCentsIncVat = parseMoneyToCents(payload.amountIncVat);
  const notes = typeof payload.notes === "string" ? payload.notes.trim().slice(0, 500) : "";
  const ocrStatusRaw = String(payload.ocrStatus ?? "skipped").trim();
  const ocrStatus = (INVOICE_OCR_STATUSES as readonly string[]).includes(ocrStatusRaw)
    ? ocrStatusRaw as InvoiceRow["ocr_status"]
    : "skipped";

  if (!projectId) return { error: "Projektas yra privalomas." };
  if (!supplierName) return { error: "Tiekėjas yra privalomas." };
  if (!invoiceNumber) return { error: "Sąskaitos numeris yra privalomas." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) return { error: "Neteisinga sąskaitos data." };
  if (!isInvoiceCategory(category)) return { error: "Neteisinga kategorija." };
  if (!isInvoiceChargedTo(chargedTo)) return { error: "Neteisingas priskyrimas." };
  if (chargedTo === "kita" && !chargedToOther) return { error: "Įrašykite kam priskiriama." };
  if (!notes) return { error: "Komentaras yra privalomas." };
  if (amountCentsExVat === null || amountCentsIncVat === null) {
    return { error: "Sumos be PVM ir su PVM yra privalomos." };
  }
  const vatCents = deriveVatCents(amountCentsExVat, amountCentsIncVat);

  return {
    data: {
      projectId,
      supplierName,
      invoiceNumber,
      invoiceDate,
      category,
      chargedTo,
      chargedToOther: chargedTo === "kita" ? chargedToOther : "",
      amountCentsExVat,
      vatCents,
      amountCentsIncVat,
      ocrStatus,
      notes,
      objectKey: typeof payload.objectKey === "string" ? payload.objectKey.trim() : "",
      thumbObjectKey: typeof payload.thumbObjectKey === "string" ? payload.thumbObjectKey.trim() : "",
    },
  };
}

export async function GET(request: Request) {
  try {
    const { supabase } = await requireUser();
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId")?.trim() ?? "";
    const from = url.searchParams.get("from")?.trim() ?? "";
    const to = url.searchParams.get("to")?.trim() ?? "";
    const q = url.searchParams.get("q")?.trim() ?? "";

    let query = supabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false });

    if (projectId) query = query.eq("project_id", projectId);
    if (from) query = query.gte("invoice_date", from);
    if (to) query = query.lte("invoice_date", to);

    const { data, error } = await query;
    if (error) throw error;

    let invoices = (data ?? []).map((row) => mapInvoice(row as InvoiceRow));
    if (q) {
      const term = q.toLocaleLowerCase("lt");
      invoices = invoices.filter((item) =>
        `${item.supplierName} ${item.invoiceNumber} ${item.amountExVat} ${item.amountIncVat}`.toLocaleLowerCase("lt").includes(term)
        || item.amountExVat.replace(",", ".").includes(q.replace(",", "."))
        || item.amountIncVat.replace(",", ".").includes(q.replace(",", ".")),
      );
    }

    return Response.json({ invoices });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, profile } = await requireUser();
    requirePermission(profile, "create_records");
    const payload = await request.json() as Record<string, unknown>;
    const parsed = parsePayload(payload);
    if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 });

    const id = crypto.randomUUID();
    const fileName = typeof payload.fileName === "string" ? payload.fileName.trim() : "invoice.jpg";
    const objectKey = parsed.data.objectKey || invoiceObjectKey(parsed.data.projectId, id, fileName);
    const thumbObjectKey = parsed.data.thumbObjectKey || null;

    const { data, error } = await supabase.from("invoices").insert({
      id,
      project_id: parsed.data.projectId,
      supplier_name: parsed.data.supplierName,
      invoice_number: parsed.data.invoiceNumber,
      invoice_date: parsed.data.invoiceDate,
      amount_cents_ex_vat: parsed.data.amountCentsExVat,
      vat_cents: parsed.data.vatCents,
      amount_cents_inc_vat: parsed.data.amountCentsIncVat,
      category: parsed.data.category,
      charged_to: parsed.data.chargedTo,
      charged_to_other: parsed.data.chargedToOther,
      object_key: objectKey,
      thumb_object_key: thumbObjectKey,
      ocr_status: parsed.data.ocrStatus,
      notes: parsed.data.notes,
      created_by: profile.id,
      created_by_email: profile.email,
      created_by_name: profile.displayName,
    }).select("*").single();

    if (error) throw error;
    return Response.json({
      invoice: mapInvoice(data as InvoiceRow),
      upload: {
        objectKey,
        thumbObjectKey,
      },
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
