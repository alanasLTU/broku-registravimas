import { apiError, requirePermission, requireUser } from "@/lib/auth";
import { MEDIA_BUCKET } from "@/lib/constants";
import {
  isInvoiceCategory,
  isInvoiceChargedTo,
} from "@/lib/constants";
import { deriveVatCents, mapInvoice, parseMoneyToCents, type InvoiceRow } from "@/lib/invoices";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { supabase, profile } = await requireUser();
    requirePermission(profile, "edit_records");
    const payload = await request.json() as Record<string, unknown>;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof payload.supplierName === "string") updates.supplier_name = payload.supplierName.trim().slice(0, 300);
    if (typeof payload.invoiceNumber === "string") updates.invoice_number = payload.invoiceNumber.trim().slice(0, 120);
    if (typeof payload.invoiceDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.invoiceDate.trim())) {
      updates.invoice_date = payload.invoiceDate.trim();
    }
    if (typeof payload.category === "string" && isInvoiceCategory(payload.category)) updates.category = payload.category;
    if (typeof payload.chargedTo === "string" && isInvoiceChargedTo(payload.chargedTo)) {
      updates.charged_to = payload.chargedTo;
      updates.charged_to_other = payload.chargedTo === "kita" ? String(payload.chargedToOther ?? "").trim().slice(0, 200) : "";
    }
    let amountCentsExVat: number | undefined;
    let amountCentsIncVat: number | undefined;
    if (payload.amountExVat !== undefined) {
      const cents = parseMoneyToCents(payload.amountExVat);
      if (cents === null) return Response.json({ error: "Neteisinga suma be PVM." }, { status: 400 });
      updates.amount_cents_ex_vat = cents;
      amountCentsExVat = cents;
    }
    if (payload.amountIncVat !== undefined) {
      const cents = parseMoneyToCents(payload.amountIncVat);
      if (cents === null) return Response.json({ error: "Neteisinga suma su PVM." }, { status: 400 });
      updates.amount_cents_inc_vat = cents;
      amountCentsIncVat = cents;
    }
    if (amountCentsExVat !== undefined && amountCentsIncVat !== undefined) {
      updates.vat_cents = deriveVatCents(amountCentsExVat, amountCentsIncVat);
    }
    if (typeof payload.objectKey === "string" && payload.objectKey.trim()) updates.object_key = payload.objectKey.trim();
    if (typeof payload.thumbObjectKey === "string") updates.thumb_object_key = payload.thumbObjectKey.trim() || null;
    if (typeof payload.notes === "string") {
      const notes = payload.notes.trim().slice(0, 500);
      if (!notes) return Response.json({ error: "Komentaras yra privalomas." }, { status: 400 });
      updates.notes = notes;
    }

    const { data, error } = await supabase.from("invoices").update(updates).eq("id", id).select("*").maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "Sąskaita nerasta." }, { status: 404 });
    return Response.json({ invoice: mapInvoice(data as InvoiceRow) });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { supabase, admin, profile } = await requireUser();
    requirePermission(profile, "delete_records");

    const { data: row } = await supabase.from("invoices").select("object_key, thumb_object_key").eq("id", id).maybeSingle();
    if (!row) return Response.json({ error: "Sąskaita nerasta." }, { status: 404 });

    const db = admin ?? supabase;
    const keys = [row.object_key, row.thumb_object_key].filter(Boolean) as string[];
    if (keys.length) await db.storage.from(MEDIA_BUCKET).remove(keys);

    const { data: deleted, error } = await db.from("invoices").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!deleted?.length) return Response.json({ error: "Nepavyko ištrinti sąskaitos." }, { status: 500 });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
