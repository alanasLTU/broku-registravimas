import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function pdfText(value) {
  const map = {
    "ą": "a", "č": "c", "ę": "e", "ė": "e", "į": "i", "š": "s", "ų": "u", "ū": "u", "ž": "z",
    "Ą": "A", "Č": "C", "Ę": "E", "Ė": "E", "Į": "I", "Š": "S", "Ų": "U", "Ū": "U", "Ž": "Z",
    "·": "-",
  };
  return value.replace(/[ąčęėįšųūžĄČĘĖĮŠŲŪŽ·]/g, (ch) => map[ch] ?? ch);
}

function formatMoneyFromCents(cents) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

async function buildRecordsDigestPdf(input) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595, 842]);
  let y = 800;

  page.drawText(pdfText("Dienos suvestinė · įrašai"), { x: 40, y, size: 16, font: bold, color: rgb(0.12, 0.3, 0.23) });
  y -= 20;
  page.drawText(pdfText(input.dateLabel), { x: 40, y, size: 10, font, color: rgb(0.35, 0.4, 0.38) });
  y -= 28;

  for (const section of input.sections) {
    page.drawText(pdfText(section.projectName), { x: 40, y, size: 12, font: bold, color: rgb(0.12, 0.16, 0.15) });
    y -= 16;
    for (const line of section.lines) {
      page.drawText(pdfText(`• ${line}`), { x: 48, y, size: 9, font, color: rgb(0.2, 0.24, 0.22) });
      y -= 13;
      if (y < 60) break;
    }
    y -= 10;
    if (y < 60) break;
  }

  return Buffer.from(await pdf.save());
}

async function buildInvoicesDigestPdf(input) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595, 842]);
  let y = 800;

  page.drawText(pdfText("Dienos suvestinė · sąskaitos"), { x: 40, y, size: 16, font: bold, color: rgb(0.12, 0.3, 0.23) });
  y -= 20;
  page.drawText(pdfText(input.dateLabel), { x: 40, y, size: 10, font, color: rgb(0.35, 0.4, 0.38) });
  y -= 28;

  for (const section of input.sections) {
    page.drawText(pdfText(section.projectName), { x: 40, y, size: 12, font: bold, color: rgb(0.12, 0.16, 0.15) });
    y -= 16;
    for (const line of section.lines) {
      page.drawText(pdfText(`• ${line}`), { x: 48, y, size: 9, font, color: rgb(0.2, 0.24, 0.22) });
      y -= 13;
      if (y < 80) break;
    }
    page.drawText(pdfText(`Suma su PVM: ${formatMoneyFromCents(section.totalIncVatCents)} €`), { x: 48, y, size: 9, font: bold, color: rgb(0.12, 0.16, 0.15) });
    y -= 18;
    if (y < 80) break;
  }

  page.drawText(pdfText(`Viso su PVM: ${formatMoneyFromCents(input.grandTotalIncVatCents)} €`), { x: 40, y: Math.max(40, y), size: 11, font: bold, color: rgb(0.12, 0.16, 0.15) });
  return Buffer.from(await pdf.save());
}

const dateLabel = new Intl.DateTimeFormat("lt-LT", {
  timeZone: "Europe/Vilnius",
  dateStyle: "long",
}).format(new Date(Date.now() - 86400000));

const outDir = path.join(process.cwd(), "_qa", "digest-preview");

const recordsPdf = await buildRecordsDigestPdf({
  dateLabel,
  sections: [
    {
      projectName: "BURGA · Kauno LEZ",
      lines: [
        "BR-0042 · Brokas · Spinta virtuvėje (Argintas)",
        "AP-0018 · Apimtis · Papildomas stalviršis (Alanas)",
        "UZ-0007 · Užduotis · Sutvarkyti fasadą (Montuotojai)",
      ],
    },
  ],
});

const invoicesPdf = await buildInvoicesDigestPdf({
  dateLabel,
  sections: [
    {
      projectName: "BURGA · Kauno LEZ",
      lines: [
        "UAB Baldų tiekimas SF-2026-0142 · Brokas · Distyle · 1 240,00 €",
        "UAB Stiklų centras SC-889 · Papildoma apimtis · Klientas · 380,50 €",
      ],
      totalIncVatCents: 162050,
    },
  ],
  grandTotalIncVatCents: 162050,
});

await mkdir(outDir, { recursive: true });
const recordsPath = path.join(outDir, "dienos-suvestine-irrasai-PV-koordinatoriui.pdf");
const invoicesPath = path.join(outDir, "dienos-suvestine-saskaitos-PV-koordinatoriui.pdf");
await writeFile(recordsPath, recordsPdf);
await writeFile(invoicesPath, invoicesPdf);

console.log("Sugeneruota:");
console.log(recordsPath);
console.log(invoicesPath);
