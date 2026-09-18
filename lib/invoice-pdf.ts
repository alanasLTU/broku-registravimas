import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatMoneyFromCents } from "@/lib/invoices";

export type InvoiceReportRow = {
  projectName: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  category: string;
  chargedTo: string;
  amountExVat: string;
  vat: string;
  amountIncVat: string;
  createdByName: string;
  createdAt: string;
};

function truncate(value: string, max: number) {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

export async function buildInvoiceReportPdf(input: {
  title: string;
  periodLabel: string;
  rows: InvoiceReportRow[];
  totalExVatCents: number;
  totalIncVatCents: number;
}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [842, 595];
  let page = pdf.addPage(pageSize);
  let y = pageSize[1] - 40;

  const draw = (text: string, x: number, size = 9, useBold = false, color = rgb(0.12, 0.16, 0.15)) => {
    page.drawText(text, { x, y, size, font: useBold ? bold : font, color });
  };

  draw(input.title, 40, 16, true);
  y -= 18;
  draw(input.periodLabel, 40, 10);
  y -= 24;

  const columns = [
    { label: "Objektas", width: 95 },
    { label: "Tiekėjas", width: 95 },
    { label: "Nr", width: 55 },
    { label: "Data", width: 50 },
    { label: "Kategorija", width: 70 },
    { label: "Kam", width: 55 },
    { label: "Be PVM", width: 55 },
    { label: "PVM", width: 45 },
    { label: "Su PVM", width: 55 },
  ];

  let x = 40;
  for (const column of columns) {
    draw(column.label, x, 8, true);
    x += column.width;
  }
  y -= 14;

  for (const row of input.rows) {
    if (y < 50) {
      page = pdf.addPage(pageSize);
      y = pageSize[1] - 40;
    }
    x = 40;
    const values = [
      truncate(row.projectName, 18),
      truncate(row.supplierName, 18),
      truncate(row.invoiceNumber, 12),
      row.invoiceDate,
      truncate(row.category, 14),
      truncate(row.chargedTo, 12),
      row.amountExVat,
      row.vat,
      row.amountIncVat,
    ];
    for (let index = 0; index < columns.length; index += 1) {
      draw(values[index] ?? "", x, 8);
      x += columns[index].width;
    }
    y -= 12;
  }

  y -= 8;
  draw(`Iš viso be PVM: ${formatMoneyFromCents(input.totalExVatCents)} €`, 40, 10, true);
  y -= 14;
  draw(`Iš viso su PVM: ${formatMoneyFromCents(input.totalIncVatCents)} €`, 40, 10, true);

  return Buffer.from(await pdf.save());
}
