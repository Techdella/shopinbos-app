import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { UploadRejectedError, uploadFileServer, type StorageFolder } from "@/lib/supabase/storage.server";
import { recordMedia } from "@/lib/media/library.server";
import { mediaDisplayName, mediaFileProblem, mediaKindOfType } from "@shared/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_FOLDERS: StorageFolder[] = ["products", "brand", "store-banners", "supplier-logos"];
// Allowed types and sizes: shared/media.ts (the same rules as the media library, /api/app/media).

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Expected multipart/form-data" } }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const folderRaw = formData.get("folder") as string | null;
  const folder: StorageFolder = (folderRaw && ALLOWED_FOLDERS.includes(folderRaw as StorageFolder))
    ? (folderRaw as StorageFolder)
    : "brand";

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "file field is required" } }, { status: 400 });
  }

  const problem = mediaFileProblem(file);
  if (problem) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: problem } }, { status: 400 });
  }

  try {
    const result = await uploadFileServer(folder, file);
    // Every upload joins the person's media library ("Choose from my media").
    await recordMedia({ userId: user.id, url: result.publicUrl, path: result.path, name: mediaDisplayName(file.name), kind: mediaKindOfType(file.type) ?? undefined, bytes: file.size, source: folder === "store-banners" ? "banner" : folder === "products" ? "product" : "upload" });
    return NextResponse.json({ data: { path: result.path, publicUrl: result.publicUrl } });
  } catch (error) {
    // The bytes aren't what the type claims, or an SVG carries script (checked in uploadFileServer).
    if (error instanceof UploadRejectedError) {
      return NextResponse.json({ error: { code: "BAD_REQUEST", message: error.message } }, { status: 400 });
    }
    console.error("Upload failed:", error);
    return NextResponse.json({ error: { code: "UPLOAD_FAILED", message: "File upload failed" } }, { status: 500 });
  }
});
