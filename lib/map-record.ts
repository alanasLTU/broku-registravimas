import { locationLabel } from "@/lib/auth";
import { MEDIA_BUCKET, normalizeStatus } from "@/lib/constants";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RecordRow = {
  id: string;
  code: string;
  project_id: string;
  record_type: string;
  title: string;
  room: string;
  zone: string;
  description: string;
  origin: string;
  priority: string;
  status: string;
  responsible: string;
  assignee: string;
  due_date: string | null;
  requested_by: string;
  price_cents: number | null;
  notes: string;
  required_work: string;
  resolution: string;
  include_in_report: boolean;
  created_by_email: string;
  created_by_name: string;
  created_at: string;
  archived?: boolean;
  archived_at?: string | null;
  version: number;
};

type ItemRow = { id: string; record_id: string; issue: string; required_work: string };
type MediaRow = {
  id: string;
  record_id: string;
  object_key: string;
  file_name: string;
  mime_type: string;
  media_kind: string;
  caption: string;
};

export async function mapRecord(
  supabase: SupabaseClient,
  record: RecordRow,
  items: ItemRow[],
  media: MediaRow[],
) {
  const signed = await Promise.all(
    media.map(async (row) => {
      const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(row.object_key, 60 * 60 * 12);
      return {
        id: row.id,
        url: data?.signedUrl ?? `/api/media/${record.id}/${row.id}`,
        caption: row.caption,
        kind: row.media_kind === "video" ? "video" : "photo",
        fileName: row.file_name,
        objectKey: row.object_key,
      };
    }),
  );
  const photos = signed.filter((item) => item.kind === "photo");
  const videos = signed.filter((item) => item.kind === "video");
  const itemList = items.map((row) => ({ id: row.id, issue: row.issue, requiredWork: row.required_work }));
  return {
    id: record.id,
    code: record.code,
    projectId: record.project_id,
    recordType: record.record_type,
    room: record.room,
    zone: record.zone,
    location: locationLabel(record.room, record.zone),
    title: record.title,
    description: record.description,
    origin: record.origin,
    status: normalizeStatus(record.status),
    priority: record.priority,
    responsible: record.responsible,
    assignee: record.assignee || "—",
    due: record.due_date ?? "Nenustatyta",
    requestedBy: record.requested_by,
    price: record.price_cents === null ? "" : (record.price_cents / 100).toFixed(2),
    notes: record.notes,
    created: record.created_at,
    archived: Boolean(record.archived),
    photo: photos[0]?.url,
    photos,
    videos,
    media: signed,
    items: itemList,
                selected: Boolean(record.include_in_report),
    requiredWork: record.required_work,
    resolution: record.resolution,
    version: record.version,
  };
}
