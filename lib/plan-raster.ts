import { isImageFile, isInvoicePdfFile, PLAN_JPEG_QUALITY, PLAN_MAX_SIDE } from "@/lib/media";

const MAX_PDF_PAGES = 8;

export type RasterizedPlanPage = {
  file: File;
  width: number;
  height: number;
  page: number;
  pageCount: number;
};

async function canvasToJpeg(canvas: HTMLCanvasElement, name: string) {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", PLAN_JPEG_QUALITY);
  });
  if (!blob) throw new Error("Nepavyko suspausti plano");
  return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
}

export async function rasterizePlanSource(file: File): Promise<RasterizedPlanPage[]> {
  if (isInvoicePdfFile(file)) {
    return rasterizePdf(file);
  }
  if (!isImageFile(file)) {
    throw new Error("Įkelkite PDF arba nuotrauką (JPG, PNG)");
  }
  const { preparePlanForUpload } = await import("@/lib/media");
  const prepared = await preparePlanForUpload(file);
  if (!prepared) throw new Error("Nepavyko suspausti plano");
  return [{ file: prepared.file, width: prepared.width, height: prepared.height, page: 1, pageCount: 1 }];
}

async function rasterizePdf(file: File): Promise<RasterizedPlanPage[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const pageCount = Math.min(doc.numPages, MAX_PDF_PAGES);
  const pages: RasterizedPlanPage[] = [];
  const base = file.name.replace(/\.pdf$/i, "").slice(0, 50) || "planas";
  for (let page = 1; page <= pageCount; page += 1) {
    const pdfPage = await doc.getPage(page);
    const raw = pdfPage.getViewport({ scale: 1 });
    const scale = Math.min(4, PLAN_MAX_SIDE / Math.max(raw.width, raw.height, 1));
    const viewport = pdfPage.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Nepavyko nupiešti PDF");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise;
    const jpeg = await canvasToJpeg(canvas, pageCount > 1 ? `${base}-p${page}.jpg` : `${base}.jpg`);
    pages.push({
      file: jpeg,
      width: canvas.width,
      height: canvas.height,
      page,
      pageCount,
    });
  }

  return pages;
}
