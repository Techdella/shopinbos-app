import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { created, apiError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveReviewLink } from "@/lib/reviews/public";
import { uploadFileServer, uploadPath } from "@/lib/supabase/storage.server";

export const runtime = "nodejs";

const CORS = { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] };
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 6 * 1024 * 1024;

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

// POST multipart: file + (token) or (orderNumber + email). Only buyers with a real order can upload a photo.
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  if (!checkRateLimit(`review-photo:${ip}`, { maxRequests: 20, windowMs: 10 * 60_000 }).allowed) {
    return withCors(req, apiError("RATE_LIMITED", "Too many uploads. Try again in a few minutes.", 429), CORS);
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return withCors(req, apiError("BAD_REQUEST", "Choose a photo."), CORS);
  if (!TYPES.has(file.type)) return withCors(req, apiError("BAD_REQUEST", "Use a JPG, PNG or WebP photo."), CORS);
  if (file.size > MAX_BYTES) return withCors(req, apiError("BAD_REQUEST", "Photos can be up to 6 MB."), CORS);

  let storeId: string | null = null;
  const token = String(form?.get("token") ?? "");
  if (token) {
    const link = await resolveReviewLink(slug, token);
    storeId = link.error ? null : link.store.id;
  } else {
    const email = String(form?.get("email") ?? "").trim();
    const orderNumber = String(form?.get("orderNumber") ?? "").trim().replace(/^#/, "");
    const orderId = String(form?.get("orderId") ?? "").trim();
    const store = await db.store.findUnique({ where: { slug }, select: { id: true, status: true } });
    if (store?.status === "active" && email && (orderNumber || orderId)) {
      const order = await db.retailOrder.findFirst({
        where: { storeId: store.id, buyerEmail: { equals: email, mode: "insensitive" }, ...(orderId ? { id: orderId } : { orderNumber: { equals: orderNumber, mode: "insensitive" } }) },
        select: { id: true },
      });
      storeId = order ? store.id : null;
    }
  }
  if (!storeId) return withCors(req, apiError("FORBIDDEN", "We couldn't match this to an order.", 403), CORS);

  try {
    const { publicUrl } = await uploadFileServer("products", file, uploadPath(`reviews/${storeId}/photos`, file));
    return withCors(req, created({ url: publicUrl }), CORS);
  } catch (error) {
    console.error("[reviews] photo upload failed", error);
    return withCors(req, apiError("UPLOAD_FAILED", "We couldn't save that photo. Try again.", 500), CORS);
  }
}
