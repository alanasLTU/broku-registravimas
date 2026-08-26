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
