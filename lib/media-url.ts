export type MediaVariant = "full" | "thumb";

/** App proxy for Storage — signed URL tik kai failas tikrai atidaromas (GET /api/media/...). */
export function mediaProxyUrl(
  recordId: string,
  mediaId: string,
  cacheBust?: number | string,
  variant: MediaVariant = "full",
) {
  const base = `/api/media/${recordId}/${mediaId}`;
  const params = new URLSearchParams();
  if (variant === "thumb") params.set("thumb", "1");
  if (cacheBust !== undefined && cacheBust !== "") params.set("v", String(cacheBust));
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function mediaThumbUrl(recordId: string, mediaId: string, cacheBust?: number | string) {
  return mediaProxyUrl(recordId, mediaId, cacheBust, "thumb");
}
