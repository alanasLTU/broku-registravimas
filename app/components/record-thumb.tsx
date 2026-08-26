"use client";

import { useEffect, useMemo, useState } from "react";

type RecordThumbProps = {
  recordId: string;
  photoUrl?: string;
  photoId?: string;
  videoUrl?: string;
  photoCount?: number;
  videoCount?: number;
  fallbackLabel: string;
  placeholderClass: string;
};

function primaryThumbSrc(recordId: string, photoId?: string, photoUrl?: string) {
  if (!photoUrl) return null;
  if (photoUrl.startsWith("blob:") || photoUrl.startsWith("data:")) return photoUrl;
  if (photoUrl.startsWith("http")) return photoUrl;
  if (photoId && !photoId.startsWith("legacy-") && !photoId.startsWith("local-")) {
    return `/api/media/${recordId}/${photoId}`;
  }
  return photoUrl;
}

function fallbackThumbSrc(recordId: string, photoId?: string, current?: string | null) {
  if (!photoId || photoId.startsWith("legacy-") || photoId.startsWith("local-")) return null;
  const proxy = `/api/media/${recordId}/${photoId}`;
  return current === proxy ? null : proxy;
}

export default function RecordThumb({
  recordId,
  photoUrl,
  photoId,
  videoUrl,
  photoCount = 0,
  videoCount = 0,
  fallbackLabel,
  placeholderClass,
}: RecordThumbProps) {
  const initialSrc = useMemo(() => primaryThumbSrc(recordId, photoId, photoUrl), [recordId, photoId, photoUrl]);
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
            const next = fallbackThumbSrc(recordId, photoId, imageSrc);
            if (next) {
              setImageSrc(next);
              return;
            }
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
