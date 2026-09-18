"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMoneyEuro } from "@/lib/invoices";
import DateInput from "./date-input";

type ReportRow = {
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

type Props = {
  projectId: string;
  projectName: string;
  onClose: () => void;
};

function monthBounds() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export default function InvoiceReportModal({ projectId, projectName, onClose }: Props) {
  const defaults = monthBounds();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [totals, setTotals] = useState({ exVat: "0,00", incVat: "0,00" });
  const [loading, setLoading] = useState(false);

  async function loadReport() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to, projectId });
      const response = await fetch(`/api/invoices/report?${params.toString()}`);
      const payload = await response.json() as { rows?: ReportRow[]; totals?: { exVat: string; incVat: string }; error?: string };
      if (!response.ok) throw new Error(payload.error || "Nepavyko gauti ataskaitos");
      setRows(payload.rows ?? []);
      setTotals(payload.totals ?? { exVat: "0,00", incVat: "0,00" });
    } catch {
      setRows([]);
      setTotals({ exVat: "0,00", incVat: "0,00" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReport();
  }, [from, to, projectId]);

  const csv = useMemo(() => {
    const header = ["Objektas", "Tiekėjas", "Nr", "Data", "Kategorija", "Kam", "Be PVM", "PVM", "Su PVM", "Įkėlė", "Įkėlimo data"];
    const lines = rows.map((row) => [
      row.projectName,
      row.supplierName,
      row.invoiceNumber,
      row.invoiceDate,
      row.category,
      row.chargedTo,
      row.amountExVat,
      row.vat,
      row.amountIncVat,
      row.createdByName,
      row.createdAt,
    ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","));
    return [header.join(","), ...lines].join("\n");
  }, [rows]);

  function downloadCsv() {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `saskaitos-${from}-${to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="modal-layer invoice-report-layer" role="dialog" aria-modal="true">
      <button className="modal-scrim" onClick={onClose} aria-label="Uždaryti" />
      <section className="invoice-report-modal">
        <div className="panel-title">
          <div><span>{projectName}</span><h2>Sąskaitų ataskaita</h2></div>
          <button type="button" onClick={onClose} aria-label="Uždaryti">×</button>
        </div>
        <div className="invoice-report-filters">
          <label><span>Nuo</span><DateInput value={from} onChange={setFrom} /></label>
          <label><span>Iki</span><DateInput value={to} onChange={setTo} /></label>
          <button type="button" className="secondary-button" onClick={() => void loadReport()} disabled={loading}>{loading ? "…" : "Atnaujinti"}</button>
        </div>
        <div className="invoice-report-actions">
          <button type="button" className="secondary-button" onClick={downloadCsv}>CSV</button>
          <button type="button" className="secondary-button" onClick={() => window.print()}>Spausdinti / PDF</button>
        </div>
        <div className="invoice-report-table-wrap">
          <table className="invoice-report-table">
            <thead>
              <tr>
                <th>Tiekėjas</th><th>Nr</th><th>Data</th><th>Kategorija</th><th>Kam</th><th>Be PVM</th><th>PVM</th><th>Su PVM</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.invoiceNumber}-${index}`}>
                  <td>{row.supplierName}</td>
                  <td>{row.invoiceNumber}</td>
                  <td>{row.invoiceDate}</td>
                  <td>{row.category}</td>
                  <td>{row.chargedTo}</td>
                  <td>{row.amountExVat}</td>
                  <td>{row.vat}</td>
                  <td>{row.amountIncVat}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="invoice-report-cards">
            {rows.map((row, index) => (
              <article key={`${row.invoiceNumber}-card-${index}`}>
                <strong>{row.supplierName}</strong>
                <span>{row.invoiceNumber} · {row.invoiceDate}</span>
                <p>{row.category} · {row.chargedTo}</p>
                <b>{row.amountIncVat} €</b>
                <small>be PVM {row.amountExVat} €</small>
              </article>
            ))}
          </div>
        </div>
        <footer className="invoice-report-total">
          <span>Iš viso be PVM: <strong>{totals.exVat} €</strong></span>
          <span>Iš viso su PVM: <strong>{totals.incVat} €</strong></span>
        </footer>
      </section>

      <section className="print-invoice-report">
        <header>
          <strong>DISTYLE · SĄSKAITŲ ATASKAITA</strong>
          <h1>{projectName}</h1>
          <p>{from} — {to}</p>
        </header>
        <table>
          <thead>
            <tr><th>Tiekėjas</th><th>Nr</th><th>Data</th><th>Kategorija</th><th>Kam</th><th>Be PVM</th><th>PVM</th><th>Su PVM</th></tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`print-${index}`}>
                <td>{row.supplierName}</td><td>{row.invoiceNumber}</td><td>{row.invoiceDate}</td><td>{row.category}</td><td>{row.chargedTo}</td><td>{row.amountExVat}</td><td>{row.vat}</td><td>{row.amountIncVat}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <footer>
          <p>Iš viso be PVM: {totals.exVat} €</p>
          <p>Iš viso su PVM: {totals.incVat} €</p>
        </footer>
      </section>
    </div>
  );
}
