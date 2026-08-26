import { apiError, requireUser } from "@/lib/auth";
import { MEDIA_BUCKET } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string; mediaId: string }> }) {
  try {
    const { id, mediaId } = await context.params;
    const { supabase } = await requireUser();
    const { data: row } = await supabase
      .from("record_media")
      .select("object_key, mime_type, file_name")
      .eq("record_id", id)
      .eq("id", mediaId)
      .maybeSingle();
    if (!row) return new Response("Failas nerastas", { status: 404 });
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(row.object_key, 60);
    if (error || !data?.signedUrl) return new Response("Failas nepasiekiamas", { status: 404 });
    return Response.redirect(data.signedUrl, 302);
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
      .select("object_key, media_kind")
      .eq("record_id", id)
      .eq("id", mediaId)
      .maybeSingle();
    if (!row || row.media_kind === "video") return Response.json({ error: "Nuotrauka nerasta." }, { status: 404 });

    const payload = await request.json() as { objectKey?: string };
    const objectKey = payload.objectKey?.trim() || row.object_key;
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(objectKey, 60 * 60 * 12);
    if (error) throw error;
    return Response.json({ url: `${data.signedUrl}${data.signedUrl.includes("?") ? "&" : "?"}v=${Date.now()}`, fileName: "pazymeta.jpg", objectKey });
  } catch (error) {
    return apiError(error);
  }
}
