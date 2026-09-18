"use client";

import { useEffect, useMemo, useState } from "react";

type RecordThumbProps = {
  recordId: string;
  photoUrl?: string;
  thumbUrl?: string;
  photoId?: string;
  videoUrl?: string;
  photoCount?: number;
  videoCount?: number;
  fallbackLabel: string;
  placeholderClass: string;
  /** true = krauti tik miniatiūrą (mažas egress sąraše). */
  preferThumb?: boolean;
};

function resolveThumbSrc(recordId: string, photoId?: string, photoUrl?: string, thumbUrl?: string, preferThumb = false) {
  if (preferThumb) return thumbUrl || null;
  if (!photoUrl) return null;
  if (photoUrl.startsWith("blob:") || photoUrl.startsWith("data:")) return photoUrl;
  if (photoUrl.startsWith("http")) return photoUrl;
  if (photoId && !photoId.startsWith("legacy-") && !photoId.startsWith("local-")) {
    return `/api/media/${recordId}/${photoId}`;
  }
  return photoUrl;
}

export default function RecordThumb({
  recordId,
  photoUrl,
  thumbUrl,
  photoId,
  videoUrl,
  photoCount = 0,
  videoCount = 0,
  fallbackLabel,
  placeholderClass,
  preferThumb = false,
}: RecordThumbProps) {
  const initialSrc = useMemo(
    () => resolveThumbSrc(recordId, photoId, photoUrl, thumbUrl, preferThumb),
    [preferThumb, recordId, photoId, photoUrl, thumbUrl],
  );
  const [imageSrc, setImageSrc] = useState<string | null>(initialSrc);
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    setImageSrc(initialSrc);
    setPhotoFailed(false);
  }, [initialSrc]);

  const showVideo = !imageSrc && !photoFailed && Boolean(videoUrl);
  const mediaTotal = photoCount + videoCount;

  return (
    <div className={`photo-thumb ${imageSrc || showVideo ? "has-media" : placeholderClass}`}>
      {imageSrc ? (
        <img
          src={imageSrc}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => {
            setPhotoFailed(true);
            setImageSrc(null);
          }}
        />
      ) : showVideo ? (
        <video src={videoUrl} muted playsInline preload="metadata" />
      ) : (
        <span>{fallbackLabel}</span>
      )}
      {mediaTotal > 1 && <b className="photo-count">{mediaTotal}</b>}
      {videoCount > 0 && <b className="video-count">▶</b>}
    </div>
  );
}
