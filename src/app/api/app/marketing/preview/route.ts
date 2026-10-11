import { z } from "zod";
import { ok } from "@/lib/api/response";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { previewCampaignHtml } from "@/lib/marketing/campaigns";

// The email as it will look: brand kit colours and logo, sample customer details.
export const POST = marketingRoute(async ({ req, store }) => {
  const input = await readBody(req, z.object({ bodyHtml: z.string().max(200_000), preheader: z.string().max(200).nullable().optional() }));
  return ok({ html: await previewCampaignHtml(store.id, input) });
});
