import { NextRequest } from "next/server";
import { withAdmin } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { UploadRejectedError, removeFileByPublicUrl, uploadFileServer, uploadPath } from "@/lib/supabase/storage.server";
import { setQcPhotos } from "@/lib/imports/service.server";

export const dynamic = "force-dynamic";

// Admin › China imports: the partner's QC photos from Guangzhou (up to 12), shown to the seller before it ships.

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024;

export const POST = withAdmin(async (req: NextRequest, { params }) => {
  const { id } = await params;
  const order = await db.importOrder.findUnique({ where: { id }, select: { id: true, storeId: true, qcPhotos: true } });
  if (!order) return apiError("NOT_FOUND", "Import not found", 404);
  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("photo") ?? []).filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (!files.length) return apiError("BAD_REQUEST", "Choose a photo.");
  if (order.qcPhotos.length + files.length > 12) return apiError("BAD_REQUEST", "Up to 12 QC photos per import.");
  const urls: string[] = [];
  for (const file of files) {
    if (!IMAGE_TYPES.has(file.type) || file.size > MAX_BYTES) return apiError("BAD_REQUEST", "Use JPG, PNG or WebP photos under 8MB.");
    try {
      urls.push((await uploadFileServer("products", file, uploadPath(`imports/${order.storeId}/qc`, file))).publicUrl);
    } catch (error) {
      if (error instanceof UploadRejectedError) return apiError("BAD_REQUEST", error.message);
      throw error;
    }
  }
  return ok(await setQcPhotos(id, [...order.qcPhotos, ...urls]));
});

export const DELETE = withAdmin(async (req: NextRequest, { params }) => {
  const { id } = await params;
  const url = req.nextUrl.searchParams.get("url") ?? "";
  const order = await db.importOrder.findUnique({ where: { id }, select: { id: true, qcPhotos: true } });
  if (!order) return apiError("NOT_FOUND", "Import not found", 404);
  if (!order.qcPhotos.includes(url)) return apiError("NOT_FOUND", "Photo not found", 404);
  const updated = await setQcPhotos(id, order.qcPhotos.filter((photo) => photo !== url));
  await removeFileByPublicUrl(url).catch(() => null);
  return ok(updated);
});
