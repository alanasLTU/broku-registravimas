import { MAX_PHOTO_BYTES, MAX_VIDEO_BYTES } from "@/lib/constants";

const imageExtensions = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".gif", ".avif"];
const videoExtensions = [".mp4", ".mov", ".webm", ".m4v", ".3gp"];

function extensionOf(file: File) {
  const name = file.name.toLowerCase();
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index) : "";
}

export function isImageFile(file: File) {
  if (file.type.startsWith("image/")) return true;
  if (file.type === "application/octet-stream" || !file.type) return imageExtensions.includes(extensionOf(file));
  return imageExtensions.includes(extensionOf(file));
}

export function isInvoicePdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function pickInvoiceUploadFile(files: Iterable<File>) {
  for (const file of files) {
    if (isInvoicePdfFile(file)) return file;
    if (isImageFile(file)) return file;
  }
  return null;
}

export function isVideoFile(file: File) {
  if (file.type.startsWith("video/")) return true;
  if (file.type === "application/octet-stream" || !file.type) return videoExtensions.includes(extensionOf(file));
  return videoExtensions.includes(extensionOf(file));
}

export function imageTooLarge(file: File) {
  return file.size > MAX_PHOTO_BYTES;
}

export function videoTooLarge(file: File) {
  return file.size > MAX_VIDEO_BYTES;
}

export function mimeOf(file: File, kind: "photo" | "video") {
  if (file.type) return file.type;
  return kind === "video" ? "video/mp4" : "image/jpeg";
}

export function mediaFileName(file: File, kind: "photo" | "video") {
  const trimmed = file.name?.trim();
  if (trimmed) return trimmed;
  const ext = kind === "video" ? "mp4" : "jpg";
  return `${kind}-${Date.now()}.${ext}`;
}

const UPLOAD_MAX_SIDE = 1280;
const UPLOAD_JPEG_QUALITY = 0.78;
const UPLOAD_SKIP_BELOW_BYTES = 500_000;
const THUMB_MAX_SIDE = 480;
const THUMB_JPEG_QUALITY = 0.72;

export function thumbObjectKeyFor(projectId: string, recordId: string, mediaId: string) {
  return `${projectId}/${recordId}/${mediaId}-thumb.jpg`;
}

/** Mažina Storage + egress free plane: resize + JPEG prieš upload. */
export async function preparePhotoForUpload(file: File): Promise<File> {
  if (!isImageFile(file) || file.type === "image/gif") return file;
  if (file.size <= UPLOAD_SKIP_BELOW_BYTES && file.type === "image/jpeg") return file;

  if (typeof window === "undefined" || typeof document === "undefined") return file;

  try {
    const image = await loadUploadImage(file);
    const scale = Math.min(1, UPLOAD_MAX_SIDE / Math.max(image.naturalWidth, 1));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", UPLOAD_JPEG_QUALITY);
    });
    if (!blob || blob.size >= file.size) return file;
    const base = file.name.replace(/\.[^.]+$/, "").slice(0, 70) || "nuotrauka";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

/** Mažas JPEG preview sąrašui / drawer — ~20–40 KB vietoj pilnos nuotraukos. */
export async function preparePhotoThumb(file: File): Promise<File | null> {
  if (!isImageFile(file) || file.type === "image/gif") return null;
  if (typeof window === "undefined" || typeof document === "undefined") return null;

  try {
    const image = await loadUploadImage(file);
    const scale = Math.min(1, THUMB_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight, 1));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", THUMB_JPEG_QUALITY);
    });
    if (!blob) return null;
    const base = file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "thumb";
    return new File([blob], `${base}-thumb.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return null;
  }
}

function loadUploadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image load failed"));
    };
    image.src = url;
  });
}
