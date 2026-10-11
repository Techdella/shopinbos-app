import "server-only";

import { meterAi } from "@/lib/ai/usage";
import { draftItem, listForAssistant } from "@/lib/cms/ai.server";
import { CmsError } from "@/lib/cms/server";
import type { PeggyToolInput } from "./pure";
import { ToolError, type PeggyToolContext, type ToolOutput } from "./tools";

// Peggy's content tools: read the store's collections and draft items in them (drafts only).

async function listItems(ctx: PeggyToolContext, input: PeggyToolInput<"cms_list_items">): Promise<ToolOutput> {
  try {
    return { content: JSON.stringify(await listForAssistant(ctx.store.id, input.collection)) };
  } catch (error) {
    if (error instanceof CmsError) throw new ToolError(`${error.message} Use cms_list_items with collection null to see the collections.`);
    throw error;
  }
}

async function draftCmsItem(ctx: PeggyToolContext, input: PeggyToolInput<"cms_draft_item">): Promise<ToolOutput> {
  if (await meterAi(ctx.userId, "text")) throw new ToolError("The seller has used today's AI writing allowance. Tell them it resets within 24 hours or with a plan upgrade.");
  try {
    const { collection, item } = await draftItem(ctx.store.id, ctx.store.name, input, "peggy");
    const href = `/home/cms/${collection.id}/${item.id}`;
    const summary = `Wrote "${item.title}" and saved it as a draft in ${collection.name}. It is not published.`;
    return { content: `${summary}\nSummary: ${item.excerpt}\nEdit and publish: ${href}`, action: { summary, href } };
  } catch (error) {
    if (error instanceof CmsError) throw new ToolError(error.message);
    throw error;
  }
}

export const CMS_TOOL_RUNNERS = {
  cms_list_items: listItems,
  cms_draft_item: draftCmsItem,
};
