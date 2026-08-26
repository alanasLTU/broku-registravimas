export const MAX_PHOTOS = 6;
export const MAX_VIDEOS = 1;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 40 * 1024 * 1024;
export const MEDIA_BUCKET = "record-media";

export const recordTypes = ["Brokas", "Apimtis", "Papildoma apimtis", "Užduotis"] as const;
export const statuses = ["Naujas", "Planuojamas", "Vykdoma", "Baigtas"] as const;
export const COMPLETED_STATUS = "Baigtas" as const;
export const LEGACY_COMPLETED_STATUSES = ["Baigtas", "Uždaryta"] as const;
export const priorities = ["Kritinis", "Aukštas", "Vidutinis", "Žemas"] as const;
export const RESPONSIBLE_OTHER = "Kita" as const;
export const responsibilities = ["Baldų gamintojas", "Montuotojai", "Distyle", RESPONSIBLE_OTHER] as const;

export const recordPrefixes: Record<(typeof recordTypes)[number], string> = {
  Brokas: "BR",
  Apimtis: "AP",
  "Papildoma apimtis": "PA",
  Užduotis: "UZ",
};

export function isRecordArchived(record: { archived?: boolean; status?: string | null }) {
  return Boolean(record.archived) || LEGACY_COMPLETED_STATUSES.includes((record.status ?? "") as typeof LEGACY_COMPLETED_STATUSES[number]);
}

export function normalizeStatus(value: string | null | undefined): (typeof statuses)[number] {
  if (value === "Uždaryta") return "Baigtas";
  if (value === "Perduota") return "Planuojamas";
  if (value === "Laukia patikros") return "Vykdoma";
  if (statuses.includes(value as (typeof statuses)[number])) return value as (typeof statuses)[number];
  return "Naujas";
}
export const ACTIVE_PROJECT_STORAGE_KEY = "broku-registras:active-project-id";
export const ACTIVE_TYPE_STORAGE_KEY = "broku-registras:active-record-type";
