import { apiError, requireUser } from "@/lib/auth";
import { MEDIA_BUCKET } from "@/lib/constants";

export const dynamic = "force-dynamic";

const SIGNED_URL_TTL_SEC = 60 * 60 * 24;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const thumb = new URL(request.url).searchParams.get("thumb") === "1";
    const { supabase } = await requireUser();
    const { data: row } = await supabase
      .from("invoices")
      .select("object_key, thumb_object_key")
      .eq("id", id)
      .maybeSingle();
    if (!row?.object_key) return new Response("Failas nerastas", { status: 404 });
    const objectKey = thumb ? row.thumb_object_key : row.object_key;
    if (!objectKey) return new Response("Miniatiūra nerasta", { status: 404 });

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
