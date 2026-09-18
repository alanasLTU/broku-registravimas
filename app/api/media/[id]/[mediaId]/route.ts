import { apiError, requirePermission, requireUser } from "@/lib/auth";
import { MEDIA_BUCKET } from "@/lib/constants";
import { mediaProxyUrl } from "@/lib/media-url";

export const dynamic = "force-dynamic";

const SIGNED_URL_TTL_SEC = 60 * 60 * 24;

export async function GET(request: Request, context: { params: Promise<{ id: string; mediaId: string }> }) {
  try {
    const { id, mediaId } = await context.params;
    const thumb = new URL(request.url).searchParams.get("thumb") === "1";
    const { supabase } = await requireUser();
    const { data: row } = await supabase
      .from("record_media")
      .select("object_key, thumb_object_key, mime_type, file_name")
      .eq("record_id", id)
      .eq("id", mediaId)
      .maybeSingle();
    if (!row) return new Response("Failas nerastas", { status: 404 });
    if (thumb && !row.thumb_object_key) return new Response("Miniatiūra nerasta", { status: 404 });
    const objectKey = thumb ? row.thumb_object_key : row.object_key;
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(objectKey, SIGNED_URL_TTL_SEC);
    if (error || !data?.signedUrl) return new Response("Failas nepasiekiamas", { status: 404 });
    return new Response(null, {
      status: 302,
      headers: {
        Location: data.signedUrl,
        "Cache-Control": thumb
          ? "private, max-age=86400, stale-while-revalidate=604800"
          : "private, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string; mediaId: string }> }) {
  try {
    const { id, mediaId } = await context.params;
    const { supabase } = await requireUser();
    const { data: row } = await supabase
      .from("record_media")
      .select("object_key, thumb_object_key, media_kind")
      .eq("record_id", id)
      .eq("id", mediaId)
      .maybeSingle();
    if (!row || row.media_kind === "video") return Response.json({ error: "Nuotrauka nerasta." }, { status: 404 });

    const payload = await request.json() as { objectKey?: string; thumbObjectKey?: string };
    const objectKey = payload.objectKey?.trim() || row.object_key;
    const thumbObjectKey = payload.thumbObjectKey?.trim() || row.thumb_object_key || null;
    const { error } = await supabase
      .from("record_media")
      .update({
        object_key: objectKey,
        thumb_object_key: thumbObjectKey,
        file_name: "pazymeta.jpg",
        mime_type: "image/jpeg",
      })
      .eq("id", mediaId)
      .eq("record_id", id);
    if (error) throw error;
    return Response.json({
      url: mediaProxyUrl(id, mediaId, Date.now()),
      thumbUrl: mediaProxyUrl(id, mediaId, Date.now(), "thumb"),
      fileName: "pazymeta.jpg",
      objectKey,
      thumbObjectKey,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; mediaId: string }> }) {
  try {
    const { id, mediaId } = await context.params;
    const { supabase, profile } = await requireUser();
    requirePermission(profile, "delete_media");

    const { data: row } = await supabase
      .from("record_media")
      .select("object_key, thumb_object_key")
      .eq("record_id", id)
      .eq("id", mediaId)
      .maybeSingle();
    if (!row) return Response.json({ error: "Failas nerastas." }, { status: 404 });

    const keys = [row.object_key, row.thumb_object_key].filter(Boolean) as string[];
    if (keys.length) await supabase.storage.from(MEDIA_BUCKET).remove(keys);
    const { error } = await supabase.from("record_media").delete().eq("id", mediaId).eq("record_id", id);
    if (error) throw error;

    await supabase.from("record_events").insert({
      record_id: id,
      type: "media_removed",
      message: "Pašalintas failas",
      actor_email: profile.email,
      actor_name: profile.displayName,
    });

    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
