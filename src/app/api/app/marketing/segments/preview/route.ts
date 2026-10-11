import { z } from "zod";
import { ok } from "@/lib/api/response";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { previewSegment } from "@/lib/marketing/segments";
import { RulesSchema } from "../../schemas";

// Live count for the rule builder.
export const POST = marketingRoute(async ({ req, store }) => {
  const { rules } = await readBody(req, z.object({ rules: RulesSchema }));
  return ok(await previewSegment(store.id, rules));
});
