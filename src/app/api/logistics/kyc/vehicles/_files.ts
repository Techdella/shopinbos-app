import "server-only";

import { docMimeType, validateDocFile } from "@shared/verification-docs";
import { assertUploadContent, removePrivateFile, uploadPrivateFile } from "@/lib/supabase/storage.server";

// A vehicle's photo and licence: images only (PDF too for the licence), checked and stored privately under the
// partner's verification folder so only they and the team can open them (/api/verification/file).

export type VehicleFiles = { photo: File; licence: File };

export function vehicleFileProblem(file: unknown, label: string, allowPdf: boolean): string | null {
  if (!(file instanceof File) || file.size === 0) return `Add the ${label}.`;
  const invalid = validateDocFile(file);
  if (invalid) return invalid;
  const type = docMimeType(file);
  if (!allowPdf && type === "application/pdf") return `The ${label} must be a photo (JPG, PNG or WebP).`;
  return null;
}

export async function storeVehicleFile(partnerId: string, file: File): Promise<string> {
  await assertUploadContent(file);
  const { path } = await uploadPrivateFile(`logistics-verifications/${partnerId}/vehicle`, file);
  return path;
}

export async function removeVehicleFiles(paths: Array<string | null | undefined>) {
  await Promise.all(paths.filter((path): path is string => Boolean(path)).map((path) => removePrivateFile(path).catch(() => undefined)));
}
