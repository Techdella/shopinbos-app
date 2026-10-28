import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { myRatings, rateSupplier, ratableDropshipOrders } from "@/lib/marketplace/supplier-ratings.server";
import { RATING_KINDS, RATING_TEXT_MAX } from "@shared/supplier-ratings";

export const dynamic = "force-dynamic";

// A seller rates a supplier (shared/supplier-ratings.ts), from the phone and the web:
//   GET                      → { ratings: [{ kind, orderId, rating, text }] }  the seller's own ratings (newest first)
//   GET ?retailOrderId=…     → { orders: [{ id, status, supplierName, canRate, rated }] }  the supplier parcels of
//                              one of the seller's store orders, for "Rate the supplier" on the order page
//   POST { kind: "wholesale_order" | "dropship_order", orderId, rating: 1–5, text? (≤ 280) }
//                            → { rating, supplier: { rating, count } }; 409 when already rated, 400 before it arrived.

const Body = z.object({
  kind: z.enum(RATING_KINDS),
  orderId: z.string().min(1).max(64),
  rating: z.number().int().min(1).max(5),
  text: z.string().max(RATING_TEXT_MAX * 2).optional(),
});

export const GET = withSeller(async (req: NextRequest, { user }) => {
  const retailOrderId = req.nextUrl.searchParams.get("retailOrderId")?.trim().slice(0, 64);
  if (retailOrderId) return ok({ orders: await ratableDropshipOrders(user.id, retailOrderId) });
  return ok({ ratings: await myRatings(user.id) });
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Pick from 1 to 5 stars.");
  const result = await rateSupplier({ id: user.id }, parsed.data);
  if (!result.ok) return apiError(result.code, result.message, result.code === "NOT_FOUND" ? 404 : result.code === "CONFLICT" ? 409 : 400);
  return ok({ rating: result.rating, supplier: result.supplier }, 201);
});
