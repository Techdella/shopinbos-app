import { getSupabaseServiceClient } from "./server";
import { SNIFF_BYTES, uploadContentProblem } from "@/lib/security/upload-sniff";

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET ?? "shopinbos-media";

export type StorageFolder =
  | "products"
  | "avatars"
  | "store-banners"
  | "supplier-logos"
  | "logistics-logos"
  | "logistics-banners"
  | "brand"
  | "supplier-verifications"
  | "logistics-verifications"
  | "supplier-product-images";

export interface UploadResult {
  path: string;
  publicUrl: string;
}

/**
 * Bucket for private files (verification documents, message and support attachments), set with
 * PRIVATE_STORAGE_BUCKET. Create it as a private bucket (docs/migrations/2026-10-13-private-storage.sql); until
 * it is set, private files keep going to the main bucket and are still only handed out as signed URLs.
 */
export function privateBucket() {
  const bucket = process.env.PRIVATE_STORAGE_BUCKET?.trim();
  return bucket && bucket !== BUCKET ? bucket : null;
}

/** Short-lived link to a stored file. Looks in the private bucket first (newer files), then the main one. */
export async function getSignedUrl(path: string, expiresIn = 3600): Promise<string> {
  const supabase = await getSupabaseServiceClient();
  const priv = privateBucket();
  if (priv) {
    const { data } = await supabase.storage.from(priv).createSignedUrl(path, expiresIn);
    if (data?.signedUrl) return data.signedUrl;
  }
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

/** Stores a private file (served only through getSignedUrl after an access check). Returns its path. */
export async function uploadPrivateFile(dir: string, file: File | Blob): Promise<{ path: string }> {
  await assertUploadContent(file);
  const path = uploadPath(dir, file);
  const supabase = await getSupabaseServiceClient();
  const { error } = await supabase.storage.from(privateBucket() ?? BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw new Error(error.message);
  return { path };
}

/** Removes a private file from whichever bucket holds it. Best effort. */
export async function removePrivateFile(path: string) {
  const supabase = await getSupabaseServiceClient();
  const priv = privateBucket();
  await Promise.allSettled([...(priv ? [supabase.storage.from(priv).remove([path])] : []), supabase.storage.from(BUCKET).remove([path])]);
}

/** Thrown when an upload's bytes don't match its declared type (or an SVG carries script). */
export class UploadRejectedError extends Error {}

/** Checks the file's real content against its declared type; throws UploadRejectedError. */
export async function assertUploadContent(file: File | Blob) {
  const type = file.type || "application/octet-stream";
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  const text = type.toLowerCase().startsWith("image/svg") ? await file.text() : undefined;
  const problem = uploadContentProblem(type, head, text);
  if (problem) throw new UploadRejectedError(problem);
}

export async function uploadFileServer(
  folder: StorageFolder,
  file: File | Blob,
  customPath?: string,
): Promise<UploadResult> {
  await assertUploadContent(file);
  const supabase = await getSupabaseServiceClient();

  // The extension comes from the checked type, never the browser's file name (".html" on an "image/png").
  const filename = customPath ?? uploadPath(folder, file);

  const { error } = await supabase.storage.from(BUCKET).upload(filename, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "application/octet-stream",
  });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return { path: filename, publicUrl: data.publicUrl };
}

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg", "application/pdf": "pdf", "video/mp4": "mp4", "video/webm": "webm", "video/ogg": "ogv" };

/**
 * A fresh storage path under `dir` for an uploaded file. Never reuses the browser's file name: uploads don't
 * overwrite, so a second "logo.png" would fail, and names can carry spaces or characters URLs mangle.
 */
export function uploadPath(dir: string, file: File | Blob) {
  const fromName = file instanceof File ? file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const ext = EXTENSIONS[file.type] ?? (fromName && fromName.length <= 5 && !/^(html?|xhtml|svg|js|mjs|xml)$/.test(fromName) ? fromName : "bin");
  // Unguessable name (private files such as message attachments live in this bucket too).
  return `${dir.replace(/\/+$/, "")}/${Date.now()}-${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}.${ext}`;
}

/** Deletes a file we stored, given its public URL. Best effort: a leftover file is harmless. */
export async function removeFileByPublicUrl(publicUrl: string | null | undefined) {
  if (!publicUrl) return;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) return;
  const path = decodeURIComponent(publicUrl.slice(index + marker.length).split("?")[0]);
  try {
    const supabase = await getSupabaseServiceClient();
    await supabase.storage.from(BUCKET).remove([path]);
  } catch {
    // Not ours or already gone.
  }
}
