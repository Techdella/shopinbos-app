import { z } from "zod";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { cancelPaymentLink } from "@/lib/payment-links/service.server";

const UpdateSchema = z.object({ action: z.literal("cancel") }).strict();

// Cancels one of the seller's own unpaid payment links.
export const PATCH = withSeller(async (req, { user, params }) => {
  const { id } = await params;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const parsed = UpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Say what to change");
  const result = await cancelPaymentLink(store.id, String(id));
  if (!result.ok) return apiError("BAD_REQUEST", result.message);
  return ok({ cancelled: true });
});
