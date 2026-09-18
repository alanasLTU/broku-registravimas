import { apiError, requirePermission, requireUser } from "@/lib/auth";
import { parseInvoiceImage } from "@/lib/invoice-ocr";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const { profile } = await requireUser();
    requirePermission(profile, "create_records");
    const contentType = request.headers.get("content-type") ?? "";
    let buffer: Buffer;
    let mimeType = "image/jpeg";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return Response.json({ fields: {}, ocrStatus: "skipped", error: "Failas nerastas." }, { status: 400 });
      }
      if (file.size > MAX_BYTES) {
        return Response.json({ fields: {}, ocrStatus: "failed", error: "Failas per didelis (iki 8 MB)." }, { status: 400 });
      }
      mimeType = file.type || "image/jpeg";
      buffer = Buffer.from(await file.arrayBuffer());
    } else {
      const payload = await request.json() as { imageBase64?: string; mimeType?: string };
      const raw = String(payload.imageBase64 ?? "").trim();
      if (!raw) return Response.json({ fields: {}, ocrStatus: "skipped" }, { status: 200 });
      mimeType = payload.mimeType?.trim() || "image/jpeg";
      const normalized = raw.includes(",") ? raw.split(",").pop() ?? "" : raw;
      buffer = Buffer.from(normalized, "base64");
      if (buffer.length > MAX_BYTES) {
        return Response.json({ fields: {}, ocrStatus: "failed", error: "Failas per didelis (iki 8 MB)." }, { status: 400 });
      }
    }

    const result = await parseInvoiceImage(buffer, mimeType);
    return Response.json(result);
  } catch (error) {
    console.error("[invoices/parse]", error);
    return Response.json({ fields: {}, ocrStatus: "failed" });
  }
}
