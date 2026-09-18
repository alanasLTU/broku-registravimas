import { apiError, requireUser } from "@/lib/auth";
import { MAX_PHOTOS, MAX_VIDEOS, MAX_PHOTO_BYTES, MAX_VIDEO_BYTES } from "@/lib/constants";
import { mediaProxyUrl, mediaThumbUrl } from "@/lib/media-url";

export const dynamic = "force-dynamic";

type MediaPayload = {
  id?: string;
  objectKey?: string;
  thumbObjectKey?: string;
  fileName?: string;
  mimeType?: string;
  mediaKind?: string;
  fileSize?: number;
  caption?: string;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { supabase, profile } = await requireUser();
    const { data: record } = await supabase.from("records").select("id, project_id").eq("id", id).maybeSingle();
    if (!record) return Response.json({ error: "Įrašas nerastas." }, { status: 404 });

    const { data: existing } = await supabase.from("record_media").select("id, media_kind").eq("record_id", id);
    const existingPhotos = (existing ?? []).filter((item) => item.media_kind !== "video").length;
    const existingVideos = (existing ?? []).filter((item) => item.media_kind === "video").length;

    const payload = await request.json() as { media?: MediaPayload[] };
    const incoming = (payload.media ?? []).slice(0, MAX_PHOTOS + MAX_VIDEOS);
    if (!incoming.length) return Response.json({ error: "Nėra įkeltų failų." }, { status: 400 });

    const prefix = `${record.project_id}/${id}/`;
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const rows = incoming.map((item, index) => {
      const objectKey = String(item.objectKey ?? "");
      if (!objectKey.startsWith(prefix)) throw new Error("Netinkamas failo kelias");
      const thumbObjectKey = String(item.thumbObjectKey ?? "").trim();
      if (thumbObjectKey && !thumbObjectKey.startsWith(prefix)) throw new Error("Netinkamas miniatiūros kelias");
      const mediaKind = item.mediaKind === "video" ? "video" : "photo";
      const fileSize = Number(item.fileSize ?? 0);
      if (mediaKind === "photo" && fileSize > MAX_PHOTO_BYTES) throw new Error("Nuotrauka per didelė");
      if (mediaKind === "video" && fileSize > MAX_VIDEO_BYTES) throw new Error("Video per didelis");
      const requestedId = String(item.id ?? "");
      return {
        id: uuidPattern.test(requestedId) ? requestedId : crypto.randomUUID(),
        record_id: id,
        object_key: objectKey,
        thumb_object_key: thumbObjectKey || null,
        file_name: String(item.fileName ?? "").slice(0, 200),
        mime_type: String(item.mimeType ?? (mediaKind === "video" ? "video/mp4" : "image/jpeg")),
        media_kind: mediaKind,
        file_size: fileSize,
        caption: String(item.caption ?? "").slice(0, 500),
        sort_order: (existing?.length ?? 0) + index,
      };
    });

    const photoCount = rows.filter((row) => row.media_kind === "photo").length;
    const videoCount = rows.filter((row) => row.media_kind === "video").length;
    if (existingPhotos + photoCount > MAX_PHOTOS || existingVideos + videoCount > MAX_VIDEOS) {
      return Response.json({ error: `Prie įrašo galima pridėti iki ${MAX_PHOTOS} nuotraukų ir ${MAX_VIDEOS} video.` }, { status: 400 });
    }

    const { data: inserted, error } = await supabase.from("record_media").insert(rows).select("*");
    if (error) throw error;

    await supabase.from("record_events").insert({
      record_id: id,
      type: "media_added",
      message: `Pridėta: ${photoCount} nuotraukos, ${videoCount} video`,
      actor_email: profile.email,
      actor_name: profile.displayName,
    });

    const media = (inserted ?? []).map((row) => ({
      id: row.id,
      url: mediaProxyUrl(id, row.id),
      thumbUrl: row.media_kind === "video" ? undefined : mediaThumbUrl(id, row.id),
      caption: row.caption,
      kind: row.media_kind === "video" ? "video" : "photo",
      fileName: row.file_name,
      objectKey: row.object_key,
    }));
    return Response.json({ media }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
