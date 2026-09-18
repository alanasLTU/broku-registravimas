import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFPage } from "pdf-lib";
import { formatMoneyFromCents } from "@/lib/invoices";

/** StandardFonts palaiko tik WinAnsi — liet. raidės be custom fonto. */
export function pdfText(value: string) {
  const map: Record<string, string> = {
    "ą": "a", "č": "c", "ę": "e", "ė": "e", "į": "i", "š": "s", "ų": "u", "ū": "u", "ž": "z",
    "Ą": "A", "Č": "C", "Ę": "E", "Ė": "E", "Į": "I", "Š": "S", "Ų": "U", "Ū": "U", "Ž": "Z",
    "·": "-",
  };
  return value.replace(/[ąčęėįšųūžĄČĘĖĮŠŲŪŽ·]/g, (ch) => map[ch] ?? ch);
}

export type DigestRecordEntry = {
  line: string;
  image?: { bytes: Uint8Array; mimeType: string };
};

const PAGE = { width: 595, height: 842 } as const;
const THUMB = 78;
const MARGIN = 40;

async function embedPhoto(pdf: PDFDocument, bytes: Uint8Array, mimeType: string): Promise<PDFImage | null> {
  const mime = mimeType.toLowerCase();
  try {
    if (mime.includes("png")) return await pdf.embedPng(bytes);
    if (mime.includes("jpeg") || mime.includes("jpg")) return await pdf.embedJpg(bytes);
    return await pdf.embedJpg(bytes);
  } catch {
    try {
      return await pdf.embedPng(bytes);
    } catch {
      return null;
    }
  }
}

function ensureSpace(pdf: PDFDocument, page: PDFPage, y: number, needed: number) {
  if (y - needed >= 52) return { page, y };
  const next = pdf.addPage([PAGE.width, PAGE.height]);
  return { page: next, y: PAGE.height - MARGIN };
}

export async function buildRecordsDigestPdf(input: {
  dateLabel: string;
  sections: Array<{
    projectName: string;
    entries: DigestRecordEntry[];
  }>;
}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  page.drawText(pdfText("Dienos suvestinė · įrašai"), { x: MARGIN, y, size: 16, font: bold, color: rgb(0.12, 0.3, 0.23) });
  y -= 20;
  page.drawText(pdfText(input.dateLabel), { x: MARGIN, y, size: 10, font, color: rgb(0.35, 0.4, 0.38) });
  y -= 28;

  for (const section of input.sections) {
    ({ page, y } = ensureSpace(pdf, page, y, 24));
    page.drawText(pdfText(section.projectName), { x: MARGIN, y, size: 12, font: bold, color: rgb(0.12, 0.16, 0.15) });
    y -= 18;

    for (const entry of section.entries) {
      const blockHeight = entry.image ? THUMB + 12 : 14;
      ({ page, y } = ensureSpace(pdf, page, y, blockHeight));

      if (entry.image) {
        const image = await embedPhoto(pdf, entry.image.bytes, entry.image.mimeType);
        const textX = MARGIN + THUMB + 12;
        if (image) {
          page.drawRectangle({
            x: MARGIN,
            y: y - THUMB,
            width: THUMB,
            height: THUMB,
            borderColor: rgb(0.88, 0.9, 0.89),
            borderWidth: 0.6,
            color: rgb(0.98, 0.99, 0.98),
          });
          page.drawImage(image, { x: MARGIN + 1, y: y - THUMB + 1, width: THUMB - 2, height: THUMB - 2 });
        } else {
          page.drawText(pdfText("Be foto"), { x: MARGIN + 8, y: y - THUMB / 2, size: 8, font, color: rgb(0.55, 0.6, 0.58) });
        }
        page.drawText(pdfText(entry.line), { x: textX, y: y - 14, size: 9, font, color: rgb(0.2, 0.24, 0.22) });
        y -= blockHeight;
      } else {
        page.drawText(pdfText(`• ${entry.line}`), { x: MARGIN + 8, y, size: 9, font, color: rgb(0.2, 0.24, 0.22) });
        y -= 14;
      }
    }

    y -= 8;
  }

  return Buffer.from(await pdf.save());
}

export async function buildInvoicesDigestPdf(input: {
  dateLabel: string;
  sections: Array<{
    projectName: string;
    lines: string[];
    totalIncVatCents: number;
  }>;
  grandTotalIncVatCents: number;
}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  page.drawText(pdfText("Dienos suvestinė · sąskaitos"), { x: MARGIN, y, size: 16, font: bold, color: rgb(0.12, 0.3, 0.23) });
  y -= 20;
  page.drawText(pdfText(input.dateLabel), { x: MARGIN, y, size: 10, font, color: rgb(0.35, 0.4, 0.38) });
  y -= 28;

  for (const section of input.sections) {
    page.drawText(pdfText(section.projectName), { x: MARGIN, y, size: 12, font: bold, color: rgb(0.12, 0.16, 0.15) });
    y -= 16;
    for (const line of section.lines) {
      page.drawText(pdfText(`• ${line}`), { x: MARGIN + 8, y, size: 9, font, color: rgb(0.2, 0.24, 0.22) });
      y -= 13;
      if (y < 80) break;
    }
    page.drawText(pdfText(`Suma su PVM: ${formatMoneyFromCents(section.totalIncVatCents)} €`), { x: MARGIN + 8, y, size: 9, font: bold, color: rgb(0.12, 0.16, 0.15) });
    y -= 18;
    if (y < 80) break;
  }

  page.drawText(pdfText(`Viso su PVM: ${formatMoneyFromCents(input.grandTotalIncVatCents)} €`), { x: MARGIN, y: Math.max(40, y), size: 11, font: bold, color: rgb(0.12, 0.16, 0.15) });
  return Buffer.from(await pdf.save());
}
