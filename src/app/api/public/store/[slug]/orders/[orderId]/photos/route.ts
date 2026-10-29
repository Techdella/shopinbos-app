import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { created, apiError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";
import { uploadFileServer, uploadPath } from "@/lib/supabase/storage.server";

export const runtime = "nodejs";

// A photo for "Report a problem" or a return on the store's order page (the wrong item, the damage). Access matches
// the order page: the order's unguessable id, for an order of this store. POST multipart "file" → { data: { url } }.

const CORS = { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] };
const TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);
const MAX_BYTES = 8 * 1024 * 1024;

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string; orderId: string }> }) {
  const { slug, orderId } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if (!checkRateLimit(`order-photo:${ip}`, { maxRequests: 12, windowMs: 10 * 60_000 }).allowed || !checkRateLimit(`order-photo-order:${orderId}`, { maxRequests: 12, windowMs: 60 * 60_000 }).allowed) {
    return withCors(req, apiError("RATE_LIMITED", "Too many photos. Try again in a few minutes.", 429), CORS);
  }
  const store = await db.store.findUnique({ where: { slug }, select: { id: true } });
  const order = store && orderId && orderId.length <= 64 ? await db.retailOrder.findFirst({ where: { id: orderId, storeId: store.id }, select: { id: true } }) : null;
  if (!store || !order) return withCors(req, apiError("NOT_FOUND", "We couldn't find this order.", 404), CORS);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return withCors(req, apiError("BAD_REQUEST", "Choose a photo."), CORS);
  if (!TYPES.has(file.type)) return withCors(req, apiError("BAD_REQUEST", "Use a JPG, PNG or WebP photo."), CORS);
  if (file.size > MAX_BYTES) return withCors(req, apiError("BAD_REQUEST", "Photos can be up to 8 MB."), CORS);
  try {
    const { publicUrl } = await uploadFileServer("products", file, uploadPath(`orders/${store.id}/problems`, file));
    return withCors(req, created({ url: publicUrl }), CORS);
  } catch (error) {
    console.error("[order photos] upload failed", error);
    return withCors(req, apiError("UPLOAD_FAILED", "We couldn't save that photo. Try again.", 500), CORS);
  }
}
