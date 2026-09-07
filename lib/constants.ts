export const MAX_PHOTOS = 6;
export const MAX_VIDEOS = 1;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 40 * 1024 * 1024;
export const MEDIA_BUCKET = "record-media";

export const recordTypes = ["Brokas", "Apimtis", "Papildoma apimtis", "Užduotis"] as const;
export const clientRecordTypes = ["Brokas", "Apimtis", "Papildoma apimtis"] as const;
export type RecordTypeName = (typeof recordTypes)[number];
export type ClientRecordTypeName = (typeof clientRecordTypes)[number];

export function isRecordType(value: string): value is RecordTypeName {
  return (recordTypes as readonly string[]).includes(value);
}

export function isClientRecordType(value: string): value is ClientRecordTypeName {
  return (clientRecordTypes as readonly string[]).includes(value);
}

export const statuses = ["Užregistruota", "Perduota sprendimui", "Vykdoma", "Sutvarkyta"] as const;
export const COMPLETED_STATUS = "Sutvarkyta" as const;
export const LEGACY_COMPLETED_STATUSES = ["Sutvarkyta", "Baigtas", "Uždaryta"] as const;
export const priorities = ["Kritinis", "Aukštas", "Vidutinis", "Žemas"] as const;
export const RESPONSIBLE_OTHER = "Kita" as const;
export const responsibilities = ["Baldų gamintojas", "Montuotojai", "Distyle", RESPONSIBLE_OTHER] as const;

export const CONTACT_CATEGORIES = ["Baldai", "Metalas", "Stalviršiai", "Stiklas / veidrodžiai", "Kita"] as const;

export const PROJECT_CONTACT_ROLES = [
  "site_contact",
  "project_manager",
  "works_manager",
  "coordinator",
  "manufacturer",
  "installer",
] as const;

export type ProjectContactRole = (typeof PROJECT_CONTACT_ROLES)[number];

export const PROJECT_CONTACT_ROLE_LABELS: Record<ProjectContactRole, string> = {
  site_contact: "Kontaktinis asmuo objekte",
  project_manager: "Projekto vadovas",
  works_manager: "Darbų vadovas",
  coordinator: "Koordinatorius",
  manufacturer: "Gamintojas / tiekėjas",
  installer: "Montuotojas",
};

export const recordPrefixes: Record<(typeof recordTypes)[number], string> = {
  Brokas: "BR",
  Apimtis: "AP",
  "Papildoma apimtis": "PA",
  Užduotis: "UZ",
};

export function isRecordArchived(record: { archived?: boolean }) {
  return Boolean(record.archived);
}

export function isRecordCompleted(record: { status?: string | null }) {
  return normalizeStatus(record.status) === COMPLETED_STATUS;
}

const STATUS_ALIASES: Record<string, (typeof statuses)[number]> = {
  Naujas: "Užregistruota",
  Planuojamas: "Perduota sprendimui",
  Perduota: "Perduota sprendimui",
  "Laukia patikros": "Vykdoma",
  Baigtas: "Sutvarkyta",
  Uždaryta: "Sutvarkyta",
};

export function normalizeStatus(value: string | null | undefined): (typeof statuses)[number] {
  if (!value) return "Užregistruota";
  if (STATUS_ALIASES[value]) return STATUS_ALIASES[value];
  if (statuses.includes(value as (typeof statuses)[number])) return value as (typeof statuses)[number];
  return "Užregistruota";
}

export const ACTIVE_PROJECT_STORAGE_KEY = "broku-registras:active-project-id";
export const ACTIVE_TYPE_STORAGE_KEY = "broku-registras:active-record-type";

export const projectStatuses = ["Vykdomas", "Baigtas"] as const;
export type ProjectStatus = (typeof projectStatuses)[number];
export const ACTIVE_PROJECT_STATUS = "Vykdomas" as const;
export const COMPLETED_PROJECT_STATUS = "Baigtas" as const;

export function normalizeProjectStatus(value: string | null | undefined): ProjectStatus {
  return value === COMPLETED_PROJECT_STATUS ? COMPLETED_PROJECT_STATUS : ACTIVE_PROJECT_STATUS;
}

export function isProjectCompleted(project: { status?: string | null; archived?: boolean }) {
  return Boolean(project.archived) || project.status === COMPLETED_PROJECT_STATUS;
}

export const ARCHIVED_TAB = "Archyvas" as const;
export const SUPER_ADMIN_EMAILS = ["argintas@digroup.lt", "argintas@distyle.lt"] as const;
export const SEED_SUPER_ADMIN_EMAIL = SUPER_ADMIN_EMAILS[0];

export function isSuperAdminEmail(email: string) {
  const normalized = email.trim().toLocaleLowerCase();
  return (SUPER_ADMIN_EMAILS as readonly string[]).includes(normalized);
}
