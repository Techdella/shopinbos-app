import { created } from "@/lib/api/response";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { saveDiscount } from "@/lib/marketing/discounts";
import { DiscountSchema } from "../schemas";

export const POST = marketingRoute(async ({ req, store }) => {
  const input = await readBody(req, DiscountSchema);
  return created(await saveDiscount(store.id, null, input));
});
