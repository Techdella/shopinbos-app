import { created } from "@/lib/api/response";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { createAutomation } from "@/lib/marketing/automations";
import { FlowSchema } from "../schemas";

export const POST = marketingRoute(async ({ req, store }) => {
  const input = await readBody(req, FlowSchema);
  return created(await createAutomation(store.id, input));
});
