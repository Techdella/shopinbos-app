import { ok } from "@/lib/api/response";
import { marketingRoute } from "@/lib/marketing/api";
import { deleteTemplate } from "@/lib/marketing/templates";

export const DELETE = marketingRoute(async ({ store, params }) => {
  await deleteTemplate(store.id, params.id);
  return ok({ deleted: true });
});
