import "server-only";

import { db } from "@/lib/db/client";
import { meterAi } from "@/lib/ai/usage";
import { checkConfirmationCode, confirmationCode } from "@/lib/marketing/brand";
import { draftLegalPage, legalContext, legalStore, legalTitle, LegalError, saveLegalPage, sellerLegalPage } from "@/lib/legal/server";
import { legalPageStatus } from "@/lib/legal/pages";
import type { PeggyToolInput } from "./pure";
import { ToolError, type PeggyToolContext, type ToolOutput } from "./tools";

// Peggy drafting a legal page with the legal editor's own writer (src/lib/legal/server.ts). Saved unpublished
// after the seller confirms; a page that is already live is never touched here.

async function draftPage(ctx: PeggyToolContext, input: PeggyToolInput<"legal_draft_page">): Promise<ToolOutput> {
  const store = await legalStore(ctx.userId);
  if (!store) throw new ToolError("This seller has no shop yet.");
  const page = sellerLegalPage(store, input.page);
  if (!page) throw new ToolError("That legal page doesn't exist.");
  const title = page.title || legalTitle(input.page);
  const href = `/home/legal/${input.page}`;
  if (page.published) throw new ToolError(`"${title}" is already live, so I won't replace it from chat. The seller can open ${href} and use Peggy in the editor to redraft it, then publish when happy.`);

  const parts = [ctx.store.id, "legal", input.page];
  if (!checkConfirmationCode(input.confirmCode, parts)) {
    const hasText = legalPageStatus(page) !== "empty";
    return {
      content: `NOT SAVED YET. Ask the seller to confirm: write a draft "${title}" page from their shop settings${input.brief ? " and what they said" : ""}${hasText ? ", replacing the unpublished draft text already there" : ""}? It stays unpublished until they publish it at ${href}. Confirmation code: ${confirmationCode(parts)}. Only call legal_draft_page again with this code after they clearly say yes.${input.confirmCode ? " (The code given was wrong or expired.)" : ""}`,
    };
  }

  if (await meterAi(ctx.userId, "text")) throw new ToolError("The seller is out of AI credits (or hit today's safety cap). Tell them to top up on the AI credits page, or that their plan's credits refill at the start of next month.");
  const owner = await db.user.findUnique({ where: { id: ctx.userId }, select: { email: true, phone: true } });
  try {
    const legalCtx = await legalContext(store, { email: owner?.email ?? null, phone: owner?.phone ?? ctx.userPhone });
    const { doc, source } = await draftLegalPage(input.page, title, legalCtx, input.brief ?? "");
    await saveLegalPage(store, input.page, { title, doc, style: page.style, seo: page.seo, published: false });
    const summary = `Saved a draft "${title}" page${source === "template" ? " from the standard template (the writer was offline)" : ""}. It is NOT published: the seller should check the [Check: …] notes, then publish it at ${href}.`;
    return { content: summary, action: { summary, href } };
  } catch (error) {
    if (error instanceof LegalError) throw new ToolError(error.message);
    throw error;
  }
}

export const LEGAL_TOOL_RUNNERS = {
  legal_draft_page: draftPage,
};
