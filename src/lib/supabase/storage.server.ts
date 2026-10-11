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
