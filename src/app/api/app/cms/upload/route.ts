import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { sellerStore } from "@/lib/cms/server";
import { uploadFileServer, uploadPath } from "@/lib/supabase/storage.server";
import { recordMedia } from "@/lib/media/library.server";
import { mediaDisplayName, mediaKindOfType } from "@shared/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Media for CMS items (images in posts, galleries, lesson videos, downloadable PDFs), kept under the store's
// own folder in the media bucket. SVG is left out: it can carry script when opened directly.
const LIMITS: Record<string, number> = {
  "image/jpeg": 10, "image/png": 10, "image/webp": 10, "image/gif": 10,
  "video/mp4": 80, "video/webm": 80,
  "application/pdf": 20,
};

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return NextResponse.json({ error: { code: "NO_STORE", message: "Create your store first" } }, { status: 404 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Choose a file to upload" } }, { status: 400 });
  const maxMb = LIMITS[file.type];
  if (!maxMb) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Upload a JPG, PNG, WebP or GIF picture, an MP4 or WebM video, or a PDF" } }, { status: 400 });
  if (file.size > maxMb * 1024 * 1024) return NextResponse.json({ error: { code: "BAD_REQUEST", message: `That file is over ${maxMb} MB` } }, { status: 400 });
  try {
    const result = await uploadFileServer("brand", file, uploadPath(`brand/cms/${store.id}`, file));
    const kind = mediaKindOfType(file.type);
    if (kind) await recordMedia({ userId: user.id, storeId: store.id, url: result.publicUrl, path: result.path, name: mediaDisplayName(file.name), kind, bytes: file.size, source: "cms" });
    return NextResponse.json({ data: { url: result.publicUrl, name: file.name.slice(0, 120), type: file.type } });
  } catch (error) {
    console.error("[cms] upload failed", error);
    return NextResponse.json({ error: { code: "UPLOAD_FAILED", message: "The upload didn't go through. Try again." } }, { status: 500 });
  }
});
