import { ok } from "@/lib/api/response";
import { marketingRoute } from "@/lib/marketing/api";
import { shopFacts } from "@/lib/marketing/template-ai.server";

// The shop's published products with a photo, for the email builder's product grid (name, price, photo, link).
export const GET = marketingRoute(async ({ store }) => {
  const { products } = await shopFacts(store.id);
  return ok({ products });
});
