import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { ok, apiError } from "@/lib/api/response";
import { captureAbandonedCart, restoreAbandonedCart } from "@/lib/commerce/abandoned-cart.server";
import { CHECKOUT_STEPS, isEmail, isPhone, isRecoveryToken } from "@shared/cart-checkout";
import { overPublicLimit } from "@/lib/rate-limit";

// POST saves the shopper's bag once checkout knows how to reach them (email or phone), for cart reminders.
// GET ?recover=<token> returns the bag behind a reminder link so the cart page can restore it.

const CORS = { methods: ["GET", "POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

const LineSchema = z.object({
  productId: z.string().min(1).max(64),
  name: z.string().max(200).default("Item"),
  price: z.number().nonnegative(),
  quantity: z.number().int().positive().max(999),
  image: z.string().max(1000).optional(),
  variant: z.string().max(120).optional(),
  maxQuantity: z.number().int().positive().optional(),
});

const CaptureSchema = z.object({
  visitorKey: z.string().min(8).max(100),
  email: z.string().max(200).optional(),
  phone: z.string().max(40).optional(),
  name: z.string().max(120).optional(),
  items: z.array(LineSchema).min(1).max(100),
  step: z.enum(CHECKOUT_STEPS).optional(),
  discountCode: z.string().max(40).optional(),
  token: z.string().max(64).optional(),
});

async function activeStore(slug: string) {
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, name: true, currency: true, status: true } });
  return store && store.status === "active" ? store : null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (overPublicLimit(req.headers, "cart")) return withCors(req, apiError("RATE_LIMITED", "Too many tries. Wait a few minutes and try again.", 429), CORS);
  const { slug } = await params;
  const store = await activeStore(slug);
  if (!store) return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);

  const parsed = CaptureSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return withCors(req, apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid cart"), CORS);
  const input = parsed.data;
  // Only keep contact details that could actually reach the shopper.
  const email = input.email && isEmail(input.email) ? input.email : null;
  const phone = input.phone && isPhone(input.phone) ? input.phone : null;
  if (!email && !phone) return withCors(req, ok({ token: null }), CORS);

  const saved = await captureAbandonedCart({
    store,
    visitorKey: input.visitorKey,
    email,
    phone,
    name: input.name,
    items: input.items,
    step: input.step,
    discountCode: input.discountCode,
    token: input.token,
  });
  return withCors(req, ok({ token: saved?.token ?? null }), CORS);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await activeStore(slug);
  if (!store) return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);

  const token = req.nextUrl.searchParams.get("recover");
  if (!isRecoveryToken(token)) return withCors(req, apiError("BAD_REQUEST", "This cart link isn't valid."), CORS);
  const cart = await restoreAbandonedCart(store.id, token);
  if (!cart) return withCors(req, apiError("NOT_FOUND", "We couldn't find that cart. It may have expired.", 404), CORS);
  const res = withCors(req, ok(cart), CORS);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
