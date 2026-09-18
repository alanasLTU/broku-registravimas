type InvoiceSubmitInput = {
  file: File | null;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  amountExVat: string;
  amountIncVat: string;
  notes: string;
  chargedTo: string;
  chargedToOther: string;
};

export function invoiceSubmitIssues(input: InvoiceSubmitInput, options?: { requireFile?: boolean }) {
  const issues: string[] = [];
  const requireFile = options?.requireFile !== false;
  if (requireFile && !input.file) issues.push("Įkelkite SF nuotrauką arba PDF failą");
  if (!input.supplierName.trim()) issues.push("Įrašykite tiekėją");
  if (!input.invoiceNumber.trim()) issues.push("Įrašykite SF numerį");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.invoiceDate.trim())) issues.push("Pasirinkite teisingą SF datą");
  if (!input.amountExVat.trim()) issues.push("Įrašykite sumą be PVM");
  if (!input.amountIncVat.trim()) issues.push("Įrašykite sumą su PVM");
  if (!input.notes.trim()) issues.push("Įrašykite komentarą — privaloma");
  if (input.chargedTo === "kita" && !input.chargedToOther.trim()) issues.push("Įrašykite kam priskiriama (Kita)");
  return issues;
}

export function invoiceSubmitBlockReason(input: InvoiceSubmitInput, options?: { requireFile?: boolean }) {
  const issues = invoiceSubmitIssues(input, options);
  if (!issues.length) return "";
  return issues[0];
}
