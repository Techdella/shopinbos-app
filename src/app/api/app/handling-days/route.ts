import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { ok, apiError } from "@/lib/api/response";
import { HANDLING_DAY_CHOICES } from "@shared/cart-checkout";

// The store's handling time: days it takes to send an order of its own stock. With each delivery zone's days it gives
// customers an "Arrives …" date at checkout (shared/cart-checkout.ts ownArrival). Web /home/shipping.
//   GET   → { data: { handlingDays } }
//   PATCH { handlingDays: 0 | 1 | 2 | 3 | 5 } → the same

export const GET = withSeller(async (_req, { user }) => {
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { handlingDays: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  return ok(store);
});

export const PATCH = withSeller(async (req, { user }) => {
  const body = (await req.json().catch(() => null)) as { handlingDays?: unknown } | null;
  const days = Number(body?.handlingDays);
  if (!(HANDLING_DAY_CHOICES as readonly number[]).includes(days)) return apiError("BAD_REQUEST", "Choose how many days you take to send an order.");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  return ok(await db.store.update({ where: { id: store.id }, data: { handlingDays: days }, select: { handlingDays: true } }));
});
