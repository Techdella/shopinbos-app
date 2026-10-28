import { z } from "zod";
import { ok } from "@/lib/api/response";
import { meterAi } from "@/lib/ai/usage";
import { htmlFromBlocks, readBlocks } from "@/lib/marketing/blocks";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { draftEmail } from "@/lib/marketing/template-ai.server";

// "What's it about? Rex writes it" on the phone (apps/mobile/src/app/marketing/email/new.tsx, board M-EmailCreate):
// the web email builder's writer (POST /api/app/marketing/templates/assist, the same draftEmail) with the blocks
// turned into the saved body HTML, so the phone can show it and send it as a campaign
// (POST /api/app/marketing/campaigns, then { action: "send" } or "schedule"). A second ask with `current` changes the
// draft instead of starting again. Saves nothing.
export const POST = marketingRoute(async ({ req, user, store }) => {
  const input = await readBody(
    req,
    z.object({
      instruction: z.string().trim().min(2, "Tell Rex what the email is about").max(1000),
      current: z.object({ subject: z.string().max(200), preheader: z.string().max(200), bodyHtml: z.string().max(200_000) }).nullable().optional(),
    }),
  );
  const limited = await meterAi(user.id, "text");
  if (limited) return limited;
  const blocks = input.current ? (readBlocks(input.current.bodyHtml) ?? []) : [];
  const current = input.current && blocks.length ? { subject: input.current.subject, preheader: input.current.preheader, blocks } : null;
  const draft = await draftEmail(store.id, input.instruction, current);
  return ok({ subject: draft.subject, preheader: draft.preheader, bodyHtml: htmlFromBlocks(draft.blocks), note: draft.note, ai: draft.ai });
});
