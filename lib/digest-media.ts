import { MEDIA_BUCKET } from "@/lib/constants";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DigestPhoto = {
  bytes: Uint8Array;
  mimeType: string;
};

type MediaRow = {
  record_id: string;
  object_key: string;
  thumb_object_key: string | null;
  media_kind: string;
  mime_type: string;
  sort_order: number;
};

export async function loadFirstPhotoByRecordId(
  admin: SupabaseClient,
  recordIds: string[],
): Promise<Map<string, DigestPhoto>> {
  const result = new Map<string, DigestPhoto>();
  if (!recordIds.length) return result;

  const { data, error } = await admin
    .from("record_media")
    .select("record_id, object_key, thumb_object_key, media_kind, mime_type, sort_order")
    .in("record_id", recordIds)
    .eq("media_kind", "photo")
    .order("sort_order", { ascending: true });
  if (error) throw error;

  const firstKeyByRecord = new Map<string, { key: string; mimeType: string }>();
  for (const row of (data ?? []) as MediaRow[]) {
    if (firstKeyByRecord.has(row.record_id)) continue;
    const key = row.thumb_object_key?.trim() || row.object_key?.trim();
    if (!key) continue;
    firstKeyByRecord.set(row.record_id, { key, mimeType: row.mime_type || "image/jpeg" });
  }

  await Promise.all([...firstKeyByRecord.entries()].map(async ([recordId, { key, mimeType }]) => {
    const { data: blob, error: downloadError } = await admin.storage.from(MEDIA_BUCKET).download(key);
    if (downloadError || !blob) return;
    result.set(recordId, {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      mimeType,
    });
  }));

  return result;
}
