const MAX_PRINT_WIDTH = 1600;
const JPEG_QUALITY = 0.72;

export async function compressImageForPrint(url: string): Promise<string> {
  if (typeof window === "undefined" || !url || url.startsWith("data:")) return url;
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, MAX_PRINT_WIDTH / Math.max(image.naturalWidth, 1));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return url;
    ctx.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) return url;
    return URL.createObjectURL(blob);
  } catch {
    return url;
  }
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image load failed"));
    image.src = url;
  });
}

export async function preparePrintImages(urls: string[]) {
  const compressed = await Promise.all(urls.map((url) => compressImageForPrint(url)));
  const objectUrls = compressed.filter((url) => url.startsWith("blob:"));
  return {
    urls: compressed,
    revoke: () => objectUrls.forEach((url) => URL.revokeObjectURL(url)),
  };
}
