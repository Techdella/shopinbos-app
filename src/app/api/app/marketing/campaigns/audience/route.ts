import { z } from "zod";
import { ok } from "@/lib/api/response";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { audienceSize } from "@/lib/marketing/campaigns";
import { AudienceSchema, ChannelSchema } from "../../schemas";

// How many people a campaign would reach right now, for the editor.
export const POST = marketingRoute(async ({ req, store }) => {
  const input = await readBody(req, z.object({ channel: ChannelSchema, segmentId: z.string().max(64).nullable().optional(), audience: AudienceSchema.optional() }));
  const filter = input.segmentId ? ({ mode: "segment", segmentId: input.segmentId } as const) : (input.audience ?? { mode: "all" as const });
  return ok({ count: await audienceSize(store.id, input.channel, filter) });
});
