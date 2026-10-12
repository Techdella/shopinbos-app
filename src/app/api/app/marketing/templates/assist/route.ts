import { z } from "zod";
import { ok } from "@/lib/api/response";
import { meterAi } from "@/lib/ai/usage";
import { parseBlocks } from "@/lib/marketing/blocks";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { draftEmail } from "@/lib/marketing/template-ai.server";

// "Ask Peggy" in the email builder: returns blocks to apply (the builder keeps the old ones for Undo). Saves nothing.
export const POST = marketingRoute(async ({ req, user, store }) => {
  const input = await readBody(
    req,
    z.object({
      instruction: z.string().trim().min(2, "Tell Peggy what to write").max(1000),
      current: z.object({ subject: z.string().max(200), preheader: z.string().max(200), blocks: z.array(z.unknown()).max(60) }).nullable().optional(),
    }),
  );
  const limited = await meterAi(user.id, "text");
  if (limited) return limited;
  const current = input.current ? { subject: input.current.subject, preheader: input.current.preheader, blocks: parseBlocks(input.current.blocks) } : null;
  return ok(await draftEmail(store.id, input.instruction, current?.blocks.length ? current : null));
});
