import { z } from "zod";
import { ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { saveDiscount } from "@/lib/marketing/discounts";
import { MarketingError } from "@/lib/marketing/segments";
import { DiscountSchema } from "../../schemas";

export const PATCH = marketingRoute(async ({ req, store, params }) => {
  const input = await readBody(req, z.union([z.object({ status: z.enum(["active", "disabled", "draft"]) }).strict(), DiscountSchema]));
  if (!("type" in input)) {
    const found = await db.discount.findFirst({ where: { id: params.id, storeId: store.id }, select: { id: true } });
    if (!found) throw new MarketingError("Discount not found");
    return ok(await db.discount.update({ where: { id: params.id }, data: { status: input.status } }));
  }
  return ok(await saveDiscount(store.id, params.id, input));
});

export const DELETE = marketingRoute(async ({ store, params }) => {
  const found = await db.discount.findFirst({ where: { id: params.id, storeId: store.id }, select: { id: true } });
  if (!found) throw new MarketingError("Discount not found");
  await db.discount.delete({ where: { id: params.id } });
  return ok({ deleted: true });
});
