import "server-only";

import { meterAi } from "@/lib/ai/usage";
import { readBlocks, readPreheader } from "@/lib/marketing/blocks";
import { MarketingError } from "@/lib/marketing/segments";
import { draftEmail, findTemplate, saveDraftTemplate } from "@/lib/marketing/template-ai.server";
import { matchStarter } from "@/lib/marketing/template-library";
import type { PeggyToolInput } from "./pure";
import { ToolError, type PeggyToolContext, type ToolOutput } from "./tools";

// Peggy's email template tools, on the same writer as the builder's "Ask Peggy" panel. Each saves a new draft
// template (never sends, never overwrites the seller's own work) and links to it in the builder.

async function meter(ctx: PeggyToolContext) {
  if (await meterAi(ctx.userId, "text")) throw new ToolError("The seller has used today's AI writing allowance. Tell them it resets within 24 hours or with a plan upgrade.");
}

async function wrap<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof MarketingError) throw new ToolError(error.message);
    throw error;
  }
}

async function draftTemplate(ctx: PeggyToolContext, input: PeggyToolInput<"draft_email_template">): Promise<ToolOutput> {
  await meter(ctx);
  const draft = await wrap(() => draftEmail(ctx.store.id, input.brief));
  const kind = input.kind ?? matchStarter(input.brief)?.category ?? "marketing";
  const template = await wrap(() => saveDraftTemplate(ctx.store.id, draft, input.name || draft.subject.replace(/{{\s*\w+\s*}}/g, "").trim().slice(0, 80) || "New email", kind));
  const href = `/home/marketing/templates/${template.id}`;
  const summary = `Saved the email template "${template.name}" as a draft (subject: "${draft.subject}"). Nothing was sent.${draft.ai ? "" : " The writer was offline, so it starts from the closest starter with the shop's products."}`;
  return { content: `${summary}\nWhat it says: ${draft.note}\nOpen it in the builder: ${href}`, action: { summary, href } };
}

async function improveCopy(ctx: PeggyToolContext, input: PeggyToolInput<"improve_email_copy">): Promise<ToolOutput> {
  const original = await findTemplate(ctx.store.id, input.template);
  if (!original) throw new ToolError(`No saved template called "${input.template}". Use marketing_list_templates to see the names.`);
  const blocks = readBlocks(original.bodyHtml);
  if (!blocks?.length) throw new ToolError("That template was written in HTML, so Peggy can't edit it block by block. Suggest the changes in your reply instead.");
  await meter(ctx);
  const draft = await wrap(() => draftEmail(ctx.store.id, input.instruction, { subject: original.subject, preheader: readPreheader(original.bodyHtml), blocks }));
  if (!draft.ai) throw new ToolError("The writing service isn't available right now, so nothing was changed. Suggest the changes in your reply instead.");
  const copy = await wrap(() => saveDraftTemplate(ctx.store.id, draft, `${original.name} (Peggy's edit)`, original.category));
  const href = `/home/marketing/templates/${copy.id}`;
  const summary = `Saved my edit of "${original.name}" as a new draft template "${copy.name}" (subject: "${draft.subject}"). The original is unchanged and nothing was sent.`;
  return { content: `${summary}\nWhat changed: ${draft.note}\nOpen it: ${href}`, action: { summary, href } };
}

export const EMAIL_TOOL_RUNNERS = {
  draft_email_template: draftTemplate,
  improve_email_copy: improveCopy,
};
