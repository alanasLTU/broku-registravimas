import { locationLabel } from "@/lib/auth";
import { normalizeStatus, isRecordCompleted } from "@/lib/constants";
import { mediaProxyUrl, mediaThumbUrl } from "@/lib/media-url";
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
  executor?: string;
  supervisor_id?: string | null;
  supervisor_name?: string | null;
  parent_record_id?: string | null;
  due_date: string | null;
  requested_by: string;
  price_cents: number | null;
  notes: string;
  required_work: string;
  resolution: string;
  include_in_report: boolean;
  visible_to_client: boolean;
  notify_responsible: boolean;
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
  thumb_object_key?: string | null;
  file_name: string;
  mime_type: string;
  media_kind: string;
  caption?: string;
};

function mapMedia(recordId: string, media: MediaRow[]) {
  return media.map((row) => {
    const isVideo = row.media_kind === "video";
    const hasThumb = Boolean(row.thumb_object_key);
    return {
      id: row.id,
      url: mediaProxyUrl(recordId, row.id),
      thumbUrl: !isVideo && hasThumb ? mediaThumbUrl(recordId, row.id) : undefined,
      caption: row.caption ?? "",
      kind: isVideo ? "video" : "photo",
      fileName: row.file_name,
      objectKey: row.object_key,
    };
  });
}

export function mapRecord(
  record: RecordRow,
  items: ItemRow[],
  media: MediaRow[],
  extras?: {
    supervisorName?: string;
    childTasks?: Array<{ id: string; code: string; title: string; status: string }>;
  },
) {
  const signed = mapMedia(record.id, media);
  const photos = signed.filter((item) => item.kind === "photo");
  const videos = signed.filter((item) => item.kind === "video");
  const itemList = items.map((row) => ({ id: row.id, issue: row.issue, requiredWork: row.required_work }));
  return {
    id: record.id,
    code: record.code,
    projectId: record.project_id,
    parentRecordId: record.parent_record_id ?? null,
    recordType: record.record_type,
    room: record.room,
    zone: record.zone,
    location: locationLabel(record.room, record.zone),
    title: record.title,
    description: record.description,
    origin: record.origin === "client" ? "client" : "staff",
    createdByName: record.created_by_name || "",
    createdByEmail: record.created_by_email || "",
    status: normalizeStatus(record.status),
    priority: record.priority,
    responsible: record.responsible,
    assignee: record.assignee || "—",
    executor: record.executor || "",
    supervisorId: record.supervisor_id ?? null,
    supervisorName: record.supervisor_name?.trim() || extras?.supervisorName || "",
    due: record.due_date ?? "Nenustatyta",
    requestedBy: record.requested_by,
    price: record.price_cents === null ? "" : (record.price_cents / 100).toFixed(2),
    notes: record.notes,
    created: record.created_at,
    createdAt: record.created_at,
    archived: Boolean(record.archived),
    visibleToClient: Boolean(record.visible_to_client),
    notifyResponsible: Boolean(record.notify_responsible),
    photo: photos[0]?.url,
    photos,
    videos,
    media: signed,
    items: itemList,
    selected: Boolean(record.include_in_report),
    requiredWork: record.required_work,
    resolution: record.resolution,
    version: record.version,
    childTasks: extras?.childTasks ?? [],
  };
}

export async function fetchRecordBundle(supabase: SupabaseClient, recordId: string) {
  const { data: record, error } = await supabase.from("records").select("*").eq("id", recordId).maybeSingle();
  if (error) throw error;
  if (!record) return null;

  const [{ data: items }, { data: media }, { data: children }, supervisor] = await Promise.all([
    supabase.from("record_items").select("*").eq("record_id", recordId).order("sort_order"),
    supabase.from("record_media").select("*").eq("record_id", recordId).order("sort_order"),
    supabase.from("records").select("id, code, title, status").eq("parent_record_id", recordId).order("created_at"),
    record.supervisor_id
      ? supabase.from("profiles").select("display_name").eq("id", record.supervisor_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return mapRecord(
    record as RecordRow,
    items ?? [],
    media ?? [],
    {
      supervisorName: (record as RecordRow).supervisor_name?.trim() || supervisor.data?.display_name || "",
      childTasks: (children ?? [])
        .filter((child) => !isRecordCompleted(child))
        .map((child) => ({
          id: child.id,
          code: child.code,
          title: child.title,
          status: normalizeStatus(child.status),
        })),
    },
  );
}
