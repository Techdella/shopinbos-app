import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, created, ok } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";
import { CreatePaymentLinkSchema } from "@/lib/payment-links/pure";
import { createPaymentLink, LINK_STORE_SELECT, listPaymentLinks, paymentReadiness } from "@/lib/payment-links/service.server";

// The seller's payment links: list them, and make one for products in their own shop.

async function sellerStore(userId: string) {
  return db.store.findUnique({ where: { userId }, select: LINK_STORE_SELECT });
}

export const GET = withSeller(async (req, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const status = new URL(req.url).searchParams.get("status");
  const [links, readiness] = await Promise.all([listPaymentLinks(store, { status }), paymentReadiness(store.id)]);
  return ok({ links, readiness });
});

export const POST = withSeller(async (req, { user }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  if (!checkRateLimit(`payment-links:${store.id}`, { maxRequests: 60, windowMs: 60 * 60_000 }).allowed) {
    return apiError("RATE_LIMITED", "You've made a lot of links in the last hour. Try again a little later.", 429);
  }
  const parsed = CreatePaymentLinkSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the details");
  const result = await createPaymentLink(store, parsed.data, { createdBy: "seller" });
  if (!result.ok) return apiError("BAD_REQUEST", result.message);
  return created({ id: result.link.id, code: result.link.code, url: result.url, total: result.total, title: result.link.title, items: result.items });
});
