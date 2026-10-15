import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { saveDesignPreview } from "@/lib/packaging/designs.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The designer's thumbnail for the Labels and print gallery (multipart "file", a small PNG).
export const POST = withSeller(async (req, { user, params }) => {
  const { id } = await params;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Set up your store first.", 404);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return apiError("BAD_REQUEST", "Add the preview picture.");
  try {
    const row = await saveDesignPreview(store.id, id, file);
    if (!row) return apiError("NOT_FOUND", "That design isn't here any more.", 404);
    return ok({ previewUrl: row.previewUrl });
  } catch (error) {
    return apiError("BAD_REQUEST", error instanceof Error ? error.message : "Couldn't save the preview.");
  }
});
