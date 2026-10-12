import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { created, apiError } from "@/lib/api/response";
import { captureAbandonedCart } from "@/lib/commerce/abandoned-cart.server";
import { overPublicLimit } from "@/lib/rate-limit";

// Older storefront bundles post here. Same capture as POST /cart: the cart is saved for the reminder
// automation, which waits before writing to the shopper (nothing is emailed from this request).

const CORS = { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

const CartSchema = z.object({
  visitorKey: z.string().min(8),
  email: z.string().email(),
  name: z.string().optional(),
  items: z.array(z.object({
    productId: z.string(),
    name: z.string(),
    price: z.number(),
    quantity: z.number().int().positive(),
    image: z.string().optional(),
    variant: z.string().optional(),
  })).min(1),
  subtotal: z.number().nonnegative(),
  token: z.string().max(64).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  if (overPublicLimit(req.headers, "cart")) return withCors(req, apiError("RATE_LIMITED", "Too many tries. Wait a few minutes and try again.", 429), CORS);
  const { slug } = await params;
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, name: true, status: true, currency: true } });
  if (!store || store.status !== "active") return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);

  const parsed = CartSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return withCors(req, apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid cart"), CORS);

  const input = parsed.data;
  const saved = await captureAbandonedCart({ store, visitorKey: input.visitorKey, email: input.email, name: input.name, items: input.items, token: input.token });
  return withCors(req, created({ token: saved?.token ?? null }), CORS);
}
