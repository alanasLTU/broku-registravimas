import { INVOICE_OCR_STATUSES, type InvoiceOcrStatus } from "@/lib/constants";
import { normalizeInvoiceDate } from "@/lib/date-format";
import type { InvoicePrefill } from "@/lib/invoices";

const EMPTY_PREFILL: InvoicePrefill = {
  supplierName: "",
  invoiceNumber: "",
  invoiceDate: "",
  amountExVat: "",
  vat: "",
  amountIncVat: "",
};

function normalizeOcrStatus(value: unknown): InvoiceOcrStatus {
  const status = String(value ?? "").trim();
  return (INVOICE_OCR_STATUSES as readonly string[]).includes(status) ? status as InvoiceOcrStatus : "partial";
}

function parseJsonBlock(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function mapPrefill(raw: Record<string, unknown> | null): InvoicePrefill {
  if (!raw) return { ...EMPTY_PREFILL };
  return {
    supplierName: String(raw.supplierName ?? raw.supplier_name ?? "").trim().slice(0, 300),
    invoiceNumber: String(raw.invoiceNumber ?? raw.invoice_number ?? "").trim().slice(0, 120),
    invoiceDate: normalizeInvoiceDate(String(raw.invoiceDate ?? raw.invoice_date ?? "")),
    amountExVat: String(raw.amountExVat ?? raw.amount_ex_vat ?? "").trim(),
    vat: String(raw.vat ?? raw.vat_amount ?? "").trim(),
    amountIncVat: String(raw.amountIncVat ?? raw.amount_inc_vat ?? "").trim(),
  };
}

function hasAnyPrefill(fields: InvoicePrefill) {
  return Boolean(fields.supplierName || fields.invoiceNumber || fields.invoiceDate || fields.amountExVat || fields.vat || fields.amountIncVat);
}

export async function parseInvoiceImage(buffer: Buffer, mimeType = "image/jpeg") {
  const gatewayKey = process.env.AI_GATEWAY_API_KEY?.trim();
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  const apiKey = gatewayKey || openAiKey;
  if (!apiKey) {
    return { fields: { ...EMPTY_PREFILL }, ocrStatus: "skipped" as const };
  }

  const baseUrl = gatewayKey ? "https://ai-gateway.vercel.sh/v1" : "https://api.openai.com/v1";
  const model = process.env.INVOICE_OCR_MODEL?.trim() || "gpt-4o-mini";
  const base64 = buffer.toString("base64");
  const prompt = `Ištrauk duomenis iš lietuviškos PVM sąskaitos faktūros nuotraukos.
Grąžink TIK JSON objektą su raktais:
supplierName, invoiceNumber, invoiceDate (YYYY-MM-DD), amountExVat, vat, amountIncVat.
Sumos eurais su kableliu arba tašku, 2 skaitmenys. "Suma apmokėti" = amountIncVat.
Jei lauko nematai — tuščia eilutė. Pridėk ocrStatus: ok | partial | failed.`;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
            ],
          },
        ],
      }),
    });
    if (!response.ok) {
      console.error("[invoice-ocr]", await response.text());
      return { fields: { ...EMPTY_PREFILL }, ocrStatus: "failed" as const };
    }
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content ?? "";
    const parsed = parseJsonBlock(content);
    const fields = mapPrefill(parsed);
    const ocrStatus = normalizeOcrStatus(parsed?.ocrStatus);
    if (!hasAnyPrefill(fields)) return { fields, ocrStatus: "failed" as const };
    return { fields, ocrStatus };
  } catch (error) {
    console.error("[invoice-ocr]", error);
    return { fields: { ...EMPTY_PREFILL }, ocrStatus: "failed" as const };
  }
}
