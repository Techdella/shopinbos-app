// Browser only. Phone photos are often 5–12 MB, but an upload through our API routes can't be over about 4.5 MB
// (Vercel's request limit), so pictures are made smaller in the browser before they're sent.

/** Raster pictures a canvas can redraw (not SVG or animated GIF). */
export function canShrink(file: { type?: string | null }): boolean {
  return /^image\/(jpe?g|png|webp|heic|heif)$/i.test(file.type ?? "");
}

/**
 * Shrinks to at most `max` px on the long side, as WebP (logos, which may be see-through) or JPEG on white
 * (product photos and documents: JPEG is what catalogs like WhatsApp and Facebook take). Returns the original when
 * it can't or it wouldn't help.
 */
export async function shrinkImage(file: File, max: number, type: "image/webp" | "image/jpeg" = "image/webp"): Promise<File> {
  if (typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 600 * 1024) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (context && type === "image/jpeg") {
      // JPEG has no see-through: give transparent pixels a white background instead of black.
      context.fillStyle = "#FFFFFF";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, type === "image/jpeg" ? 0.85 : 0.9));
    // Some browsers can't encode WebP and hand back PNG; any of them is fine as long as it got smaller.
    if (!blob || blob.size >= file.size) return file;
    const ext = blob.type === "image/webp" ? "webp" : blob.type === "image/jpeg" ? "jpg" : "png";
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.${ext}`, { type: blob.type });
  } catch {
    return file;
  }
}

/** Long side for product pictures and documents: sharp enough to zoom into and read, small enough to send. */
export const UPLOAD_LONG_SIDE = 2560;

/** A picture made small enough to send, or the file as it was (PDFs, videos, SVGs). */
export async function readyToSend(file: File): Promise<File> {
  return canShrink(file) ? shrinkImage(file, UPLOAD_LONG_SIDE, "image/jpeg") : file;
}
