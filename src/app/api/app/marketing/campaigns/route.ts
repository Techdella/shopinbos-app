import { created } from "@/lib/api/response";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { createCampaign } from "@/lib/marketing/campaigns";
import { CampaignSchema } from "../schemas";

export const POST = marketingRoute(async ({ req, store }) => {
  const input = await readBody(req, CampaignSchema);
  return created(await createCampaign(store.id, input));
});
