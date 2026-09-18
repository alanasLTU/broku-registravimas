import { MEDIA_BUCKET } from "@/lib/constants";
import type { SupabaseClient } from "@supabase/supabase-js";

async function collectRecordMediaKeys(client: SupabaseClient, projectId: string) {
  const { data: records, error: recordsError } = await client
    .from("records")
    .select("id")
    .eq("project_id", projectId);
  if (recordsError) throw recordsError;

  const recordIds = (records ?? []).map((row) => row.id);
  if (!recordIds.length) return [] as string[];

  const { data: media, error: mediaError } = await client
    .from("record_media")
    .select("object_key, thumb_object_key")
    .in("record_id", recordIds);
  if (mediaError) throw mediaError;

  return (media ?? []).flatMap((row) => [row.object_key, row.thumb_object_key].filter(Boolean)) as string[];
}

async function collectPlanMediaKeys(client: SupabaseClient, projectId: string) {
  const { data: plans, error } = await client
    .from("project_plans")
    .select("object_key, thumb_object_key")
    .eq("project_id", projectId);
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("project_plans") && message.includes("does not exist")) return [] as string[];
    throw error;
  }
  return (plans ?? []).flatMap((row) => [row.object_key, row.thumb_object_key].filter(Boolean)) as string[];
}

export async function deleteProjectStorage(client: SupabaseClient, projectId: string) {
  const keys = [...new Set([
    ...await collectRecordMediaKeys(client, projectId),
    ...await collectPlanMediaKeys(client, projectId),
  ])];
  if (!keys.length) return { removed: 0 };

  const chunkSize = 100;
  let removed = 0;
  for (let index = 0; index < keys.length; index += chunkSize) {
    const chunk = keys.slice(index, index + chunkSize);
    const { error } = await client.storage.from(MEDIA_BUCKET).remove(chunk);
    if (error) throw error;
    removed += chunk.length;
  }
  return { removed };
}

export async function deleteProjectCompletely(client: SupabaseClient, projectId: string) {
  await deleteProjectStorage(client, projectId);
  const { error } = await client.from("projects").delete().eq("id", projectId);
  if (error) throw error;
}
