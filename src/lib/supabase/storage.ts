import { getSupabaseBrowserClient } from "./browser";

const BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET ?? "shopinbos-media";

export type StorageFolder =
  | "products"
  | "avatars"
  | "store-banners"
  | "supplier-logos"
  | "logistics-logos"
  | "brand"
  | "supplier-verifications"
  | "logistics-verifications"
  | "supplier-product-images";

export interface UploadResult {
  path: string;
  publicUrl: string;
}

export async function uploadFile(
  folder: StorageFolder,
  file: File,
  customPath?: string
): Promise<UploadResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase client not available");

  const ext = file.name.split(".").pop() ?? "bin";
  const filename = customPath ?? `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(filename, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return { path: filename, publicUrl: data.publicUrl };
}

export async function replaceFile(
  existingPath: string,
  file: File
): Promise<UploadResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { error } = await supabase.storage.from(BUCKET).upload(existingPath, file, {
    cacheControl: "3600",
    upsert: true,
  });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(existingPath);
  return { path: existingPath, publicUrl: data.publicUrl };
}

export function getPublicUrl(path: string): string {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return "";
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteFile(path: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error("Supabase client not available");
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}
