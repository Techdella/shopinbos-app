import { z } from "zod";
import { db } from "@/lib/db/client";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";

const UpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(30).optional().nullable(),
  commissionRate: z.number().min(1).max(50).optional(),
  active: z.boolean().optional(),
  /** Marks every delivered, unpaid commission as paid (the seller paid the creator). */
  markPaid: z.literal(true).optional(),
});

async function findAffiliate(userId: string, id: string) {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true } });
  if (!store) return null;
  return db.affiliate.findFirst({ where: { id, storeId: store.id } });
}

export const PATCH = withSeller(async (req, { user, params }) => {
  const { id } = await params;
  const affiliate = await findAffiliate(user.id, id);
  if (!affiliate) return apiError("NOT_FOUND", "Creator not found", 404);

  const parsed = UpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the details");
  const { markPaid, ...changes } = parsed.data;

  // A new rate applies to future orders; commissions already recorded keep their rate.
  const updated = await db.affiliate.update({ where: { id: affiliate.id }, data: changes });
  let paidOrders = 0;
  if (markPaid) {
    const result = await db.retailOrder.updateMany({
      where: { affiliateId: affiliate.id, status: "delivered", affiliatePaidAt: null },
      data: { affiliatePaidAt: new Date() },
    });
    paidOrders = result.count;
  }
  return ok({ ...updated, paidOrders });
});

export const DELETE = withSeller(async (_req, { user, params }) => {
  const { id } = await params;
  const affiliate = await findAffiliate(user.id, id);
  if (!affiliate) return apiError("NOT_FOUND", "Creator not found", 404);
  // Orders keep their history (affiliateId is set to null by the foreign key).
  await db.affiliate.delete({ where: { id: affiliate.id } });
  return ok({ id: affiliate.id });
});
