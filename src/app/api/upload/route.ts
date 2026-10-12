import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { UploadRejectedError, uploadFileServer, type StorageFolder } from "@/lib/supabase/storage.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_FOLDERS: StorageFolder[] = ["products", "brand", "store-banners", "supplier-logos"];
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]);
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/ogg"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

export const POST = withSeller(async (req: NextRequest) => {
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

  const isImage = ALLOWED_IMAGE_TYPES.has(file.type);
  const isVideo = ALLOWED_VIDEO_TYPES.has(file.type);
  if (!isImage && !isVideo) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Only JPG, PNG, WebP, GIF, SVG, MP4, WebM, and Ogg files are allowed" } }, { status: 400 });
  }

  const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > maxBytes) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: isVideo ? "Video too large (max 80MB)" : "Image too large (max 10MB)" } }, { status: 400 });
  }

  try {
    const result = await uploadFileServer(folder, file);
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
