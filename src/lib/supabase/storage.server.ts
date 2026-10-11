import { getSupabaseServiceClient } from "./server";

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

export async function getSignedUrl(path: string, expiresIn = 3600): Promise<string> {
  const supabase = await getSupabaseServiceClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function uploadFileServer(
  folder: StorageFolder,
  file: File | Blob,
  customPath?: string,
): Promise<UploadResult> {
  const supabase = await getSupabaseServiceClient();

  const ext = file instanceof File ? (file.name.split(".").pop() ?? "bin") : "bin";
  const filename = customPath ?? `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(filename, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "application/octet-stream",
  });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return { path: filename, publicUrl: data.publicUrl };
}

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "application/pdf": "pdf" };

/**
 * A fresh storage path under `dir` for an uploaded file. Never reuses the browser's file name: uploads don't
 * overwrite, so a second "logo.png" would fail, and names can carry spaces or characters URLs mangle.
 */
export function uploadPath(dir: string, file: File | Blob) {
  const fromName = file instanceof File ? file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const ext = EXTENSIONS[file.type] ?? (fromName && fromName.length <= 5 ? fromName : "bin");
  return `${dir.replace(/\/+$/, "")}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
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
