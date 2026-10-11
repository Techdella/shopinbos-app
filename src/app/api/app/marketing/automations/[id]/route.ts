import { ok } from "@/lib/api/response";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { deleteAutomation, updateAutomation } from "@/lib/marketing/automations";
import { FlowSchema } from "../../schemas";

export const PATCH = marketingRoute(async ({ req, store, params }) => {
  const input = await readBody(req, FlowSchema.omit({ presetKey: true }));
  return ok(await updateAutomation(store.id, params.id, input));
});

export const DELETE = marketingRoute(async ({ store, params }) => {
  await deleteAutomation(store.id, params.id);
  return ok({ deleted: true });
});
