import type { RecordTypeName } from "@/lib/constants";
import { responsibleDisplay } from "@/lib/responsible";

export type ReportFieldKey =
  | "photos"
  | "location"
  | "title"
  | "descriptions"
  | "requiredWork"
  | "responsible"
  | "executor"
  | "supervisor"
  | "due"
  | "status"
  | "priority"
  | "notes"
  | "commercial"
  | "resolution"
  | "createdBy";

export type ReportOptions = Record<ReportFieldKey, boolean>;

export const DEFAULT_REPORT_OPTIONS: ReportOptions = {
  photos: true,
  location: true,
  title: true,
  descriptions: true,
  requiredWork: true,
  responsible: true,
  executor: true,
  supervisor: true,
  due: true,
  status: true,
  priority: true,
  notes: true,
  commercial: true,
  resolution: true,
  createdBy: true,
};

export const REPORT_OPTION_LABELS: Record<ReportFieldKey, string> = {
  photos: "Nuotraukos",
  location: "Patalpa ir zona",
  title: "Pozicija / pavadinimas",
  descriptions: "Aprašymai",
  requiredWork: "Ką atlikti / pataisyti",
  responsible: "Atsakinga šalis",
  executor: "Darbų vykdytojas",
  supervisor: "Prižiūri",
  due: "Terminas",
  status: "Būsena",
  priority: "Prioritetas",
  notes: "Pastabos",
  commercial: "Kaina ir kas paprašė",
  resolution: "Sprendimas / atlikti darbai",
  createdBy: "Kas užregistravo",
};

type ReportRecord = {
  recordType: RecordTypeName | string;
  title: string;
  room?: string;
  zone?: string;
  location?: string;
  status: string;
  priority: string;
  responsible: string;
  assignee: string;
  executor?: string;
  supervisorName?: string;
  due: string;
  notes?: string;
  requestedBy?: string;
  price?: string;
  resolution?: string;
  createdByName?: string;
  createdByEmail?: string;
  items?: Array<{ issue: string; requiredWork: string }>;
};

export function formatReportLocation(record: ReportRecord) {
  if (record.location?.trim()) return record.location.trim();
  return [record.room, record.zone].filter(Boolean).join(" · ");
}

export function buildReportFieldRows(record: ReportRecord, options: ReportOptions) {
  const rows: Array<{ label: string; value: string }> = [];
  const location = formatReportLocation(record);
  if (options.location && location) rows.push({ label: "Patalpa", value: location });
  if (options.title && record.title) rows.push({ label: "Pozicija", value: record.title });
  if (options.status && record.status) rows.push({ label: "Būsena", value: record.status });
  if (options.priority && record.priority) rows.push({ label: "Prioritetas", value: record.priority });
  if (options.responsible) {
    const value = responsibleDisplay(record.responsible, record.assignee);
    if (value) rows.push({ label: "Atsakinga šalis", value });
  }
  if (options.executor && record.executor?.trim()) rows.push({ label: "Darbų vykdytojas", value: record.executor.trim() });
  if (options.supervisor && record.supervisorName?.trim()) rows.push({ label: "Prižiūri", value: record.supervisorName.trim() });
  if (options.due && record.due && record.due !== "Nenustatyta") rows.push({ label: "Terminas", value: record.due });
  if (options.createdBy) {
    const who = record.createdByName || record.createdByEmail;
    if (who) rows.push({ label: "Užregistravo", value: who });
  }
  if (options.commercial && record.recordType === "Papildoma apimtis") {
    if (record.requestedBy?.trim()) rows.push({ label: "Kas paprašė", value: record.requestedBy.trim() });
    if (record.price?.trim()) rows.push({ label: "Kaina", value: `${record.price} EUR` });
  }
  if (options.notes && record.notes?.trim()) rows.push({ label: "Pastabos", value: record.notes.trim() });
  if (options.resolution && record.resolution?.trim()) rows.push({ label: "Sprendimas", value: record.resolution.trim() });
  return rows;
}
