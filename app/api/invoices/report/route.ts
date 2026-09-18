import { apiError, requireUser } from "@/lib/auth";
import { INVOICE_CATEGORY_LABELS, INVOICE_CHARGED_TO_LABELS } from "@/lib/constants";
import { formatMoneyFromCents, mapInvoice, sumInvoiceTotals, type InvoiceRow } from "@/lib/invoices";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { supabase } = await requireUser();
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId")?.trim() ?? "";
    const from = url.searchParams.get("from")?.trim() ?? "";
    const to = url.searchParams.get("to")?.trim() ?? "";

    let query = supabase
      .from("invoices")
      .select("*, projects(name, address)")
      .order("invoice_date", { ascending: true });

    if (projectId) query = query.eq("project_id", projectId);
    if (from) query = query.gte("invoice_date", from);
    if (to) query = query.lte("invoice_date", to);

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []).map((row) => {
      const invoice = mapInvoice(row as InvoiceRow);
      const project = row.projects as { name?: string; address?: string } | null;
      const chargedLabel = invoice.chargedTo === "kita" && invoice.chargedToOther
        ? invoice.chargedToOther
        : INVOICE_CHARGED_TO_LABELS[invoice.chargedTo];
      return {
        projectName: project?.name ?? "",
        projectAddress: project?.address ?? "",
        supplierName: invoice.supplierName,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        category: INVOICE_CATEGORY_LABELS[invoice.category],
        chargedTo: chargedLabel,
        amountExVat: invoice.amountExVat,
        vat: invoice.vat,
        amountIncVat: invoice.amountIncVat,
        createdByName: invoice.createdByName || invoice.createdByEmail,
        createdAt: invoice.createdAt,
      };
    });

    const totals = sumInvoiceTotals((data ?? []).map((row) => mapInvoice(row as InvoiceRow)));

    return Response.json({
      rows,
      totals: {
        exVat: formatMoneyFromCents(totals.exVat),
        incVat: formatMoneyFromCents(totals.incVat),
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
